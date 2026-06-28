# Posting Suggestion Agent — Architecture

Repository name:

```text
posting-suggestion-agent
```

Application name:

```text
Posting Suggestion Agent
```

## 1. Purpose

This repository contains a throwaway prototype for the BuchhaltungsButler / Visma AI Software Developer work case.

The prototype demonstrates a simple AI-assisted accounting workflow for cases where the existing deterministic booking suggestion engine could not produce a reliable answer.

Core loop:

```text
unresolved accounting cases JSON
        ↓
retrieve similar accepted postings from vector memory
        ↓
ask Cloudflare Workers AI for posting suggestions
        ↓
return posting suggestions JSON with confidence, evidence, risks
        ↓
human edits/approves JSON
        ↓
accepted postings are stored as learning examples
```

This is not a production accounting system.

This is not a full BHB API integration.

This is not an autonomous accountant.

The product idea:

```text
The Posting Suggestion Agent helps with ambiguous accounting cases.
It proposes postings, explains evidence, shows risk, and lets the human approve or correct the result.
```

---

## 2. Main architecture decision: deterministic first, agent second

In production, the deterministic BHB booking suggestion engine should run first.

Reason:

```text
Deterministic rules are cheaper, faster, more auditable, and safer for exact cases.
The AI/RAG agent should handle exceptions, edge cases, and uncertain cases.
```

Target production flow:

```text
BHB Core Application
        ↓
existing deterministic booking suggestion engine
        ↓
if deterministic result is good enough:
    keep existing flow
else:
    send unresolved case to Posting Suggestion Agent
```

For this prototype, we assume:

```text
The deterministic BHB engine already ran.
Only unresolved or low-confidence cases are sent to this prototype.
```

Therefore this prototype will not reimplement deterministic matching.

The input JSON already represents the cases that need AI help.

---

## 3. Technology choices

Use one Cloudflare Worker.

```text
Cloudflare Worker
    ├── Hono REST-style JSON API
    ├── static HTML frontend
    ├── Cloudflare Workers AI for LLM
    ├── Cloudflare Workers AI for embeddings
    ├── Cloudflare Vectorize for vector memory
    └── Cloudflare D1 for accepted postings
```

Use:

```text
Runtime: Cloudflare Workers
Framework: Hono
API style: REST-style JSON APIs
Frontend: Vanilla HTML + JavaScript
Database: Cloudflare D1
Vector database: Cloudflare Vectorize
LLM: Cloudflare Workers AI
Embeddings: Cloudflare Workers AI
Language: TypeScript
```

Do not build separate frontend and backend apps.

Use:

```text
one Worker + D1 + Vectorize + Workers AI
```

This is intentionally simple.

---

## 4. AI model choice

Use only Cloudflare Workers AI.

### LLM model

Use:

```text
@cf/qwen/qwen3-30b-a3b-fp8
```

Use it for:

```text
posting suggestion generation
confidence explanation
evidence generation
risk explanation
human-review decision explanation
```

### Embedding model

Use:

```text
@cf/qwen/qwen3-embedding-0.6b
```

Use it for:

```text
embedding accepted postings
embedding new unresolved cases
retrieving similar accepted postings
```

No external AI provider is needed for this prototype.

---

## 5. Repository structure

```text
posting-suggestion-agent/
  package.json
  wrangler.toml
  README.md
  docs/
    openapi.yaml
  migrations/
    0001_initial.sql
  public/
    index.html
  src/
    index.ts
    types.ts
    sampleData.ts
    services/
      aiClient.ts
      embeddings.ts
      vectorMemory.ts
      storage.ts
      promptBuilder.ts
      confidence.ts
```

Keep the code small.

Avoid unnecessary abstractions.

---

## 6. Routes

The prototype needs only these routes:

```text
GET  /                         serves the static frontend
POST /api/suggestion-runs      creates posting suggestions from unresolved cases
POST /api/accepted-postings    stores human-approved postings as learning examples
```

No health endpoint.

No endpoint for listing accepted postings.

No OpenAPI endpoint.

The OpenAPI file will exist only as a documentation artifact:

```text
docs/openapi.yaml
```

