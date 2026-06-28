import type { PostingSuggestion } from "../types";

export type AcceptedPostingRecord = {
  id: string;
  run_id: string;
  case_id: string;
  transaction_id: string;
  matched_receipt_id: string | null;
  account_code: string;
  account_name: string;
  vat_rate: number | null;
  amount_gross: number;
  currency: string;
  posting_text: string;
  confidence: number;
  posting_json: PostingSuggestion;
  embedding_text: string;
  vector_id: string;
};

export async function storeAcceptedPosting(
  env: Env,
  posting: AcceptedPostingRecord
): Promise<void> {
  await env.DB.prepare(
    `
    INSERT INTO accepted_postings (
      id,
      source_case_id,
      posting_json,
      run_id,
      transaction_id,
      matched_receipt_id,
      account_code,
      account_name,
      vat_rate,
      amount_gross,
      currency,
      posting_text,
      confidence,
      embedding_text,
      vector_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  )
    .bind(
      posting.id,
      posting.case_id,
      JSON.stringify(posting.posting_json),
      posting.run_id,
      posting.transaction_id,
      posting.matched_receipt_id,
      posting.account_code,
      posting.account_name,
      posting.vat_rate,
      posting.amount_gross,
      posting.currency,
      posting.posting_text,
      posting.confidence,
      posting.embedding_text,
      posting.vector_id
    )
    .run();
}

export async function deleteAcceptedPosting(env: Env, id: string): Promise<void> {
  await env.DB.prepare("DELETE FROM accepted_postings WHERE id = ?").bind(id).run();
}
