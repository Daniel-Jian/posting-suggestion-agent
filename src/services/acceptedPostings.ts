import { createEmbedding } from "./embeddings";
import { deleteAcceptedPosting, storeAcceptedPosting } from "./storage";
import { upsertAcceptedPostingVector } from "./vectorMemory";
import type {
  AcceptedPostingRequest,
  AcceptedPostingResponse,
  PostingDecision,
  PostingSuggestion,
  SimilarPostingExample,
  SuggestedPosting
} from "../types";

export class AcceptedPostingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AcceptedPostingValidationError";
  }
}

export class AcceptedPostingStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AcceptedPostingStorageError";
  }
}

export type AcceptedPostingLogger = (
  event: string,
  metadata?: Record<string, unknown>
) => void;

export async function storeAcceptedPostingsFromRunResponse(
  env: Env,
  input: unknown,
  options: {
    log?: AcceptedPostingLogger;
  } = {}
): Promise<AcceptedPostingResponse> {
  const request = normalizeAcceptedPostingRequest(input);
  const insertedPostingIds: string[] = [];
  const upsertedVectorIds: string[] = [];

  try {
    for (const suggestion of request.data.suggestions) {
      const postingId = crypto.randomUUID();
      const vectorId = `accepted_posting:${postingId}`;
      const suggestedPosting = suggestion.suggested_posting;
      const embeddingText = buildAcceptedPostingEmbeddingText(suggestion);
      const embedding = await createEmbedding(env, embeddingText);

      await storeAcceptedPosting(env, {
        id: postingId,
        run_id: request.data.run_id,
        case_id: suggestion.case_id,
        transaction_id: suggestion.transaction_id,
        matched_receipt_id: suggestion.matched_receipt_id ?? null,
        account_code: suggestedPosting.account_code,
        account_name: suggestedPosting.account_name,
        vat_rate: suggestedPosting.vat_rate ?? null,
        amount_gross: suggestedPosting.amount_gross,
        currency: suggestedPosting.currency,
        posting_text: suggestedPosting.posting_text,
        confidence: suggestion.confidence,
        posting_json: suggestion,
        embedding_text: embeddingText,
        vector_id: vectorId
      });
      insertedPostingIds.push(postingId);

      await upsertAcceptedPostingVector(env, vectorId, embedding, {
        posting_id: postingId,
        run_id: request.data.run_id,
        case_id: suggestion.case_id,
        transaction_id: suggestion.transaction_id,
        account_code: suggestedPosting.account_code,
        account_name: suggestedPosting.account_name,
        amount_gross: suggestedPosting.amount_gross,
        currency: suggestedPosting.currency,
        posting_text: suggestedPosting.posting_text,
        summary: buildAcceptedPostingSummary(suggestion)
      });
      upsertedVectorIds.push(vectorId);
    }
  } catch (err) {
    await cleanupAcceptedPostingWrites(env, insertedPostingIds, upsertedVectorIds, options.log);
    throw new AcceptedPostingStorageError("Accepted posting storage failed.");
  }

  return {
    stored_count: insertedPostingIds.length,
    accepted_posting_ids: insertedPostingIds,
    vector_ids: upsertedVectorIds
  };
}

function normalizeAcceptedPostingRequest(value: unknown): AcceptedPostingRequest {
  if (!isObject(value) || value.success !== true || !isObject(value.data)) {
    throw new AcceptedPostingValidationError(
      "Request body must be a successful suggestion run response."
    );
  }

  const runId = requireString(value.data.run_id, "data.run_id");

  if (!Array.isArray(value.data.suggestions) || value.data.suggestions.length === 0) {
    throw new AcceptedPostingValidationError("Request body must include suggestions.");
  }

  return {
    success: true,
    data: {
      run_id: runId,
      suggestions: value.data.suggestions.map(normalizePostingSuggestion),
      summary: {
        case_count: 0,
        suggestion_count: value.data.suggestions.length,
        auto_post_candidates: 0,
        needs_human_approval: 0,
        manual_review: 0
      }
    }
  };
}

function normalizePostingSuggestion(value: unknown): PostingSuggestion {
  if (!isObject(value)) {
    throw new AcceptedPostingValidationError("Suggestion must be an object.");
  }

  return {
    case_id: requireString(value.case_id, "case_id"),
    transaction_id: requireString(value.transaction_id, "transaction_id"),
    matched_receipt_id: normalizeNullableString(value.matched_receipt_id, "matched_receipt_id"),
    suggested_posting: normalizeSuggestedPosting(value.suggested_posting),
    confidence: requireNumber(value.confidence, "confidence"),
    decision: normalizeDecision(value.decision),
    evidence: normalizeStringArray(value.evidence, "evidence"),
    risks: normalizeStringArray(value.risks, "risks"),
    similar_examples: normalizeSimilarExamples(value.similar_examples),
    source: normalizeSuggestionSource(value.source)
  };
}

