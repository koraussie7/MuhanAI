/**
 * @agentmesh/muhan-agent — public API.
 *
 * Run this on every user machine (macOS / Linux / Windows) that wants
 * to host MuhanAI sessions. The daemon registers itself with the
 * gateway and answers SessionRoute messages for its user.
 */

export { createDaemon } from "./daemon.js";
export { loadMachineIdentity } from "./machine-identity.js";

export {
  encryptSessionPayload,
  decryptSessionRoute,
  type SessionKey,
  type DecryptedSession,
  type SessionEnvelope,
} from "./session-decrypt.js";

export {
  createSessionRunner,
  type SessionRunner,
  type SessionRequest,
  type SessionResponse,
  type SessionHandler,
} from "./session-runner.js";

export {
  buildMcpHandler,
  defaultCapabilityMap,
  buildBrowserHandler,
  browserCapabilityMap,
  type CapabilityMap,
  type BrowserAdapter,
} from "./mcp-router.js";

export {
  createVault,
  unlockVault,
  VaultAuthError,
  VaultTamperedError,
  type VaultBlob,
  type VaultEntry,
  type VaultHandle,
} from "./credentials-vault.js";

export type {
  DaemonConfig,
  DaemonHandle,
  MessageTransport,
} from "./daemon.js";

export type { MachineIdentity } from "./machine-identity.js";
