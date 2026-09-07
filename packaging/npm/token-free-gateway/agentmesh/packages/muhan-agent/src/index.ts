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
