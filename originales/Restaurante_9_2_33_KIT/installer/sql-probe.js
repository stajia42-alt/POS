'use strict';
// Prueba de solo lectura: recibe la configuracion mediante stdin, nunca por argumentos.
const path = require('path');
const { createRequire } = require('module');
const runtimeRequire = createRequire(path.join(__dirname, '..', 'runtime', 'loader.js'));
const sql = runtimeRequire('mssql');
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; if (input.length > 8192) process.exit(3); });
process.stdin.on('end', async () => {
  let pool;
  try {
    const c = JSON.parse(input.trim());
    const port = Number(c.port);
    if (!c.server || !c.database || !c.user || !c.password ||
        !Number.isInteger(port) || port < 1 || port > 65535) process.exit(3);
    pool = new sql.ConnectionPool({
      server: String(c.server), port, database: String(c.database),
      user: String(c.user), password: String(c.password),
      connectionTimeout: 3500, requestTimeout: 3500,
      pool: { max: 1, min: 0, idleTimeoutMillis: 2000 },
      options: { encrypt: false, trustServerCertificate: true, useUTC: true }
    });
    pool.on('error', () => {});
    await pool.connect();
    // Verificar la base de Soft Restaurant sin modificar tablas, cuentas ni ventas.
    const result = await pool.request().query(
      "SELECT OBJECT_ID('dbo.cheques','U') AS cheques, OBJECT_ID('dbo.productos','U') AS productos"
    );
    if (!result.recordset[0]?.cheques || !result.recordset[0]?.productos) process.exitCode = 4;
    else { process.stdout.write('OK\n'); process.exitCode = 0; }
  } catch (_) {
    process.stdout.write('NO_VALIDADA\n');
    process.exitCode = 2;
  } finally {
    if (pool) await pool.close().catch(() => {});
  }
});
