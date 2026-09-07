/**
 * Fixed-step physics accumulator for CosmicCanvas.
 *
 * Why this exists
 * ---------------
 * ADR-0006 established a render-loop scheduler that caps onTick to a target
 * FPS and skips frames inside the budget. The scheduler calls onTick with a
 * wall-clock `dt` and the renderer previously called `physics.step()` once
 * per onTick — implicitly coupling the simulation rate to the render rate.
 *
 * That coupling is wrong for two reasons:
 *   1. **Determinism** — if the render runs at 60Hz vs 30Hz vs 240Hz-capped-
 *      to-60Hz, the simulation integrates at different rates. A bug fix
 *      tested under one rate can break under another. Recorded interactions
 *      (drag a node, run for 5s) produce different node positions.
 *   2. **Blow-up on slow frames** — if a frame stalls for 500ms, the
 *      simulation receives a 500ms mega-step. Forces like REPULSION_GAIN
 *      and SPRING_STIFFNESS become large in proportion, and nodes fly off
 *      screen before INTEGRATION_DAMPING can bleed the energy out.
 *
 * This module decouples them with the standard "fixed-step accumulator"
 * pattern (Glenn Fiedler, "Fix Your Timestep"):
 *
 *   - The simulation always integrates by `fixedTimestepMs` (default 1/60s).
 *   - The renderer calls `advance(wallDtMs)` whenever a render frame fires.
 *   - The accumulator drains zero or more fixed steps until residual < step.
 *   - The render receives `alpha = accumulator / fixedTimestepMs` (0..1) so
 *     it can interpolate visuals between the last and next physics state.
 *
 * Consequences (and the trade-offs we accept):
 *   - **Deterministic simulation** — same inputs + same elapsed wall time =
 *     same node positions, regardless of render rate or stutter.
 *   - **Frame-rate-independent simulation** — frame budget caps (30/60 fps
 *     idle/active) no longer slow down physics; physics runs at 60Hz when
 *     visible, 30Hz when idle, paused when hidden.
 *   - **Bounded work per frame** — `maxStepsPerAdvance` caps how many steps
 *     a single render frame may drain. A 5s background-resume cannot fire
 *     300 physics steps; it caps at the limit (default 5) and discards the
 *     residual, so the simulation resumes from the latest known state.
 *   - **Visual interpolation added** — render closure now receives `alpha`
 *     so edge packet pulses (and future visual interpolation) can blend
 *     between physics states for sub-frame smoothness.
 *
 * Architecture rationale lives in `docs/adr/0006-adaptive-render-loop.md`
 * under "Phase 2".
 */

export interface PhysicsLoopConfig {
	/**
	 * Called once per fixed physics step. Must not throw. Receives the
	 * fixed `dtMs` for this step (always equal to `fixedTimestepMs`).
	 */
	onStep: (dtMs: number) => void;

	/** Fixed simulation timestep in ms. Default 1000/60 ≈ 16.6667. */
	fixedTimestepMs?: number;

	/**
	 * Maximum steps a single `advance()` call may drain. Bounds work after
	 * a long pause (e.g. background-resume after 5 minutes). Default 5 —
	 * enough to absorb a 5-frame hitch at 60Hz but small enough that one
	 * render frame never takes more than ~80ms of CPU on physics alone.
	 */
	maxStepsPerAdvance?: number;

	/** Inject to control the time source under node:test. */
	now?: () => number;
}

export interface PhysicsLoop {
	/**
	 * Advance the simulation by `wallDtMs`. Drains zero or more fixed
	 * steps from the accumulator. Returns the count of steps fired and
	 * the alpha (0..1) residual for visual interpolation.
	 */
	advance(wallDtMs: number): { steps: number; alpha: number };

	/** Synchronous snapshot of the accumulator (in ms). Useful for tests. */
	getAccumulator(): number;

	/** Reset the accumulator to zero. Call on visibility change resume. */
	reset(): void;

	/** Destroy the loop. Currently a no-op reserved for future state. */
	destroy(): void;
}

const DEFAULT_FIXED_TIMESTEP_MS = 1000 / 60;
const DEFAULT_MAX_STEPS_PER_ADVANCE = 5;

/**
 * Build a physics loop. The returned object owns no React state, no DOM,
 * and no scheduler reference — it is driven entirely by the caller calling
 * `advance(wallDtMs)` whenever a render frame fires. This keeps the
 * accumulator testable under node:test without jsdom.
 */
export function createPhysicsLoop(config: PhysicsLoopConfig): PhysicsLoop {
	const fixedTimestepMs = config.fixedTimestepMs ?? DEFAULT_FIXED_TIMESTEP_MS;
	const maxStepsPerAdvance = config.maxStepsPerAdvance ?? DEFAULT_MAX_STEPS_PER_ADVANCE;
	const now = config.now ?? (() => Date.now());

	let accumulator = 0;

	function advance(wallDtMs: number): { steps: number; alpha: number } {
		// Clamp negative or NaN inputs to 0 — defensive against upstream
		// clock skew that could otherwise pin the accumulator at -Infinity.
		const dt = Number.isFinite(wallDtMs) && wallDtMs > 0 ? wallDtMs : 0;
		accumulator += dt;

		let steps = 0;
		while (accumulator >= fixedTimestepMs && steps < maxStepsPerAdvance) {
			config.onStep(fixedTimestepMs);
			accumulator -= fixedTimestepMs;
			steps += 1;
		}

		// If the accumulator is still over the step boundary but we've
		// hit maxStepsPerAdvance, discard the residual. The alternative
		// (let it grow without bound) would mean a single huge wallDt
		// causes every subsequent advance to chase the deficit forever.
		if (steps >= maxStepsPerAdvance && accumulator >= fixedTimestepMs) {
			accumulator = 0;
		}

		// Alpha is the fraction of the way to the next step. Always in
		// [0, 1) because we just drained everything >= fixedTimestepMs.
		const alpha = accumulator / fixedTimestepMs;
		return { steps, alpha };
	}

	function getAccumulator(): number {
		return accumulator;
	}

	function reset(): void {
		accumulator = 0;
	}

	function destroy(): void {
		// No-op for now. Reserved for future state (e.g. internal timing
		// buffers) that would need explicit teardown.
	}

	// Touch `now` so the captured reference is intentional rather than
	// coincidental — future revisions may use it for pause-detection.
	void now;

	return { advance, getAccumulator, reset, destroy };
}
