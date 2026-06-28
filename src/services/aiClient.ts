import { buildSuggestionPrompt, buildSystemPrompt } from "./promptBuilder";
import type {
  PostingDecision,
  PostingSuggestion,
  SuggestionRunRequest,
  SuggestionRunResponse,
  SuggestedPosting
} from "../types";

type RawAiResponse = {
  response?: unknown;
};

type RawPostingSuggestion = {
  case_id?: unknown;
  transaction_id?: unknown;
  matched_receipt_id?: unknown;
  suggested_posting?: unknown;
  confidence?: unknown;
  decision?: unknown;
  evidence?: unknown;
  risks?: unknown;
};

const suggestionResponseSchema = {
  type: "object",
  required: [
    "case_id",
    "transaction_id",
    "matched_receipt_id",
    "suggested_posting",
    "confidence",
    "decision",
    "evidence",
    "risks"
  ],
  properties: {
    case_id: { type: "string" },
    transaction_id: { type: "string" },
    matched_receipt_id: { type: ["string", "null"] },
    suggested_posting: {
      type: "object",
      required: ["account_code", "account_name", "amount_gross", "currency", "posting_text"],
      properties: {
        account_code: { type: "string" },
        account_name: { type: "string" },
        vat_rate: { type: ["number", "null"] },
        amount_gross: { type: "number" },
        currency: { type: "string" },
        posting_text: { type: "string" }
      }
    },
    confidence: { type: "number" },
    decision: {
      type: "string",
      enum: ["auto_post_candidate", "needs_human_approval", "manual_review"]
    },
    evidence: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } }
  }
};

export class AiSuggestionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiSuggestionError";
  }
}

export class AiSuggestionTimeoutError extends AiSuggestionError {
  constructor(message = "Workers AI timed out after 45 seconds.") {
    super(message);
    this.name = "AiSuggestionTimeoutError";
  }
}

export type SuggestionRunLogger = (event: string, metadata?: Record<string, unknown>) => void;

export async function createPostingSuggestions(
  env: Env,
  input: SuggestionRunRequest,
  options: {
    log?: SuggestionRunLogger;
    timeoutMs?: number;
  } = {}
): Promise<SuggestionRunResponse> {
  const suggestions: PostingSuggestion[] = [];

  for (const unresolvedCase of input.cases) {
    const rawSuggestion = await generatePostingSuggestion(env, input, unresolvedCase.id, options);
    options.log?.("ai_parse_start", { caseId: unresolvedCase.id });
    suggestions.push(normalizeSuggestion(rawSuggestion, env.LLM_MODEL));
  }

  return {
    run_id: crypto.randomUUID(),
    suggestions,
    summary: {
      case_count: input.cases.length,
      suggestion_count: suggestions.length,
      auto_post_candidates: suggestions.filter(
        (suggestion) => suggestion.decision === "auto_post_candidate"
      ).length,
      needs_human_approval: suggestions.filter(
        (suggestion) => suggestion.decision === "needs_human_approval"
      ).length,
      manual_review: suggestions.filter((suggestion) => suggestion.decision === "manual_review")
        .length
    }
  };
}

async function generatePostingSuggestion(
  env: Env,
  input: SuggestionRunRequest,
  caseId: string,
  options: {
    log?: SuggestionRunLogger;
    timeoutMs?: number;
  }
): Promise<unknown> {
  const unresolvedCase = input.cases.find((candidate) => candidate.id === caseId);

  if (!unresolvedCase) {
    throw new AiSuggestionError("Unresolved case was not found.");
  }

  options.log?.("ai_start", {
    caseId,
    model: env.LLM_MODEL
  });

  const startedAt = Date.now();
  const response = (await withTimeout(
    env.AI.run(env.LLM_MODEL, {
      messages: [
        {
          role: "system",
          content: buildSystemPrompt()
        },
        {
          role: "user",
          content: buildSuggestionPrompt({
            unresolvedCase,
            accounts: input.accounts
          })
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: suggestionResponseSchema
      },
      temperature: 0.1,
      max_tokens: 1200
    }),
    options.timeoutMs ?? 45000
  )) as RawAiResponse | string;

  options.log?.("ai_success", {
    caseId,
    durationMs: Date.now() - startedAt
  });

  const responseText = typeof response === "string" ? response : String(response.response ?? "");
  return parseJsonObject(responseText);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new AiSuggestionTimeoutError(`Workers AI timed out after ${timeoutMs / 1000} seconds.`)
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function parseJsonObject(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    const start = value.indexOf("{");
    const end = value.lastIndexOf("}");

    if (start === -1 || end === -1 || end <= start) {
      throw new AiSuggestionError("Workers AI did not return JSON.");
    }

    try {
      return JSON.parse(value.slice(start, end + 1));
    } catch {
      throw new AiSuggestionError("Workers AI returned malformed JSON.");
    }
  }
}

function normalizeSuggestion(value: unknown, model: string): PostingSuggestion {
  if (!isObject(value)) {
    throw new AiSuggestionError("Workers AI returned an invalid suggestion.");
  }

  const raw = value as RawPostingSuggestion;
  const suggestedPosting = normalizeSuggestedPosting(raw.suggested_posting);
  const decision = normalizeDecision(raw.decision);

  return {
    case_id: requireString(raw.case_id, "case_id"),
    transaction_id: requireString(raw.transaction_id, "transaction_id"),
    matched_receipt_id:
      typeof raw.matched_receipt_id === "string" ? raw.matched_receipt_id : null,
    suggested_posting: suggestedPosting,
    confidence: normalizeConfidence(raw.confidence),
    decision,
    evidence: normalizeStringArray(raw.evidence),
    risks: normalizeStringArray(raw.risks),
    similar_examples: [],
    source: {
      retrieval_used: false,
      llm_used: true,
      model
    }
  };
}

function normalizeSuggestedPosting(value: unknown): SuggestedPosting {
  if (!isObject(value)) {
    throw new AiSuggestionError("Workers AI returned an invalid suggested_posting.");
  }

  const raw = value as Record<string, unknown>;

  return {
    account_code: requireString(raw.account_code, "suggested_posting.account_code"),
    account_name: requireString(raw.account_name, "suggested_posting.account_name"),
    vat_rate: typeof raw.vat_rate === "number" ? raw.vat_rate : null,
    amount_gross: requireNumber(raw.amount_gross, "suggested_posting.amount_gross"),
    currency: requireString(raw.currency, "suggested_posting.currency"),
    posting_text: requireString(raw.posting_text, "suggested_posting.posting_text")
  };
}

function normalizeDecision(value: unknown): PostingDecision {
  if (
    value === "auto_post_candidate" ||
    value === "needs_human_approval" ||
    value === "manual_review"
  ) {
    return value;
  }

  throw new AiSuggestionError("Workers AI returned an invalid decision.");
}

function normalizeConfidence(value: unknown): number {
  const confidence = requireNumber(value, "confidence");
  return Math.max(0, Math.min(1, confidence));
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new AiSuggestionError(`Workers AI returned an invalid ${field}.`);
  }

  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new AiSuggestionError(`Workers AI returned an invalid ${field}.`);
  }

  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
