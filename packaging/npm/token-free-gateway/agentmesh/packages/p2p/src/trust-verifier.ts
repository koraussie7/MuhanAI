/**
 * TOFU + probabilistic trust verifier (HiveBear port).
 *
 * Original: https://github.com/BeckhamLabsLLC/HiveBear
 *   crates/hivebear-mesh/src/trust/verification.rs (~4967 bytes)
 * License: MIT (verbatim port — attribution preserved per MIT §4(b))
 *
 * HiveBear source implements a probabilistic *spot-check* verifier that
 * randomly samples fraction of computation tokens to re-verify (with a
 * `MIN_VERIFICATION_RATE=0.01` floor that cannot be disabled in production).
 *
 * AgentMesh adaptation (see ADR-0003 + CODE-INTEGRATION-PLAN.md §3.4):
 *   - HiveBear's per-token spot-check → per-peer TOFU key pin
 *     (we trust first observed public key, then flag any later change as
 *     a `mismatch` so we can refuse the connection).
 *   - The MIN_VERIFICATION_RATE constant is retained as a configurable
 *     module-level export, so future spot-check logic can clamp to it.
 *
 * Why TOFU rather than full spot-check verification:
 *   libp2p already authenticates peers at the transport layer (Noise XX
 *   handshake binds the connection to a private key). What it does NOT
 *   detect is a *peer-id to public-key rebinding* attack: a malicious
 *   peer re-publishing the same PeerId with a different libp2p key.
 *   TOFU pinning is the standard mitigation and matches folklore's
 *   `peer-transport.ts` + HiveBear's `trust/verification.rs` design.
 */

import type { PublicKey } from "@libp2p/interface";

/**
 * Minimum verification rate floor — mirrors HiveBear's `MIN_VERIFICATION_RATE`.
 * Retained for future probabilistic spot-check wiring (Phase 3+); not used by
 * `verify()` today because libp2p Noise XX already authenticates every frame.
 */
export const MIN_VERIFICATION_RATE = 0.01;

export interface VerificationRecord {
  peerId: string;
  publicKey: PublicKey;
  firstSeen: number;
  lastVerified: number;
  verifiedCount: number;
}

export type VerificationStatus = "verified" | "tofu" | "unverified" | "mismatch";

export interface VerificationOutcome {
  peerId: string;
  status: VerificationStatus;
  publicKey?: PublicKey;
  reason?: string;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export class TrustVerifier {
  private records = new Map<string, VerificationRecord>();

  /**
   * Verify a peer against its claimed public key.
   *
   * - First encounter (no record): record key, return `"tofu"`.
   * - Subsequent match: increment `verifiedCount`, return `"verified"`.
   * - Subsequent mismatch (key changed): return `"mismatch"` WITHOUT
   *   overwriting the record — operator decides whether to `remove()` and
   *   re-pin, or to keep the old pin and refuse the connection.
   */
  verify(peerId: string, publicKey: PublicKey): VerificationOutcome {
    const prev = this.records.get(peerId);
    const now = Date.now();

    if (!prev) {
      this.records.set(peerId, {
        peerId,
        publicKey,
        firstSeen: now,
        lastVerified: now,
        verifiedCount: 1,
      });
      return { peerId, status: "tofu", publicKey };
    }

    if (!bytesEqual(prev.publicKey.raw, publicKey.raw)) {
      return {
        peerId,
        status: "mismatch",
        reason: "public key changed",
      };
    }

    prev.lastVerified = now;
    prev.verifiedCount += 1;
    return { peerId, status: "verified", publicKey };
  }

  /**
   * Check whether a peer has ever been verified (TOFU or otherwise).
   * Does NOT trigger a verify() — purely a presence query.
   */
  isKnown(peerId: string): boolean {
    return this.records.has(peerId);
  }

  get(peerId: string): VerificationRecord | undefined {
    return this.records.get(peerId);
  }

  remove(peerId: string): boolean {
    return this.records.delete(peerId);
  }

  size(): number {
    return this.records.size;
  }

  all(): VerificationRecord[] {
    return Array.from(this.records.values());
  }
}
