import type { Database, SqlDriver } from '../db/database';
import {
  DEFAULT_PERMISSIONS,
  PERMISSION_LABELS,
  ROLE_LABELS,
  type Actor,
  type Employee,
  type EmployeeInput,
  type Permission,
  type Role,
  type AuditRow,
} from './access-types';
import { audit, newId, textRequired, timestamp } from './shared';

const ITERATIONS = 600_000;
export class SessionError extends Error {}
interface Credentials {
  id: string;
  name: string;
  identifier: string;
  role: Role;
  active: number;
  pin_hash: string;
  pin_lookup: string | null;
  salt: string;
  iterations: number;
  failed_attempts: number;
  locked_until: string | null;
}
const hex = (value: ArrayBuffer) =>
  [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
function validatePin(pin: string) {
  if (!/^\d{4,8}$/.test(pin)) throw new Error('El PIN debe contener de 4 a 8 dígitos.');
}
async function derive(pin: string, salt: string, iterations: number) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, [
    'deriveBits',
  ]);
  return hex(
    await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations },
      key,
      256,
    ),
  );
}
async function encodePin(pin: string) {
  validatePin(pin);
  const salt = hex(crypto.getRandomValues(new Uint8Array(24)).buffer);
  return { salt, hash: await derive(pin, salt, ITERATIONS) };
}
function equalHash(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let i = 0; i < left.length; i++) result |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return result === 0;
}
async function employee(sql: SqlDriver, id: string): Promise<Employee> {
  const [row] = await sql.query<
    Pick<Credentials, 'id' | 'name' | 'identifier' | 'role' | 'active'>
  >('SELECT id,name,identifier,role,active FROM employees WHERE id=?', [id]);
  if (!row) throw new Error('Empleado no disponible.');
  const permissions = (
    await sql.query<{ permission: Permission }>(
      'SELECT permission FROM employee_permissions WHERE employee_id=? AND allowed=1 ORDER BY permission',
      [id],
    )
  ).map((item) => item.permission);
  return { ...row, permissions };
}
function identifier(value: string) {
  const result = textRequired(value, 'un identificador', 40).toLowerCase();
  if (!/^[a-z0-9._-]+$/.test(result))
    throw new Error(
      'El identificador admite letras sin acentos, números, punto, guion y guion bajo.',
    );
  return result;
}
async function permissions(sql: SqlDriver, employeeId: string, selected: Permission[]) {
  if (!Array.isArray(selected) || selected.some((item) => !Object.hasOwn(PERMISSION_LABELS, item)))
    throw new Error('Permisos no válidos.');
  await sql.run('DELETE FROM employee_permissions WHERE employee_id=?', [employeeId]);
  for (const permission of new Set(selected))
    await sql.run(
      'INSERT INTO employee_permissions(employee_id,permission,allowed) VALUES(?,?,1)',
      [employeeId, permission],
    );
}

