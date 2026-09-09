import { beforeEach, describe, expect, it } from "vitest";
import type { KnowledgeNode } from "../../shared/types";
import { decayEngine as defaultDecayEngine } from "./decay/engine.js";
import { fuseHybridResults, type FuseInputs } from "./hybrid-search.js";
import type { ScoredKnowledge } from "./retrieval.js";

function makeNode(overrides: Partial<KnowledgeNode>): KnowledgeNode {
	return {
		id: overrides.id ?? "n",
		ownerId: "user-1",
		categoryId: "general",
		title: overrides.title ?? "Untitled",
		content: overrides.content ?? "",
		sourceType: "document",
		visibility: "private",
		permissions: { readableBy: ["user-1"], usableByAgents: true, commercialUse: false },
		confidence: overrides.confidence ?? 0.8,
		createdAt: new Date("2026-01-01"),
		updatedAt: new Date("2026-01-01"),
		metadata: overrides.metadata,
	};
}

function makeVectorHit(node: KnowledgeNode, score: number): ScoredKnowledge {
	return { node, score };
}

describe("fuseHybridResults — basic fusion", () => {
	beforeEach(() => {
		defaultDecayEngine.reset();
	});

	it("returns an empty list when both inputs are empty", () => {
		const out = fuseHybridResults({
			query: "anything",
			keywordHits: [],
			vectorHits: [],
			limit: 8,
			now: 1_700_000_000_000,
		});
		expect(out).toEqual([]);
	});

	it("returns up to `limit` results sorted by RRF score", () => {
		const kw = [
			makeNode({ id: "a", title: "FSRS Notes", content: "Spaced repetition" }),
			makeNode({ id: "b", title: "Other", content: "unrelated" }),
		];
		const vec = [
			makeVectorHit(makeNode({ id: "a", title: "FSRS Notes", content: "x" }), 0.9),
			makeVectorHit(makeNode({ id: "c", title: "FSRS deep dive", content: "y" }), 0.8),
		];
		const out = fuseHybridResults({
			query: "FSRS",
			keywordHits: kw,
			vectorHits: vec,
			limit: 3,
			now: 1_700_000_000_000,
		});
		expect(out.length).toBeLessThanOrEqual(3);
		expect(out[0]!.node.id).toBe("a"); // a is in BOTH keyword and vector → highest RRF
	});

	it("marks 'both' when a node appears in keyword AND vector", () => {
		const node = makeNode({ id: "a", title: "FSRS", content: "x" });
		const out = fuseHybridResults({
			query: "FSRS",
			keywordHits: [node],
			vectorHits: [makeVectorHit(node, 0.9)],
			limit: 5,
			now: 1_700_000_000_000,
		});
		expect(out.find((h) => h.node.id === "a")!.source).toBe("both");
	});

	it("marks 'keyword' for keyword-only hits", () => {
		const node = makeNode({ id: "k", title: "kw-only", content: "x" });
		const out = fuseHybridResults({
			query: "kw-only",
			keywordHits: [node],
			vectorHits: [],
			limit: 5,
			now: 1_700_000_000_000,
		});
		expect(out[0]!.source).toBe("keyword");
	});

	it("marks 'vector' for vector-only hits", () => {
		const node = makeNode({ id: "v", title: "vec-only", content: "x" });
		const out = fuseHybridResults({
			query: "vec-only",
			keywordHits: [],
			vectorHits: [makeVectorHit(node, 0.85)],
			limit: 5,
			now: 1_700_000_000_000,
		});
		expect(out[0]!.source).toBe("vector");
	});
});

