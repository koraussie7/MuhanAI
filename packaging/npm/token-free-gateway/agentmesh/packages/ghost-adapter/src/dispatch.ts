/**
 * Ghost task-dispatch guard.
 *
 * Agent Card capabilities are self-declared, so dispatching real work to a
 * registered Ghost node requires three independent gates, all implemented
 * here as pure, injectable building blocks:
 *
 *   1. Probe-based capability verification — a node only earns a capability
 *      after answering a marker challenge end-to-end (the marker must come
 *      back through the node's task response), with a verification TTL so a
 *      stale node cannot ride an old proof forever.
 *   2. Approvals — write/execute capabilities (`desktop_automation`) need an
 *      explicit, revocable, expiring grant on top of verification.
 *   3. Replay-safe task IDs — every dispatch gets a fresh UUID that the
 *      ledger consumes exactly once; a repeated ID (or an expired one) is
 *      rejected, and failures are recorded.
 *
 * Every dispatch outcome feeds a subject-scoped reputation sink (wired to
 * `PeerReputationRegistry` by the API routes; injectable here) so the mesh
 * learns which nodes actually deliver per capability.
 */
import { randomUUID } from "node:crypto";
import type { GhostCapability } from "./index.js";

export type GhostTaskKind = GhostCapability | "capability_probe";

/** Injectable clock so tests can travel through TTLs. */
export type GhostClock = () => number;

export const DEFAULT_TASK_TTL_MS = 60_000;
export const DEFAULT_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1_000;
export const DEFAULT_CHALLENGE_TTL_MS = 60_000;

// ---------------------------------------------------------------------------
// Task ledger — replay-safe, single-use dispatch IDs
// ---------------------------------------------------------------------------

export interface GhostTaskRecord {
  taskId: string;
  nodeId: string;
  kind: GhostTaskKind;
  status: "issued" | "completed" | "failed";
  issuedAt: number;
  expiresAt: number;
  completedAt?: number;
}

export type GhostConsumeResult =
  | { ok: true; record: GhostTaskRecord }
  | { ok: false; reason: "unknown_task" | "expired" | "replayed"; record?: GhostTaskRecord };

export interface TaskLedgerOptions {
  clock?: GhostClock;
  /** How long an issued (unconsumed) task stays valid. */
  ttlMs?: number;
}

export function createTaskLedger(options: TaskLedgerOptions = {}) {
  const clock = options.clock ?? ((): number => Date.now());
  const ttlMs = options.ttlMs ?? DEFAULT_TASK_TTL_MS;
  const tasks = new Map<string, GhostTaskRecord>();

  return {
    /** Issue a fresh, single-use task ID for (nodeId, kind). */
    issue(nodeId: string, kind: GhostTaskKind): GhostTaskRecord {
      const now = clock();
      const record: GhostTaskRecord = {
        taskId: randomUUID(),
        nodeId,
        kind,
        status: "issued",
        issuedAt: now,
        expiresAt: now + ttlMs,
      };
      tasks.set(record.taskId, record);
      return record;
    },
    /** Consume exactly once. Every later call with the same ID is a replay. */
    consume(taskId: string): GhostConsumeResult {
      const record = tasks.get(taskId);
      if (!record) return { ok: false, reason: "unknown_task" };
      if (record.status !== "issued") return { ok: false, reason: "replayed", record };
      if (clock() > record.expiresAt) return { ok: false, reason: "expired", record };
      record.status = "completed";
      record.completedAt = clock();
      return { ok: true, record };
    },
    /** Mark an issued task failed (transport error) so it cannot be consumed. */
    fail(taskId: string): void {
      const record = tasks.get(taskId);
      if (record && record.status === "issued") {
        record.status = "failed";
        record.completedAt = clock();
      }
    },
    get(taskId: string): GhostTaskRecord | undefined {
      return tasks.get(taskId);
    },
    /** Drop finished/expired records; in-flight issued tasks are kept. */
    purgeExpired(): number {
      const now = clock();
      let removed = 0;
      for (const [taskId, record] of tasks) {
        if (record.status !== "issued" && record.expiresAt < now) {
          tasks.delete(taskId);
          removed += 1;
        }
      }
      return removed;
    },
    size(): number {
      return tasks.size;
    },
  };
}

// ---------------------------------------------------------------------------
// Capability verifier — marker challenges answered by real execution
// ---------------------------------------------------------------------------

export interface GhostChallenge {
  probeId: string;
  nodeId: string;
  capability: GhostCapability;
  /** The node's task response must contain this marker to earn the capability. */
  marker: string;
  issuedAt: number;
  expiresAt: number;
}

export interface GhostVerification {
  capability: GhostCapability;
  verifiedAt: number;
  expiresAt: number;
}

export interface GhostVerifyResult {
  verified: boolean;
  reason?: "unknown_probe" | "expired_probe" | "marker_missing";
  challenge?: GhostChallenge;
}

