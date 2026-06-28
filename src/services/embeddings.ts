export class EmbeddingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingError";
  }
}

export async function createEmbedding(env: Env, text: string): Promise<number[]> {
  const result = await env.AI.run(env.EMBEDDING_MODEL, {
    text
  });

  if (!result.data || !Array.isArray(result.data) || !Array.isArray(result.data[0])) {
    throw new EmbeddingError("Workers AI did not return an embedding.");
  }

  const embedding = result.data[0];

  if (embedding.length === 0 || !embedding.every((value) => Number.isFinite(value))) {
    throw new EmbeddingError("Workers AI returned an invalid embedding.");
  }

  return embedding;
}
