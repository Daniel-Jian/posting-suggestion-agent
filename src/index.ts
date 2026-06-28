import { Hono } from "hono";
import type { Context } from "hono";

import {
  createPostingSuggestions,
  AiSuggestionError,
  AiSuggestionTimeoutError
} from "./services/aiClient";
import {
  AcceptedPostingStorageError,
  AcceptedPostingValidationError,
  storeAcceptedPostingsFromRunResponse
} from "./services/acceptedPostings";
import { sampleAccounts, sampleUnresolvedCases } from "./sampleData";
import type {
  ApiErrorResponse,
  ApiSuccessResponse,
  SuggestionRunRequest
} from "./types";

type AppBindings = {
  Bindings: Env;
};

const app = new Hono<AppBindings>();

type LogMetadata = Record<string, unknown>;
type JsonStatus = 200 | 400 | 502 | 504;

function success<T>(data: T): ApiSuccessResponse<T> {
  return {
    success: true,
    data
  };
}

function error(code: string, message: string): ApiErrorResponse {
  return {
    success: false,
    error: {
      code,
      message
    }
  };
}

function createRequestId(): string {
  return crypto.randomUUID();
}

function logEvent(requestId: string, event: string, metadata: LogMetadata = {}): void {
  console.log(
    JSON.stringify({
      requestId,
      event,
      ...metadata
    })
  );
}

function jsonWithRequestId(
  c: Context<AppBindings>,
  body: ApiSuccessResponse<unknown> | ApiErrorResponse,
  status: JsonStatus,
  requestId: string
) {
  c.header("X-Request-Id", requestId);
  return c.json(body, status);
}

async function readJsonBody(c: Context<AppBindings>): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

function isSuggestionRunRequest(value: unknown): value is SuggestionRunRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    "cases" in value &&
    Array.isArray((value as { cases: unknown }).cases) &&
    "accounts" in value &&
    Array.isArray((value as { accounts: unknown }).accounts)
  );
}

app.post("/api/suggestion-runs", async (c) => {
  const requestId = createRequestId();
  const startedAt = Date.now();
  logEvent(requestId, "request_received", {
    path: "/api/suggestion-runs"
  });

  const body = await readJsonBody(c);

  if (!isSuggestionRunRequest(body)) {
    logEvent(requestId, "request_error", {
      errorName: "InvalidRequest",
      errorMessage: "Request body must include cases and accounts arrays.",
      durationMs: Date.now() - startedAt
    });

    return jsonWithRequestId(
      c,
      error("INVALID_REQUEST", "Request body must include cases and accounts arrays."),
      400,
      requestId
    );
  }

  logEvent(requestId, "request_validated", {
    caseCount: body.cases.length,
    accountCount: body.accounts.length,
    model: c.env.LLM_MODEL
  });

  try {
    const result = await createPostingSuggestions(c.env, body, {
      timeoutMs: 45000,
      log: (event, metadata) => {
        logEvent(requestId, event, metadata);
      }
    });

    logEvent(requestId, "response_success", {
      durationMs: Date.now() - startedAt,
      suggestionCount: result.suggestions.length
    });

    return jsonWithRequestId(c, success(result), 200, requestId);
  } catch (err) {
    const errorName = err instanceof Error ? err.name : "UnknownError";
    const errorMessage = err instanceof Error ? err.message : "Unknown error.";

    if (err instanceof AiSuggestionError) {
      const status = err instanceof AiSuggestionTimeoutError ? 504 : 502;
      const code =
        err instanceof AiSuggestionTimeoutError
          ? "AI_SUGGESTION_TIMEOUT"
          : "AI_SUGGESTION_FAILED";

      logEvent(
        requestId,
        err instanceof AiSuggestionTimeoutError ? "request_timeout" : "request_error",
        {
          errorName,
          errorMessage,
          durationMs: Date.now() - startedAt
        }
      );

      return jsonWithRequestId(c, error(code, err.message), status, requestId);
    }

    logEvent(requestId, "request_error", {
      errorName,
      errorMessage,
      durationMs: Date.now() - startedAt
    });

    throw err;
  }
});

app.post("/api/accepted-postings", async (c) => {
  const requestId = createRequestId();
  const startedAt = Date.now();
  logEvent(requestId, "request_received", {
    path: "/api/accepted-postings"
  });

  const body = await readJsonBody(c);

  try {
    const result = await storeAcceptedPostingsFromRunResponse(c.env, body, {
      log: (event, metadata) => {
        logEvent(requestId, event, metadata);
      }
    });

    logEvent(requestId, "accepted_postings_stored", {
      durationMs: Date.now() - startedAt,
      storedCount: result.stored_count,
      vectorCount: result.vector_ids.length
    });

    return jsonWithRequestId(c, success(result), 200, requestId);
  } catch (err) {
    const errorName = err instanceof Error ? err.name : "UnknownError";
    const errorMessage = err instanceof Error ? err.message : "Unknown error.";

    if (err instanceof AcceptedPostingValidationError) {
      logEvent(requestId, "request_error", {
        errorName,
        errorMessage,
        durationMs: Date.now() - startedAt
      });

      return jsonWithRequestId(c, error("INVALID_REQUEST", err.message), 400, requestId);
    }

    if (err instanceof AcceptedPostingStorageError) {
      logEvent(requestId, "request_error", {
        errorName,
        errorMessage,
        durationMs: Date.now() - startedAt
      });

      return jsonWithRequestId(c, error("ACCEPTED_POSTING_FAILED", err.message), 502, requestId);
    }

    logEvent(requestId, "request_error", {
      errorName,
      errorMessage,
      durationMs: Date.now() - startedAt
    });

    throw err;
  }
});

app.get("/api/sample-data", (c) => {
  return c.json(success({ cases: sampleUnresolvedCases, accounts: sampleAccounts }));
});

app.all("*", (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
