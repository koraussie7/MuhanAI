/**
 * Computer Use Module for MuhanAI
 *
 * Provides AI-powered computer control capabilities:
 * - Screen capture and analysis
 * - Mouse and keyboard control
 * - Browser automation
 * - Vision-based UI interaction
 *
 * Integrates with:
 * - E2B Desktop Sandbox (cloud sandbox)
 * - BYOK Vision Providers (OpenAI, Google, Groq, OpenRouter)
 * - MoltMesh P2P (distributed task execution)
 * - memwal (memory persistence)
 */

export {
	buildComputerUseRunHandler,
	COMPUTER_USE_RUN_CAPABILITY,
	type ComputerUseRunArgs,
} from "./computer-use-router.js";
// Re-export types
export type { E2bSandboxLike, VisionClient } from "./e2b-adapter.js";
export { E2bBrowserAdapter, type E2bBrowserAdapterOptions } from "./e2b-adapter.js";
export {
	type ByokProviderId,
	type ByokVisionProvider,
	type CreateByokVisionProviderOptions,
	createByokVisionProvider,
} from "./e2b-byok-vision.js";
export {
	type ComputerUseAction,
	type ComputerUseLoopOptions,
	type ComputerUseLoopResult,
	type ComputerUseStep,
	E2bStreamSession,
	runComputerUseLoop,
} from "./e2b-computer-use.js";