It will not be served by the Worker.

---

## 7. `wrangler.toml`

Create:

```toml
name = "posting-suggestion-agent"
main = "src/index.ts"
compatibility_date = "2026-06-01"

[assets]
directory = "./public"
binding = "ASSETS"

[ai]
binding = "AI"

[[d1_databases]]
binding = "DB"
database_name = "posting-suggestion-agent"
database_id = "REPLACE_ME"

[[vectorize]]
binding = "POSTING_INDEX"
index_name = "posting-suggestion-agent-postings"

[vars]
APP_NAME = "Posting Suggestion Agent"
LLM_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8"
EMBEDDING_MODEL = "@cf/qwen/qwen3-embedding-0.6b"
```

---

## 8. Domain model

### Receipt

A receipt is the accounting evidence document.

German term:

```text
Beleg
```

Example:

```json
{
  "id": "rcpt_001",
  "type": "incoming_invoice",
  "supplier_name": "Amazon Business",
  "invoice_number": "DE-2026-001",
  "invoice_date": "2026-01-15",
  "currency": "EUR",
  "gross_amount": 119.0,
  "net_amount": 100.0,
  "vat_amount": 19.0,
  "vat_rate": 19,
  "description": "Office supplies: printer paper and pens",
  "ocr_text": "Amazon Business Rechnung DE-2026-001 Bürobedarf 119,00 EUR inkl. 19% MwSt"
}
```

### Transaction

A transaction is the bank or payment movement.

Example:

```json
{
  "id": "tx_001",
  "source": "bank",
  "booking_date": "2026-01-18",
  "counterparty_name": "Amazon Payments Europe",
  "purpose": "Amazon Business DE-2026-001",
  "amount": -119.0,
  "currency": "EUR"
}
```

Negative amount means money leaves the business.

Positive amount means money enters the business.

### Posting

A posting is the accounting classification suggestion.

German term:

```text
Buchungssatz
```

Example:

```json
{
  "transaction_id": "tx_001",
  "matched_receipt_id": "rcpt_001",
  "suggested_posting": {
    "account_code": "4930",
    "account_name": "Bürobedarf",
    "vat_rate": 19,
    "amount_gross": 119.0,
    "currency": "EUR",
    "posting_text": "Amazon Business office supplies"
  },
  "confidence": 0.86,
  "decision": "needs_human_approval",
  "evidence": [
    "Similar accepted postings for Amazon Business used account 4930 Bürobedarf",
    "Receipt description contains office supplies"
  ],
  "risks": []
}
```

---

## 9. API input model

`POST /api/suggestion-runs`

The frontend sends unresolved cases and accounts.

Example request:

```json
{
  "cases": [
    {
      "id": "case_001",
      "transaction": {
        "id": "tx_001",
        "source": "bank",
        "booking_date": "2026-01-18",
        "counterparty_name": "Amazon Payments Europe",
        "purpose": "Amazon Business DE-2026-001",
        "amount": -119.0,
        "currency": "EUR"
      },
      "candidate_receipts": [
        {
          "id": "rcpt_001",
          "type": "incoming_invoice",
          "supplier_name": "Amazon Business",
          "invoice_number": "DE-2026-001",
          "invoice_date": "2026-01-15",
          "currency": "EUR",
          "gross_amount": 119.0,
          "vat_rate": 19,
          "description": "Office supplies: printer paper and pens",
          "ocr_text": "Amazon Business Rechnung DE-2026-001 Bürobedarf 119,00 EUR inkl. 19% MwSt"
        }
      ],
      "deterministic_context": {
        "status": "low_confidence",
        "reason": "Rule engine found candidate receipt but no reliable customer-specific account mapping",
        "candidate_receipt_ids": ["rcpt_001"],
        "candidate_account_codes": ["4930", "4600"]
      }
    }
  ],
  "accounts": [
    {
      "code": "4930",
      "name": "Bürobedarf",
      "type": "expense",
      "description": "Office supplies and small office materials",
      "examples": ["printer paper", "pens", "office supplies"]
    },
    {
      "code": "4600",
      "name": "Werbekosten",
      "type": "expense",
      "description": "Advertising and marketing expenses",
      "examples": ["google ads", "facebook ads", "online marketing"]
    }
  ]
}
```

