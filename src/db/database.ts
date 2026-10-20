export type SqlValue = string | number | null;
export interface SqlDriver {
  query<T>(sql: string, values?: SqlValue[]): Promise<T[]>;
  run(sql: string, values?: SqlValue[]): Promise<void>;
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

// Every read and write uses the same queue, including native SQLite calls.
// This prevents a UI refresh from observing half of a checkout transaction.
export class Database {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private readonly driver: SqlDriver) {}

  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const task = this.tail.then(fn);
    this.tail = task.catch(() => undefined);
    return task;
  }

  read<T>(fn: (sql: SqlDriver) => Promise<T>): Promise<T> {
    return this.exclusive(() => fn(this.driver));
  }

  transaction<T>(fn: (sql: SqlDriver) => Promise<T>): Promise<T> {
    return this.exclusive(async () => {
      await this.driver.begin();
      try {
        const result = await fn(this.driver);
        await this.driver.commit();
        return result;
      } catch (error) {
        await this.driver.rollback();
        throw error;
      }
    });
  }
}
