DROP TABLE IF EXISTS accepted_postings;

CREATE TABLE accepted_postings (
  id TEXT PRIMARY KEY,
  source_case_id TEXT,
  posting_json TEXT NOT NULL,
  run_id TEXT,
  transaction_id TEXT NOT NULL,
  matched_receipt_id TEXT,
  account_code TEXT NOT NULL,
  account_name TEXT NOT NULL,
  vat_rate REAL,
  amount_gross REAL NOT NULL,
  currency TEXT NOT NULL,
  posting_text TEXT NOT NULL,
  confidence REAL,
  embedding_text TEXT NOT NULL,
  vector_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX accepted_postings_source_case_id_idx
  ON accepted_postings (source_case_id);

CREATE INDEX accepted_postings_vector_id_idx
  ON accepted_postings (vector_id);

CREATE INDEX accepted_postings_account_code_idx
  ON accepted_postings (account_code);