export interface CapabilityVerifierOptions {
  clock?: GhostClock;
  /** How long a successful verification stays valid. */
  ttlMs?: number;
  /** How long an unanswered challenge stays claimable. */
  challengeTtlMs?: number;
  markerLength?: number;
}

export function createCapabilityVerifier(options: CapabilityVerifierOptions = {}) {
  const clock = options.clock ?? ((): number => Date.now());
  const ttlMs = options.ttlMs ?? DEFAULT_VERIFICATION_TTL_MS;
  const challengeTtlMs = options.challengeTtlMs ?? DEFAULT_CHALLENGE_TTL_MS;
  const markerLength = options.markerLength ?? 16;

  const pending = new Map<string, GhostChallenge>();
  const verified = new Map<string, Map<GhostCapability, GhostVerification>>();

  return {
    /** Mint a challenge; the marker must travel to the node and come back. */
    challengeFor(nodeId: string, capability: GhostCapability): GhostChallenge {
      const now = clock();
      const challenge: GhostChallenge = {
        probeId: randomUUID(),
        nodeId,
        capability,
        marker: randomUUID().replace(/-/g, "").slice(0, markerLength),
        issuedAt: now,
        expiresAt: now + challengeTtlMs,
      };
      pending.set(challenge.probeId, challenge);
      return challenge;
    },
    /**
     * Check a node's response against a pending challenge. The challenge is
     * consumed either way — a failed probe cannot be retried with the same
     * marker, and the response only counts if it echoes the marker back.
     */
    verifyFromResponse(probeId: string, response: unknown): GhostVerifyResult {
      const challenge = pending.get(probeId);
      if (!challenge) return { verified: false, reason: "unknown_probe" };
      pending.delete(probeId);
      if (clock() > challenge.expiresAt) {
        return { verified: false, reason: "expired_probe", challenge };
      }
      if (!JSON.stringify(response ?? "").includes(challenge.marker)) {
        return { verified: false, reason: "marker_missing", challenge };
      }
      const now = clock();
      const perNode = verified.get(challenge.nodeId) ?? new Map();
      perNode.set(challenge.capability, {
        capability: challenge.capability,
        verifiedAt: now,
        expiresAt: now + ttlMs,
      });
      verified.set(challenge.nodeId, perNode);
      return { verified: true, challenge };
    },
    isVerified(nodeId: string, capability: GhostCapability, now?: number): boolean {
      const at = now ?? clock();
      const entry = verified.get(nodeId)?.get(capability);
      return entry !== undefined && entry.expiresAt > at;
    },
    verifiedCapabilities(nodeId: string, now?: number): GhostCapability[] {
      const at = now ?? clock();
      const out: GhostCapability[] = [];
      for (const [capability, entry] of verified.get(nodeId) ?? []) {
        if (entry.expiresAt > at) out.push(capability);
      }
      return out;
    },
    verificationFor(nodeId: string, capability: GhostCapability): GhostVerification | undefined {
      return verified.get(nodeId)?.get(capability);
    },
    /** Drop all verifications for a node (e.g. it re-registered with a new URL). */
    forget(nodeId: string): void {
      verified.delete(nodeId);
    },
  };
}

// ---------------------------------------------------------------------------
// Approvals — expiring, revocable grants for write/execute capabilities
// ---------------------------------------------------------------------------

export interface GhostApproval {
  nodeId: string;
  capability: GhostCapability;
  grantedBy: string;
  grantedAt: number;
  expiresAt: number;
}

export const DEFAULT_APPROVAL_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

export interface ApprovalStoreOptions {
  clock?: GhostClock;
  defaultTtlMs?: number;
}

export function createApprovalStore(options: ApprovalStoreOptions = {}) {
  const clock = options.clock ?? ((): number => Date.now());
  const defaultTtlMs = options.defaultTtlMs ?? DEFAULT_APPROVAL_TTL_MS;
  const grants = new Map<string, Map<GhostCapability, GhostApproval>>();

  return {
    grant(
      nodeId: string,
      capability: GhostCapability,
      opts: { grantedBy: string; ttlMs?: number },
    ): GhostApproval {
      const now = clock();
      const approval: GhostApproval = {
        nodeId,
        capability,
        grantedBy: opts.grantedBy,
        grantedAt: now,
        expiresAt: now + (opts.ttlMs ?? defaultTtlMs),
      };
      const perNode = grants.get(nodeId) ?? new Map();
      perNode.set(capability, approval);
      grants.set(nodeId, perNode);
      return approval;
    },
    isApproved(nodeId: string, capability: GhostCapability): boolean {
      const approval = grants.get(nodeId)?.get(capability);
      return approval !== undefined && approval.expiresAt > clock();
    },
    revoke(nodeId: string, capability: GhostCapability): boolean {
      return grants.get(nodeId)?.delete(capability) ?? false;
    },
    list(nodeId?: string): GhostApproval[] {
      const now = clock();
      const out: GhostApproval[] = [];
      const collect = (perNode: Map<GhostCapability, GhostApproval>) => {
        for (const approval of perNode.values()) {
          if (approval.expiresAt > now) out.push(approval);
        }
      };
      if (nodeId === undefined) {
        for (const perNode of grants.values()) collect(perNode);
      } else {
        const perNode = grants.get(nodeId);
        if (perNode) collect(perNode);
      }
      return out;
    },
  };
}

