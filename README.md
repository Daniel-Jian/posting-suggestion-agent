# posting-suggestion-agent
BHB Assignment Prototype

The prototype intentionally assumes that the existing deterministic BHB rule engine runs first.

The Posting Suggestion Agent receives only unresolved or low-confidence cases.
This avoids reimplementing existing BHB functionality and focuses the prototype on the work case question:
how an agentic/RAG workflow can handle edge cases, explain suggestions, and learn from human approvals.

The application demonstrates:
- REST-style JSON APIs
- Hono on Cloudflare Workers
- OpenAPI documentation
- Workers AI Qwen3 model for structured posting suggestions
- Workers AI Qwen embedding model
- Vectorize for similar accepted postings
- D1 for audit and accepted posting storage
- human-in-the-loop approval through editable JSON
