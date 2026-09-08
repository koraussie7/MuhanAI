/**
 * Computer-use session handler — bridges the SessionRunner surface
 * (capability name + handler) to the ComputerUseLoop.
 *
 * A single session request with capability `computer-use.run` and args
 * `{goal, provider, apiKey, ...}` drives one full agent loop and
 * returns the aggregated step log + final screenshot.
 *
 * The handler is intentionally NOT tied to a specific sandbox. The
 * daemon injects an `E2bBrowserAdapter` (which owns the sandbox)
 * when wiring the runner; tests inject a stub.
 */
import {
	createByokVisionProvider,
	type ByokProviderId,
	type ByokVisionProvider,
} from "./e2b-byok-vision.js";
import { runComputerUseLoop, type ComputerUseLoopResult } from "./e2b-computer-use.js";
import type { E2bBrowserAdapter } from "./e2b-adapter.js";
import type { SessionHandler, SessionRequest, SessionResponse } from "./session-runner.js";

export const COMPUTER_USE_RUN_CAPABILITY = "computer-use.run";

export interface ComputerUseRunArgs {
	goal: string;
	provider: ByokProviderId;
	apiKey: string;
	planModel?: string;
	locateModel?: string;
	maxSteps?: number;
	viewport?: { width: number; height: number };
}

/**
 * Build a SessionHandler that runs `runComputerUseLoop` against the
 * adapter's sandbox. Each request brings its own BYOK vision provider
 * (created per call from the request args) so users can switch providers
 * without re-running setup.
 *
 * Tests inject `visionFactory` to stub the provider; production leaves
 * it unset and gets the real BYOK factory.
 */
export function buildComputerUseRunHandler(opts: {
	adapter: E2bBrowserAdapter;
	visionFactory?: (args: ComputerUseRunArgs) => ByokVisionProvider;
}): SessionHandler {
	const { adapter } = opts;
	const factory = opts.visionFactory ?? defaultVisionFactory;
	return async (req: SessionRequest): Promise<SessionResponse> => {
		try {
			const args = parseArgs(req.args ?? {});
			const vision = factory(args);
			const sandbox = await adapter.getSandbox();
			const result = await runComputerUseLoop({
				goal: args.goal,
				sandbox,
				vision,
				maxSteps: args.maxSteps,
				viewport: args.viewport,
				adapter,
			});
			if (result.finishedReason === "error") {
				return {
					ok: false,
					correlationId: req.correlationId,
					error: result.error ?? "computer-use loop reported error",
					result: serializeResult(result),
				};
			}
			return {
				ok: true,
				correlationId: req.correlationId,
				result: serializeResult(result),
			};
		} catch (err) {
			const reason = err instanceof Error ? err.message : String(err);
			return {
				ok: false,
				correlationId: req.correlationId,
				error: `computer-use.run failed: ${reason}`,
			};
		}
	};
}

function defaultVisionFactory(args: ComputerUseRunArgs): ByokVisionProvider {
	return createByokVisionProvider({
		provider: args.provider,
		apiKey: args.apiKey,
		planModel: args.planModel,
		locateModel: args.locateModel,
	});
}

function parseArgs(args: Record<string, unknown>): ComputerUseRunArgs {
	if (typeof args.goal !== "string" || args.goal.length === 0) {
		throw new Error("`goal` must be a non-empty string");
	}
	if (typeof args.apiKey !== "string" || args.apiKey.length === 0) {
		throw new Error("`apiKey` must be a non-empty string");
	}
	const provider = args.provider;
	const valid: ByokProviderId[] = ["openai", "google", "groq", "openrouter"];
	if (typeof provider !== "string" || !valid.includes(provider as ByokProviderId)) {
		throw new Error(
			`\`provider\` must be one of ${valid.join(", ")} (got ${JSON.stringify(provider)})`,
		);
	}
	const vp = args.viewport;
	let viewport: { width: number; height: number } | undefined;
	if (vp && typeof vp === "object") {
		const w = (vp as { width?: unknown }).width;
		const h = (vp as { height?: unknown }).height;
		if (typeof w === "number" && typeof h === "number") {
			viewport = { width: w, height: h };
		}
	}
	return {
		goal: args.goal,
		provider: provider as ByokProviderId,
		apiKey: args.apiKey,
		planModel: typeof args.planModel === "string" ? args.planModel : undefined,
		locateModel: typeof args.locateModel === "string" ? args.locateModel : undefined,
		maxSteps: typeof args.maxSteps === "number" ? args.maxSteps : undefined,
		viewport,
	};
}

function serializeResult(result: ComputerUseLoopResult): unknown {
	return {
		finishedReason: result.finishedReason,
		error: result.error,
		finalScreenshot: result.finalScreenshot,
		stepCount: result.steps.length,
		steps: result.steps.map((s) => ({
			index: s.index,
			action: s.action,
			durationMs: s.durationMs,
		})),
	};
}
