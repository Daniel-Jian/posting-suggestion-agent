import { createEmbedding } from "./embeddings";

export type AcceptedPostingVectorMetadata = {
  posting_id: string;
  run_id: string;
  case_id: string;
  transaction_id: string;
  account_code: string;
  account_name: string;
  amount_gross: number;
  currency: string;
  posting_text: string;
  summary: string;
};

export async function storeAcceptedPostingVector(
  env: Env,
  vectorId: string,
  embeddingText: string,
  metadata: AcceptedPostingVectorMetadata
): Promise<void> {
  const vector = await createEmbedding(env, embeddingText);

  await upsertAcceptedPostingVector(env, vectorId, vector, metadata);
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