// ---------------------------------------------------------------------------
// Dispatch orchestration — gates, single-use IDs, reputation feedback
// ---------------------------------------------------------------------------

export interface GhostReputationSink {
  /** Compatible with `PeerReputationRegistry.update`. */
  update(
    subject: string,
    signal: { peerId: string; positive: boolean; weight?: number; timestamp: number },
  ): unknown;
}

export interface GhostDispatchRequest {
  nodeId: string;
  nodeUrl: string;
  capability: Exclude<GhostTaskKind, "capability_probe">;
  payload: unknown;
  /** Capabilities the node's Agent Card claims — checked before verification. */
  claimedCapabilities?: readonly string[];
}

export interface GhostDispatchDeps {
  ledger: ReturnType<typeof createTaskLedger>;
  verifier: ReturnType<typeof createCapabilityVerifier>;
  approvals: ReturnType<typeof createApprovalStore>;
  reputation?: GhostReputationSink;
  /** Server→node transport. The caller owns SSRF validation of `nodeUrl`. */
  transport: (url: string, body: unknown) => Promise<unknown>;
  clock?: GhostClock;
}

export type GhostDispatchResult =
  | {
      ok: true;
      taskId: string;
      result: unknown;
      reputation?: { score: number; variance: number };
    }
  | {
      ok: false;
      stage: "claimed" | "verified" | "approval" | "transport" | "replay";
      reason: string;
      taskId?: string;
      reputation?: { score: number; variance: number };
    };

function reputationUpdate(
  deps: GhostDispatchDeps,
  nodeId: string,
  capability: string,
  positive: boolean,
  now: number,
): { score: number; variance: number } | undefined {
  const updated = deps.reputation?.update(`ghost:${capability}`, {
    peerId: nodeId,
    positive,
    timestamp: now,
  });
  if (updated && typeof updated === "object") {
    const candidate = updated as { score?: unknown; variance?: unknown };
    if (typeof candidate.score === "number" && typeof candidate.variance === "number") {
      return { score: candidate.score, variance: candidate.variance };
    }
  }
  return undefined;
}

/**
 * Run one gated dispatch: claim check → probe verification → approval (for
 * `desktop_automation`) → fresh single-use task ID → node transport → ledger
 * consume → reputation feedback. Any transport failure fails the ledger
 * record and dings reputation; success marks it completed and boosts it.
 */
export async function runGhostDispatch(
  request: GhostDispatchRequest,
  deps: GhostDispatchDeps,
): Promise<GhostDispatchResult> {
  const now = deps.clock?.() ?? Date.now();

  if (
    request.claimedCapabilities !== undefined &&
    !request.claimedCapabilities.includes(request.capability)
  ) {
    return {
      ok: false,
      stage: "claimed",
      reason: `Agent Card does not claim capability: ${request.capability}`,
    };
  }

  if (!deps.verifier.isVerified(request.nodeId, request.capability, now)) {
    return {
      ok: false,
      stage: "verified",
      reason: `capability not probe-verified: ${request.capability}`,
    };
  }

  if (
    request.capability === "desktop_automation" &&
    !deps.approvals.isApproved(request.nodeId, request.capability)
  ) {
    return {
      ok: false,
      stage: "approval",
      reason: "desktop_automation requires an explicit, unexpired approval grant",
    };
  }

  const task = deps.ledger.issue(request.nodeId, request.capability);
  try {
    const response = await deps.transport(request.nodeUrl, {
      taskId: task.taskId,
      kind: request.capability,
      payload: request.payload,
    });
    const consumed = deps.ledger.consume(task.taskId);
    if (!consumed.ok) {
      return {
        ok: false,
        stage: "replay",
        reason: consumed.reason ?? "task could not be consumed",
        taskId: task.taskId,
      };
    }
    return {
      ok: true,
      taskId: task.taskId,
      result: response,
      reputation: reputationUpdate(deps, request.nodeId, request.capability, true, now),
    };
  } catch (error) {
    deps.ledger.fail(task.taskId);
    return {
      ok: false,
      stage: "transport",
      reason: (error as Error).message ?? "node transport failed",
      taskId: task.taskId,
      reputation: reputationUpdate(deps, request.nodeId, request.capability, false, now),
    };
  }
}