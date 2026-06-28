# Cloudflare AI setup

This project uses Cloudflare Workers AI through the Worker `AI` binding.

Current models:

```text
LLM_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
EMBEDDING_MODEL = "@cf/qwen/qwen3-embedding-0.6b"
```

The first-run `POST /api/suggestion-runs` flow uses only the LLM model.
Embeddings and Vectorize are configured for the later learning loop, after
accepted postings exist.

## 1. Confirm Workers AI access

1. Open the Cloudflare dashboard.
2. Select the account that owns the Worker.
3. Open **Workers & Pages**.
4. Open **AI** or **Workers AI**.
5. Use the model browser or playground to confirm that this account can run:
   `@cf/meta/llama-3.3-70b-instruct-fp8-fast`.

Cloudflare model reference:

```text
https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/
```

## 2. Confirm the Worker AI binding

The Worker must have an AI binding named `AI`.

In `wrangler.toml` this is:

```toml
[ai]
binding = "AI"
```

This makes the binding available in code as:

```ts
env.AI.run(env.LLM_MODEL, input)
```

Binding reference:

```text
https://developers.cloudflare.com/workers-ai/configuration/bindings/
```

## 3. Confirm model variables

The Worker uses environment variables from `wrangler.toml`:

```toml
[vars]
APP_NAME = "Posting Suggestion Agent"
LLM_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
EMBEDDING_MODEL = "@cf/qwen/qwen3-embedding-0.6b"
```

The LLM model is used for posting suggestions, confidence explanation, evidence,
risk explanation, and human-review guidance.

The embedding model is reserved for accepted postings and future Vectorize
retrieval.

Embedding model reference:

```text
https://developers.cloudflare.com/workers-ai/models/qwen3-embedding-0.6b/
```

## 4. JSON output mode

The suggestion route asks the LLM for JSON output with `response_format`.

Cloudflare supports JSON output mode for compatible text generation models, but
the application still parses and validates the result defensively. If Workers AI
returns malformed JSON, the API returns a consistent JSON error instead of
returning raw model text.

JSON mode reference:

```text
https://developers.cloudflare.com/workers-ai/features/json-mode/
```

## 5. Vectorize setup for later runs

The first run intentionally skips embeddings and Vectorize because there are no
accepted postings yet.

The project still declares the Vectorize binding for the later learning loop:

```toml
[[vectorize]]
binding = "POSTING_INDEX"
index_name = "posting-suggestion-agent-postings"
```

Before implementing accepted-posting storage and retrieval:

1. Open the Cloudflare dashboard.
2. Open **Workers & Pages**.
3. Open **Vectorize**.
4. Create or confirm the index named
   `posting-suggestion-agent-postings`.
5. Confirm the Worker binding name is `POSTING_INDEX`.

Vectorize reference:

```text
https://developers.cloudflare.com/vectorize/get-started/intro/
```
