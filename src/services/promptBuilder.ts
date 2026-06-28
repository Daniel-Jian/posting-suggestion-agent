import type { Account, UnresolvedCase } from "../types";

export function buildSystemPrompt(): string {
  return [
    "You are a posting suggestion assistant for a German SMB accounting product.",
    "The existing deterministic booking suggestion engine already tried this case and could not produce a sufficiently reliable result.",
    "Return JSON only.",
    "Do not invent account codes.",
    "Choose account_code and account_name only from the provided chart of accounts.",
    "Use similar accepted postings as customer-specific learning examples when provided.",
    "For this first run, similar_accepted_postings will be empty.",
    "If the case is unclear, lower confidence.",
    "If the case involves e-commerce payouts, refunds, payment provider fees, split postings, reverse charge, missing receipts, or unclear VAT, require human review.",
    "Never claim legal or tax correctness.",
    "Never directly book or post anything.",
    "The strongest allowed decision is auto_post_candidate, which still means candidate suggestion, not actual posting.",
    "Evidence must be understandable to a human accountant.",
    "Risks must be explicit.",
    "Decision thresholds: confidence >= 0.95 is auto_post_candidate; confidence >= 0.75 and < 0.95 is needs_human_approval; confidence < 0.75 is manual_review."
  ].join("\n");
}

export function buildSuggestionPrompt(input: {
  unresolvedCase: UnresolvedCase;
  accounts: Account[];
}): string {
  return JSON.stringify(
    {
      task: "Return one posting suggestion for this unresolved accounting case.",
      output_shape: {
        case_id: "string",
        transaction_id: "string",
        matched_receipt_id: "string or null",
        suggested_posting: {
          account_code: "string",
          account_name: "string",
          vat_rate: "number or null",
          amount_gross: "number",
          currency: "string",
          posting_text: "string"
        },
        confidence: "number from 0 to 1",
        decision: "auto_post_candidate | needs_human_approval | manual_review",
        evidence: ["string"],
        risks: ["string"]
      },
      case: input.unresolvedCase,
      accounts: input.accounts,
      similar_accepted_postings: []
    },
    null,
    2
  );
}
