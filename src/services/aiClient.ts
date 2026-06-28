import { buildSuggestionPrompt, buildSystemPrompt } from "./promptBuilder";
import { summarizeConfidence } from "./confidence";
import { findSimilarAcceptedPostings, type RetrievedSimilarPosting } from "./vectorMemory";
import type {
  PostingDecision,
  PostingSuggestion,
  SimilarPostingExample,
  SuggestionRunRequest,
  SuggestionRunResponse,
  SuggestedPosting
} from "../types";

type RawAiResponse = {
  choices?: unknown;
  response?: unknown;
  usage?: unknown;
};

type AiResponseJsonDetails = {
  value: unknown;
  source: AiResponseCandidateSource;
};

type AiResponseCandidateSource =
  | "raw_string"
  | "response_string"
  | "response_object"
  | "choices_message";

type AiResponseCandidate = {
  source: AiResponseCandidateSource;
  value: unknown;
};

type AiResponseCandidateParseSummary = {
  source: AiResponseCandidateSource;
  valueType: string;
  ok: boolean;
  errorMessage?: string;
  textLength?: number;
  containsOpeningBrace?: boolean;
  containsClosingBrace?: boolean;
  textExcerpt?: string;
};

type AiResponseParseFailureDetails = {
  responseKind: string;
  responseKeys: string[];
  responseFieldType: string;
  responseFieldIsArray: boolean;
  responseFieldKeys?: string[];
  text?: string;
  candidates: AiResponseCandidateParseSummary[];
  completion: Record<string, unknown>;
};

type RawPostingSuggestion = {
  case_id?: unknown;
  transaction_id?: unknown;
  matched_receipt_id?: unknown;
  account_code?: unknown;
  account_name?: unknown;
  vat_rate?: unknown;
  amount_gross?: unknown;
  currency?: unknown;
  posting_text?: unknown;
  confidence?: unknown;
  decision?: unknown;
  evidence_1?: unknown;
  evidence_2?: unknown;
  risk_1?: unknown;
  risk_2?: unknown;
};

const suggestionSchemaVersion = "flat_v1";
const suggestionResponseFormat = "json_object";
const suggestionMaxTokens = 700;

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
    const similarExamples = await getSimilarAcceptedPostings(env, unresolvedCase, options);
    const rawSuggestion = await generatePostingSuggestion(
      env,
      input,
      unresolvedCase.id,
      similarExamples,
      options
    );

    try {
      const suggestion = normalizeSuggestion(rawSuggestion, env.LLM_MODEL, similarExamples);
      suggestions.push(
        summarizeConfidence({
          suggestion,
          unresolvedCase,
          similarExamples
        })
      );
    } catch (err) {
      options.log?.("ai_normalize_failed", {
        caseId: unresolvedCase.id,
        errorName: err instanceof Error ? err.name : "UnknownError",
        errorMessage: err instanceof Error ? err.message : "Unknown error."
      });

      throw err;
    }
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
  similarAcceptedPostings: RetrievedSimilarPosting[],
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
    model: env.LLM_MODEL,
    schemaVersion: suggestionSchemaVersion,
    responseFormat: suggestionResponseFormat,
    maxTokens: suggestionMaxTokens
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
            accounts: input.accounts,
            similarAcceptedPostings
          })
        }
      ],
      response_format: {
        type: suggestionResponseFormat
      },
      temperature: 0.1,
      max_tokens: suggestionMaxTokens
    }),
    options.timeoutMs ?? 45000
  )) as RawAiResponse | string;

  options.log?.("ai_success", {
    caseId,
    durationMs: Date.now() - startedAt,
    usage: typeof response === "object" && response !== null ? response.usage : undefined,
    ...summarizeAiCompletionMetadata(response)
  });

  options.log?.("ai_parse_start", { caseId });

  try {
    const parsedResponse = parseAiJsonResponse(response);

    options.log?.("ai_parse_success", {
      caseId,
      source: parsedResponse.source
    });

    return parsedResponse.value;
  } catch (err) {
    options.log?.("ai_parse_failed", {
      caseId,
      ...summarizeAiParseFailure(response)
    });

    throw err;
  }
}

