import 'fake-indexeddb/auto';
import initSqlJs from 'sql.js';
import { expect, it } from 'vitest';
import { indexedDbPersistence } from '../src/db/indexeddb';
import { WasmDriver } from '../src/db/wasm-driver';
import { Database } from '../src/db/database';
import { migrate } from '../src/db/migrations';

it('guarda y restaura una base SQLite completa desde IndexedDB', async () => {
  const sql = await initSqlJs();
  const first = indexedDbPersistence('test-persist');
  const db = new Database(new WasmDriver(sql, first));
  await migrate(db);
  await db.transaction((d) =>
    d.run("INSERT INTO categories(id,name,color) VALUES('id','Café','#123456')"),
  );
  const reopened = indexedDbPersistence('test-persist');
  const bytes = await reopened.load();
  expect(bytes).toBeInstanceOf(Uint8Array);
  const db2 = new Database(new WasmDriver(sql, reopened, bytes));
  expect(await db2.read((d) => d.query('SELECT name FROM categories'))).toEqual([{ name: 'Café' }]);
});
