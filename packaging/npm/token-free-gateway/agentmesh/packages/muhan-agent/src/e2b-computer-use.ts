/**
 * Computer-use orchestration on top of `E2bBrowserAdapter`.
 *
 * Mirrors the role of e2b-dev/open-computer-use: stream the desktop,
 * drive it with a vision model in a screenshot → action loop. We keep
 * this thin and self-contained so it can be wired into the daemon's
 * SessionRunner or called directly from a UI.
 *
 * Two layers:
 *   - `E2bStreamSession` polls the sandbox screenshot and emits base64
 *     frames. UI subscribes to show live desktop.
 *   - `ComputerUseLoop` is the agent loop: given a goal + vision model,
 *     iterate (screenshot → tool spec → action → execute) until the
 *     model emits a `done` action or the step budget runs out.
 */
import {
	type E2bSandboxLike,
	type VisionClient,
	E2bBrowserAdapter,
} from "./e2b-adapter.js";

/** Action the loop may emit on any iteration. Matches AIHawk tool surface. */
export type ComputerUseAction =
	| { type: "click"; x: number; y: number }
	| { type: "click_selector"; selector: string }
	| { type: "type"; text: string }
	| { type: "press"; key: string }
	| { type: "navigate"; url: string }
	| { type: "done"; reason: string };

export interface ComputerUseStep {
	index: number;
	action: ComputerUseAction;
	screenshotBefore: string;
	screenshotAfter?: string;
	durationMs: number;
	modelRaw: string;
}

export interface ComputerUseLoopOptions {
	/** User's goal in natural language (e.g., "Open Gmail and find my last invoice"). */
	goal: string;
	/** Underlying sandbox. Pass a real E2bSandboxLike or a test stub. */
	sandbox: E2bSandboxLike;
	/** Vision model used both to locate UI elements and to decide next action. */
	vision: VisionClient & {
		/** Plan the next action given the goal + recent screenshot + history. */
		planAction?(opts: {
			goal: string;
			imageBase64: string;
			history: ReadonlyArray<ComputerUseStep>;
		}): Promise<ComputerUseAction>;
	};
	/** Maximum iterations before stopping. Default 25. */
	maxSteps?: number;
	/** Frame polling interval in ms. Default 250. */
	frameIntervalMs?: number;
	/** Optional adapter to reuse for tool dispatch (else we build one). */
	adapter?: E2bBrowserAdapter;
	/** Viewport size used to phrase the model prompt. Default 1280x720. */
	viewport?: { width: number; height: number };
	/** Callback per step. Useful for UI streaming. */
	onStep?: (step: ComputerUseStep) => void;
}

export interface ComputerUseLoopResult {
	steps: ComputerUseStep[];
	finalScreenshot?: string;
	finishedReason: "done" | "max-steps" | "error";
	error?: string;
}

const DEFAULT_MAX_STEPS = 25;
const DEFAULT_FRAME_INTERVAL_MS = 250;

/**
 * Stream frames from an e2b Desktop sandbox. Polls `sandbox.screenshot()`
 * on an interval and pushes base64 strings to subscribers. Caller is
 * responsible for `start()` and matching `stop()`.
 */
export class E2bStreamSession {
	private readonly sandbox: E2bSandboxLike;
	private readonly intervalMs: number;
	private readonly listeners = new Set<(frame: string) => void>();
	private timer: ReturnType<typeof setInterval> | undefined;
	private lastFrame: string | undefined;
	private running = false;

	constructor(opts: { sandbox: E2bSandboxLike; intervalMs?: number }) {
		this.sandbox = opts.sandbox;
		this.intervalMs = opts.intervalMs ?? DEFAULT_FRAME_INTERVAL_MS;
	}

	start(): void {
		if (this.running) return;
		this.running = true;
		this.tick();
		this.timer = setInterval(() => this.tick(), this.intervalMs);
	}

	stop(): void {
		if (!this.running) return;
		this.running = false;
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = undefined;
		}
	}

	subscribe(fn: (frame: string) => void): () => void {
		this.listeners.add(fn);
		if (this.lastFrame) fn(this.lastFrame);
		return () => this.listeners.delete(fn);
	}

	getLastFrame(): string | undefined {
		return this.lastFrame;
	}

	private async tick(): Promise<void> {
		try {
			const shot = (await this.sandbox.screenshot()) as unknown;
			const base64 = toBase64(shot);
			this.lastFrame = base64;
			for (const fn of this.listeners) {
				try {
					fn(base64);
				} catch {
					// listener errors must not stop the stream
				}
			}
		} catch {
			// transient screenshot errors — drop this tick, retry next interval
		}
	}
}

