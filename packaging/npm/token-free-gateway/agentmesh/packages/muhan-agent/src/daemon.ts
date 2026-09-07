/**
 * muhan-agent daemon — long-running process per user machine.
 *
 * Responsibilities:
 *   1. Hold a stable Ed25519 machine identity (machine-identity.ts).
 *   2. Subscribe to /muhanai/gateway/v1 and respond to SessionRoute
 *      messages addressed to this user+machine.
 *   3. Publish Heartbeat every 10s so the gateway can keep us
 *      sticky for new sessions.
 *   4. Decrypt incoming session payloads (session-decrypt.ts) and
 *      dispatch them through the SessionRunner.
 *   5. Route session requests through MCP (mcp-router.ts) so personal
 *      context enriches responses.
 *   6. Optionally unlock a credentials vault (credentials-vault.ts) so
 *      MCP tool calls can fetch per-user API keys.
 *
 * Phase 1 (this commit) wires all six; phase 2 will swap the
 * InMemory transport for libp2p and replace the stub session key
 * with one derived from install.sh escrow.
 */

import { loadMachineIdentity } from "./machine-identity.js";
import {
  decryptSessionRoute,
  encryptSessionPayload,
  type SessionKey,
} from "./session-decrypt.js";
import { createSessionRunner, type SessionRunner } from "./session-runner.js";
import {
  encodeMessage,
  decodeMessage,
  GATEWAY_PUBSUB_TOPIC,
  type SignedPayload,
  type MachineClaim,
  type Heartbeat,
  type SessionRoute,
  type ProtocolMessage,
  type MachinePlatform,
} from "@agentmesh/gateway";
import { buildMcpHandler, defaultCapabilityMap, buildBrowserHandler, browserCapabilityMap, type CapabilityMap } from "./mcp-router.js";
import type { PersonalMCP } from "@agentmesh/personal-mcp";
import type { VaultHandle } from "./credentials-vault.js";
import type { BrowserAdapter } from "./mcp-router.js";

const HEARTBEAT_INTERVAL_MS = 10_000;

export interface DaemonConfig {
  userId: string;
  platform: MachinePlatform;
  /** Friendly label, surfaced in user's machine list. */
  label?: string;
  identityFile?: string;
  /** Injectable for tests; production uses real libp2p transport. */
  transport: MessageTransport;
  /** Override heartbeat cadence; defaults to 10s. */
  heartbeatIntervalMs?: number;
  /** Phase 2: real key from install.sh escrow. Phase 1: 32-byte dev key. */
  sessionKey?: SessionKey;
  /** Optional MCP instance — when provided, capabilities auto-register. */
  mcp?: PersonalMCP;
  /** Override the default capability → MCP tool map. */
  capabilities?: CapabilityMap;
  /** Optional vault — exposed via the runner's "vault-get" capability. */
  vault?: VaultHandle;
  /**
   * Optional AIHawk-compatible browser adapter. When provided, every
   * entry in browserCapabilityMap() registers against the runner, so
   * `browser_snapshot`, `browser_click_at`, `browser_evaluate` etc.
   * surface as plain session capabilities.
   */
  browser?: BrowserAdapter;
}

export interface MessageTransport {
  publish(topic: string, bytes: Uint8Array): Promise<void>;
  subscribe(
    topic: string,
    handler: (bytes: Uint8Array) => void,
  ): () => void;
}

export interface DaemonHandle {
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Test hook: read the in-process runner. */
  runner(): SessionRunner;
  /** Test hook: dispatch a session request end-to-end. */
  dispatchSession(req: import("./session-runner.js").SessionRequest): Promise<import("./session-runner.js").SessionResponse>;
  /** Test hook: encrypt a session payload with the daemon's session key. */
  encryptForRoute(payload: unknown): Promise<Uint8Array>;
}