The prototype assumes the input JSON is well-formed.

No schema validation is required.

---

## 10. API output model

`POST /api/suggestion-runs` returns:

```json
{
  "run_id": "run_123",
  "suggestions": [
    {
      "case_id": "case_001",
      "transaction_id": "tx_001",
      "matched_receipt_id": "rcpt_001",
      "suggested_posting": {
        "account_code": "4930",
        "account_name": "Bürobedarf",
        "vat_rate": 19,
        "amount_gross": 119,
        "currency": "EUR",
        "posting_text": "Amazon Business office supplies"
      },
      "confidence": 0.86,
      "decision": "needs_human_approval",
      "evidence": [
        "Receipt text contains office supplies",
        "Selected account exists in provided chart of accounts",
        "Similar accepted posting found for Amazon Business"
      ],
      "risks": [],
      "similar_examples": [
        {
          "id": "ap_001",
          "score": 0.89,
          "account_code": "4930",
          "account_name": "Bürobedarf",
          "vat_rate": 19,
          "posting_text": "Amazon Business office supplies",
          "summary": "Amazon Business posted to office supplies with 19% VAT"
        }
      ],
      "source": {
        "retrieval_used": true,
        "llm_used": true,
        "model": "@cf/qwen/qwen3-30b-a3b-fp8"
      }
    }
  ],
  "summary": {
    "case_count": 1,
    "suggestion_count": 1,
    "auto_post_candidates": 0,
    "needs_human_approval": 1,
    "manual_review": 0
  }
}
```

The output JSON textarea is editable in the frontend.

The user can correct the AI result manually before storing accepted postings.

---

## 11. Accepted postings API

`POST /api/accepted-postings`

Request:

```json
{
  "run_id": "run_123",
  "accepted_postings": [
    {
      "case_id": "case_001",
      "transaction_id": "tx_001",
      "matched_receipt_id": "rcpt_001",
      "suggested_posting": {
        "account_code": "4930",
        "account_name": "Bürobedarf",
        "vat_rate": 19,
        "amount_gross": 119,
        "currency": "EUR",
        "posting_text": "Amazon Business office supplies"
      },
      "confidence": 0.86,
      "decision": "needs_human_approval",
      "evidence": [
        "Receipt text contains office supplies"
      ],
      "risks": []
    }
  ]
}
```

Behavior:

```text
1. Parse JSON.
2. For each accepted posting:
   - store it in D1
   - create embedding text
   - generate embedding
   - upsert vector into Vectorize
3. Return stored_count.
```

Response:

```json
{
  "ok": true,
  "stored_count": 1
}
```

Accepted postings are the learning source.

Do not store raw suggestions unless the user explicitly clicks the accept/store button.

---

## 12. D1 schema

Keep only one table.

`migrations/0001_initial.sql`

```sql
CREATE TABLE IF NOT EXISTS accepted_postings (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  run_id TEXT,
  case_id TEXT,
  transaction_id TEXT NOT NULL,
  matched_receipt_id TEXT,
  account_code TEXT NOT NULL,
  account_name TEXT NOT NULL,
  vat_rate REAL,
  amount_gross REAL NOT NULL,
  currency TEXT NOT NULL,
  posting_text TEXT NOT NULL,
  confidence REAL,
  source_json TEXT NOT NULL,
  embedding_text TEXT NOT NULL,
  vector_id TEXT NOT NULL
);
```

No `suggestion_runs` table.

No `audit_events` table.

This is enough for the demo learning loop.

---

## 13. Hono application skeleton

`src/index.ts`:

