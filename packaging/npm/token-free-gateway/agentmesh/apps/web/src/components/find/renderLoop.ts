/**
 * Adaptive render-loop scheduler for the CosmicCanvas.
 *
 * Replaces a raw `requestAnimationFrame` loop with a budget-aware scheduler
 * that observes Page Visibility, user interaction recency, and frame budget.
 *
 * Why this exists
 * ---------------
 * `CosmicCanvas.tsx` previously ran an unbounded `requestAnimationFrame` chain:
 *
 *     animId = requestAnimationFrame(render);
 *
 * On 120Hz / 240Hz displays this produced 200+ fps even when the user is
 * reading static pages or the tab is in the background. CPU saturation
 * followed (~130-250%, 2k+ DrawFrame events/min). The physics module
 * (`./physics.ts`) is a stateless pure function so the architecture was
 * already correct — the loop driver was the bottleneck.
 *
 * The scheduler caps the loop to a target FPS, halves it after an idle
 * threshold, and pauses entirely when `document.visibilityState` is
 * `"hidden"`. The reduction is achieved by skipping `onTick` invocations
 * that arrive inside the FPS budget while keeping the rAF chain alive,
 * so the next eligible frame fires immediately.
 *
 * Design notes
 * ------------
 * - DOM- and React-free: no `useEffect`, no event listeners wired here.
 *   `CosmicCanvas` mounts the scheduler in a useEffect and wires its own
 *   pointer/wheel/touch listeners to `notifyInteraction()`.
 * - Dep injection: the constructor takes optional `raf`, `caf`,
 *   `onVisibilityChange`, and `now` overrides so tests run under
 *   `node:test` without jsdom. Browser defaults are globals.
 * - No physics changes: the physics step stays a pure function called from
 *   the `onTick` callback; the scheduler only changes how often the
 *   callback runs.
 *
 * Architecture rationale lives in `docs/adr/0006-adaptive-render-loop.md`.
 */

export type QualityProfile = "active" | "idle" | "hidden";

export interface RenderSchedulerConfig {
	/** Called once per scheduled frame. Must not throw. */
	onTick: (deltaMs: number, profile: QualityProfile) => void;

	/** Target FPS in the active state. Default 60. */
	targetFps?: number;

	/** Target FPS once the user has been idle longer than `idleAfterMs`. Default 30. */
	reducedIdleFps?: number;

	/** Idle threshold in ms before the profile becomes "idle". Default 5000. */
	idleAfterMs?: number;

	// ---- Test injection points (optional, browser-safe defaults otherwise) ----

	/** Inject to control timing under node:test. */
	raf?: (cb: (t: number) => void) => number;

	/** Inject to assert cancellation under node:test. */
	caf?: (id: number) => void;

	/**
	 * Inject to drive visibility transitions under node:test. The scheduler
	 * calls the registered listener with the new hidden flag whenever the
	 * page becomes hidden or visible. The returned function removes the
	 * listener. When omitted, the scheduler attaches to `document`'s
	 * `visibilitychange` event if a `document` exists.
	 */
	onVisibilityChange?: (cb: (hidden: boolean) => void) => () => void;

	/** Inject to control the time source under node:test. */
	now?: () => number;
}

/**
 * Self-reported statistics. The scheduler tracks these in-process so callers
 * (and the test suite) can verify behavior without instrumenting the DOM.
 *
 * `skippedFrameRatio` is the fraction of rAF callbacks that arrived inside
 * the FPS budget and therefore suppressed `onTick`. A 240Hz monitor running
 * at a 60Hz target will report ~0.75; the same monitor at a 30Hz target will
 * report ~0.875.
 *
 * `effectiveFps` is the moving average of `onTick` invocations per second,
 * computed over the last `windowMs` (default 1000).
 */
export interface SchedulerStats {
	profile: QualityProfile;
	rafCount: number;
	onTickCount: number;
	skippedFrameRatio: number;
	effectiveFps: number;
	lastDtMs: number;
	minDtMs: number;
	maxDtMs: number;
}

