CREATE TABLE suggestion_runs (
  id TEXT PRIMARY KEY,
  unresolved_cases_json TEXT NOT NULL,
  suggestions_json TEXT,
  status TEXT NOT NULL DEFAULT 'stubbed',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE accepted_postings (
  id TEXT PRIMARY KEY,
  source_case_id TEXT,
  posting_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX accepted_postings_source_case_id_idx
  ON accepted_postings (source_case_id);
