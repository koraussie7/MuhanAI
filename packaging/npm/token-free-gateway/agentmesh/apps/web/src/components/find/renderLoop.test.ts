/**
 * Unit tests for the adaptive render-loop scheduler.
 *
 * Run with: `node --import tsx --test src/components/find/renderLoop.test.ts`
 *
 * Mirrors the `physics.test.ts` style: Node 20+'s built-in `node:test` runner
 * with `node:assert/strict`. The scheduler is DOM-free and React-free, so no
 * jsdom is needed — the test harness injects fake raf/caf/visibility hooks
 * via the config object.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createRenderScheduler } from "./renderLoop";
import type { QualityProfile } from "./renderLoop";

// ------------------- Fake rAF harness -------------------
//
// The browser's `requestAnimationFrame` fires once per display frame with the
// current timestamp. Under test we want deterministic control over time and
// the order in which frames fire. The harness models raf as "queue the
// callback; the test drains the queue manually with a chosen `t` value."
//
// flushAt(t) drains all pending callbacks and runs them with the same t.
// Subsequent rAFs scheduled from inside frame() will not fire in the same
// flushAt call — that mirrors the "next vsync" semantics of the browser.

interface FrameQueue {
	rafCount: number;
	cafCount: number;
	raf: (cb: (t: number) => void) => number;
	caf: (id: number) => void;
	flushAt(t: number): void;
}

function makeFrameQueue(): FrameQueue {
	const pending: Array<(t: number) => void> = [];
	let id = 0;
	const q: FrameQueue = {
		rafCount: 0,
		cafCount: 0,
		raf: (cb) => {
			id += 1;
			q.rafCount += 1;
			pending.push(cb);
			return id;
		},
		caf: (_cancelId) => {
			q.cafCount += 1;
			pending.length = 0;
		},
		flushAt(t) {
			const drained = pending.slice();
			pending.length = 0;
			for (const cb of drained) cb(t);
		},
	};
	return q;
}

// Visibility harness. The scheduler accepts an `onVisibilityChange` factory so
// we don't need a real DOM. Tests toggle `setHidden` to dispatch listeners.
interface VisibilityHarness {
	setHidden(hidden: boolean): void;
	listenerCount(): number;
	onChange: (cb: (hidden: boolean) => void) => () => void;
}

function makeVisibility(initialVisible = true): VisibilityHarness {
	let visible = initialVisible;
	const listeners: Array<(hidden: boolean) => void> = [];
	return {
		setHidden(hidden: boolean) {
			visible = !hidden;
			for (const fn of listeners.slice()) fn(hidden);
		},
		listenerCount: () => listeners.length,
		onChange: (cb: (hidden: boolean) => void) => {
			listeners.push(cb);
			return () => {
				const idx = listeners.indexOf(cb);
				if (idx >= 0) listeners.splice(idx, 1);
			};
		},
	};
}

// Controllable monotonic clock.
function makeClock(initial = 0): { now: () => number; advance: (ms: number) => void } {
	let t = initial;
	return {
		now: () => t,
		advance: (ms) => {
			t += ms;
		},
	};
}

// ------------------- Tests -------------------

describe("createRenderScheduler basics", () => {
	test("onTick is called once per eligible frame after start", () => {
		const q = makeFrameQueue();
		const ticks: Array<{ dt: number; profile: QualityProfile }> = [];
		const s = createRenderScheduler({
			raf: q.raf,
			caf: q.caf,
			onTick: (dt, profile) => ticks.push({ dt, profile }),
			targetFps: 60,
		});
		s.start();
		q.flushAt(0); // first frame; dt = fallback 16.67
		assert.equal(ticks.length, 1);
		assert.equal(ticks[0]?.profile, "active");
		// 40ms after t=0 → dt = 40 ≥ 16.67 budget → second tick
		q.flushAt(40);
		assert.equal(ticks.length, 2);
		s.destroy();
	});

	test("start is idempotent (no double rAF chain)", () => {
		const q = makeFrameQueue();
		const s = createRenderScheduler({ raf: q.raf, caf: q.caf, onTick: () => {} });
		s.start();
		s.start();
		s.start();
		// Only one rAF from the kickoff; subsequent rAFs come from inside frame().
		const rafsAfterStart = q.rafCount;
		q.flushAt(0); // drain kickoff
		const rafsAfterFirstFrame = q.rafCount;
		assert.equal(rafsAfterFirstFrame, rafsAfterStart + 1, "exactly one reschedule after frame()");
		s.destroy();
	});

	test("stop cancels the in-flight rAF", () => {
		const q = makeFrameQueue();
		const s = createRenderScheduler({ raf: q.raf, caf: q.caf, onTick: () => {} });
		s.start();
		q.flushAt(0);
		s.stop();
		assert.equal(q.cafCount, 1, "stop invokes cancelAnimationFrame");
		s.destroy();
	});

	test("destroy detaches the visibility listener", () => {
		const q = makeFrameQueue();
		const v = makeVisibility(true);
		const s = createRenderScheduler({
			raf: q.raf,
			caf: q.caf,
			onVisibilityChange: v.onChange,
			onTick: () => {},
		});
		assert.equal(v.listenerCount(), 1);
		s.destroy();
		assert.equal(v.listenerCount(), 0, "destroy removes the visibility listener");
	});

	test("destroy is idempotent", () => {
		const q = makeFrameQueue();
		const s = createRenderScheduler({ raf: q.raf, caf: q.caf, onTick: () => {} });
		s.destroy();
		s.destroy(); // must not throw
	});
});

describe("createRenderScheduler FPS capping", () => {
	test("frame skipping: ticks inside budget do not fire onTick", () => {
		const q = makeFrameQueue();
		let tickCount = 0;
		const s = createRenderScheduler({
			raf: q.raf,
			caf: q.caf,
			onTick: () => {
				tickCount += 1;
			},
			targetFps: 60, // budget = 16.67ms
		});
		s.start();
		// Frame 1: dt = fallback (16.67) → eligible
		q.flushAt(0);
		assert.equal(tickCount, 1);

		// Frame 2: t = 8 → dt = 8 < 16.67 → skip
		q.flushAt(8);
		assert.equal(tickCount, 1, "second frame skipped (8ms < 16.67ms budget)");

		// Frame 3: t = 40 → dt = 40 - 8 = 32 ≥ 16.67 → eligible
		q.flushAt(40);
		assert.equal(tickCount, 2);
		s.destroy();
	});

	test("low target FPS aggregates to a coarser tick rate", () => {
		const q = makeFrameQueue();
		let tickCount = 0;
		const s = createRenderScheduler({
			raf: q.raf,
			caf: q.caf,
			onTick: () => {
				tickCount += 1;
			},
			targetFps: 30, // budget = 33.33ms
		});
		s.start();
		// Frame 1 at t=0: dt = 33.33 fallback → eligible
		q.flushAt(0);
		assert.equal(tickCount, 1);
		// Frame 2 at t=16: dt = 16 < 33.33 → skip
		q.flushAt(16);
		assert.equal(tickCount, 1);
		// Frame 3 at t=50: dt = 50 - 16 = 34 ≥ 33.33 → eligible
		q.flushAt(50);
		assert.equal(tickCount, 2);
		s.destroy();
	});
});

describe("createRenderScheduler idle state", () => {
	test("notifyInteraction keeps profile 'active' even after long real time", () => {
		const q = makeFrameQueue();
		const clock = makeClock(0);
		const profiles: QualityProfile[] = [];
		const s = createRenderScheduler({
			raf: q.raf,
			caf: q.caf,
			now: clock.now,
			idleAfterMs: 1000,
			onTick: (_dt, p) => profiles.push(p),
		});
		s.start();
		clock.advance(500);
		q.flushAt(16.67);
		s.notifyInteraction(); // reset idle timer
		// 900 ms after the notification, well below the 1000 ms threshold.
		clock.advance(900);
		q.flushAt(100);
		assert.deepEqual(profiles, ["active", "active"], "stayed active across notifyInteraction");
		s.destroy();
	});

	test("idle threshold crossed → profile flips to 'idle'", () => {
		const q = makeFrameQueue();
		const clock = makeClock(0);
		const profiles: QualityProfile[] = [];
		const s = createRenderScheduler({
			raf: q.raf,
			caf: q.caf,
			now: clock.now,
			idleAfterMs: 1000,
			onTick: (_dt, p) => profiles.push(p),
			targetFps: 60,
			reducedIdleFps: 30,
		});
		s.start();
		// Frame 1: clock at 0, active.
		q.flushAt(16.67);
		assert.equal(profiles[0], "active");
		// Advance clock well past idle threshold.
		clock.advance(2000);
		// dt = 80 - 16.67 = 63.33, safely above the 30 FPS idle budget (33.33ms)
		q.flushAt(80);
		assert.equal(profiles[profiles.length - 1], "idle", "idle threshold crossed");
		s.destroy();
	});

	test("idle FPS cap is enforced independently", () => {
		const q = makeFrameQueue();
		const clock = makeClock(0);
		const profiles: QualityProfile[] = [];
		let tickCount = 0;
		const s = createRenderScheduler({
			raf: q.raf,
			caf: q.caf,
			now: clock.now,
			idleAfterMs: 1000,
			targetFps: 60,
			reducedIdleFps: 30, // idle budget = 33.33ms
			onTick: (_dt, p) => {
				tickCount += 1;
				profiles.push(p);
			},
		});
		s.start();
		// First tick at t=16.67 (fallback), then jump to idle.
		q.flushAt(16.67);
		clock.advance(2000);
		// Idle: budget is 33.33ms. dt = 80 - 16.67 = 63.33 > 33.33 → eligible.
		q.flushAt(80);
		assert.equal(profiles[profiles.length - 1], "idle");
		// 20ms later: dt = 20 < 33.33 idle budget → skip
		q.flushAt(100);
		assert.equal(tickCount, 2, "no third tick at idle with dt=20 < 33.33 budget");
		s.destroy();
	});
});

describe("createRenderScheduler visibility", () => {
	test("hidden → stop() halts the loop", () => {
		const q = makeFrameQueue();
		const vis = makeVisibility(true);
		let tickCount = 0;
		const s = createRenderScheduler({
			raf: q.raf,
			caf: q.caf,
			onVisibilityChange: vis.onChange,
			onTick: () => {
				tickCount += 1;
			},
		});
		s.start();
		q.flushAt(0);
		assert.equal(tickCount, 1, "tick before hide");

		vis.setHidden(true);
		// Drain any pending rAF — its callback will see running=false and exit.
		q.flushAt(33.33);
		assert.equal(tickCount, 1, "no tick while hidden");
		s.destroy();
	});

	test("getProfile reflects current visibility", () => {
		const q = makeFrameQueue();
		const vis = makeVisibility(true);
		const s = createRenderScheduler({
			raf: q.raf,
			caf: q.caf,
			onVisibilityChange: vis.onChange,
			onTick: () => {},
		});
		s.start();
		q.flushAt(0);
		assert.equal(s.getProfile(), "active");
		vis.setHidden(true);
		assert.equal(s.getProfile(), "hidden");
		s.destroy();
	});

	test("resuming visibility restarts the loop", () => {
		const q = makeFrameQueue();
		const vis = makeVisibility(true);
		let tickCount = 0;
		const s = createRenderScheduler({
			raf: q.raf,
			caf: q.caf,
			onVisibilityChange: vis.onChange,
			onTick: () => {
				tickCount += 1;
			},
		});
		s.start();
		q.flushAt(0);
		assert.equal(tickCount, 1);

		vis.setHidden(true);
		q.flushAt(33.33);
		assert.equal(tickCount, 1, "no ticks while hidden");

		vis.setHidden(false);
		q.flushAt(50);
		assert.equal(tickCount, 2, "loop resumed after visibility restored");
		s.destroy();
	});

	test("first frame after resumption uses fallback dt (not the gap since last hide)", () => {
		const q = makeFrameQueue();
		const vis = makeVisibility(true);
		const dts: number[] = [];
		const s = createRenderScheduler({
			raf: q.raf,
			caf: q.caf,
			onVisibilityChange: vis.onChange,
			onTick: (dt) => dts.push(dt),
		});
		s.start();
		q.flushAt(0);
		assert.ok((dts[0] ?? Infinity) < 50, "first tick dt is bounded (fallback)");

		vis.setHidden(true);
		q.flushAt(33.33);
		vis.setHidden(false);
		// Simulate a 5-minute gap between tabs.
		q.flushAt(300_100);
		const resumeTick = dts[dts.length - 1];
		assert.ok(
			resumeTick !== undefined && resumeTick < 50,
			`post-resume dt should be bounded (fallback), got ${resumeTick}`,
		);
		s.destroy();
	});
});

describe("createRenderScheduler integration", () => {
	test("lifecycle: start → tick → idle → hide → tick-suspended → show → tick → destroy", () => {
		const q = makeFrameQueue();
		const vis = makeVisibility(true);
		const clock = makeClock(0);
		const profiles: QualityProfile[] = [];
		const s = createRenderScheduler({
			raf: q.raf,
			caf: q.caf,
			now: clock.now,
			onVisibilityChange: vis.onChange,
			idleAfterMs: 1000,
			targetFps: 60,
			reducedIdleFps: 30,
			onTick: (_dt, p) => profiles.push(p),
		});
		s.start();
		clock.advance(16.67);
		q.flushAt(16.67);
		clock.advance(2000);
		// Idle budget is 33.33ms; flush at 16.67 + 80 → dt = 63.33 ≥ 33.33 → eligible.
		q.flushAt(80);
		vis.setHidden(true);
		assert.equal(s.getProfile(), "hidden");
		vis.setHidden(false);
		// After resume, first frame uses fallback dt, clock is 2016.67 (idle).
		q.flushAt(50);
		s.destroy();

		assert.ok(profiles.includes("active"), "captured an active tick");
		assert.ok(profiles.includes("idle"), "captured an idle tick");
	});
});

// ------------------- Phase 1 verification: 4-scenario stats -------------------
//
// These tests verify the ADR-0006 expected-runtime-impact claims by exercising
// the scheduler with synthetic 240Hz input and observing the self-reported
// `getStats()` output:
//
//   Scenario A — 240Hz active:   skippedFrameRatio ≈ 0.75, effectiveFps ≈ 60
//   Scenario B — 240Hz idle:     effectiveFps drops from 60 to 30
//   Scenario C — hidden:         onTickCount frozen, profile = "hidden"
//   Scenario D — 5-min resume:   first post-resume dt < 50ms (fallback, not 300_000ms)
//
// These run under node:test — no browser, no jsdom — and act as the
// deterministic, device-independent evidence that the design goals hold.

describe("createRenderScheduler Phase 1 verification (240Hz)", () => {
	test("Scenario A: 240Hz active — ~75% frames skipped, onTick at 60Hz", () => {
		const q = makeFrameQueue();
		const clock = makeClock(0);
		const s = createRenderScheduler({
			raf: q.raf,
			caf: q.caf,
			now: clock.now,
			targetFps: 60,
			reducedIdleFps: 30,
			idleAfterMs: 5_000,
			onTick: () => {},
		});
		s.start();
		// Simulate 240 frames at 4.167ms spacing = 1 second of wall time at 240Hz.
		// Each onTick advances the clock so the effectiveFps window covers the run.
		const dt240 = 1000 / 240;
		for (let i = 1; i <= 240; i++) {
			clock.advance(dt240);
			q.flushAt(clock.now());
		}
		const stats = s.getStats(1000);
		// Allow a tolerance band: cumulative float drift means a few expected
		// ticks may land just below the 16.67ms threshold. 60Hz target gives
		// ~60 ticks/s; we accept 50-65 as a valid implementation of the budget.
		assert.ok(stats.onTickCount >= 50 && stats.onTickCount <= 65, `onTick ≈ 60, got ${stats.onTickCount}`);
		assert.equal(stats.rafCount, 240, "every display frame is observed");
		// skippedFrameRatio = 1 - onTick/rafCount. At 60 ticks / 240 frames = 0.75.
		const expectedRatio = 1 - stats.onTickCount / stats.rafCount;
		assert.ok(
			Math.abs(stats.skippedFrameRatio - expectedRatio) < 1e-9,
			`skippedFrameRatio consistent (got ${stats.skippedFrameRatio.toFixed(3)})`,
		);
		// Key Phase 1 claim: at least 70% of display frames are skipped.
		assert.ok(
			stats.skippedFrameRatio >= 0.7,
			`at 240Hz input with 60Hz target, ≥70% of frames should be skipped, got ${(stats.skippedFrameRatio * 100).toFixed(1)}%`,
		);
		assert.ok(
			Math.abs(stats.effectiveFps - stats.onTickCount) < 1,
			`effectiveFps (${stats.effectiveFps}) ≈ onTickCount (${stats.onTickCount}) within window`,
		);
		assert.equal(stats.profile, "active");
		s.destroy();
	});

	test("Scenario B: 240Hz idle after 5s — effectiveFps drops to 30", () => {
		const q = makeFrameQueue();
		const clock = makeClock(0);
		const s = createRenderScheduler({
			raf: q.raf,
			caf: q.caf,
			now: clock.now,
			targetFps: 60,
			reducedIdleFps: 30,
			idleAfterMs: 1_000, // shrink to keep test fast
			onTick: () => {},
		});
		s.start();
		// Drive 1 second of active frames to populate the recentTickTs buffer.
		const dt240 = 1000 / 240;
		for (let i = 1; i <= 240; i++) {
			clock.advance(dt240);
			q.flushAt(clock.now());
		}
		const activeStats = s.getStats(1000);
		assert.ok(activeStats.onTickCount >= 50, `active ticks ${activeStats.onTickCount} ≈ 60`);

		// Now jump past the idle threshold (1s) and continue ticking.
		clock.advance(2_000);
		for (let i = 0; i < 240; i++) {
			clock.advance(dt240);
			q.flushAt(clock.now());
		}
		const idleStats = s.getStats(1000);
		assert.equal(idleStats.profile, "idle", "profile flipped to idle");
		// Idle effectiveFps should be roughly half of active effectiveFps.
		// Window-based metric is independent of the lifetime onTickCount (which
		// accumulates across phases). Use a wide window for the active reading
		// so both phases are covered, and a tight 1s window for idle to capture
		// only the post-threshold tick rate.
		assert.ok(
			idleStats.effectiveFps < activeStats.effectiveFps,
			`idle effectiveFps (${idleStats.effectiveFps}) should be lower than active (${activeStats.effectiveFps})`,
		);
		assert.ok(
			idleStats.effectiveFps <= activeStats.effectiveFps / 1.5,
			`idle effectiveFps (${idleStats.effectiveFps}) should be at most 2/3 of active (${activeStats.effectiveFps})`,
		);
		s.destroy();
	});

	test("Scenario C: hidden — onTick freezes, profile = 'hidden'", () => {
		const q = makeFrameQueue();
		const vis = makeVisibility(true);
		const s = createRenderScheduler({
			raf: q.raf,
			caf: q.caf,
			onVisibilityChange: vis.onChange,
			onTick: () => {},
		});
		s.start();
		q.flushAt(0);
		const baselineTicks = s.getStats().onTickCount;
		assert.ok(baselineTicks >= 1);

		vis.setHidden(true);
		// Drain any pending rAFs — their callbacks will see running=false and exit.
		q.flushAt(33.33);
		q.flushAt(100);
		q.flushAt(1000);
		const hiddenStats = s.getStats();
		assert.equal(hiddenStats.profile, "hidden");
		assert.equal(hiddenStats.onTickCount, baselineTicks, "no new onTick while hidden");
		s.destroy();
	});

	test("Scenario D: 5-min resume — first post-resume dt < 50ms (fallback)", () => {
		const q = makeFrameQueue();
		const vis = makeVisibility(true);
		const dts: number[] = [];
		const s = createRenderScheduler({
			raf: q.raf,
			caf: q.caf,
			onVisibilityChange: vis.onChange,
			onTick: (dt) => dts.push(dt),
		});
		s.start();
		q.flushAt(0);
		assert.ok((dts[0] ?? Infinity) < 50, "first tick dt is bounded");

		vis.setHidden(true);
		q.flushAt(33.33);
		vis.setHidden(false);
		// 5-minute gap between tabs.
		q.flushAt(300_100);
		const resumeTick = dts[dts.length - 1];
		assert.ok(
			resumeTick !== undefined && resumeTick < 50,
			`post-resume dt should be fallback (16.67ms), got ${resumeTick}ms — would have crashed physics`,
		);
		s.destroy();
	});
});
