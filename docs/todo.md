# TODO

This list is based on the current codebase and `docs/architecture.md`.
The first-run suggestion flow exists, but the learning loop is still partly
stubbed.

## Implemented baseline

- Cloudflare Worker project with Hono.
- Static frontend served from `public/index.html`.
- Wrangler bindings for Assets, Workers AI, D1, and Vectorize.
- Initial D1 migration for `suggestion_runs` and `accepted_postings`.
- Implemented first-run `POST /api/suggestion-runs` route.
- Stub `POST /api/accepted-postings` route.
- Sample unresolved cases exposed through `GET /api/sample-data`.
- OpenAPI documentation for the two core POST routes.
- Cloudflare AI dashboard setup notes in `docs/cloudflare_ai.md`.

## Backend API

- Replace the `501 NOT_IMPLEMENTED` response in `POST /api/accepted-postings`
  with real accepted posting storage.
- Add deeper validation for unresolved case fields beyond the top-level
  `cases` and `accounts` arrays.
- Add explicit validation for accepted posting payloads.
- Define response types for successful accepted posting storage.
- Decide whether `GET /api/sample-data` should remain a development helper or
  be removed to match the architecture route list.

## AI suggestion flow

- Improve prompt examples if first manual tests produce weak suggestions.
- Add confidence post-processing from `src/services/confidence.ts`.
- Decide whether later runs should call Vectorize before the LLM once accepted
  postings exist.

## Embeddings and vector memory

- Implement `createEmbedding` in `src/services/embeddings.ts`.
- Call the configured Workers AI embedding model from `env.EMBEDDING_MODEL`.
- Implement `findSimilarAcceptedPostings` in
  `src/services/vectorMemory.ts`.
- Query Vectorize for similar accepted postings when creating suggestions after
  accepted posting storage is implemented.
- Store accepted posting embeddings in Vectorize after human approval.
- Define stable Vectorize IDs and metadata for accepted postings.
- Handle missing or empty vector search results gracefully.

## D1 storage

- Implement `storeAcceptedPosting` in `src/services/storage.ts`.
- Insert accepted posting JSON into `accepted_postings`.
- Generate stable IDs for suggestion runs and accepted postings.
- Explicitly map database fields instead of returning raw D1 rows.
- Add small helper functions for reading/writing D1 data.
- Consider whether `accepted_postings` needs additional query fields beyond
  JSON, such as account, amount, currency, merchant, or booking date.

## Confidence and review logic

- Implement `summarizeConfidence` in `src/services/confidence.ts`.
- Define confidence thresholds for "suggest", "needs review", and "unsafe".
- Combine LLM confidence with retrieval evidence and input completeness.
- Surface missing evidence or contradictory receipt/transaction details.

## Frontend

- Load sample data from `GET /api/sample-data` or remove the duplicate inline
  sample object.
- Display real suggestion results in an editable review area.
- Allow the user to approve or edit a selected suggestion.
- Send the edited approved posting to `POST /api/accepted-postings`.
- Show clear success and error states for real API responses.
- Replace accepted-posting stub status messages once the storage flow is live.

## Documentation

- Update `docs/openapi.yaml` when successful response shapes are implemented.
- Document the expected unresolved case input shape with realistic examples.
- Document the accepted posting JSON shape.
- Add local setup steps for D1 migrations and Vectorize index creation.
- Add a short manual demo flow for the prototype.

## Testing and verification

- Add focused TypeScript tests or lightweight verification for validation
  helpers and service functions.
- Verify `npm run check` after each implemented feature.
- Test both core POST routes with valid and invalid JSON payloads.
- Test behavior when Workers AI, D1, or Vectorize calls fail.
