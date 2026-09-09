import { describe, expect, it } from "vitest";
import {
	buildAliasIndex,
	expandWithAliases,
	extractEntities,
	extractQueryTerms,
} from "./entity.js";

describe("extractEntities — wikilink primary signal", () => {
	it("extracts plain [[Target]] wikilinks from content", () => {
		const entities = extractEntities({ content: "See [[FSRS]] and [[Hybrid Search]] for context." });
		expect(entities).toContain("fsrs");
		expect(entities).toContain("hybrid search");
	});

	it("drops the alias in [[Target|alias]]", () => {
		const entities = extractEntities({ content: "Read [[FSRS|the spaced-repetition scheduler]] today." });
		expect(entities).toContain("fsrs");
		expect(entities).not.toContain("the spaced repetition scheduler");
	});

	it("drops the section anchor in [[Target#section]]", () => {
		const entities = extractEntities({ content: "See [[MuhanAI#Federation]] and [[RRF]]." });
		expect(entities).toContain("muhanai");
		expect(entities).toContain("rrf");
		expect(entities.every((e) => !e.includes("#"))).toBe(true);
	});

	it("does not pair an unclosed [[ with a later ]] (line-bounded)", () => {
		// Without line-bounding, the unclosed opener would eat to the
		// second `]]` and yield a bogus multi-line target.
		const content = "[[unfinished opener\nthis line has [[RRF]] and [[FSRS]]";
		const entities = extractEntities({ content });
		// RRF and FSRS should still be found on their own lines
		expect(entities).toContain("rrf");
		expect(entities).toContain("fsrs");
		// No garbage entity like "unfinished opener\nthis line has"
		expect(entities.every((e) => !e.includes("\n"))).toBe(true);
	});

	it("skips embeds ![[...]] (transclusions are not entity references)", () => {
		const entities = extractEntities({ content: "Image: ![[diagram.png]] and text [[RealEntity]]." });
		expect(entities).toContain("realentity");
		expect(entities.every((e) => !e.includes("diagram"))).toBe(true);
	});
});

describe("extractEntities — tags, heading, title", () => {
	it("promotes configured tags to entities", () => {
		const entities = extractEntities({
			content: "body",
			tags: ["knowledge-management", "agentmesh"],
		});
		expect(entities).toContain("knowledge management");
		expect(entities).toContain("agentmesh");
	});

	it("strips the leading # from tags and normalizes separators", () => {
		const entities = extractEntities({ content: "x", tags: ["#foo/bar_baz"] });
		expect(entities).toContain("foo bar baz");
	});

	it("extracts inline #tags from content", () => {
		const entities = extractEntities({ content: "Tagged #knowledge-base and #FSRS-impl." });
		expect(entities).toContain("knowledge base");
		expect(entities).toContain("fsrs impl");
	});

	it("promotes heading and title to entities", () => {
		const entities = extractEntities({
			content: "body",
			heading: "Reciprocal Rank Fusion",
			title: "RRF Notes",
		});
		expect(entities).toContain("reciprocal rank fusion");
		expect(entities).toContain("rrf notes");
	});
});

describe("extractEntities — fallback Title-Case / acronym extraction", () => {
	it("extracts 2..5 consecutive Title-Case words", () => {
		const entities = extractEntities({
			content: "We use Reciprocal Rank Fusion for ranking.",
		});
		expect(entities).toContain("reciprocal rank fusion");
	});

	it("extracts 2..6-letter ALL-CAPS acronyms", () => {
		const entities = extractEntities({
			content: "The system uses FSRS, RRF, and MCP.",
		});
		expect(entities).toContain("fsrs");
		expect(entities).toContain("rrf");
		expect(entities).toContain("mcp");
	});

	it("strips inline code and URLs before Title-Case scan", () => {
		const entities = extractEntities({
			content: "Use `Reciprocal Rank Fusion` from https://example.com/spec for details.",
		});
		// Inside backticks → not a Title-Case phrase
		expect(entities.every((e) => e !== "reciprocal rank fusion")).toBe(true);
	});

	it("caps at MAX_ENTITIES_PER_CHUNK (30) — never blows up signal", () => {
		const content = Array.from({ length: 100 }, (_, i) => `[[Entity${i}]]`).join(" ");
		const entities = extractEntities({ content });
		expect(entities.length).toBeLessThanOrEqual(30);
	});
});

