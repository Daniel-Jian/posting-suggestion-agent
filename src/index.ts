import { Hono } from "hono";
import type { Context } from "hono";

import { sampleUnresolvedCases } from "./sampleData";
import type {
  AcceptedPostingRequest,
  ApiErrorResponse,
  ApiSuccessResponse,
  SuggestionRunRequest
} from "./types";

type AppBindings = {
  Bindings: Env;
};

const app = new Hono<AppBindings>();

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
    Array.isArray((value as { cases: unknown }).cases)
  );
}

function isAcceptedPostingRequest(value: unknown): value is AcceptedPostingRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    "posting" in value &&
    typeof (value as { posting: unknown }).posting === "object" &&
    (value as { posting: unknown }).posting !== null
  );
}

app.post("/api/suggestion-runs", async (c) => {
  const body = await readJsonBody(c);

  if (!isSuggestionRunRequest(body)) {
    return c.json(error("INVALID_REQUEST", "Request body must include a cases array."), 400);
  }

  return c.json(
    error(
      "NOT_IMPLEMENTED",
      "Suggestion generation is stubbed for the first project scaffold."
    ),
    501
  );
});

app.post("/api/accepted-postings", async (c) => {
  const body = await readJsonBody(c);

  if (!isAcceptedPostingRequest(body)) {
    return c.json(error("INVALID_REQUEST", "Request body must include a posting object."), 400);
  }

  return c.json(
    error(
      "NOT_IMPLEMENTED",
      "Accepted posting storage is stubbed for the first project scaffold."
    ),
    501
  );
});

app.get("/api/sample-data", (c) => {
  return c.json(success({ cases: sampleUnresolvedCases }));
});

app.all("*", (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
