// A test-only D1 adapter. The backend keeps its statements behind `d1Store`,
// so these tests run the real SQL against Node's in-memory SQLite.
import { DatabaseSync } from "node:sqlite";

export function createSqliteD1() {
  const database = new DatabaseSync(":memory:");

  const prepare = (sql) => {
    const statement = database.prepare(sql);
    let bound = [];

    const prepared = {
      bind(...args) {
        bound = args;
        return prepared;
      },
      async first() {
        return statement.get(...bound) ?? null;
      },
      async all() {
        return { results: statement.all(...bound), success: true, meta: {} };
      },
      async run() {
        const result = statement.run(...bound);
        return {
          success: true,
          meta: {
            changes: Number(result.changes),
            last_row_id: Number(result.lastInsertRowid),
          },
        };
      },
    };

    return prepared;
  };

  return {
    prepare,
    async exec(sql) {
      database.exec(sql);
    },
    async batch(statements) {
      database.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) {
          results.push(await statement.run());
        }
        database.exec("COMMIT");
        return results;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    close() {
      database.close();
    },
  };
}
