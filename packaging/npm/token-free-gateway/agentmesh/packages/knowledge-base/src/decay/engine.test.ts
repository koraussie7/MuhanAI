import { describe, expect, it } from "vitest";
import { FSRS_PARAMS, computeRetrievability } from "./fsrs.js";
import { DecayEngine } from "./engine.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Build a clock that returns successive timestamps from a list. */
function fakeClock(...timestamps: number[]): () => number {
	let i = 0;
	return () => {
		const t = timestamps[i] ?? timestamps[timestamps.length - 1]!;
		i += 1;
		return t;
	};
}

describe("DecayEngine — recordAccess", () => {
	it("creates a default record on first access", () => {
		const t0 = 1_700_000_000_000;
		const engine = new DecayEngine({ clock: () => t0 });
		const r = engine.recordAccess("n1", "search");
		expect(r.nodeId).toBe("n1");
		expect(r.stabilityDays).toBe(FSRS_PARAMS.initialStability);
		expect(r.difficulty).toBe(FSRS_PARAMS.difficulty);
		expect(r.lastAccessedAt).toBe(t0);
		expect(r.accessCount).toBe(1);
	});

	it("increments accessCount on subsequent accesses", () => {
		let t = 1_700_000_000_000;
		const engine = new DecayEngine({ clock: () => t });
		engine.recordAccess("n1");
		t += 1000;
		engine.recordAccess("n1");
		t += 1000;
		const r = engine.recordAccess("n1");
		expect(r.accessCount).toBe(3);
	});

	it("updates stability upward when retrievability is high between accesses", () => {
		const t0 = 1_700_000_000_000;
		const clock = fakeClock(t0, t0, t0 + DAY_MS);
		const engine = new DecayEngine({ clock: clock });
		engine.recordAccess("n1"); // t0: init
		const r2 = engine.recordAccess("n1"); // t0 + 1day: 1 day of decay
		// First access had elapsed=0 (just-init), R=1, S grows from 7
		// Second access: 1 day of decay, R ≈ 0.984, S grows again.
		// After two easy recalls S should exceed initial 7.
		expect(r2.stabilityDays).toBeGreaterThan(FSRS_PARAMS.initialStability);
	});

	it("refreshes lastAccessedAt to the current clock on each access", () => {
		let t = 1_700_000_000_000;
		const engine = new DecayEngine({ clock: () => t });
		engine.recordAccess("n1");
		t += 5 * DAY_MS;
		const r = engine.recordAccess("n1");
		expect(r.lastAccessedAt).toBe(t);
	});

	it("treats all access types uniformly (v0.1)", () => {
		const t0 = 1_700_000_000_000;
		const engine = new DecayEngine({ clock: () => t0 });
		const r1 = engine.recordAccess("n1", "search");
		const r2 = engine.recordAccess("n1", "edit");
		// Both calls happened at the same t, so stability is updated
		// each time but should not diverge across types.
		expect(r2.stabilityDays).toBeCloseTo(r1.stabilityDays, 10);
	});
});

describe("DecayEngine — getRetrievability", () => {
	it("returns 1.0 for nodes just accessed", () => {
		const t0 = 1_700_000_000_000;
		const engine = new DecayEngine({ clock: () => t0 });
		engine.recordAccess("n1");
		expect(engine.getRetrievability("n1", t0)).toBe(1.0);
	});

	it("decays as the `now` argument advances past last access", () => {
		const t0 = 1_700_000_000_000;
		const engine = new DecayEngine({ clock: () => t0 });
		engine.recordAccess("n1");
		const r1 = engine.getRetrievability("n1", t0 + 1 * DAY_MS);
		const r7 = engine.getRetrievability("n1", t0 + 7 * DAY_MS);
		const r30 = engine.getRetrievability("n1", t0 + 30 * DAY_MS);
		expect(r1).toBeGreaterThan(r7);
		expect(r7).toBeGreaterThan(r30);
	});

	it("returns a neutral R for never-seen nodes", () => {
		const engine = new DecayEngine({ clock: () => 1_700_000_000_000 });
		// Never recorded → defaults to initial-stability, zero elapsed → 1.0
		const r = engine.getRetrievability("never-seen");
		expect(r).toBe(computeRetrievability(FSRS_PARAMS.initialStability, 0));
	});

	it("matches the manual computeRetrievability call given the same inputs", () => {
		const t0 = 1_700_000_000_000;
		const engine = new DecayEngine({ clock: () => t0 });
		engine.recordAccess("n1");
		const probeTime = t0 + 14 * DAY_MS;
		const actual = engine.getRetrievability("n1", probeTime);
		const expected = computeRetrievability(FSRS_PARAMS.initialStability, 14);
		expect(actual).toBeCloseTo(expected, 6);
	});
});

