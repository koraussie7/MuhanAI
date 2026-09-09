import { describe, expect, it } from "vitest";
import {
	FSRS_PARAMS,
	computeRetrievability,
	updateStability,
} from "./fsrs.js";

describe("FSRS_PARAMS", () => {
	it("exposes the stellavault v0.9.0 defaults", () => {
		expect(FSRS_PARAMS.initialStability).toBe(7.0);
		expect(FSRS_PARAMS.difficulty).toBe(5.0);
		expect(FSRS_PARAMS.a).toBe(0.4);
		expect(FSRS_PARAMS.b).toBe(0.6);
		expect(FSRS_PARAMS.c).toBe(0.2);
		expect(FSRS_PARAMS.d).toBe(1.0);
	});

	it("is treated as readonly via the const type — runtime mutation is the caller's choice", () => {
		// `as const` is a TypeScript compile-time assertion. At runtime
		// the object is a plain Object — freezing is a separate concern.
		// We document the expected behavior; if callers want runtime
		// immutability they should deep-freeze themselves.
		const params: typeof FSRS_PARAMS = { ...FSRS_PARAMS };
		expect(params.initialStability).toBe(FSRS_PARAMS.initialStability);
	});
});

describe("computeRetrievability", () => {
	it("returns R(7, 1) ≈ 0.984 (one day after access, default stability)", () => {
		// (1 + 1/(9*7))^(-1) = (1 + 1/63)^(-1) = 63/64 ≈ 0.984375
		// The integration analysis doc originally stated R(7, 1) = 0.674,
		// but that value corresponds to t≈30 days, not t=1. The formula
		// is what matters; this test pins the actual behavior.
		const r = computeRetrievability(7, 1);
		const expected = 63 / 64;
		expect(r).toBeCloseTo(expected, 10);
		expect(r).toBeGreaterThan(0.95);
		expect(r).toBeLessThan(1.0);
	});

	it("returns R(7, 30) ≈ 0.677 (one month of decay, default stability)", () => {
		// (1 + 30/(9*7))^(-1) = (1 + 30/63)^(-1) ≈ 0.677 — this is
		// the value the integration analysis doc intended as the
		// R(7,1) reference (the doc has a t/y transposition typo).
		const r = computeRetrievability(7, 30);
		expect(r).toBeCloseTo(0.677, 2);
	});

	it("returns 1.0 when no time has elapsed (boundary)", () => {
		expect(computeRetrievability(7, 0)).toBe(1.0);
		expect(computeRetrievability(7, -1)).toBe(1.0);
	});

	it("returns 0.0 when stability is zero (no memory)", () => {
		expect(computeRetrievability(0, 1)).toBe(0.0);
		expect(computeRetrievability(-1, 5)).toBe(0.0);
	});

	it("decays monotonically as elapsed time grows", () => {
		const r0 = computeRetrievability(7, 0);
		const r1 = computeRetrievability(7, 1);
		const r7 = computeRetrievability(7, 7);
		const r30 = computeRetrievability(7, 30);
		expect(r0).toBeGreaterThan(r1);
		expect(r1).toBeGreaterThan(r7);
		expect(r7).toBeGreaterThan(r30);
		expect(r30).toBeGreaterThan(0);
	});

	it("higher stability → higher retrievability at the same elapsed time", () => {
		const lowS = computeRetrievability(3, 7);
		const midS = computeRetrievability(7, 7);
		const highS = computeRetrievability(30, 7);
		expect(lowS).toBeLessThan(midS);
		expect(midS).toBeLessThan(highS);
	});

	it("matches the closed-form for large elapsed times", () => {
		// For very large t, R → 9S/t (since (1 + x)^(-1) ≈ 1/x for large x)
		const t = 1_000_000;
		const s = 7;
		const r = computeRetrievability(s, t);
		const approx = (9 * s) / t;
		expect(r).toBeCloseTo(approx, 6);
	});
});

describe("updateStability", () => {
	it("grows stability when currentR is high (easy recall)", () => {
		const newS = updateStability(7, 5, 0.95);
		expect(newS).toBeGreaterThan(7);
	});

	it("grows stability meaningfully when currentR is low but non-zero", () => {
		// At R=0.1, exp(1*(1-0.1)) = exp(0.9) ≈ 2.46, so even a hard
		// recall still produces a stability gain (FSRS always rewards
		// any successful recall). The 7.1 bound was wrong — the actual
		// growth is ≈ 8.05. We assert it's still bounded reasonably.
		const newS = updateStability(7, 5, 0.1);
		expect(newS).toBeGreaterThan(7);
		expect(newS).toBeLessThan(10);
	});

	it("caps stability at 365 days", () => {
		const newS = updateStability(364.9, 1, 0.9999);
		expect(newS).toBeLessThanOrEqual(365);
	});

	it("never shrinks stability (growth is clamped at 0)", () => {
		// Pathological R=1.5 (impossible) would give exp(-0.5) - 1 < 0
		// → must be clamped to keep stability non-decreasing.
		const newS = updateStability(7, 5, 1.5);
		expect(newS).toBeGreaterThanOrEqual(7);
	});

	it("higher difficulty dampens the growth factor", () => {
		const easyD = updateStability(7, 1, 0.95);
		const hardD = updateStability(7, 9, 0.95);
		expect(hardD).toBeLessThan(easyD);
	});

	it("returns the same value given the same inputs (deterministic)", () => {
		const a = updateStability(7, 5, 0.9);
		const b = updateStability(7, 5, 0.9);
		expect(a).toBe(b);
	});
});