function toBase64(shot: unknown): string {
	if (typeof shot === "string") return shot;
	if (shot instanceof Uint8Array) {
		if (typeof btoa === "function") {
			let bin = "";
			for (let i = 0; i < shot.byteLength; i += 1) {
				bin += String.fromCharCode(shot[i] ?? 0);
			}
			return btoa(bin);
		}
		return Buffer.from(shot).toString("base64");
	}
	if (shot && typeof shot === "object" && "base64" in (shot as Record<string, unknown>)) {
		const b64 = (shot as { base64: unknown }).base64;
		if (typeof b64 === "string") return b64;
	}
	return "";
}

/**
 * Computer-use agent loop. The model sees a screenshot and the user's
 * goal, returns one action per step, and we execute it via the
 * BrowserAdapter. Stops on a `done` action or step budget exhaustion.
 *
 * The vision contract is intentionally tiny: providers only need to
 * implement `planAction()` (the agent loop) and `locate()` (selector
 * grounding). Both methods take a base64 PNG and return a small JSON
 * payload, so swapping Claude/GPT-4o/Gemini vision is straightforward.
 */
export async function runComputerUseLoop(
	opts: ComputerUseLoopOptions,
): Promise<ComputerUseLoopResult> {
	const maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS;
	const viewport = opts.viewport ?? { width: 1280, height: 720 };
	const adapter =
		opts.adapter ?? new E2bBrowserAdapter({ sandbox: opts.sandbox, vision: opts.vision, viewport });
	const steps: ComputerUseStep[] = [];

	for (let i = 0; i < maxSteps; i += 1) {
		const before = toBase64(await opts.sandbox.screenshot());
		const stepStart = Date.now();

		if (!opts.vision.planAction) {
			return {
				steps,
				finishedReason: "error",
				error:
					"ComputerUseLoop: vision provider is missing planAction(); cannot drive agent loop.",
			};
		}

		let action: ComputerUseAction;
		try {
			action = await opts.vision.planAction({
				goal: opts.goal,
				imageBase64: before,
				history: steps,
			});
		} catch (err) {
			const reason = err instanceof Error ? err.message : String(err);
			return { steps, finishedReason: "error", error: `planAction failed: ${reason}` };
		}

		const step: ComputerUseStep = {
			index: i,
			action,
			screenshotBefore: before,
			durationMs: 0,
			modelRaw: "",
		};

		if (action.type === "done") {
			step.durationMs = Date.now() - stepStart;
			steps.push(step);
			opts.onStep?.(step);
			return { steps, finishedReason: "done", finalScreenshot: before };
		}

		try {
			await executeAction(adapter, opts.sandbox, action);
		} catch (err) {
			const reason = err instanceof Error ? err.message : String(err);
			step.durationMs = Date.now() - stepStart;
			steps.push(step);
			opts.onStep?.(step);
			return { steps, finishedReason: "error", error: `step ${i} ${action.type} failed: ${reason}` };
		}

		step.screenshotAfter = toBase64(await opts.sandbox.screenshot());
		step.durationMs = Date.now() - stepStart;
		steps.push(step);
		opts.onStep?.(step);
	}

	const final = toBase64(await opts.sandbox.screenshot());
	return { steps, finalScreenshot: final, finishedReason: "max-steps" };
}

async function executeAction(
	adapter: E2bBrowserAdapter,
	sandbox: E2bSandboxLike,
	action: ComputerUseAction,
): Promise<void> {
	switch (action.type) {
		case "click":
			await sandbox.click(action.x, action.y);
			return;
		case "click_selector":
			await adapter.callBrowserTool("browser_click", { selector: action.selector });
			return;
		case "type":
			await sandbox.write(action.text);
			return;
		case "press":
			await sandbox.press(action.key);
			return;
		case "navigate":
			await sandbox.open(action.url);
			return;
		case "done":
			return;
	}
}