```ts
import { Hono } from "hono";

export type Env = {
  Bindings: {
    ASSETS: Fetcher;
    AI: Ai;
    DB: D1Database;
    POSTING_INDEX: VectorizeIndex;
    APP_NAME: string;
    LLM_MODEL: string;
    EMBEDDING_MODEL: string;
  };
};

const app = new Hono<Env>();

app.post("/api/suggestion-runs", async (c) => {
  const input = await c.req.json();

  // 1. For each case, build vector query text.
  // 2. Retrieve similar accepted postings.
  // 3. Ask Workers AI for posting suggestion.
  // 4. Adjust confidence lightly.
  // 5. Return suggestions JSON.

  return c.json({
    run_id: crypto.randomUUID(),
    suggestions: [],
    summary: {
      case_count: input.cases?.length ?? 0,
      suggestion_count: 0,
      auto_post_candidates: 0,
      needs_human_approval: 0,
      manual_review: 0
    }
  });
});

app.post("/api/accepted-postings", async (c) => {
  const input = await c.req.json();

  // 1. Store accepted postings in D1.
  // 2. Create embeddings.
  // 3. Upsert vectors into Vectorize.

  return c.json({
    ok: true,
    stored_count: input.accepted_postings?.length ?? 0
  });
});

app.get("*", async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
```

Do not add CORS unless needed.

Do not add authentication.

Do not add extra middleware.

---

## 14. TypeScript types

`src/types.ts`

```ts
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

export type PostingSuggestion = {
  case_id: string;
  transaction_id: string;
  matched_receipt_id?: string | null;
  suggested_posting: SuggestedPosting;
  confidence: number;
  decision: "auto_post_candidate" | "needs_human_approval" | "manual_review";
  evidence: string[];
  risks: string[];
  similar_examples?: SimilarPostingExample[];
  source: {
    retrieval_used: boolean;
    llm_used: boolean;
    model: string;
  };
};
```

---

## 15. AI prompt

System prompt:

```text
You are a posting suggestion assistant for a German SMB accounting product.

You receive unresolved accounting cases. The existing deterministic booking suggestion engine already tried to handle these cases and could not produce a sufficiently reliable result.

Your job is to propose a posting suggestion for human review.

Rules:
- Return JSON only.
- Do not invent account codes.
- Choose account_code and account_name only from the provided chart of accounts.
- Use similar accepted postings as customer-specific learning examples.
- If the case is unclear, lower confidence.
- If the case involves e-commerce payouts, refunds, payment provider fees, split postings, reverse charge, missing receipts, or unclear VAT, require human review.
- Never claim legal or tax correctness.
- Never directly book/post anything.
- The strongest allowed decision is auto_post_candidate, which still means candidate suggestion, not actual posting.
- Evidence must be understandable to a human accountant.
- Risks must be explicit.

Decision thresholds:
- confidence >= 0.95: auto_post_candidate
- confidence >= 0.75 and < 0.95: needs_human_approval
- confidence < 0.75: manual_review
```

User payload to the model:

```json
{
  "case": {},
  "accounts": [],
  "similar_accepted_postings": []
}
```

The model should return one suggestion object for one case.

The application loops through cases.

---

## 16. AI client

`src/services/aiClient.ts`

Use Workers AI directly.

Pseudo implementation:

```ts
export async function generatePostingSuggestion(env, input) {
  const response = await env.AI.run(env.LLM_MODEL, {
    messages: [
      {
        role: "system",
        content: buildSystemPrompt()
      },
      {
        role: "user",
        content: JSON.stringify(input)
      }
    ],
    temperature: 0.1
  });

  return response;
}
```

Keep parsing simple.

The prototype can assume the model returns usable JSON.

If the model returns text around the JSON, extract the JSON object in a simple best-effort way.

No complex schema validation is required.

---

## 17. Confidence adjustment

Because the deterministic engine is assumed to have already failed or been uncertain, do not use deterministic matching score in this prototype.

Use simple post-processing:

```text
start with LLM confidence

if strong similar accepted posting exists:
    +0.10

if multiple similar accepted postings agree on same account:
    +0.10

if no similar examples:
    -0.10

if missing receipt:
    -0.15

if multiple candidate receipts:
    -0.10

if e-commerce payout / Stripe / PayPal batch:
    -0.25

if reverse charge / foreign supplier / unclear VAT:
    -0.15

clamp between 0 and 1
```

Decision:

```ts
if (confidence >= 0.95) {
  decision = "auto_post_candidate";
} else if (confidence >= 0.75) {
  decision = "needs_human_approval";
} else {
  decision = "manual_review";
}
```

