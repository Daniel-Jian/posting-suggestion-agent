export type JsonObject = Record<string, unknown>;

export type Receipt = {
  id: string;
  type?: string;
  supplier_name?: string;
  customer_name?: string;
  invoice_number?: string;
  invoice_date?: string;
  due_date?: string;
  currency: string;
  gross_amount: number;
  net_amount?: number;
  vat_amount?: number;
  vat_rate?: number | null;
  description?: string;
  ocr_text?: string;
};

export type Transaction = {
  id: string;
  source?: string;
  booking_date: string;
  value_date?: string;
  counterparty_name?: string;
  purpose?: string;
  amount: number;
  currency: string;
  account_iban_last4?: string;
};

export type Account = {
  code: string;
  name: string;
  type?: "expense" | "revenue" | "asset" | "liability" | "bank" | "tax" | "clearing";
  description?: string;
  examples?: string[];
};

export type DeterministicContext = {
  status?: "unmatched" | "low_confidence" | "multiple_candidates" | "unsupported_case";
  reason?: string;
  candidate_receipt_ids?: string[];
  candidate_account_codes?: string[];
};

export type UnresolvedCase = {
  id: string;
  transaction: Transaction;
  candidate_receipts?: Receipt[];
  deterministic_context?: DeterministicContext;
};

export type SuggestionRunRequest = {
  cases: UnresolvedCase[];
  accounts: Account[];
};

export type AcceptedPostingRequest = {
  posting: JsonObject;
};

export type SuggestedPosting = {
  account_code: string;
  account_name: string;
  vat_rate?: number | null;
  amount_gross: number;
  currency: string;
  posting_text: string;
};

export type SimilarPostingExample = {
  id: string;
  score: number;
  account_code: string;
  account_name: string;
  vat_rate?: number | null;
  posting_text: string;
  summary: string;
};

export type PostingDecision = "auto_post_candidate" | "needs_human_approval" | "manual_review";

export type PostingSuggestion = {
  case_id: string;
  transaction_id: string;
  matched_receipt_id?: string | null;
  suggested_posting: SuggestedPosting;
  confidence: number;
  decision: PostingDecision;
  evidence: string[];
  risks: string[];
  similar_examples: SimilarPostingExample[];
  source: {
    retrieval_used: boolean;
    llm_used: boolean;
    model: string;
  };
};

export type SuggestionRunSummary = {
  case_count: number;
  suggestion_count: number;
  auto_post_candidates: number;
  needs_human_approval: number;
  manual_review: number;
};

export type SuggestionRunResponse = {
  run_id: string;
  suggestions: PostingSuggestion[];
  summary: SuggestionRunSummary;
};

export type ApiSuccessResponse<T> = {
  success: true;
  data: T;
};

export type ApiErrorResponse = {
  success: false;
  error: {
    code: string;
    message: string;
  };
};

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
