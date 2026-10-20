import type { Database as WasmDatabase, SqlJsStatic } from 'sql.js';
import type { SqlDriver, SqlValue } from './database';

export interface Persistence {
  load(): Promise<Uint8Array | undefined>;
  save(data: Uint8Array): Promise<void>;
}

export class WasmDriver implements SqlDriver {
  private db: WasmDatabase;
  private backup?: Uint8Array;

  constructor(
    private readonly sqlite: SqlJsStatic,
    private readonly persistence: Persistence,
    data?: Uint8Array,
  ) {
    this.db = new sqlite.Database(data);
    this.db.run('PRAGMA foreign_keys = ON');
  }

  async query<T>(sql: string, values: SqlValue[] = []): Promise<T[]> {
    const statement = this.db.prepare(sql);
    try {
      statement.bind(values);
      const rows: T[] = [];
      while (statement.step()) rows.push(statement.getAsObject() as T);
      return rows;
    } finally {
      statement.free();
    }
  }

  async run(sql: string, values: SqlValue[] = []): Promise<void> {
    this.db.run(sql, values);
  }
  async begin(): Promise<void> {
    this.backup = this.db.export();
    this.db.run('PRAGMA foreign_keys = ON');
    this.db.run('BEGIN IMMEDIATE');
  }
  async commit(): Promise<void> {
    this.db.run('COMMIT');
    await this.persistence.save(this.db.export());
    this.db.run('PRAGMA foreign_keys = ON');
    this.backup = undefined;
  }
  async rollback(): Promise<void> {
    if (this.backup) {
      this.db.close();
      this.db = new this.sqlite.Database(this.backup);
      this.db.run('PRAGMA foreign_keys = ON');
      this.backup = undefined;
    }
  }
}
