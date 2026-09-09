import { describe, expect, it } from "vitest";
import { type RankedItem, rrfFusion, rrfFusionN } from "./rrf.js";

const ids = (...xs: string[]): RankedItem[] => xs.map((id) => ({ id }));

describe("rrfFusionN — basic fusion", () => {
	it("returns a single ranked list from two equal-weight inputs", () => {
		// List A: y first; List B: y first → y gets 2/(60+1) = 2/61 ≈ 0.0328
		// x is rank 2 in both → 2/(60+2) = 2/62 ≈ 0.0323 → y wins
		const out = rrfFusionN([ids("y", "x", "z"), ids("y", "x", "z")]);
		expect(out[0]!.id).toBe("y");
		expect(out[1]!.id).toBe("x");
		expect(out[2]!.id).toBe("z");
	});

	it("respects the limit argument", () => {
		const out = rrfFusionN([ids("a", "b", "c", "d", "e")], 60, 3);
		expect(out).toHaveLength(3);
		expect(out.map((r) => r.id)).toEqual(["a", "b", "c"]);
	});

	it("returns the correct k-bound RRF score for a single-list trivial case", () => {
		// Single list, single item → score = 1/(k+1) = 1/61
		const out = rrfFusionN([ids("only")]);
		expect(out[0]!.score).toBeCloseTo(1 / 61, 10);
	});

	it("default k=60 (no behavior change vs upstream)", () => {
		// Two-list, same ranking, default k=60
		// score = 2 * 1/(60+1) = 2/61
		const out = rrfFusionN([ids("x"), ids("x")]);
		expect(out[0]!.score).toBeCloseTo(2 / 61, 10);
	});

	it("merges disjoint lists (union, no penalty for missing from one)", () => {
		// a is only in list 1; b is only in list 2; both at rank 1
		// scores should be equal
		const out = rrfFusionN([ids("a", "c"), ids("b", "c")], 60, 5);
		const scoreA = out.find((r) => r.id === "a")!.score!;
		const scoreB = out.find((r) => r.id === "b")!.score!;
		expect(scoreA).toBeCloseTo(scoreB, 10);
	});

	it("ignores empty lists (preserves other lists' contributions)", () => {
		const out = rrfFusionN([[], ids("a", "b")]);
		// Only "a" and "b" should appear, with score = 1/(60+rank)
		expect(out.map((r) => r.id).sort()).toEqual(["a", "b"]);
		expect(out.find((r) => r.id === "a")!.score).toBeCloseTo(1 / 61, 10);
	});
});

describe("rrfFusionN — weights", () => {
	it("undefined positional weight defaults to 1 (backward-compat)", () => {
		// weights = [undefined, 1.5] → list 0 is full-strength, list 1 is 1.5×
		const w1 = rrfFusionN([ids("a"), ids("a")], 60, 10, {
			weights: [undefined as unknown as number, 1.5],
		});
		const w2 = rrfFusionN([ids("a"), ids("a")], 60, 10, { weights: [1, 1.5] });
		expect(w1[0]!.score).toBeCloseTo(w2[0]!.score!, 10);
	});

	it("higher positional weight boosts that list's contribution", () => {
		// List 0 weighted 1.0, list 1 weighted 5.0
		// "x" ranks 1st in list 1 but 2nd in list 0
		const heavyList1 = rrfFusionN(
			[ids("y", "x"), ids("x", "y")],
			60,
			10,
			{ weights: [1, 5] },
		);
		// With heavy weight on list 1, "x" should win
		expect(heavyList1[0]!.id).toBe("x");
	});

	it("a list with weight 0 contributes nothing", () => {
		// "ghost" only appears in list 0, which has weight 0
		const out = rrfFusionN(
			[ids("ghost", "real"), ids("real", "ghost")],
			60,
			10,
			{ weights: [0, 1] },
		);
		// "ghost" gets 0 + 1/(60+2); "real" gets 1/(60+2) + 1/(60+1)
		// real wins
		expect(out[0]!.id).toBe("real");
	});
});

describe("rrfFusionN — recency", () => {
	it("disabled by default (no recencyScores → byte-identical output)", () => {
		const out = rrfFusionN([ids("a", "b")], 60, 10, { recencyWeight: 0.2 });
		// recencyScores is undefined → recency is off regardless of weight
		expect(out.find((r) => r.id === "a")!.score).toBeCloseTo(1 / 61, 10);
	});

	it("missing id in recencyScores → neutral R=0.5 → multiplier 1.0", () => {
		const recencyScores = new Map<string, number>([["a", 0.9]]);
		// "b" not in map → treated as 0.5
		const out = rrfFusionN([ids("a", "b")], 60, 10, {
			recencyScores,
			recencyWeight: 0.4,
		});
		const scoreA = out.find((r) => r.id === "a")!.score!;
		const scoreB = out.find((r) => r.id === "b")!.score!;
		// scoreA is multiplied by (1 + 0.4 * (0.9 - 0.5)) = 1.16
		expect(scoreA).toBeCloseTo((1 / 61) * 1.16, 10);
		// scoreB is unchanged (R=0.5 → multiplier 1.0)
		expect(scoreB).toBeCloseTo(1 / 62, 10);
	});

	it("high R boosts the score; low R penalizes it (centered at 0.5)", () => {
		const highR = 0.95;
		const lowR = 0.05;
		const recencyScores = new Map<string, number>([["x", highR], ["y", lowR]]);
		const out = rrfFusionN([ids("x", "y")], 60, 10, {
			recencyScores,
			recencyWeight: 0.5,
		});
		// Multiplier on x: 1 + 0.5*(0.95-0.5) = 1.225
		// Multiplier on y: 1 + 0.5*(0.05-0.5) = 0.775
		// Despite y being ranked lower, x's high R pushes it way up
		expect(out[0]!.id).toBe("x");
		const scoreX = out.find((r) => r.id === "x")!.score!;
		const scoreY = out.find((r) => r.id === "y")!.score!;
		expect(scoreX).toBeGreaterThan((1 / 61) * 1.2);
		expect(scoreY).toBeLessThan((1 / 62) * 0.8);
	});

	it("bounded: recencyWeight·0.5 is the maximum swing on either side", () => {
		// recencyWeight=0.4 → max swing is ±0.2
		const recencyScores = new Map<string, number>([["x", 1.0], ["y", 0.0]]);
		const out = rrfFusionN([ids("x", "y")], 60, 10, {
			recencyScores,
			recencyWeight: 0.4,
		});
		// Multiplier bounds: [0.8, 1.2]
		const xBase = 1 / 61;
		const yBase = 1 / 62;
		const scoreX = out.find((r) => r.id === "x")!.score!;
		const scoreY = out.find((r) => r.id === "y")!.score!;
		expect(scoreX).toBeLessThanOrEqual(xBase * 1.2 + 1e-12);
		expect(scoreY).toBeGreaterThanOrEqual(yBase * 0.8 - 1e-12);
	});
});

describe("rrfFusion (2-list backward-compat)", () => {
	it("matches rrfFusionN with two equal-weight lists", () => {
		const a = rrfFusion(ids("x", "y"), ids("y", "x"));
		const b = rrfFusionN([ids("x", "y"), ids("y", "x")]);
		expect(a[0]!.id).toBe(b[0]!.id);
		expect(a[0]!.score).toBeCloseTo(b[0]!.score!, 10);
	});

	it("uses the k and limit arguments", () => {
		const out = rrfFusion(ids("a", "b", "c"), ids("d", "e", "f"), 60, 2);
		expect(out).toHaveLength(2);
	});
});