describe("DecayEngine — getRetrievabilityScores (RRF prep)", () => {
	it("returns a Map with one entry per requested id", () => {
		const engine = new DecayEngine({ clock: () => 1_700_000_000_000 });
		engine.recordAccess("a");
		engine.recordAccess("b");
		const map = engine.getRetrievabilityScores(["a", "b", "c"]);
		expect(map.size).toBe(3);
		expect(map.has("a")).toBe(true);
		expect(map.has("b")).toBe(true);
		expect(map.has("c")).toBe(true);
	});

	it("returns neutral 1.0 for never-seen ids (initial-stability, no decay)", () => {
		const engine = new DecayEngine({ clock: () => 1_700_000_000_000 });
		const map = engine.getRetrievabilityScores(["unknown-1", "unknown-2"]);
		// Unknown nodes default to R = computeRetrievability(initialStability, 0) = 1.0
		expect(map.get("unknown-1")).toBe(1.0);
		expect(map.get("unknown-2")).toBe(1.0);
	});

	it("accepts an explicit `now` argument for deterministic bulk lookups", () => {
		const t0 = 1_700_000_000_000;
		const engine = new DecayEngine({ clock: () => t0 });
		engine.recordAccess("a");
		const probe = t0 + 30 * DAY_MS;
		const map = engine.getRetrievabilityScores(["a", "b"], probe);
		// 'a' has 30 days of decay; 'b' is unknown → 1.0
		expect(map.get("a")!).toBeLessThan(1.0);
		expect(map.get("b")).toBe(1.0);
	});
});

describe("DecayEngine — state management", () => {
	it("forget() drops a record", () => {
		const engine = new DecayEngine({ clock: () => 1_700_000_000_000 });
		engine.recordAccess("n1");
		expect(engine.size).toBe(1);
		engine.forget("n1");
		expect(engine.size).toBe(0);
		expect(engine.peek("n1")).toBeUndefined();
	});

	it("reset() drops all records", () => {
		const engine = new DecayEngine({ clock: () => 1_700_000_000_000 });
		engine.recordAccess("n1");
		engine.recordAccess("n2");
		engine.recordAccess("n3");
		expect(engine.size).toBe(3);
		engine.reset();
		expect(engine.size).toBe(0);
	});

	it("peek() returns a copy (caller cannot mutate internal state)", () => {
		const engine = new DecayEngine({ clock: () => 1_700_000_000_000 });
		engine.recordAccess("n1");
		const r = engine.peek("n1");
		expect(r).toBeDefined();
		// The returned record is a new object; mutating it must not
		// affect subsequent reads.
		r!.accessCount = 999;
		expect(engine.peek("n1")!.accessCount).toBe(1);
	});
});

describe("DecayEngine — composite scenario (multi-day drift)", () => {
	it("R drops meaningfully without access, recovers with access", () => {
		const t0 = 1_700_000_000_000;
		let t = t0;
		const engine = new DecayEngine({ clock: () => t });

		engine.recordAccess("n1");
		expect(engine.getRetrievability("n1", t)).toBe(1.0);

		// 60 days of no access — at S=7 this lands at R ≈ 0.51
		// (not the < 0.3 originally asserted, which would require
		// ~150 days of decay at S=7). 0.6 is a fair "noticeable drop".
		t = t0 + 60 * DAY_MS;
		const r60 = engine.getRetrievability("n1", t);
		expect(r60).toBeLessThan(0.6);
		expect(r60).toBeGreaterThan(0.4);

		// User searches for it — stability grows, R snaps back
		engine.recordAccess("n1");
		expect(engine.getRetrievability("n1", t)).toBe(1.0);

		// After 7 more days it should still be high (stability grew)
		t += 7 * DAY_MS;
		const r7later = engine.getRetrievability("n1", t);
		const baseline7 = computeRetrievability(FSRS_PARAMS.initialStability, 7);
		expect(r7later).toBeGreaterThan(baseline7);
	});
});
