// Native Android persistence: a real SQLite database via @capacitor-community/sqlite.
// Loaded only inside the Android app (dynamic import), never during SSR or on the web.
import type { AuditEntry, Customer, DB, Settings, Tx } from "./ledger";

const DB_NAME = "tali_khata";
const SCHEMA_VERSION = 1;

// Migrations are append-only: never edit a released step, add a new one.
const MIGRATIONS: Record<number, string[]> = {
  1: [
    `CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER);`,
    `CREATE TABLE IF NOT EXISTS txs (id TEXT PRIMARY KEY NOT NULL, customer_id TEXT, type TEXT NOT NULL, amount REAL NOT NULL, date INTEGER NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER);`,
    `CREATE INDEX IF NOT EXISTS idx_txs_customer ON txs(customer_id);`,
    `CREATE INDEX IF NOT EXISTS idx_txs_date ON txs(date);`,
    `CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL, at INTEGER NOT NULL);`,
    `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);`,
  ],
};

type Conn = {
  open(): Promise<void>;
  execute(sql: string, transaction?: boolean): Promise<unknown>;
  query(sql: string, values?: unknown[]): Promise<{ values?: Record<string, unknown>[] }>;
  executeSet(set: { statement: string; values: unknown[] }[], transaction?: boolean): Promise<unknown>;
};

let conn: Conn | null = null;

export async function openSqlite(): Promise<Conn> {
  if (conn) return conn;
  const { CapacitorSQLite, SQLiteConnection } = await import("@capacitor-community/sqlite");
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  const exists = (await sqlite.isConnection(DB_NAME, false)).result;
  const c = (exists
    ? await sqlite.retrieveConnection(DB_NAME, false)
    : await sqlite.createConnection(DB_NAME, false, "no-encryption", 1, false)) as unknown as Conn;
  await c.open();
  await c.execute(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);`);
  const row = (await c.query(`SELECT value FROM meta WHERE key='schema_version'`)).values?.[0];
  let v = row ? Number(row.value) : 0;
  while (v < SCHEMA_VERSION) {
    v++;
    const set = MIGRATIONS[v].map((statement) => ({ statement, values: [] as unknown[] }));
    set.push({ statement: `INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)`, values: [String(v)] });
    await c.executeSet(set, true);
  }
  conn = c;
  return c;
}

export async function loadAll(): Promise<Partial<DB> | null> {
  const c = await openSqlite();
  const rows = async (sql: string) => (await c.query(sql)).values ?? [];
  const customers = (await rows(`SELECT data FROM customers`)).map((r) => JSON.parse(String(r.data)) as Customer);
  const txs = (await rows(`SELECT data FROM txs`)).map((r) => JSON.parse(String(r.data)) as Tx);
  const audit = (await rows(`SELECT data FROM audit ORDER BY at`)).map((r) => JSON.parse(String(r.data)) as AuditEntry);
  const s = (await rows(`SELECT value FROM settings WHERE key='app'`))[0];
  if (!customers.length && !txs.length && !s) return null;
  return { customers, txs, audit, ...(s ? { settings: JSON.parse(String(s.value)) as Settings } : {}) };
}

/** Writes only rows whose object identity changed, inside one SQL transaction. */
export async function persistDiff(prev: DB, next: DB) {
  const c = await openSqlite();
  const set: { statement: string; values: unknown[] }[] = [];
  const prevC = new Set(prev.customers);
  for (const x of next.customers)
    if (!prevC.has(x))
      set.push({
        statement: `INSERT OR REPLACE INTO customers (id, data, updated_at, deleted_at) VALUES (?, ?, ?, ?)`,
        values: [x.id, JSON.stringify(x), x.updatedAt, x.deletedAt ?? null],
      });
  const prevT = new Set(prev.txs);
  for (const t of next.txs)
    if (!prevT.has(t))
      set.push({
        statement: `INSERT OR REPLACE INTO txs (id, customer_id, type, amount, date, data, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        values: [t.id, t.customerId ?? null, t.type, t.amount, t.date, JSON.stringify(t), t.updatedAt, t.deletedAt ?? null],
      });
  const prevA = new Set(prev.audit);
  for (const a of next.audit)
    if (!prevA.has(a))
      set.push({ statement: `INSERT OR REPLACE INTO audit (id, data, at) VALUES (?, ?, ?)`, values: [a.id, JSON.stringify(a), a.at] });
  if (prev.settings !== next.settings)
    set.push({ statement: `INSERT OR REPLACE INTO settings (key, value) VALUES ('app', ?)`, values: [JSON.stringify(next.settings)] });
  // Full replace (restore) can drop rows: remove ids no longer present.
  const goneC = prev.customers.filter((x) => !next.customers.some((n) => n.id === x.id));
  const goneT = prev.txs.filter((x) => !next.txs.some((n) => n.id === x.id));
  for (const g of goneC) set.push({ statement: `DELETE FROM customers WHERE id = ?`, values: [g.id] });
  for (const g of goneT) set.push({ statement: `DELETE FROM txs WHERE id = ?`, values: [g.id] });
  if (set.length) await c.executeSet(set, true);
}
