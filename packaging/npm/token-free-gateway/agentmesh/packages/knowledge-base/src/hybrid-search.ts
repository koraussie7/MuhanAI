/**
 * Hybrid search: keyword (personal knowledge) + vector (pgvector or memory).
 *
 * P2 (stellavault port): fuse (keyword, vector, entity) via weighted RRF with
 * FSRS recency modulation. The old simple weighted sum (0.55/0.2/0.5/0.15)
 * was replaced by `fuseHybridResults`, which calls `rrfFusionN` and consumes
 * `decayEngine.getRetrievabilityScores()` for the recency signal.
 */

import type { KnowledgeNode } from "../../shared/types";
import { personalKnowledgeService } from "../../personal-mcp/src/knowledge";
import { decayEngine } from "./decay/engine.js";
import { type RankedItem, rrfFusionN } from "./search/rrf.js";
import { extractEntities, extractQueryTerms } from "./search/entity.js";
import { type ScoredKnowledge, vectorStore } from "./retrieval";

export interface HybridSearchParams {
	userId: string;
	query: string;
	limit?: number;
	categoryId?: string;
}

export interface HybridSearchHit {
	node: KnowledgeNode;
	score: number;
	source: "keyword" | "vector" | "both";
}

/** Per-list RRF weights. Vector carries slightly more than keyword; entity is
 *  a supplementary signal that mostly breaks ties. Tune via these constants. */
const WEIGHTS = {
	keyword: 1.0,
	vector: 1.2,
	entity: 0.8,
} as const;

/** Strength of the FSRS recency multiplier. 0.2 → ±10% bound on RRF scores. */
const RECENCY_WEIGHT = 0.2;
/** RRF damping constant — k=60 matches the original Cormack et al. (2009) and
 *  the stellavault port. */
const RRF_K = 60;

export async function hybridSearch(params: HybridSearchParams): Promise<HybridSearchHit[]> {
	const limit = params.limit ?? 8;

	const keywordHits = await personalKnowledgeService.search({
		userId: params.userId,
		query: params.query,
		categoryId: params.categoryId,
		limit,
	});

	let vectorHits: ScoredKnowledge[] = [];
	const mode = (process.env.PERSONAL_MCP_STORE ?? "memory").toLowerCase();

	if (mode === "prisma" && process.env.DATABASE_URL) {
		try {
			const { pgVectorStore } = await import("./pgvector-store");
			vectorHits = await pgVectorStore.search({
				query: params.query,
				filter: {
					ownerId: params.userId,
					categoryId: params.categoryId,
				},
				limit,
			});
		} catch {
			vectorHits = await vectorStore.search({
				query: params.query,
				filter: { ownerId: params.userId, categoryId: params.categoryId },
				limit,
			});
		}
	} else {
		vectorHits = await vectorStore.search({
			query: params.query,
			filter: { ownerId: params.userId, categoryId: params.categoryId },
			limit,
		});
	}

	return fuseHybridResults({
		query: params.query,
		keywordHits,
		vectorHits,
		limit,
		now: Date.now(),
	});
}

/** Inputs to the pure fusion step. Exported so unit tests can drive the
 *  ranking logic without setting up the full personal-MCP / vector store. */
export interface FuseInputs {
	query: string;
	keywordHits: KnowledgeNode[];
	vectorHits: ScoredKnowledge[];
	limit: number;
	now: number;
}

/**
 * Pure RRF-based fusion over (keyword, vector, entity) lists, with FSRS
 * recency modulation. Bounded content scan for the entity signal so the
 * per-call cost stays predictable. Rank-only fusion means the upstream
 * cosine / confidence scores do not need to be on a common scale — they
 * are dropped, and only the order inside each list is used.
 */
export function fuseHybridResults(inputs: FuseInputs): HybridSearchHit[] {
	const { query, keywordHits, vectorHits, limit, now } = inputs;

	// Candidate set: union of keyword + vector. Entity hits can only boost
	// nodes that are already candidates, not surface brand-new ones.
	const candidates = new Map<string, KnowledgeNode>();
	for (const n of keywordHits) candidates.set(n.id, n);
	for (const v of vectorHits) candidates.set(v.node.id, v.node);

	const queryTerms = extractQueryTerms(query);
	const queryTermSet = new Set(queryTerms);

	// Entity signal: for each candidate, compute a tiny entity set from
	// (title + first 500 chars of content) and check overlap with the query
	// terms. 500 chars is enough to capture the lead paragraph and most
	// headings without paying full-corpus cost.
	const entityHits: RankedItem[] = [];
	for (const node of candidates.values()) {
		const nodeEntities = new Set(
			extractEntities({
				title: node.title,
				content: node.content.slice(0, 500),
			}),
		);
		const matched = [...queryTermSet].some((t) => nodeEntities.has(t));
		if (matched) entityHits.push({ id: node.id });
	}

	const keywordList: RankedItem[] = keywordHits.map((n) => ({ id: n.id }));
	const vectorList: RankedItem[] = vectorHits.map((v) => ({ id: v.node.id }));

	const allIds = new Set<string>();
	for (const l of [keywordList, vectorList, entityHits]) for (const r of l) allIds.add(r.id);
	const recencyScores = decayEngine.getRetrievabilityScores(allIds, now);

	const fused = rrfFusionN(
		[keywordList, vectorList, entityHits],
		RRF_K,
		limit,
		{
			weights: [WEIGHTS.keyword, WEIGHTS.vector, WEIGHTS.entity],
			recencyScores,
			recencyWeight: RECENCY_WEIGHT,
		},
	);

	return fused.map((r) => {
		const inKeyword = keywordList.some((x) => x.id === r.id);
		const inVector = vectorList.some((x) => x.id === r.id);
		return {
			node: candidates.get(r.id)!,
			score: r.score ?? 0,
			source: inKeyword && inVector ? "both" : inKeyword ? "keyword" : "vector",
		};
	});
}
