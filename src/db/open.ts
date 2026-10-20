import { Capacitor } from '@capacitor/core';
import { Database, type SqlDriver } from './database';
import { migrate, SCHEMA_VERSION } from './migrations';

export async function openDatabase(): Promise<Database> {
  let driver: SqlDriver;
  if (Capacitor.isNativePlatform()) {
    const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite');
    const sqlite = new SQLiteConnection(CapacitorSQLite);
    await sqlite.checkConnectionsConsistency();
    const connection = (await sqlite.isConnection('aviles_pos', false)).result
      ? await sqlite.retrieveConnection('aviles_pos', false)
      : await sqlite.createConnection('aviles_pos', false, 'no-encryption', SCHEMA_VERSION, false);
    await connection.open();
    await connection.execute('PRAGMA foreign_keys = ON;', false);
    driver = {
      async query<T>(sql: string, values = []) {
        return ((await connection.query(sql, values)).values as T[]) || [];
      },
      async run(sql, values = []) {
        await connection.run(sql, values, false);
      },
      async begin() {
        await connection.beginTransaction();
      },
      async commit() {
        await connection.commitTransaction();
      },
      async rollback() {
        if ((await connection.isTransactionActive()).result) await connection.rollbackTransaction();
      },
    };
  } else {
    const [{ default: init }, { default: wasmUrl }, { WasmDriver }, { indexedDbPersistence }] =
      await Promise.all([
        import('sql.js'),
        import('sql.js/dist/sql-wasm.wasm?url'),
        import('./wasm-driver'),
        import('./indexeddb'),
      ]);
    const persistence = indexedDbPersistence();
    const sqlite = await init({ locateFile: () => wasmUrl });
    driver = new WasmDriver(sqlite, persistence, await persistence.load());
  }
  const db = new Database(driver);
  await migrate(db);
  return db;
}
