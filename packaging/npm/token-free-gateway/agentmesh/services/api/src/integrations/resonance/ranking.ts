/**
 * 768-dim cosine similarity ranking — Resonance semantic pattern.
 *
 * Resonance ships EmbeddingGemma-300M on-device to produce 768-dim
 * embeddings. We don't ship a model server-side; this module accepts
 * pre-computed 768-dim vectors from the client and falls back to a
 * deterministic hash-projection for development/testing only.
 *
 * NEVER use the deterministic projection in production — it does not
 * capture semantic similarity. It's here so tests and dev integrations
 * can exercise the route surface without an embedding model.
 */

import { type RankedItem, type RankedResult, RESONANCE_EMBEDDING_DIM } from "./types.js";

export function isValidEmbedding(value: unknown): value is number[] {
	if (!Array.isArray(value)) return false;
	if (value.length !== RESONANCE_EMBEDDING_DIM) return false;
	for (const v of value) {
		if (typeof v !== "number" || !Number.isFinite(v)) return false;
	}
	return true;
}

/**
 * FNV-1a 64-bit hash projected into [-1, 1] across 768 dims. Deterministic
 * for the same input string — useful for tests and dev, NOT a real embedding.
 */
export function deterministicEmbedding(input: string): number[] {
	const out = new Array<number>(RESONANCE_EMBEDDING_DIM).fill(0);
	const tokens = input
		.toLowerCase()
		.split(/[^a-z0-9가-힣]+/u)
		.filter((t) => t.length > 0);

	if (tokens.length === 0) return out;

	for (let dim = 0; dim < RESONANCE_EMBEDDING_DIM; dim++) {
		let acc = 0xcbf29ce484222325n;
		const seed = BigInt(dim + 1);
		let dimSum = 0;
		for (const token of tokens) {
			let h = acc ^ seed;
			for (let i = 0; i < token.length; i++) {
				const c = token.charCodeAt(i);
				h ^= BigInt(c);
				h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
			}
			// Map the lowest 16 bits into [-1, 1].
			const lo = Number(h & 0xffffn) / 0xffff;
			acc = h;
			dimSum += lo * 2 - 1;
		}
		// Squash to [-1, 1] via tanh-style soft clip.
		const v = dimSum / tokens.length;
		out[dim] = Math.tanh(v * 1.5);
	}

	// L2-normalise so cosine == dot product at rank time.
	const norm = Math.hypot(...out);
	if (norm === 0) return out;
	for (let i = 0; i < out.length; i++) {
		out[i] = out[i]! / norm;
	}
	return out;
}

function cosine(a: number[], b: number[]): number {
	if (a.length !== b.length) return 0;
	let dot = 0;
	let na = 0;
	let nb = 0;
	for (let i = 0; i < a.length; i++) {
		const av = a[i]!;
		const bv = b[i]!;
		dot += av * bv;
		na += av * av;
		nb += bv * bv;
	}
	if (na === 0 || nb === 0) return 0;
	return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface RankOptions {
	topK?: number;
	minScore?: number;
}

export function rankCorpus(
	queryEmbedding: number[],
	corpus: RankedItem[],
	options: RankOptions = {},
): RankedResult[] {
	const topK = options.topK ?? 10;
	const minScore = options.minScore ?? 0;

	const scored: RankedResult[] = [];
	for (const item of corpus) {
		const itemEmbedding = item.embedding ?? (item.text ? deterministicEmbedding(item.text) : null);
		if (!itemEmbedding) continue;
		const score = cosine(queryEmbedding, itemEmbedding);
		if (score < minScore) continue;
		scored.push({
			...item,
			score,
			rank: 0,
		});
	}

	scored.sort((a, b) => b.score - a.score);
	const top = scored.slice(0, topK);
	top.forEach((r, i) => {
		r.rank = i + 1;
	});
	return top;
}

export function resolveQueryEmbedding(
	query: string,
	supplied?: number[],
): { embedding: number[]; source: "client" | "deterministic" } {
	if (supplied && isValidEmbedding(supplied)) {
		return { embedding: supplied, source: "client" };
	}
	return { embedding: deterministicEmbedding(query), source: "deterministic" };
}
