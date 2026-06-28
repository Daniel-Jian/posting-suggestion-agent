import type {
  PostingDecision,
  PostingSuggestion,
  SimilarPostingExample,
  UnresolvedCase
} from "../types";

const strongSimilarExampleScore = 0.8;

type ConfidenceSignal = {
  delta: number;
  message: string;
  target: "evidence" | "risks";
};

export function summarizeConfidence(input: {
  suggestion: PostingSuggestion;
  unresolvedCase: UnresolvedCase;
  similarExamples: SimilarPostingExample[];
}): PostingSuggestion {
  const signals = getConfidenceSignals(input);
  const confidence = clampConfidence(
    signals.reduce((current, signal) => current + signal.delta, input.suggestion.confidence)
  );

  return {
    ...input.suggestion,
    confidence,
    decision: decisionFromConfidence(confidence),
    evidence: appendUnique(
      input.suggestion.evidence,
      signals.filter((signal) => signal.target === "evidence").map((signal) => signal.message)
    ),
    risks: appendUnique(
      input.suggestion.risks,
      signals.filter((signal) => signal.target === "risks").map((signal) => signal.message)
    )
  };
}

function getConfidenceSignals(input: {
  suggestion: PostingSuggestion;
  unresolvedCase: UnresolvedCase;
  similarExamples: SimilarPostingExample[];
}): ConfidenceSignal[] {
  const signals: ConfidenceSignal[] = [];
  const similarExamples = input.similarExamples;

  if (similarExamples.some((example) => example.score >= strongSimilarExampleScore)) {
    signals.push({
      delta: 0.1,
      target: "evidence",
      message: "Strong similar accepted posting supports this suggestion."
    });
  }

  if (
    multipleExamplesAgreeOnAccount(
      similarExamples,
      input.suggestion.suggested_posting.account_code
    )
  ) {
    signals.push({
      delta: 0.1,
      target: "evidence",
      message: "Multiple similar accepted postings use the same account."
    });
  }

  if (similarExamples.length === 0) {
    signals.push({
      delta: -0.1,
      target: "risks",
      message: "No similar accepted posting was found."
    });
  }

  if (isReceiptMissing(input.suggestion, input.unresolvedCase)) {
    signals.push({
      delta: -0.15,
      target: "risks",
      message: "No receipt is matched to this transaction."
    });
  }

  if ((input.unresolvedCase.candidate_receipts ?? []).length > 1) {
    signals.push({
      delta: -0.1,
      target: "risks",
      message: "Multiple candidate receipts could match this transaction."
    });
  }

  const searchableText = buildSearchableText(input);

  if (containsAny(searchableText, ["stripe", "paypal", "payment provider", "payout", "batch"])) {
    signals.push({
      delta: -0.25,
      target: "risks",
      message: "Payment provider or batch payout may need split posting."
    });
  }

  if (
    containsAny(searchableText, [
      "reverse charge",
      "foreign supplier",
      "foreign vendor",
      "unclear vat",
      "unclear ust",
      "vat unclear"
    ])
  ) {
    signals.push({
      delta: -0.15,
      target: "risks",
      message: "VAT treatment or supplier country is unclear."
    });
  }

  return signals;
}

function multipleExamplesAgreeOnAccount(
  similarExamples: SimilarPostingExample[],
  accountCode: string
): boolean {
  return similarExamples.filter((example) => example.account_code === accountCode).length >= 2;
}

function isReceiptMissing(suggestion: PostingSuggestion, unresolvedCase: UnresolvedCase): boolean {
  return !suggestion.matched_receipt_id || (unresolvedCase.candidate_receipts ?? []).length === 0;
}

function buildSearchableText(input: {
  suggestion: PostingSuggestion;
  unresolvedCase: UnresolvedCase;
}): string {
  const transaction = input.unresolvedCase.transaction;
  const receiptParts = (input.unresolvedCase.candidate_receipts ?? []).flatMap((receipt) => [
    receipt.supplier_name,
    receipt.customer_name,
    receipt.description,
    receipt.ocr_text
  ]);

  return [
    transaction.counterparty_name,
    transaction.purpose,
    input.unresolvedCase.deterministic_context?.reason,
    input.suggestion.suggested_posting.posting_text,
    ...input.suggestion.evidence,
    ...input.suggestion.risks,
    ...receiptParts
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
}

function containsAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function decisionFromConfidence(confidence: number): PostingDecision {
  if (confidence >= 0.95) {
    return "auto_post_candidate";
  }

  if (confidence >= 0.75) {
    return "needs_human_approval";
  }

  return "manual_review";
}

function clampConfidence(confidence: number): number {
  return Math.max(0, Math.min(1, confidence));
}

function appendUnique(existing: string[], additions: string[]): string[] {
  const result = [...existing];
  const seen = new Set(existing.map((value) => value.toLowerCase()));

  for (const addition of additions) {
    const key = addition.toLowerCase();

    if (!seen.has(key)) {
      result.push(addition);
      seen.add(key);
    }
  }

  return result;
}