async function getSimilarAcceptedPostings(
  env: Env,
  unresolvedCase: SuggestionRunRequest["cases"][number],
  options: {
    log?: SuggestionRunLogger;
  }
): Promise<RetrievedSimilarPosting[]> {
  try {
    const similarExamples = await findSimilarAcceptedPostings(env, unresolvedCase, {
      topK: 3,
      minScore: 0.65
    });

    options.log?.("retrieval_success", {
      caseId: unresolvedCase.id,
      similarExampleCount: similarExamples.length
    });

    return similarExamples;
  } catch (err) {
    options.log?.("retrieval_failed", {
      caseId: unresolvedCase.id,
      errorName: err instanceof Error ? err.name : "UnknownError",
      errorMessage: err instanceof Error ? err.message : "Unknown error."
    });

    return [];
  }
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

    if (start !== -1 && end === -1) {
      throw new AiSuggestionError("Workers AI returned incomplete JSON.");
    }

    if (start === -1 || end <= start) {
      throw new AiSuggestionError("Workers AI did not return JSON.");
    }

    try {
      return JSON.parse(value.slice(start, end + 1));
    } catch {
      throw new AiSuggestionError("Workers AI returned malformed JSON.");
    }
  }
}

function parseAiJsonResponse(response: RawAiResponse | string): AiResponseJsonDetails {
  const candidates = getAiResponseCandidates(response);
  const errors: AiSuggestionError[] = [];

  for (const candidate of candidates) {
    try {
      return {
        value: parseAiResponseCandidate(candidate),
        source: candidate.source
      };
    } catch (err) {
      if (err instanceof AiSuggestionError) {
        errors.push(err);
      } else {
        throw err;
      }
    }
  }

  if (errors.some((err) => err.message === "Workers AI returned incomplete JSON.")) {
    throw new AiSuggestionError("Workers AI returned incomplete JSON.");
  }

  if (errors.some((err) => err.message === "Workers AI returned malformed JSON.")) {
    throw new AiSuggestionError("Workers AI returned malformed JSON.");
  }

  throw new AiSuggestionError("Workers AI did not return JSON.");
}

function parseAiResponseCandidate(candidate: AiResponseCandidate): unknown {
  if (candidate.source === "response_object" && isObject(candidate.value)) {
    return candidate.value;
  }

  if (typeof candidate.value === "string") {
    return parseJsonObject(candidate.value);
  }

  throw new AiSuggestionError("Workers AI did not return JSON.");
}

function summarizeAiParseFailure(response: RawAiResponse | string): Record<string, unknown> {
  const details = getAiResponseParseFailureDetails(response);
  const summary: Record<string, unknown> = {
    responseKind: details.responseKind,
    responseKeys: details.responseKeys,
    responseFieldType: details.responseFieldType,
    responseFieldIsArray: details.responseFieldIsArray,
    candidates: details.candidates,
    ...details.completion
  };

  if (details.responseFieldKeys) {
    summary.responseFieldKeys = details.responseFieldKeys;
  }

  if (typeof details.text === "string") {
    summary.textLength = details.text.length;
    summary.containsOpeningBrace = details.text.includes("{");
    summary.containsClosingBrace = details.text.includes("}");
    summary.textExcerpt = details.text.slice(0, 500);
  }

  return summary;
}

function getAiResponseParseFailureDetails(
  response: RawAiResponse | string
): AiResponseParseFailureDetails {
  if (typeof response === "string") {
    return {
      responseKind: "string",
      responseKeys: [],
      responseFieldType: "missing",
      responseFieldIsArray: false,
      text: response,
      candidates: summarizeAiResponseCandidates(getAiResponseCandidates(response)),
      completion: summarizeAiCompletionMetadata(response)
    };
  }

  if (!isObject(response)) {
    return {
      responseKind: response === null ? "null" : typeof response,
      responseKeys: [],
      responseFieldType: "missing",
      responseFieldIsArray: false,
      candidates: [],
      completion: summarizeAiCompletionMetadata(response)
    };
  }

  const responseField = response.response;
  const responseFieldIsArray = Array.isArray(responseField);
  const details: AiResponseParseFailureDetails = {
    responseKind: "object",
    responseKeys: Object.keys(response),
    responseFieldType: getValueType(responseField),
    responseFieldIsArray,
    candidates: summarizeAiResponseCandidates(getAiResponseCandidates(response)),
    completion: summarizeAiCompletionMetadata(response)
  };

  if (isObject(responseField)) {
    details.responseFieldKeys = Object.keys(responseField);
  }

  if (typeof responseField === "string") {
    details.text = responseField;
  }

  const choiceMessageContent = getChoiceMessageContent(response);

  if (typeof choiceMessageContent === "string") {
    details.text = choiceMessageContent;
  }

  return details;
}