Important:

```text
auto_post_candidate does not mean the system actually posts automatically.
It only means the suggestion looks safe enough to be highlighted as a strong candidate.
```

---

## 18. Vector memory

Vector memory stores previously accepted postings.

This demonstrates the learning loop.

### Embedding text for accepted posting

Create text like:

```text
Transaction counterparty: Amazon Payments Europe
Transaction purpose: Amazon Business DE-2026-001
Transaction amount: -119 EUR
Receipt supplier: Amazon Business
Receipt description: Office supplies: printer paper and pens
Receipt OCR: Amazon Business Rechnung DE-2026-001 Bürobedarf 119,00 EUR inkl. 19% MwSt
Accepted account: 4930 Bürobedarf
Accepted VAT rate: 19
Accepted posting text: Amazon Business office supplies
```

### Query text for unresolved case

Create text like:

```text
Transaction counterparty: Amazon Payments Europe
Transaction purpose: Amazon Business DE-2026-001
Transaction amount: -119 EUR
Candidate receipt supplier: Amazon Business
Candidate receipt description: Office supplies: printer paper and pens
Candidate receipt OCR: Amazon Business Rechnung DE-2026-001 Bürobedarf 119,00 EUR inkl. 19% MwSt
Deterministic status: low_confidence
Deterministic reason: Rule engine found candidate receipt but no reliable customer-specific account mapping
```

### Retrieval behavior

For each unresolved case:

```text
1. Build query text.
2. Generate embedding.
3. Query Vectorize top 3.
4. Send similar examples to the LLM.
5. Return similar examples in the final JSON.
```

If Vectorize has no examples, continue without examples.

---

## 19. Embeddings service

`src/services/embeddings.ts`

```ts
export async function embedText(env, text: string): Promise<number[]> {
  const result = await env.AI.run(env.EMBEDDING_MODEL, {
    text
  });

  return result.data[0];
}
```

Keep this simple.

Adjust only if the actual Workers AI response shape differs.

---

## 20. Vector memory service

`src/services/vectorMemory.ts`

```ts
export async function searchSimilarPostings(env, queryText: string, topK = 3) {
  const vector = await embedText(env, queryText);

  const result = await env.POSTING_INDEX.query(vector, {
    topK,
    returnMetadata: true
  });

  return result.matches.map((match) => ({
    id: String(match.id),
    score: match.score ?? 0,
    account_code: String(match.metadata?.account_code ?? ""),
    account_name: String(match.metadata?.account_name ?? ""),
    vat_rate: typeof match.metadata?.vat_rate === "number" ? match.metadata.vat_rate : null,
    posting_text: String(match.metadata?.posting_text ?? ""),
    summary: String(match.metadata?.summary ?? "")
  }));
}
```

Store accepted posting vector:

```ts
export async function storeAcceptedPostingVector(
  env,
  vectorId: string,
  embeddingText: string,
  metadata: Record<string, string | number | boolean | null>
) {
  const vector = await embedText(env, embeddingText);

  await env.POSTING_INDEX.upsert([
    {
      id: vectorId,
      values: vector,
      metadata
    }
  ]);
}
```

---

## 21. Storage service

`src/services/storage.ts`

Only store accepted postings.

```ts
export async function saveAcceptedPosting(env, posting) {
  await env.DB.prepare(`
    INSERT INTO accepted_postings (
      id,
      created_at,
      run_id,
      case_id,
      transaction_id,
      matched_receipt_id,
      account_code,
      account_name,
      vat_rate,
      amount_gross,
      currency,
      posting_text,
      confidence,
      source_json,
      embedding_text,
      vector_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    posting.id,
    new Date().toISOString(),
    posting.run_id ?? null,
    posting.case_id ?? null,
    posting.transaction_id,
    posting.matched_receipt_id ?? null,
    posting.account_code,
    posting.account_name,
    posting.vat_rate ?? null,
    posting.amount_gross,
    posting.currency,
    posting.posting_text,
    posting.confidence ?? null,
    JSON.stringify(posting.source_json),
    posting.embedding_text,
    posting.vector_id
  ).run();
}
```

---

## 22. Frontend

Use one simple HTML page.

`public/index.html`

Layout:

```text
Title: Posting Suggestion Agent