export function createDaemon(config: DaemonConfig): DaemonHandle {
  const runner = createSessionRunner();
  const sessionKey = config.sessionKey ?? defaultDevSessionKey();
  registerCapabilities(runner, config);

  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;

  return {
    async start() {
      const identity = await loadMachineIdentity({
        filePath: config.identityFile,
      });

      // 1. Publish machine-claim (one-shot, gateway stores it).
      const claim: SignedPayload<MachineClaim> = {
        signature: new Uint8Array(64),
        from: identity.peerId,
        message: {
          kind: "machine-claim",
          v: 1,
          userId: config.userId,
          machineId: identity.machineId,
          platform: config.platform,
          label: config.label,
          issuedAt: Date.now(),
          ttlMs: 0,
        },
      };
      await config.transport.publish(
        GATEWAY_PUBSUB_TOPIC,
        encodeMessage(claim.message),
      );

      // 2. Heartbeat on an interval so the gateway keeps us online.
      heartbeatTimer = setInterval(async () => {
        const hb: SignedPayload<Heartbeat> = {
          signature: new Uint8Array(64),
          from: identity.peerId,
          message: {
            kind: "heartbeat",
            v: 1,
            userId: config.userId,
            machineId: identity.machineId,
            issuedAt: Date.now(),
          },
        };
        await config.transport.publish(
          GATEWAY_PUBSUB_TOPIC,
          encodeMessage(hb.message),
        );
      }, config.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS);

      // 3. Subscribe to inbound session routes.
      unsubscribe = config.transport.subscribe(
        GATEWAY_PUBSUB_TOPIC,
        (bytes) => {
          try {
            const msg = decodeMessage(bytes) as ProtocolMessage;
            if (msg.kind === "session-route" && msg.userId === config.userId) {
              void onSessionRoute(runner, sessionKey, msg);
            }
          } catch {
            // ignore malformed messages — gateway will drop on parse error
          }
        },
      );
    },

    async stop() {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (unsubscribe) unsubscribe();
      heartbeatTimer = null;
      unsubscribe = null;
    },

    runner() {
      return runner;
    },

    async dispatchSession(req) {
      return runner.handle(req);
    },

    async encryptForRoute(payload) {
      const env = await encryptSessionPayload(payload, sessionKey);
      // Concatenate iv + ciphertext for transport (matches parseEnvelope).
      const out = new Uint8Array(env.iv.byteLength + env.ciphertext.byteLength);
      out.set(env.iv, 0);
      out.set(env.ciphertext, env.iv.byteLength);
      return out;
    },
  };
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

async function onSessionRoute(
  runner: SessionRunner,
  sessionKey: SessionKey,
  msg: SessionRoute,
): Promise<void> {
  try {
    const decrypted = await decryptSessionRoute(msg, sessionKey);
    const req = decrypted.payload as import("./session-runner.js").SessionRequest;
    await runner.handle(req);
    runner.teardown(decrypted.sessionId);
  } catch {
    // Decrypt failure: log-and-drop. Gateway retries; we don't ack.
  }
}

function registerCapabilities(runner: SessionRunner, config: DaemonConfig): void {
  const caps = config.capabilities ?? defaultCapabilityMap();
  for (const cap of Object.keys(caps)) {
    if (config.mcp) {
      runner.register(cap, buildMcpHandler({ mcp: config.mcp, capability: cap }));
    } else {
      // No MCP wired: register an echo handler so the runner still works
      // in tests that don't need personal context.
      runner.register(cap, async (req) => ({
        ok: true,
        correlationId: req.correlationId,
        result: { echoed: req },
      }));
    }
  }
  if (config.vault) {
    runner.register("vault-get", async (req) => {
      const service = String(req.args?.service ?? "");
      const entry = config.vault!.get(service);
      return {
        ok: entry !== null,
        correlationId: req.correlationId,
        result: entry ? { service: entry.service, hasSecret: true } : null,
        error: entry ? undefined : `no entry for ${service}`,
      };
    });
  }
  if (config.browser) {
    // AIHawk-compatible capabilities: tool names mirror MS Playwright MCP,
    // order follows the ladder (selector → coord → screenshot → evaluate).
    const browserCaps = browserCapabilityMap();
    for (const cap of Object.keys(browserCaps)) {
      runner.register(cap, buildBrowserHandler({ browser: config.browser, capability: cap }));
    }
  }
}

/**
 * 32-byte deterministic dev key. Phase 1 ONLY — phase 2 sources the key
 * from install.sh escrow. We tag it so it can never silently ship.
 */
function defaultDevSessionKey(): SessionKey {
  const tag = new TextEncoder().encode("DEV-KEY-DO-NOT-SHIP-PHASE-1-ONLY");
  const key = new Uint8Array(32);
  for (let i = 0; i < 32; i++) key[i] = tag[i % tag.length]!;
  return key;
}
