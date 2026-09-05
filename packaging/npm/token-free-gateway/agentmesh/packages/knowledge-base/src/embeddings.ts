/**
 * Embedding service with:
 * - OpenAI text-embedding-3-small (when OPENAI_API_KEY is set)
 * - Deterministic pseudo-embedding fallback (dev / offline)
 *
 * Dimension is aligned with prisma KnowledgeChunk.embedding vector(1536).
 */

export interface EmbeddingResult {
  vector: number[];
  model: string;
  dimensions: number;
}

const DEFAULT_DIM = Number(process.env.EMBEDDING_DIMENSIONS ?? 1536);

export class EmbeddingService {
  readonly dimensions: number;
  private model: string;

  constructor(dimensions = DEFAULT_DIM) {
    this.dimensions = dimensions;
    this.model = process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      try {
        return await this.embedOpenAI(text, apiKey);
      } catch (err) {
        console.warn("[EmbeddingService] OpenAI failed, using pseudo:", err);
      }
    }
    return this.embedPseudo(text);
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey && texts.length > 0) {
      try {
        return await this.embedOpenAIBatch(texts, apiKey);
      } catch (err) {
        console.warn("[EmbeddingService] OpenAI batch failed, using pseudo:", err);
      }
    }
    return Promise.all(texts.map((t) => this.embedPseudo(t)));
  }

  cosineSimilarity(a: number[], b: number[]): number {
    const n = Math.min(a.length, b.length);
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < n; i++) {
      const av = a[i]!;
      const bv = b[i]!;
      dot += av * bv;
      na += av * av;
      nb += bv * bv;
    }
    return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
  }

  /** Serialize vector for pgvector literal: [0.1,0.2,...] */
  toPgVector(vector: number[]): string {
    return `[${vector.join(",")}]`;
  }

  private async embedOpenAI(text: string, apiKey: string): Promise<EmbeddingResult> {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input: text.slice(0, 8000),
        dimensions: this.dimensions,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenAI embeddings ${res.status}: ${body}`);
    }
    const json = (await res.json()) as {
      data: { embedding: number[] }[];
      model: string;
    };
    const first = json.data[0]!;
    return {
      vector: first.embedding,
      model: json.model,
      dimensions: first.embedding.length,
    };
  }

  private async embedOpenAIBatch(
    texts: string[],
    apiKey: string
  ): Promise<EmbeddingResult[]> {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input: texts.map((t) => t.slice(0, 8000)),
        dimensions: this.dimensions,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenAI embeddings batch ${res.status}: ${body}`);
    }
    const json = (await res.json()) as {
      data: { embedding: number[]; index: number }[];
      model: string;
    };
    const sorted = [...json.data].sort((a, b) => a.index - b.index);
    return sorted.map((d) => ({
      vector: d.embedding,
      model: json.model,
      dimensions: d.embedding.length,
    }));
  }

  private embedPseudo(text: string): EmbeddingResult {
    const vector = new Array(this.dimensions).fill(0);
    for (let i = 0; i < text.length; i++) {
      const idx = (text.charCodeAt(i) * (i + 7)) % this.dimensions;
      vector[idx] += 1;
    }
    // hash-ish mixing
    for (let i = 0; i < this.dimensions; i++) {
      vector[i] = Math.sin(vector[i] * 12.9898 + i * 0.5) * 0.5 + 0.5;
    }
    const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0)) || 1;
    return {
      vector: vector.map((v) => v / norm),
      model: "pseudo-embed-v2",
      dimensions: this.dimensions,
    };
  }
}

export const embeddingService = new EmbeddingService();