function getAiResponseCandidates(response: RawAiResponse | string): AiResponseCandidate[] {
  if (typeof response === "string") {
    return [
      {
        source: "raw_string",
        value: response
      }
    ];
  }

  if (!isObject(response)) {
    return [];
  }

  const candidates: AiResponseCandidate[] = [];

  if (isObject(response.response)) {
    candidates.push({
      source: "response_object",
      value: response.response
    });
  }

  if (typeof response.response === "string") {
    candidates.push({
      source: "response_string",
      value: response.response
    });
  }

  const choiceMessageContent = getChoiceMessageContent(response);

  if (typeof choiceMessageContent === "string") {
    candidates.push({
      source: "choices_message",
      value: choiceMessageContent
    });
  }

  return candidates;
}

function summarizeAiResponseCandidates(
  candidates: AiResponseCandidate[]
): AiResponseCandidateParseSummary[] {
  return candidates.map((candidate) => {
    const summary: AiResponseCandidateParseSummary = {
      source: candidate.source,
      valueType: getValueType(candidate.value),
      ok: false
    };

    if (typeof candidate.value === "string") {
      summary.textLength = candidate.value.length;
      summary.containsOpeningBrace = candidate.value.includes("{");
      summary.containsClosingBrace = candidate.value.includes("}");
      summary.textExcerpt = candidate.value.slice(0, 500);
    }

    try {
      parseAiResponseCandidate(candidate);
      summary.ok = true;
    } catch (err) {
      summary.errorMessage = err instanceof Error ? err.message : "Unknown parse error.";
    }

    return summary;
  });
}

function getChoiceMessageContent(response: Record<string, unknown>): string | undefined {
  if (!Array.isArray(response.choices) || response.choices.length === 0) {
    return undefined;
  }

  const firstChoice = response.choices[0];

  if (!isObject(firstChoice) || !isObject(firstChoice.message)) {
    return undefined;
  }

  return typeof firstChoice.message.content === "string"
    ? firstChoice.message.content
    : undefined;
}

function summarizeAiCompletionMetadata(response: unknown): Record<string, unknown> {
  if (!isObject(response) || !Array.isArray(response.choices)) {
    return {};
  }

  const finishReasons = response.choices
    .filter(isObject)
    .map((choice) => choice.finish_reason)
    .filter((value): value is string => typeof value === "string");

  return {
    choiceCount: response.choices.length,
    choiceFinishReasons: finishReasons.length > 0 ? finishReasons : undefined
  };
}

function getValueType(value: unknown): string {
  if (value === undefined) {
    return "missing";
  }

  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return "array";
  }

  return typeof value;
}

function normalizeSuggestion(
  value: unknown,
  model: string,
  similarExamples: SimilarPostingExample[]
): PostingSuggestion {
  if (!isObject(value)) {
    throw new AiSuggestionError("Workers AI returned an invalid suggestion.");
  }

  const raw = value as RawPostingSuggestion;
  const suggestedPosting = normalizeSuggestedPosting(raw);
  const decision = normalizeDecision(raw.decision);

  return {
    case_id: requireString(raw.case_id, "case_id"),
    transaction_id: requireString(raw.transaction_id, "transaction_id"),
    matched_receipt_id: normalizeOptionalId(raw.matched_receipt_id),
    suggested_posting: suggestedPosting,
    confidence: normalizeConfidence(raw.confidence),
    decision,
    evidence: normalizeTextFields([raw.evidence_1, raw.evidence_2]),
    risks: normalizeTextFields([raw.risk_1, raw.risk_2]),
    similar_examples: similarExamples,
    source: {
      retrieval_used: similarExamples.length > 0,
      llm_used: true,
      model
    }
  };
}

function normalizeSuggestedPosting(raw: RawPostingSuggestion): SuggestedPosting {
  return {
    account_code: requireString(raw.account_code, "account_code"),
    account_name: requireString(raw.account_name, "account_name"),
    vat_rate: typeof raw.vat_rate === "number" ? raw.vat_rate : null,
    amount_gross: requireNumber(raw.amount_gross, "amount_gross"),
    currency: requireString(raw.currency, "currency"),
    posting_text: requireString(raw.posting_text, "posting_text")
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

function normalizeOptionalId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeTextFields(values: unknown[]): string[] {
  return values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
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