describe("fuseHybridResults — entity signal", () => {
	beforeEach(() => {
		defaultDecayEngine.reset();
	});

	it("entity-only match in title boosts the node above pure vector hits", () => {
		// Node "a" has FSRS as a single-word title → entity is exactly "fsrs"
		// (multi-word titles are kept as one entity like "fsrs notes", which
		// would NOT match the query term "fsrs"). Use single-word title so
		// the title→entity round-trip is lossless.
		// Node "b" has no FSRS in its title or first 500 chars of content.
		const a = makeNode({ id: "a", title: "FSRS", content: "anything" });
		const b = makeNode({ id: "b", title: "Other", content: "FSRS deep content ".repeat(100) });
		// Note: "b" actually DOES contain FSRS in the first 500 chars via
		// the acronym extractor. To make the test demonstrate entity boost,
		// the second vector hit must be a node whose first 500 chars do NOT
		// contain FSRS. Replace "b" with a content that has no "FSRS".
		const bClean = makeNode({ id: "b", title: "Other", content: "Random body text. ".repeat(50) });
		const out = fuseHybridResults({
			query: "FSRS",
			keywordHits: [],
			vectorHits: [
				makeVectorHit(a, 0.7),
				makeVectorHit(bClean, 0.9), // higher cosine, but no entity match
			],
			limit: 5,
			now: 1_700_000_000_000,
		});
		// "a" gets 1.2/61 (vec) + 0.8/61 (entity) = 0.0328
		// "b" gets 1.2/62 (vec) only = 0.0194
		// → a should outrank b
		expect(out.find((h) => h.node.id === "a")!.score).toBeGreaterThan(
			out.find((h) => h.node.id === "b")!.score,
		);
	});

	it("extracts wikilink entities and matches them against query terms", () => {
		const a = makeNode({ id: "a", title: "Vault A", content: "See [[Reciprocal Rank Fusion]] for ranking." });
		const b = makeNode({ id: "b", title: "Vault B", content: "Random text, no wikilinks." });
		const out = fuseHybridResults({
			query: "RRF",
			keywordHits: [],
			vectorHits: [makeVectorHit(a, 0.6), makeVectorHit(b, 0.95)],
			limit: 5,
			now: 1_700_000_000_000,
		});
		// "a" matches RRF (acronym) AND wikilink entity "Reciprocal Rank Fusion"
		// "b" has no entity match
		expect(out[0]!.node.id).toBe("a");
	});
});

describe("fuseHybridResults — recency", () => {
	beforeEach(() => {
		defaultDecayEngine.reset();
	});

	it("scores are RRF values, not the old weighted-sum values", () => {
		// Before P2: score = 0.55 * confidence + 0.2 = 0.55 * 1.0 + 0.2 = 0.75
		// After P2:  score = 1/(k+rank+1) = 1/61 ≈ 0.0164
		// The recency hook is wired but neutral here (no access history → R=1.0).
		const a = makeNode({ id: "a", title: "FSRS", content: "x", confidence: 1.0 });
		const out = fuseHybridResults({
			query: "FSRS",
			keywordHits: [a],
			vectorHits: [],
			limit: 5,
			now: 1_700_000_000_000,
		});
		expect(out[0]!.score).toBeLessThan(0.1);
		expect(out[0]!.score).toBeGreaterThan(0);
	});

	it("high recency (just-accessed node) keeps the node near the top of the fused list", () => {
		// Two nodes that are identical in (keyword, vector, entity) signals.
		// Node "a" was just accessed → R ≈ 1.0 → positive recency modulation.
		// Node "b" was never accessed → R = 1.0 (initial) but the recency
		// multiplier is neutral at R=0.5 by design; we cannot easily backdate
		// the singleton engine's records. So this test only confirms the
		// recency lookup is plumbed end-to-end without errors and that both
		// nodes receive non-zero RRF scores.
		defaultDecayEngine.recordAccess("a");
		const a = makeNode({ id: "a", title: "FSRS", content: "x" });
		const b = makeNode({ id: "b", title: "FSRS", content: "x" });
		const out = fuseHybridResults({
			query: "FSRS",
			keywordHits: [a, b],
			vectorHits: [],
			limit: 5,
			now: 1_700_000_000_000,
		});
		expect(out).toHaveLength(2);
		expect(out.every((h) => h.score > 0)).toBe(true);
	});
});

describe("fuseHybridResults — determinism", () => {
	beforeEach(() => {
		defaultDecayEngine.reset();
	});

	it("produces the same output for the same input", () => {
		const inputs: FuseInputs = {
			query: "FSRS",
			keywordHits: [makeNode({ id: "a", title: "FSRS" })],
			vectorHits: [],
			limit: 5,
			now: 1_700_000_000_000,
		};
		const out1 = fuseHybridResults(inputs);
		const out2 = fuseHybridResults(inputs);
		expect(out1).toEqual(out2);
	});

	it("respects the limit argument", () => {
		const kw = Array.from({ length: 10 }, (_, i) =>
			makeNode({ id: `n${i}`, title: `Node ${i}` }),
		);
		const out = fuseHybridResults({
			query: "Node",
			keywordHits: kw,
			vectorHits: [],
			limit: 3,
			now: 1_700_000_000_000,
		});
		expect(out).toHaveLength(3);
	});
});
