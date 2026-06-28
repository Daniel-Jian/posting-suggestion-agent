ALTER TABLE accepted_postings
  ADD COLUMN run_id TEXT;

ALTER TABLE accepted_postings
  ADD COLUMN transaction_id TEXT;

ALTER TABLE accepted_postings
  ADD COLUMN matched_receipt_id TEXT;

ALTER TABLE accepted_postings
  ADD COLUMN account_code TEXT;

ALTER TABLE accepted_postings
  ADD COLUMN account_name TEXT;

ALTER TABLE accepted_postings
  ADD COLUMN vat_rate REAL;

ALTER TABLE accepted_postings
  ADD COLUMN amount_gross REAL;

ALTER TABLE accepted_postings
  ADD COLUMN currency TEXT;

ALTER TABLE accepted_postings
  ADD COLUMN posting_text TEXT;

ALTER TABLE accepted_postings
  ADD COLUMN confidence REAL;

ALTER TABLE accepted_postings
  ADD COLUMN embedding_text TEXT;

ALTER TABLE accepted_postings
  ADD COLUMN vector_id TEXT;

CREATE INDEX accepted_postings_vector_id_idx
  ON accepted_postings (vector_id);

CREATE INDEX accepted_postings_account_code_idx
  ON accepted_postings (account_code);