export class AccessControl {
  private actorId: string | null = null;
  private sessionGeneration = 0;
  constructor(private readonly db: Database) {}
  lock() {
    this.actorId = null;
    this.sessionGeneration++;
  }
  hasEmployees() {
    return this.db.read(
      async (sql) =>
        (await sql.query<{ n: number }>('SELECT COUNT(*) AS n FROM employees'))[0].n > 0,
    );
  }
  async require(sql: SqlDriver, ...required: Permission[]): Promise<Actor> {
    if (!this.actorId) throw new SessionError('Inicia sesión con tu PIN para continuar.');
    const actor = await employee(sql, this.actorId);
    if (!actor.active) {
      this.lock();
      throw new SessionError('Este empleado está inactivo. Inicia sesión con otro usuario.');
    }
    for (const permission of required)
      if (!actor.permissions.includes(permission))
        throw new Error(`Sin permiso: ${PERMISSION_LABELS[permission]}.`);
    return actor;
  }
  current() {
    return this.db.read((sql) => this.require(sql));
  }
  async bootstrap(input: { name: string; identifier: string; pin: string }) {
    const name = textRequired(input.name, 'el nombre del propietario');
    const code = identifier(input.identifier);
    const encoded = await encodePin(input.pin);
    const lookup = await this.lookup(input.pin);
    const actorId = await this.db.transaction(async (sql) => {
      if ((await sql.query<{ n: number }>('SELECT COUNT(*) AS n FROM employees'))[0].n)
        throw new Error('El propietario ya está configurado. Inicia sesión.');
      const id = newId();
      await sql.run(
        "INSERT INTO employees(id,name,identifier,role,active,pin_hash,salt,iterations,created_at) VALUES(?,?,?,'admin',1,?,?,?,?)",
        [id, name, code, encoded.hash, encoded.salt, ITERATIONS, timestamp()],
      );
      await sql.run('UPDATE employees SET pin_lookup=? WHERE id=?', [lookup, id]);
      await permissions(sql, id, [...DEFAULT_PERMISSIONS.admin]);
      await audit(sql, { id, name }, 'employee.bootstrap', id);
      return id;
    });
    this.actorId = actorId;
    return this.current();
  }
  private async lookup(pin: string) {
    const [salt] = await this.db.read((sql) =>
      sql.query<{ value: string }>("SELECT value FROM settings WHERE key='pinLookupSalt'"),
    );
    return derive(pin, salt.value, ITERATIONS);
  }
  private async uniquePin(sql: SqlDriver, pin: string, lookup: string, except: string) {
    const others = await sql.query<Credentials>(
      'SELECT * FROM employees WHERE active=1 AND id<>?',
      [except],
    );
    for (const other of others) {
      if (
        other.pin_lookup === lookup ||
        (!other.pin_lookup &&
          equalHash(await derive(pin, other.salt, other.iterations), other.pin_hash))
      )
        throw new Error('Ese PIN ya está asignado a otro empleado activo. Elige uno diferente.');
    }
  }
  async login(pinOrIdentifier: string, compatibilityPin?: string) {
    this.lock();
    const generation = this.sessionGeneration;
    const pin = compatibilityPin ?? pinOrIdentifier;
    validatePin(pin);
    const getState = async (sql: SqlDriver) =>
      JSON.parse(
        (await sql.query<{ value: string }>("SELECT value FROM settings WHERE key='pinAccess'"))[0]
          .value,
      ) as { failed: number; until: string | null };
    const state = await this.db.read(getState);
    if (state.until && new Date(state.until).getTime() > Date.now())
      throw new Error(
        'Acceso bloqueado temporalmente por intentos fallidos. Espera antes de reintentar.',
      );
    const lookup = await this.lookup(pin);
    const candidates = await this.db.read((sql) =>
      sql.query<Credentials>(
        'SELECT * FROM employees WHERE active=1 AND (pin_lookup=? OR pin_lookup IS NULL)',
        [lookup],
      ),
    );
    const matches: Credentials[] = [];
    for (const candidate of candidates)
      if (equalHash(await derive(pin, candidate.salt, candidate.iterations), candidate.pin_hash))
        matches.push(candidate);
    const outcome = await this.db.transaction(async (sql) => {
      if (generation !== this.sessionGeneration)
        return { error: 'El acceso se canceló. Inicia sesión de nuevo.' };
      const state = await getState(sql);
      if (state.until && new Date(state.until).getTime() > Date.now())
        return {
          error:
            'Acceso bloqueado temporalmente por intentos fallidos. Espera antes de reintentar.',
        };
      const current = await sql.query<Credentials>(
        'SELECT * FROM employees WHERE active=1 AND (pin_lookup=? OR pin_lookup IS NULL)',
        [lookup],
      );
      const valid = current.filter((row) =>
        matches.some(
          (match) =>
            match.id === row.id && match.pin_hash === row.pin_hash && match.salt === row.salt,
        ),
      );
      const row = valid.length === 1 ? valid[0] : undefined;
      const expectedIdentifier =
        compatibilityPin !== undefined ? identifier(pinOrIdentifier) : null;
      if (
        !row ||
        (expectedIdentifier && row.identifier !== expectedIdentifier) ||
        (row.locked_until && new Date(row.locked_until).getTime() > Date.now())
      ) {
        const failed = state.failed + 1;
        const until =
          failed >= 5
            ? new Date(
                Date.now() + Math.min(300, 30 * 2 ** Math.min(failed - 5, 4)) * 1000,
              ).toISOString()
            : null;
        await sql.run("UPDATE settings SET value=? WHERE key='pinAccess'", [
          JSON.stringify({ failed, until }),
        ]);
        await audit(sql, null, 'employee.login_failed', 'pin', { ambiguous: valid.length > 1 });
        return {
          error: until
            ? 'Acceso bloqueado temporalmente por intentos fallidos.'
            : valid.length > 1
              ? 'Este PIN se repite en empleados anteriores a la actualización. Un administrador con PIN exclusivo debe restablecer los PIN repetidos.'
              : 'PIN no válido o empleado inactivo.',
        };
      }
      await this.uniquePin(sql, pin, lookup, row.id);
      await sql.run(
        'UPDATE employees SET pin_lookup=?,failed_attempts=0,locked_until=NULL WHERE id=?',
        [lookup, row.id],
      );
      await sql.run("UPDATE settings SET value=? WHERE key='pinAccess'", [
        JSON.stringify({ failed: 0, until: null }),
      ]);
      await audit(sql, row, 'employee.login', row.id);
      return { id: row.id };
    });
    if ('error' in outcome) throw new Error(outcome.error);
    if (generation !== this.sessionGeneration)
      throw new SessionError('El acceso se canceló. Inicia sesión de nuevo.');
    this.actorId = outcome.id!;
    return this.current();
  }
  list() {
    return this.db.read(async (sql) => {
      await this.require(sql, 'employees');
      const rows = await sql.query<{ id: string }>(
        'SELECT id FROM employees ORDER BY name COLLATE NOCASE',
      );
      const result: Employee[] = [];
      for (const row of rows) result.push(await employee(sql, row.id));
      return result;
    });
  }
  async save(input: EmployeeInput) {
    const name = textRequired(input.name, 'el nombre del empleado');
    const code = identifier(input.identifier);
    if (!Object.hasOwn(ROLE_LABELS, input.role) || ![0, 1].includes(input.active))
      throw new Error('Rol o estado no válido.');
    const encoded = input.pin ? await encodePin(input.pin) : undefined;
    const lookup = input.pin ? await this.lookup(input.pin) : undefined;
    return this.db.transaction(async (sql) => {
      const actor = await this.require(sql, 'employees');
      const id = input.id || newId();
      const [old] = await sql.query<Credentials>('SELECT * FROM employees WHERE id=?', [id]);
      if (!old && !encoded) throw new Error('Establece un PIN para el nuevo empleado.');
      if (old && !old.active && input.active && !encoded)
        throw new Error('Confirma un PIN exclusivo al reactivar al empleado.');
      if (input.active && input.pin && lookup) await this.uniquePin(sql, input.pin, lookup, id);
      await sql.run(
        `INSERT INTO employees(id,name,identifier,role,active,pin_hash,salt,iterations,created_at,pin_lookup) VALUES(?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name,identifier=excluded.identifier,role=excluded.role,active=excluded.active,pin_hash=excluded.pin_hash,salt=excluded.salt,iterations=excluded.iterations,pin_lookup=excluded.pin_lookup`,
        [
          id,
          name,
          code,
          input.role,
          input.active,
          encoded?.hash || old.pin_hash,
          encoded?.salt || old.salt,
          encoded ? ITERATIONS : old.iterations,
          timestamp(),
          lookup ?? old?.pin_lookup ?? null,
        ],
      );
      if (encoded)
        await sql.run('UPDATE employees SET failed_attempts=0,locked_until=NULL WHERE id=?', [id]);
      await permissions(sql, id, input.permissions);
      const admins = await sql.query<{ id: string }>(
        "SELECT id FROM employees WHERE role='admin' AND active=1",
      );
      let recoverable = false;
      for (const admin of admins) {
        const item = await employee(sql, admin.id);
        if (item.permissions.includes('employees') && item.permissions.includes('settings'))
          recoverable = true;
      }
      if (!recoverable)
        throw new Error(
          'Debe quedar al menos un administrador activo con permisos de empleados y configuración.',
        );
      await audit(sql, actor, old ? 'employee.update' : 'employee.create', id, {
        role: input.role,
        active: input.active,
        permissions: input.permissions,
        pinChanged: !!encoded,
      });
      return id;
    });
  }
  auditHistory() {
    return this.db.read(async (sql) => {
      await this.require(sql, 'employees');
      return sql.query<AuditRow>(
        'SELECT * FROM administrative_actions ORDER BY rowid DESC LIMIT 200',
      );
    });
  }
}
