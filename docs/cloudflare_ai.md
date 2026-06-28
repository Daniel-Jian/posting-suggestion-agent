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

The route uses a deliberately simple model-facing schema named `flat_v1`.
The schema avoids nested objects, arrays, nullable union types, and enum
constraints. The Worker maps that flat response back into the public nested API
response.

The current generation settings use:

```text
response_format.type = "json_schema"
schemaVersion = "flat_v1"
max_tokens = 2000
```

Cloudflare supports JSON output mode for compatible text generation models, but
schema mode can still fail if the requested schema or prompt is too complex. If
Workers AI returns malformed or incompatible JSON, the API returns a consistent
JSON error instead of returning raw model text.

`max_tokens` is set in Worker code, not in the Cloudflare Worker settings page.
To inspect token usage, open Cloudflare Worker Live Logs and look for the
`ai_success` event. The Worker logs safe metadata such as `schemaVersion`,
`maxTokens`, model name, duration, and `usage` when Workers AI returns it.

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

## 6. Debug suggestion runs

The `POST /api/suggestion-runs` route writes safe structured logs with a
`requestId`.

The frontend also displays the `X-Request-Id` response header when the request
finishes. Use that ID to find the same request in Cloudflare logs.

Log events to expect:

```text
request_received
request_validated
ai_start
ai_success
ai_parse_start
response_success
```

If the request times out, expect:

```text
request_timeout
```

If validation or model parsing fails, expect:

```text
request_error
```

The logs intentionally include only safe metadata such as request ID, case
count, account count, model name, duration, and error message. They do not log
full receipt text, prompts, account lists, or raw model output.

To inspect logs in Cloudflare:

1. Open the Cloudflare dashboard.
2. Open **Workers & Pages**.
3. Select the `posting-suggestion-agent` Worker.
4. Open **Logs**.
5. Start **Live logs**.
6. Click **Create suggestions** in the app.
7. Search or filter for the request ID shown by the frontend.

You can also use Wrangler:

```sh
npx wrangler tail posting-suggestion-agent
```

If logs stop at `ai_start`, the Worker reached Workers AI and is waiting for
the model response. If the frontend shows `REQUEST_TIMEOUT`, the browser waited
longer than the configured frontend timeout. If the Worker returns
`AI_SUGGESTION_TIMEOUT`, the backend 45-second Workers AI timeout fired.

Cloudflare logging references:

```text
https://developers.cloudflare.com/workers/observability/logs/
https://developers.cloudflare.com/workers/observability/logs/real-time-logs/
```
