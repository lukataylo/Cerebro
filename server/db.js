import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, 'data.db'));
db.pragma('journal_mode = WAL');
// We don't rely on FK cascades anywhere, and admin-scoped audit entries
// (rule edits) don't have a quote_id. Leaving FK enforcement off matches
// the long-standing behaviour of the app.
db.pragma('foreign_keys = OFF');

// Schema v3 — lifecycle + scorecard + audit log.
// Lifecycle: submitted → bound → processing (see TRIAGE_MODEL.md).
// Forward-migrations below keep older v2 dbs working.
db.exec(`
  CREATE TABLE IF NOT EXISTS quotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ref TEXT NOT NULL,

    assured TEXT NOT NULL,
    domicile_country TEXT,
    industry TEXT,

    cls TEXT NOT NULL,
    sub_class TEXT,
    geography TEXT,
    tiv_usd INTEGER,

    placement_type TEXT,
    inception_date TEXT,
    premium_k INTEGER NOT NULL,
    expiring_carrier TEXT,
    binder_id TEXT,

    loss_ratio_5yr REAL,
    years_of_losses INTEGER,

    -- Routing output
    dest_id TEXT NOT NULL,
    rule_id TEXT NOT NULL,
    fallback_dest_id TEXT,
    fallback_rule_id TEXT,
    score_json TEXT,
    state TEXT NOT NULL,                       -- submitted | bound | processing
    confidence INTEGER NOT NULL,
    reasoning TEXT,
    trace TEXT,

    -- Lifecycle
    final_terms_json TEXT,
    bound_at TEXT,
    locked INTEGER NOT NULL DEFAULT 0,

    broker TEXT,
    email_id INTEGER,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_addr TEXT NOT NULL,
    to_addr TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    received_at TEXT NOT NULL,
    attachments TEXT,
    source_type TEXT NOT NULL DEFAULT 'email',
    source_url TEXT
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quote_id INTEGER NOT NULL,
    ts TEXT NOT NULL,
    actor TEXT NOT NULL,                       -- 'cerebro' | 'broker' | 'system'
    event TEXT NOT NULL,                       -- ingested | extracted | routed | accepted | overridden | rfi_sent | bound | processing
    detail_json TEXT,
    FOREIGN KEY(quote_id) REFERENCES quotes(id)
  );

  CREATE INDEX IF NOT EXISTS idx_audit_quote ON audit_log(quote_id);
  CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_event ON audit_log(event);

  CREATE TABLE IF NOT EXISTS rules (
    id TEXT PRIMARY KEY,
    tier TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    priority INTEGER NOT NULL,
    kind TEXT NOT NULL,                        -- 'predicate' | 'builtin'
    predicate_json TEXT,
    dest_id TEXT NOT NULL,
    updated_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_rules_priority ON rules(priority);
`);

// ---- forward migrations ----
const emailCols = db.prepare("PRAGMA table_info(emails)").all().map(c => c.name);
if (!emailCols.includes('source_type')) {
  db.exec("ALTER TABLE emails ADD COLUMN source_type TEXT NOT NULL DEFAULT 'email'");
}
if (!emailCols.includes('source_url')) {
  db.exec("ALTER TABLE emails ADD COLUMN source_url TEXT");
}

const quoteCols = db.prepare("PRAGMA table_info(quotes)").all().map(c => c.name);
const addQuoteCol = (name, ddl) => {
  if (!quoteCols.includes(name)) db.exec(`ALTER TABLE quotes ADD COLUMN ${name} ${ddl}`);
};
addQuoteCol('fallback_dest_id', 'TEXT');
addQuoteCol('fallback_rule_id', 'TEXT');
addQuoteCol('score_json', 'TEXT');
addQuoteCol('final_terms_json', 'TEXT');
addQuoteCol('bound_at', 'TEXT');
addQuoteCol('locked', 'INTEGER NOT NULL DEFAULT 0');

export default db;