export interface RenderScheduler {
	/** Begin the rAF chain. Idempotent. */
	start(): void;
	/** Cancel the rAF chain. Idempotent. */
	stop(): void;
	/** Reset the idle timer. Call from pointer/wheel/touch handlers. */
	notifyInteraction(): void;
	/** Synchronous snapshot of the current quality profile. */
	getProfile(): QualityProfile;
	/**
	 * Self-reported stats snapshot. Cheap; safe to call from any context.
	 * Useful for in-browser performance overlays and for the unit-test
	 * verification of FPS-cap / idle-threshold / resume-fallback behavior.
	 */
	getStats(windowMs?: number): SchedulerStats;
	/**
	 * Cancel the rAF chain and detach all listeners. Idempotent.
	 * Call from React `useEffect` cleanup.
	 */
	destroy(): void;
}

const DEFAULT_TARGET_FPS = 60;
const DEFAULT_REDUCED_IDLE_FPS = 30;
const DEFAULT_IDLE_AFTER_MS = 5_000;

// Browser globals — captured once at module load. These are the production
// path; tests inject overrides via the config object.
const globalRaf: (cb: (t: number) => void) => number =
	typeof globalThis !== "undefined" && typeof globalThis.requestAnimationFrame === "function"
		? (cb) => globalThis.requestAnimationFrame(cb)
		: (cb) => {
				const id = setTimeout(() => cb(Date.now()), 16);
				return id as unknown as number;
			};

const globalCaf: (id: number) => void =
	typeof globalThis !== "undefined" && typeof globalThis.cancelAnimationFrame === "function"
		? (id) => globalThis.cancelAnimationFrame(id)
		: (id) => {
				clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
			};

const globalNow: () => number =
	typeof globalThis !== "undefined" && typeof globalThis.performance !== "undefined"
		? () => globalThis.performance.now()
		: () => Date.now();

/**
 * Build a scheduler. The returned object owns no React state and never
 * touches the DOM directly — it surfaces events through the config
 * callbacks and injected hooks.
 */