describe("extractQueryTerms", () => {
	it("extracts acronyms as lowercase candidates", () => {
		const terms = extractQueryTerms("How does RRF compare to BM25?");
		expect(terms).toContain("rrf");
		expect(terms).toContain("bm25");
	});

	it("emits 1..4 word n-grams from a lowercase query", () => {
		const terms = extractQueryTerms("hybrid search ranking fusion");
		expect(terms).toContain("hybrid");
		expect(terms).toContain("hybrid search");
		expect(terms).toContain("hybrid search ranking");
		expect(terms).toContain("hybrid search ranking fusion");
	});

	it("filters n-grams whose boundary words are stopwords", () => {
		// "the cat" → both words at edges → discard
		// "the quick fox" → "the" at start, "fox" ok → discard
		// "cat the dog" → "the" in middle, "dog" at end → keep? (upstream keeps interior stopwords)
		const terms = extractQueryTerms("the cat the dog");
		// Upstream behavior: middle stopwords allowed, edge stopwords rejected
		expect(terms).not.toContain("the cat");
		expect(terms).not.toContain("cat the dog the");
	});

	it("tokenizes CJK without spaces (per-character fallthrough)", () => {
		// Korean/CJK queries have no whitespace → split returns single bigram? no,
		// the regex splits on \s+ which yields the whole phrase as one token.
		// So we get the unigram (length ≥ 2 after normalize).
		const terms = extractQueryTerms("하이브리드 검색");
		expect(terms).toContain("하이브리드 검색");
	});

	it("extracts wikilinks from the query itself", () => {
		const terms = extractQueryTerms("What does [[FSRS]] say?");
		expect(terms).toContain("fsrs");
	});

	it("caps at MAX_QUERY_TERMS (64)", () => {
		const terms = extractQueryTerms(Array.from({ length: 200 }, (_, i) => `word${i}`).join(" "));
		expect(terms.length).toBeLessThanOrEqual(64);
	});
});

describe("buildAliasIndex + expandWithAliases", () => {
	it("builds a bidirectional index from {key: [aliases]}", () => {
		const idx = buildAliasIndex({ 자비스: ["jarvis"] });
		expect(idx.get("자비스")).toEqual(["jarvis"]);
		expect(idx.get("jarvis")).toEqual(["자비스"]);
	});

	it("transitively links multi-member groups", () => {
		const idx = buildAliasIndex({ ai: ["인공 지능", "artificial intelligence"] });
		// ai ↔ 인공 지능, ai ↔ artificial intelligence
		expect(idx.get("ai")!.sort()).toEqual(["artificial intelligence", "인공 지능"]);
		expect(idx.get("인공 지능")).toEqual(["ai", "artificial intelligence"]);
	});

	it("ignores single-member groups (nothing to bridge)", () => {
		const idx = buildAliasIndex({ only: ["only"] });
		expect(idx.size).toBe(0);
	});

	it("returns an empty index for undefined input", () => {
		expect(buildAliasIndex(undefined).size).toBe(0);
	});

	it("expandWithAliases is a no-op when index is empty", () => {
		const terms = ["foo", "bar"];
		expect(expandWithAliases(terms, new Map())).toEqual(terms);
	});

	it("expandWithAliases adds alias terms and dedupes", () => {
		const idx = buildAliasIndex({ ai: ["인공 지능"] });
		const out = expandWithAliases(["ai", "foo"], idx);
		expect(out).toContain("ai");
		expect(out).toContain("인공 지능");
		expect(out).toContain("foo");
		// dedup: "ai" appears once
		expect(out.filter((t) => t === "ai")).toHaveLength(1);
	});
});

describe("extractEntities — language-agnostic wikilink handling", () => {
	it("preserves Korean characters in wikilink targets (no Title-Case required)", () => {
		const entities = extractEntities({ content: "[[하이브리드 검색]] is a thing." });
		expect(entities).toContain("하이브리드 검색");
	});

	it("preserves Chinese characters in wikilink targets", () => {
		const entities = extractEntities({ content: "[[知识图谱]] 是一种数据结构。" });
		expect(entities).toContain("知识图谱");
	});
});
