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
- Implemented `POST /api/accepted-postings` route for accepted posting storage.
- Sample unresolved cases exposed through `GET /api/sample-data`.
- OpenAPI documentation for the two core POST routes.
- Cloudflare AI dashboard setup notes in `docs/cloudflare_ai.md`.

## Backend API

- Add deeper validation for unresolved case fields beyond the top-level
  `cases` and `accounts` arrays.
- Add deeper validation for accepted posting payloads beyond the accepted
  suggestion fields needed for storage.
- Decide whether `GET /api/sample-data` should remain a development helper or
  be removed to match the architecture route list.

## AI suggestion flow

- Improve prompt examples if first manual tests produce weak suggestions.
- Add confidence post-processing from `src/services/confidence.ts`.

## D1 storage

- Generate stable IDs for suggestion runs and accepted postings.
- Explicitly map database fields instead of returning raw D1 rows.

## Confidence and review logic

- Implement `summarizeConfidence` in `src/services/confidence.ts`.
- Define confidence thresholds for "suggest", "needs review", and "unsafe".
- Combine LLM confidence with retrieval evidence and input completeness.
- Surface missing evidence or contradictory receipt/transaction details.

## Frontend

- Load sample data from `GET /api/sample-data` or remove the duplicate inline
  sample object.
- Allow the user to approve or edit a selected suggestion.
- Show clear success and error states for real API responses.

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
