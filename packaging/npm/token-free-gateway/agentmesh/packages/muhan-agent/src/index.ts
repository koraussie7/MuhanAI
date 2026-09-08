/**
 * @agentmesh/muhan-agent — public API.
 *
 * Run this on every user machine (macOS / Linux / Windows) that wants
 * to host MuhanAI sessions. The daemon registers itself with the
 * gateway and answers SessionRoute messages for its user.
 */

export {
	createVault,
	unlockVault,
	VaultAuthError,
	type VaultBlob,
	type VaultEntry,
	type VaultHandle,
	VaultTamperedError,
} from "./credentials-vault.js";
export type {
	DaemonConfig,
	DaemonHandle,
	MessageTransport,
} from "./daemon.js";
export { createDaemon } from "./daemon.js";
export {
	E2bBrowserAdapter,
	type E2bBrowserAdapterOptions,
	type E2bSandboxLike,
	type VisionClient,
} from "./e2b-adapter.js";
export {
	type ByokProviderId,
	type ByokVisionProvider,
	type CreateByokVisionProviderOptions,
	createByokVisionProvider,
	type PlanActionFn,
} from "./e2b-byok-vision.js";
export {
	type ComputerUseAction,
	type ComputerUseLoopOptions,
	type ComputerUseLoopResult,
	type ComputerUseStep,
	E2bStreamSession,
	runComputerUseLoop,
} from "./e2b-computer-use.js";
export {
	buildComputerUseRunHandler,
	type ComputerUseRunArgs,
	COMPUTER_USE_RUN_CAPABILITY,
} from "./computer-use-router.js";
export type { MachineIdentity } from "./machine-identity.js";
export { loadMachineIdentity } from "./machine-identity.js";
export {
	type BrowserAdapter,
	browserCapabilityMap,
	buildBrowserHandler,
	buildMcpHandler,
	type CapabilityMap,
	defaultCapabilityMap,
} from "./mcp-router.js";
export {
	type DecryptedSession,
	decryptSessionRoute,
	encryptSessionPayload,
	type SessionEnvelope,
	type SessionKey,
} from "./session-decrypt.js";
export {
	createSessionRunner,
	type SessionHandler,
	type SessionRequest,
	type SessionResponse,
	type SessionRunner,
} from "./session-runner.js";