function normalizeSuggestedPosting(value: unknown): SuggestedPosting {
  if (!isObject(value)) {
    throw new AcceptedPostingValidationError("suggested_posting must be an object.");
  }

  return {
    account_code: requireString(value.account_code, "suggested_posting.account_code"),
    account_name: requireString(value.account_name, "suggested_posting.account_name"),
    vat_rate: normalizeNullableNumber(value.vat_rate, "suggested_posting.vat_rate"),
    amount_gross: requireNumber(value.amount_gross, "suggested_posting.amount_gross"),
    currency: requireString(value.currency, "suggested_posting.currency"),
    posting_text: requireString(value.posting_text, "suggested_posting.posting_text")
  };
}

function buildAcceptedPostingEmbeddingText(suggestion: PostingSuggestion): string {
  const posting = suggestion.suggested_posting;

  return [
    `Case ID: ${suggestion.case_id}`,
    `Transaction ID: ${suggestion.transaction_id}`,
    `Matched receipt ID: ${suggestion.matched_receipt_id ?? "none"}`,
    `Accepted account: ${posting.account_code} ${posting.account_name}`,
    `Accepted VAT rate: ${posting.vat_rate ?? "none"}`,
    `Accepted amount: ${posting.amount_gross} ${posting.currency}`,
    `Accepted posting text: ${posting.posting_text}`,
    `Decision: ${suggestion.decision}`,
    `Confidence: ${suggestion.confidence}`,
    `Evidence: ${suggestion.evidence.join(" | ")}`,
    `Risks: ${suggestion.risks.join(" | ")}`
  ].join("\n");
}

function buildAcceptedPostingSummary(suggestion: PostingSuggestion): string {
  const posting = suggestion.suggested_posting;

  return `${posting.account_code} ${posting.account_name}: ${posting.posting_text}`;
}

function normalizeSimilarExamples(value: unknown): SimilarPostingExample[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isObject)
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : "",
      score: typeof item.score === "number" && Number.isFinite(item.score) ? item.score : 0,
      account_code: typeof item.account_code === "string" ? item.account_code : "",
      account_name: typeof item.account_name === "string" ? item.account_name : "",
      vat_rate: typeof item.vat_rate === "number" && Number.isFinite(item.vat_rate) ? item.vat_rate : null,
      posting_text: typeof item.posting_text === "string" ? item.posting_text : "",
      summary: typeof item.summary === "string" ? item.summary : ""
    }));
}

function normalizeSuggestionSource(value: unknown): PostingSuggestion["source"] {
  if (!isObject(value)) {
    return {
      retrieval_used: false,
      llm_used: true,
      model: ""
    };
  }

  return {
    retrieval_used: value.retrieval_used === true,
    llm_used: value.llm_used !== false,
    model: typeof value.model === "string" ? value.model : ""
  };
}

async function cleanupAcceptedPostingWrites(
  env: Env,
  postingIds: string[],
  vectorIds: string[],
  log?: AcceptedPostingLogger
): Promise<void> {
  for (const postingId of postingIds) {
    try {
      await deleteAcceptedPosting(env, postingId);
    } catch (err) {
      log?.("accepted_posting_cleanup_failed", {
        target: "d1",
        postingId,
        errorName: err instanceof Error ? err.name : "UnknownError"
      });
    }
  }

  if (vectorIds.length === 0) {
    return;
  }

  try {
    await env.POSTING_INDEX.deleteByIds(vectorIds);
  } catch (err) {
    log?.("accepted_posting_cleanup_failed", {
      target: "vectorize",
      vectorCount: vectorIds.length,
      errorName: err instanceof Error ? err.name : "UnknownError"
    });
  }
}

function normalizeDecision(value: unknown): PostingDecision {
  if (
    value === "auto_post_candidate" ||
    value === "needs_human_approval" ||
    value === "manual_review"
  ) {
    return value;
  }

  throw new AcceptedPostingValidationError("Suggestion decision is invalid.");
}

function normalizeStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new AcceptedPostingValidationError(`${field} must be an array.`);
  }

  return value.map((item) => requireString(item, field));
}

function normalizeNullableString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return requireString(value, field);
}

function normalizeNullableNumber(value: unknown, field: string): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  return requireNumber(value, field);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AcceptedPostingValidationError(`${field} must be a non-empty string.`);
  }

  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new AcceptedPostingValidationError(`${field} must be a finite number.`);
  }

  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