Textarea 1:
Unresolved cases + accounts JSON

Button:
Create suggestion run

Textarea 2:
Suggestion run output JSON

Button:
Store accepted postings

Button:
Load sample data

Status area:
loading / success / errors
```

The output JSON textarea is editable.

Human-in-the-loop is simulated like this:

```text
1. User creates suggestion run.
2. App displays JSON suggestions.
3. User manually edits/corrects JSON.
4. User clicks Store accepted postings.
5. Backend stores edited suggestions as accepted postings.
6. Future runs retrieve these examples.
```

---

## 23. Sample input

Pre-fill the UI with this sample:

```json
{
  "cases": [
    {
      "id": "case_001",
      "transaction": {
        "id": "tx_001",
        "source": "bank",
        "booking_date": "2026-01-18",
        "counterparty_name": "Amazon Payments Europe",
        "purpose": "Amazon Business DE-2026-001",
        "amount": -119.0,
        "currency": "EUR"
      },
      "candidate_receipts": [
        {
          "id": "rcpt_001",
          "type": "incoming_invoice",
          "supplier_name": "Amazon Business",
          "invoice_number": "DE-2026-001",
          "invoice_date": "2026-01-15",
          "currency": "EUR",
          "gross_amount": 119.0,
          "net_amount": 100.0,
          "vat_amount": 19.0,
          "vat_rate": 19,
          "description": "Office supplies: printer paper and pens",
          "ocr_text": "Amazon Business Rechnung DE-2026-001 Bürobedarf 119,00 EUR inkl. 19% MwSt"
        }
      ],
      "deterministic_context": {
        "status": "low_confidence",
        "reason": "Rule engine found candidate receipt but no reliable customer-specific account mapping",
        "candidate_receipt_ids": ["rcpt_001"],
        "candidate_account_codes": ["4930", "4600"]
      }
    },
    {
      "id": "case_002",
      "transaction": {
        "id": "tx_002",
        "source": "bank",
        "booking_date": "2026-01-25",
        "counterparty_name": "Stripe Payments Europe",
        "purpose": "Stripe payout January batch after fees and refunds",
        "amount": 967.2,
        "currency": "EUR"
      },
      "candidate_receipts": [],
      "deterministic_context": {
        "status": "unsupported_case",
        "reason": "Payment provider payout may contain sales, fees, refunds, and split postings"
      }
    },
    {
      "id": "case_003",
      "transaction": {
        "id": "tx_003",
        "source": "bank",
        "booking_date": "2026-01-21",
        "counterparty_name": "Google Ireland Ltd",
        "purpose": "GOOG-2026-991 Google Ads",
        "amount": -250.0,
        "currency": "EUR"
      },
      "candidate_receipts": [
        {
          "id": "rcpt_003",
          "type": "incoming_invoice",
          "supplier_name": "Google Ireland Ltd",
          "invoice_number": "GOOG-2026-991",
          "invoice_date": "2026-01-20",
          "currency": "EUR",
          "gross_amount": 250.0,
          "net_amount": 250.0,
          "vat_amount": 0.0,
          "vat_rate": 0,
          "description": "Google Ads advertising services",
          "ocr_text": "Google Ireland Ltd Google Ads invoice reverse charge advertising services"
        }
      ],
      "deterministic_context": {
        "status": "low_confidence",
        "reason": "Foreign supplier / reverse charge VAT treatment requires review",
        "candidate_receipt_ids": ["rcpt_003"],
        "candidate_account_codes": ["4600"]
      }
    }
  ],
  "accounts": [
    {
      "code": "4930",
      "name": "Bürobedarf",
      "type": "expense",
      "description": "Office supplies and small office materials",
      "examples": ["printer paper", "pens", "office supplies"]
    },
    {
      "code": "4920",
      "name": "Telefon",
      "type": "expense",
      "description": "Telephone and internet costs",
      "examples": ["telekom", "phone bill", "internet"]
    },
    {
      "code": "4600",
      "name": "Werbekosten",
      "type": "expense",
      "description": "Advertising and marketing expenses",
      "examples": ["google ads", "facebook ads", "online marketing"]
    },
    {
      "code": "NebenkostenGeldverkehr",
      "name": "Nebenkosten des Geldverkehrs",
      "type": "expense",
      "description": "Payment provider and bank fees",
      "examples": ["stripe fee", "paypal fee", "bank fee"]
    },
    {
      "code": "8400",
      "name": "Erlöse 19% USt",
      "type": "revenue",
      "description": "Domestic sales revenue with 19% VAT",
      "examples": ["customer payment", "sales invoice"]
    },
    {
      "code": "1200",
      "name": "Bank",
      "type": "bank",
      "description": "Bank account"
    }
  ]
}
```

Expected behavior:

```text
case_001:
  suggest Bürobedarf
  confidence medium/high
  decision needs_human_approval unless memory strongly supports it