export function createRenderScheduler(config: RenderSchedulerConfig): RenderScheduler {
	const targetFps = config.targetFps ?? DEFAULT_TARGET_FPS;
	const reducedIdleFps = config.reducedIdleFps ?? DEFAULT_REDUCED_IDLE_FPS;
	const idleAfterMs = config.idleAfterMs ?? DEFAULT_IDLE_AFTER_MS;
	const raf = config.raf ?? globalRaf;
	const caf = config.caf ?? globalCaf;
	const now = config.now ?? globalNow;

	let lastInteractionAt = now();
	let running = false;
	let animId: number | null = null;
	let isFirstFrame = true;
	let lastFrameTime = 0;
	let visible = true;
	let removeVisibilityListener: (() => void) | null = null;
	let destroyed = false;

	// Self-reported stats. Counts every rAF callback and every onTick; the
	// skipped-frame ratio derives from those. dt samples feed min/max/last.
	let rafCount = 0;
	let onTickCount = 0;
	let lastDtMs = 0;
	let minDtMs = Number.POSITIVE_INFINITY;
	let maxDtMs = 0;
	// Ring buffer of recent onTick timestamps for effectiveFps (ms granularity).
	const recentTickTs: number[] = [];

	function recordTickSample(ts: number): void {
		recentTickTs.push(ts);
		// Drop samples older than 5 seconds — plenty for any reasonable windowMs.
		const cutoff = ts - 5000;
		while (recentTickTs.length > 0 && (recentTickTs[0] ?? Infinity) < cutoff) {
			recentTickTs.shift();
		}
	}

	function getProfile(): QualityProfile {
		if (!visible) return "hidden";
		if (now() - lastInteractionAt >= idleAfterMs) return "idle";
		return "active";
	}

	function frame(t: number): void {
		if (!running || destroyed) return;
		animId = null;
		rafCount += 1;

		if (!visible) {
			running = false;
			return;
		}

		// dt is the time elapsed since the last *onTick* (not since the last
		// display frame). When running on a 240Hz monitor, four display frames
		// arrive per 16.67ms; only the one whose cumulative dt ≥ minIntervalMs
		// is allowed to fire onTick. The other three are observed (rafCount++)
		// but otherwise no-op.
		const dt = isFirstFrame ? 1000 / targetFps : t - lastFrameTime;
		isFirstFrame = false;
		// Note: lastFrameTime is updated only when we actually fire onTick (below).
		// Skip frames do not advance it — that is the cumulative-budget logic.
		lastDtMs = dt;
		if (dt < minDtMs) minDtMs = dt;
		if (dt > maxDtMs) maxDtMs = dt;

		const profile = getProfile();
		const effectiveFps = profile === "idle" ? reducedIdleFps : targetFps;
		const minIntervalMs = 1000 / effectiveFps;

		// The frame arrived inside its FPS budget. Skip the tick but keep the
		// rAF chain alive so the next eligible frame fires immediately.
		if (dt < minIntervalMs) {
			animId = raf(frame);
			return;
		}

		config.onTick(dt, profile);
		lastFrameTime = t;
		onTickCount += 1;
		recordTickSample(now());

		if (!running || destroyed) return;
		animId = raf(frame);
	}

	function start(): void {
		if (running || destroyed) return;
		running = true;
		isFirstFrame = true;
		lastFrameTime = 0;
		rafCount = 0;
		onTickCount = 0;
		minDtMs = Number.POSITIVE_INFINITY;
		maxDtMs = 0;
		lastDtMs = 0;
		recentTickTs.length = 0;
		animId = raf(frame);
	}

	function stop(): void {
		running = false;
		if (animId !== null) {
			caf(animId);
			animId = null;
		}
	}

	function notifyInteraction(): void {
		lastInteractionAt = now();
	}

	function onVisibilityChange(hidden: boolean): void {
		visible = !hidden;
		if (visible) {
			isFirstFrame = true;
			lastFrameTime = 0;
			if (!running && !destroyed) start();
		} else {
			stop();
		}
	}

	function wireVisibility(): void {
		if (config.onVisibilityChange) {
			removeVisibilityListener = config.onVisibilityChange(onVisibilityChange);
			return;
		}
		if (typeof globalThis === "undefined") return;
		const doc = (globalThis as { document?: Document }).document;
		if (!doc) return;
		const handler = () => {
			onVisibilityChange(doc.visibilityState === "hidden");
		};
		doc.addEventListener("visibilitychange", handler);
		visible = doc.visibilityState !== "hidden";
		removeVisibilityListener = () => {
			doc.removeEventListener("visibilitychange", handler);
		};
	}

	wireVisibility();

	function getStats(windowMs = 1000): SchedulerStats {
		const cutoff = now() - windowMs;
		let ticksInWindow = 0;
		for (let i = recentTickTs.length - 1; i >= 0; i--) {
			if ((recentTickTs[i] ?? -Infinity) >= cutoff) ticksInWindow += 1;
			else break;
		}
		const skippedFrameRatio = rafCount > 0 ? 1 - onTickCount / rafCount : 0;
		const effectiveFps = windowMs > 0 ? (ticksInWindow * 1000) / windowMs : 0;
		return {
			profile: getProfile(),
			rafCount,
			onTickCount,
			skippedFrameRatio,
			effectiveFps,
			lastDtMs,
			minDtMs: minDtMs === Number.POSITIVE_INFINITY ? 0 : minDtMs,
			maxDtMs,
		};
	}

	function destroy(): void {
		if (destroyed) return;
		destroyed = true;
		stop();
		if (removeVisibilityListener) {
			removeVisibilityListener();
			removeVisibilityListener = null;
		}
	}

	return {
		start,
		stop,
		notifyInteraction,
		getProfile,
		getStats,
		destroy,
	};
}
