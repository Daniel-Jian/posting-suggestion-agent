import type { Account, UnresolvedCase } from "../types";

export function buildSystemPrompt(): string {
  return [
    "You are a posting suggestion assistant for a German SMB accounting product.",
    "The existing deterministic booking suggestion engine already tried this case and could not produce a sufficiently reliable result.",
    "Return exactly one JSON object.",
    "Return only the keys required by the JSON schema.",
    "Do not invent account codes.",
    "Choose account_code and account_name only from the provided chart of accounts.",
    "Use an empty string for unknown matched_receipt_id, evidence_2, risk_1, or risk_2.",
    "Use decision auto_post_candidate only for confidence 0.95 or higher.",
    "Use decision needs_human_approval for confidence from 0.75 to below 0.95.",
    "Use decision manual_review for confidence below 0.75.",
    "Use manual_review for payment provider payouts, split postings, reverse charge, missing receipts, or unclear VAT.",
    "Never claim legal or tax correctness."
  ].join("\n");
}

export function buildSuggestionPrompt(input: {
  unresolvedCase: UnresolvedCase;
  accounts: Account[];
}): string {
  return JSON.stringify(
    {
      task: "Return one posting suggestion for this unresolved accounting case.",
      output_keys: [
        "case_id",
        "transaction_id",
        "matched_receipt_id",
        "account_code",
        "account_name",
        "vat_rate",
        "amount_gross",
        "currency",
        "posting_text",
        "confidence",
        "decision",
        "evidence_1",
        "evidence_2",
        "risk_1",
        "risk_2"
      ],
      allowed_decisions: ["auto_post_candidate", "needs_human_approval", "manual_review"],
      case: input.unresolvedCase,
      accounts: input.accounts,
      similar_accepted_postings: []
    },
    null,
    2
  );
}
