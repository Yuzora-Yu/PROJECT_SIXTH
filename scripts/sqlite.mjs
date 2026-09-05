import { DatabaseSync } from "node:sqlite";
export function localDatabase(filename = ":memory:") {
  const native = new DatabaseSync(filename);
  native.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;");
  return {
    native,
    prepare(sql) {
      const params = [];
      return {
        sql,
        params,
        bind(...values) {
          this.params = values;
          return this;
        },
        async first() {
          return native.prepare(sql).get(...this.params) || null;
        },
        async all() {
          return { results: native.prepare(sql).all(...this.params) };
        },
        async run() {
          const r = native.prepare(sql).run(...this.params);
          return { meta: { changes: Number(r.changes) } };
        },
      };
    },
    async batch(statements) {
      native.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map((s) => {
          const r = native.prepare(s.sql).run(...s.params);
          return { meta: { changes: Number(r.changes) } };
        });
        native.exec("COMMIT");
        return results;
      } catch (e) {
        native.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
