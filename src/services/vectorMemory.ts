import { createEmbedding } from "./embeddings";
import type { SimilarPostingExample, UnresolvedCase } from "../types";

export type AcceptedPostingVectorMetadata = {
  posting_id: string;
  run_id: string;
  case_id: string;
  transaction_id: string;
  account_code: string;
  account_name: string;
  vat_rate?: number;
  amount_gross: number;
  currency: string;
  posting_text: string;
  summary: string;
};

export type RetrievedSimilarPosting = SimilarPostingExample & {
  amount_gross: number | null;
  currency: string;
};

export async function findSimilarAcceptedPostings(
  env: Env,
  unresolvedCase: UnresolvedCase,
  options: {
    topK?: number;
    minScore?: number;
  } = {}
): Promise<RetrievedSimilarPosting[]> {
  const queryText = buildUnresolvedCaseQueryText(unresolvedCase);
  const vector = await createEmbedding(env, queryText);
  const result = await env.POSTING_INDEX.query(vector, {
    topK: options.topK ?? 3,
    returnMetadata: true
  });

  return result.matches
    .filter((match) => match.score >= (options.minScore ?? 0.65))
    .map(mapVectorizeMatch);
}

export async function storeAcceptedPostingVector(
  env: Env,
  vectorId: string,
  embeddingText: string,
  metadata: AcceptedPostingVectorMetadata
): Promise<void> {
  const vector = await createEmbedding(env, embeddingText);

  await upsertAcceptedPostingVector(env, vectorId, vector, metadata);
}

function buildUnresolvedCaseQueryText(unresolvedCase: UnresolvedCase): string {
  const transaction = unresolvedCase.transaction;
  const lines = [
    `Transaction counterparty: ${transaction.counterparty_name ?? ""}`,
    `Transaction purpose: ${transaction.purpose ?? ""}`,
    `Transaction amount: ${transaction.amount} ${transaction.currency}`,
    `Transaction booking date: ${transaction.booking_date}`
  ];

  for (const receipt of unresolvedCase.candidate_receipts ?? []) {
    lines.push(
      `Candidate receipt supplier: ${receipt.supplier_name ?? ""}`,
      `Candidate receipt description: ${receipt.description ?? ""}`,
      `Candidate receipt amount: ${receipt.gross_amount} ${receipt.currency}`,
      `Candidate receipt OCR: ${receipt.ocr_text ?? ""}`
    );
  }

  return lines.filter((line) => !line.endsWith(": ")).join("\n");
}

function mapVectorizeMatch(match: VectorizeMatch): RetrievedSimilarPosting {
  const metadata = isObject(match.metadata) ? match.metadata : {};

  return {
    id: String(match.id),
    score: match.score,
    account_code: getStringMetadata(metadata, "account_code"),
    account_name: getStringMetadata(metadata, "account_name"),
    vat_rate: getNumberMetadata(metadata, "vat_rate"),
    amount_gross: getNumberMetadata(metadata, "amount_gross"),
    currency: getStringMetadata(metadata, "currency"),
    posting_text: getStringMetadata(metadata, "posting_text"),
    summary: getStringMetadata(metadata, "summary")
  };
}

function getStringMetadata(metadata: Record<string, unknown>, key: string): string {
  const value = metadata[key];

  return typeof value === "string" ? value : "";
}

function getNumberMetadata(metadata: Record<string, unknown>, key: string): number | null {
  const value = metadata[key];

  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function upsertAcceptedPostingVector(
  env: Env,
  vectorId: string,
  vector: number[],
  metadata: AcceptedPostingVectorMetadata
): Promise<void> {
  await env.POSTING_INDEX.upsert([
    {
      id: vectorId,
      values: vector,
      metadata
    }
  ]);
}
