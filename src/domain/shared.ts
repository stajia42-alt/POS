import type { SqlDriver } from '../db/database';
import type { Actor } from './access-types';

export const newId = () => crypto.randomUUID();
export const timestamp = () => new Date().toISOString();
export function textRequired(value: string, label: string, max = 120): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    throw new Error(`Escribe ${label} (máximo ${max} caracteres).`);
  return value.trim();
}
export function audit(
  sql: SqlDriver,
  actor: Pick<Actor, 'id' | 'name'>,
  action: string,
  target: string,
  details: object = {},
) {
  return sql.run(
    'INSERT INTO administrative_actions(id,actor_id,actor_name,action,target,details,created_at) VALUES(?,?,?,?,?,?,?)',
    [newId(), actor.id, actor.name, action, target, JSON.stringify(details), timestamp()],
  );
}