case_002:
  manual_review
  risk: Stripe payout may need split posting

case_003:
  suggest Werbekosten
  needs_human_approval
  risk: reverse charge / VAT treatment
```

---

## 24. Demo learning behavior

The most important demo moment:

### First run

The Amazon case has no memory.

Expected:

```text
Suggestion: 4930 Bürobedarf
Decision: needs_human_approval
Evidence: receipt text says office supplies
Risk: no similar accepted postings yet
```

User accepts.

### Second run

Run a similar Amazon case again.

Expected:

```text
Suggestion: 4930 Bürobedarf
Evidence includes: similar accepted posting found
Confidence is higher
```

This demonstrates:

```text
human feedback → vector memory → better future suggestions
```

---

## 25. OpenAPI

Create an OpenAPI file here:

```text
docs/openapi.yaml
```

The OpenAPI file documents only the two API endpoints:

```text
POST /api/suggestion-runs
POST /api/accepted-postings
```

Do not serve the OpenAPI file from the application.

Do not put the complete OpenAPI document inside this architecture file.

Codex can generate `docs/openapi.yaml` from the API shapes described above.

---

## 26. What not to build

Do not build:

```text
real BHB API integration
authentication
authorization
user accounts
multi-tenancy
OAuth
separate frontend app
separate backend app
health endpoint
accepted postings listing endpoint
OpenAPI serving endpoint
complex deterministic matcher
Zod validation
schema validation
suggestion_runs table
audit_events table
background jobs
queues
cron jobs
React app
ORM
complex CSS framework
```

This is a throwaway prototype.

Keep the implementation small enough to explain during the interview.

---

## 27. Future production enhancements

These are intentionally out of scope for the prototype, but can be mentioned in the interview:

```text
real BHB API adapter
proper schema validation
OpenAPI served by API gateway or docs system
authentication and tenant isolation
audit log
suggestion_runs table
feedback metrics
acceptance/rejection tracking
human review queue
more robust confidence scoring
tool-calling architecture
deterministic rule integration
structured model output validation
idempotency keys
rate limiting
monitoring and tracing
production-grade error handling
```

---

## 29. Implementation priority

Build in this order:

```text
1. Create Hono Worker skeleton.
2. Serve public/index.html.
3. Add POST /api/suggestion-runs returning mock suggestions.
4. Add POST /api/accepted-postings with mock success response.
5. Add D1 accepted_postings table.
6. Store accepted postings in D1.
7. Add Workers AI embeddings.
8. Add Vectorize upsert/query.
9. Add Workers AI LLM call.
10. Add simple confidence adjustment.
11. Add sample data button and demo polish.
12. Generate docs/openapi.yaml.
```

Do not start with Vectorize or the LLM.

First make the frontend and API flow work.

---

## 30. Success criteria

The prototype is successful if:

```text
The user can paste unresolved cases JSON.
The user can click Create suggestion run.
The app returns posting suggestions as structured JSON.
Each suggestion contains confidence, evidence, risks, and decision.
The user can edit the output JSON manually.
The user can store accepted postings.
Accepted postings are embedded and stored in vector memory.
Future similar cases retrieve accepted examples.
The implementation uses one Hono Cloudflare Worker.
The architecture clearly explains deterministic first, agent second.
The repository contains docs/openapi.yaml.
```
