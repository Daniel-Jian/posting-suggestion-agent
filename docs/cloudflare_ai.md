# Cloudflare AI setup

This project uses Cloudflare Workers AI through the Worker `AI` binding.

Current models:

```text
LLM_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8"
EMBEDDING_MODEL = "@cf/qwen/qwen3-embedding-0.6b"
```

The `POST /api/suggestion-runs` flow uses the embedding model to retrieve
similar accepted postings from Vectorize, then calls the LLM model for the
posting suggestion.

## 1. Confirm Workers AI access

1. Open the Cloudflare dashboard.
2. Select the account that owns the Worker.
3. Open **Workers & Pages**.
4. Open **AI** or **Workers AI**.
5. Use the model browser or playground to confirm that this account can run:
   `@cf/qwen/qwen3-30b-a3b-fp8`.

Cloudflare model reference:

```text
https://developers.cloudflare.com/workers-ai/models/qwen3-30b-a3b-fp8/
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
LLM_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8"
EMBEDDING_MODEL = "@cf/qwen/qwen3-embedding-0.6b"
```

The LLM model is used for posting suggestions, confidence explanation, evidence,
risk explanation, and human-review guidance.

The embedding model is used for accepted posting storage and suggestion-time
Vectorize retrieval.

Embedding model reference:

```text
https://developers.cloudflare.com/workers-ai/models/qwen3-embedding-0.6b/
```

## 4. JSON output mode

The suggestion route asks the LLM for JSON output with `response_format`.

The route uses JSON Object Mode plus a deliberately flat model-facing response
shape named `flat_v1`. The Worker maps that flat response back into the public
nested API response.

The current generation settings use:

```text
response_format.type = "json_object"
schemaVersion = "flat_v1"
max_tokens = 700
```

Cloudflare supports JSON output mode for compatible text generation models, but
model output can still be malformed. If Workers AI returns malformed or
incompatible JSON, the API returns a consistent JSON error instead of returning
raw model text.

`max_tokens` is set in Worker code, not in the Cloudflare Worker settings page.
To inspect token usage, open Cloudflare Worker Live Logs and look for the
`ai_success` event. The Worker logs safe metadata such as `schemaVersion`,
`maxTokens`, model name, duration, and `usage` when Workers AI returns it.

JSON mode reference:

```text
https://developers.cloudflare.com/workers-ai/features/json-mode/
```

## 5. Vectorize setup

Suggestion runs query Vectorize for similar accepted postings. If retrieval
fails, the Worker logs `retrieval_failed` and continues without examples.

The project declares the Vectorize binding:

```toml
[[vectorize]]
binding = "POSTING_INDEX"
index_name = "posting-suggestion-agent-postings"
```

Before running the full learning loop:

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
retrieval_success
ai_start
ai_success
ai_parse_start
ai_parse_success
response_success
```

If parsing fails after Workers AI returns, expect:

```text
ai_parse_failed
```

If retrieval fails before the LLM call, expect:

```text
retrieval_failed
```

This event logs the response kind, object keys, `response` field type, whether
the `response` field was an array, object keys for object-shaped `response`
fields, and only the first 500 characters when the failed value was a string or
chat-completion message.

If the request times out, expect:

```text
request_timeout
```

If validation or model parsing fails, expect:

```text
request_error
```

The logs intentionally include only safe metadata such as request ID, case
count, account count, model name, duration, error message, and a short response
excerpt on parse failure. They do not log full receipt text, prompts, account
lists, or full raw model output.

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
