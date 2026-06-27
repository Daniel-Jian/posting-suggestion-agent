# AGENTS.md – Posting Suggestion Agent

## First Read
- docs/architecture.md

## Project

This repository contains the Prototype for the Posting Suggestion Agent, an AI agent for matching  receipts, transactions, accounts in postings.

## Current stack

- Cloudflare Worker
- TypeScript
- Hono
- Cloudflare D1
- Cloudflare Vectorize
- AI API
- Wrangler

## Development rule

Build one small feature at a time.

Do not generate a full application.

For each task:
1. Read this file first.
2. Read only the relevant documentation.
3. Explain the planned change before editing.
4. Make small, understandable changes.
5. Explain what changed and why.

Clarity is more important than speed.

## Coding style

- Use boring, readable TypeScript.
- Keep route handlers thin.
- Move database logic into small functions.
- Avoid clever abstractions.
- Avoid unrelated refactoring.
- Do not introduce new libraries without asking.

## API rules

- REST-style JSON APIs.
- Consistent response shape.
- Never return passwords, password hashes, or secrets.
- Validate all input on the backend.
- Prefer explicit field mapping over returning raw database rows.

## Database rules

- Use Cloudflare D1.
- Keep schema changes in Wrangler migrations.
- Keep migrations small.
- Do not use automatic schema updates.
