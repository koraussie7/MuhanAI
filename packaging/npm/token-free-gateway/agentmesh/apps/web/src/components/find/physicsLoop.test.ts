/**
 * Phase 2 verification suite for createPhysicsLoop.
 *
 * Each test injects a synthetic onStep spy and asserts accumulator
 * behavior at deterministic dt inputs. Runs under node:test — no jsdom,
 * no canvas, no scheduler required.
 *
 * Coverage target: 6 scenarios. Together they prove
 *   - basic advance fires exactly one step when wallDt == fixedTimestep
 *   - multi-step drain: advance(3 * step) fires exactly 3 steps
 *   - sub-step alpha: dt < step stores alpha without firing
 *   - blow-up guard: maxStepsPerAdvance caps a huge dt
 *   - reset: clear the accumulator on demand
 *   - monotonic alpha: alpha grows toward 1 as dt accumulates
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createPhysicsLoop } from "./physicsLoop";

describe("createPhysicsLoop", () => {
	it("fires exactly one step when wallDt equals fixedTimestep", () => {
		let calls = 0;
		let lastDt = 0;
		const loop = createPhysicsLoop({
			fixedTimestepMs: 16.6667,
			onStep: (dt) => {
				calls += 1;
				lastDt = dt;
			},
		});

		const { steps, alpha } = loop.advance(16.6667);

		assert.equal(calls, 1, "should fire exactly one step");
		assert.equal(steps, 1);
		assert.equal(lastDt, 16.6667, "step dt must equal fixedTimestepMs");
		assert.ok(alpha >= 0 && alpha < 1, `alpha must be in [0,1); got ${alpha}`);
	});

	it("drains three steps when wallDt is three times fixedTimestep", () => {
		let calls = 0;
		const loop = createPhysicsLoop({
			fixedTimestepMs: 10,
			onStep: () => {
				calls += 1;
			},
		});

		// 30ms wall at 10ms step → exactly 3 steps, no residual
		const { steps, alpha } = loop.advance(30);

		assert.equal(calls, 3, "should fire exactly three steps");
		assert.equal(steps, 3);
		assert.equal(alpha, 0, "clean drain leaves zero alpha");
		assert.equal(loop.getAccumulator(), 0);
	});

	it("stores alpha without firing when wallDt is below fixedTimestep", () => {
		let calls = 0;
		const loop = createPhysicsLoop({
			fixedTimestepMs: 16.6667,
			onStep: () => {
				calls += 1;
			},
		});

		// 8ms < 16.67ms — too small for a full step
		const { steps, alpha } = loop.advance(8);

		assert.equal(calls, 0, "should not fire any step");
		assert.equal(steps, 0);
		// alpha should be 8 / 16.6667 ≈ 0.48
		assert.ok(alpha > 0.47 && alpha < 0.49, `alpha should be ~0.48; got ${alpha}`);
		assert.equal(loop.getAccumulator(), 8, "accumulator should hold the residual");
	});

	it("caps steps fired when wallDt is huge (blow-up guard)", () => {
		let calls = 0;
		const loop = createPhysicsLoop({
			fixedTimestepMs: 16.6667,
			maxStepsPerAdvance: 5,
			onStep: () => {
				calls += 1;
			},
		});

		// 10 seconds wall = 600 steps @ 60Hz — but capped at 5
		const { steps, alpha } = loop.advance(10_000);

		assert.equal(calls, 5, "should cap at maxStepsPerAdvance");
		assert.equal(steps, 5);
		assert.equal(loop.getAccumulator(), 0, "residual must be discarded after cap");
		assert.equal(alpha, 0);
	});

	it("reset() clears the accumulator", () => {
		const loop = createPhysicsLoop({
			fixedTimestepMs: 16.6667,
			onStep: () => {},
		});

		// Accumulate 8ms < step, no fire
		loop.advance(8);
		assert.equal(loop.getAccumulator(), 8);

		loop.reset();
		assert.equal(loop.getAccumulator(), 0, "reset should zero the accumulator");

		// After reset, a 10ms advance should NOT fire (10 < 16.67)
		let calls = 0;
		const loop2 = createPhysicsLoop({
			fixedTimestepMs: 16.6667,
			onStep: () => {
				calls += 1;
			},
		});
		loop2.reset();
		loop2.advance(10);
		assert.equal(calls, 0, "post-reset sub-step advance should not fire");
	});

	it("alpha grows monotonically toward 1 as wallDt accumulates", () => {
		let calls = 0;
		const loop = createPhysicsLoop({
			fixedTimestepMs: 100,
			onStep: () => {
				calls += 1;
			},
		});

		const a1 = loop.advance(20);
		const a2 = loop.advance(20);
		const a3 = loop.advance(20);
		const a4 = loop.advance(20);

		// 80ms total < 100ms step → no fires
		assert.equal(calls, 0, "80ms total < 100ms step → no fires");
		assert.ok(a1.alpha < a2.alpha, `alpha should grow: ${a1.alpha} < ${a2.alpha}`);
		assert.ok(a2.alpha < a3.alpha);
		assert.ok(a3.alpha < a4.alpha);
		assert.ok(a4.alpha >= 0 && a4.alpha < 1, `alpha after 80ms should be 0.8; got ${a4.alpha}`);
	});

	it("drains a step mid-accumulation and continues alpha from the residual", () => {
		let calls = 0;
		const loop = createPhysicsLoop({
			fixedTimestepMs: 100,
			onStep: () => {
				calls += 1;
			},
		});

		// Advance 80ms (alpha ~0.8, no fire), then 30ms (total 110ms → 1 fire + 10ms residual)
		const a1 = loop.advance(80);
		const a2 = loop.advance(30);

		assert.equal(calls, 1, "should fire exactly one step at the 110ms mark");
		assert.equal(a1.steps, 0);
		assert.equal(a2.steps, 1);
		// 110 - 100 = 10ms residual → alpha = 10/100 = 0.1
		assert.ok(
			a2.alpha > 0.09 && a2.alpha < 0.11,
			`alpha after drain should be ~0.1; got ${a2.alpha}`,
		);
	});
});
