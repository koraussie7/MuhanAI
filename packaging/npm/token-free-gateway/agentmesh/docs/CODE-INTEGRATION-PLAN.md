# AgentMesh 코드 통합 플랜 — Phase 2~3 (Token-bank + Reputation)

> **상위 문서**: `docs/INTEGRATED-CODE-PLAN.md` (M1~M5 master plan)
> **소스 카탈로그**: `docs/IMPORTABLE-SOURCE-MAP.md` (8 OSS × 12 축 매트릭스)
> **라이선스 결정**: `docs/adr/0003-eight-repo-lineage.md`
> **작성일**: 2026-09-07

이 문서는 **M1 (libp2p transport) 완료 이후, token-bank Phase 2~3 + reputation 통합을 위한 모듈 단위 실행 플랜**이다.
INTEGRATED-CODE-PLAN.md의 §10(Phase 2/2+ 스케치)을 모듈 단위 인터페이스로 풀고, IMPORTABLE-SOURCE-MAP.md §5(ready-to-import 5 모듈)을 실제 파일 경로와 통합 순서로 매핑한다.

---

## 0. TL;DR

| 항목 | 결정 |
|---|---|
| 통합 범위 | 5 모듈 (3 → `packages/credits`, 2 → `packages/p2p`) |
| 외부 의존 추가 | 없음 (모두 pure-TS port) |
| 라이선스 카테고리 | 4 MIT verbatim + 1 자체 작성 (p2ptokens co-receipts, LICENSE 부재) |
| 통합 순서 | S1 types → S2 reputation core → S3 credit-account → S4 trust-verifier → S5 peer-reputation wiring |
| 테스트 | vitest 단위 + docker-compose 멀티 peer 통합 |
| 롤백 단위 | 모듈 단위 (각 step 완료 시 git tag) |
| 사용자 확인 필요 | 1건 (§11 — co-receipts 자체 작성 결정) |

---

## 1. 현재 상태 (State)

### 1.1 DONE — M1 (libp2p transport)

| 파일 | LOC | 출처 |
|---|---|---|
| `packages/p2p/src/transport.ts` | 224 | folklore peer-transport.ts (MIT) |
| `packages/p2p/src/identity.ts` | 85 | folklore + HiveBear NodeIdentity 패턴 (MIT) |
| `packages/p2p/src/peer-catalog.ts` | 66 | folklore peer-store (MIT) |
| `packages/p2p/src/bandwidth.ts` | ~120 | folklore rateLimiter + Semaphore (MIT) |
| `packages/p2p/src/pubsub.ts` | ~80 | @libp2p/floodsub factory (D1 결정) |
| `packages/p2p/src/index.ts` | ~30 | public exports |
| `packages/p2p/vitest.config.ts` | 9 | vitest 2.1.8 |

**검증**: `pnpm -F @agentmesh/p2p typecheck` 0 errors, 15/15 tests pass.

### 1.2 DONE — credits Phase 0/1 (already in place)

`packages/credits/src/index.ts` (148 LOC) — 이미 구현됨:

- `WELCOME_CREDITS = 1_000_000`
- `grantCredits / spendCredits` — Prisma + idempotencyKey 기반 ledger
- `getCreditBalance` — wallet 조회
- `grantWelcomeBonus` — sign-up bonus 통합 진입점
- `InsufficientCreditsError` — 음수 잔액 가드

### 1.3 TODO — 이번 플랜의 대상

| Phase | 모듈 | 위치 |
|---|---|---|
| **2a** | `reputation.ts` (Bayesian-EMA) | `packages/credits/src/` |
| **2a** | `credit-account.ts` (4-tier) | `packages/credits/src/` |
| **2b** | `co-receipt.ts` (자체 작성) | `packages/credits/src/` |
| **2c** | `trust-verifier.ts` (TOFU + probabilistic) | `packages/p2p/src/` |
| **2c** | `peer-reputation.ts` (subject-scoped) | `packages/p2p/src/` |

각 모듈의 원본 위치는 §3에 명시.

---

## 2. 아키텍처 다이어그램

### 2.1 모듈 의존 그래프

```
                    ┌─────────────────────────────────┐
                    │   @agentmesh/shared (existing)  │
                    │   - types/peer-id               │
                    │   - types/result                │
                    └────────────────┬────────────────┘
                                     │
            ┌────────────────────────┼────────────────────────┐
            │                        │                        │
   ┌────────▼─────────┐    ┌─────────▼────────┐    ┌─────────▼────────┐
   │  @agentmesh/p2p  │◄───┤  @agentmesh/     │◄───┤  @agentmesh/     │
   │                  │    │  credits         │    │  hivebear        │
   │  - transport     │    │                  │    │  (ollama-proxy)  │
   │  - identity      │    │  - ledger (DONE) │    │                  │
   │  - peer-catalog  │    │  - reputation    │    └──────────────────┘
   │  - bandwidth     │    │  - credit-account│
   │  - pubsub        │    │  - co-receipt    │
   │  - trust-verifier    │                  │
   │  - peer-reputation   │                  │
   └──────────┬───────┘    └─────────┬────────┘
              │                      │
              └──────────┬───────────┘
                         │
                ┌────────▼─────────┐
                │  services/api    │
                │  - pulse-routes  │
                │  - gossip-bridge │
                └──────────────────┘
```

**규약**:
- `p2p` → `credits`: 단방향 의존 없음 (`p2p`는 `credits`를 import 안 함)
- `credits` → `p2p`: type only (`PeerId` 문자열 alias만 사용, runtime 의존 없음)
- `hivebear`은 무관 (ollama-proxy만 다룸 — 별도 product surface)

### 2.2 데이터 흐름 (reputation 업데이트 시)

```
        gossip / direct
              │
              ▼
  ┌──────────────────────┐
  │  PeerCatalog         │  ← transport.ts PITFALL 1
  │  (lastSeen, addrs)   │
  └──────────┬───────────┘
             │ event: peer:connect / peer:disconnect / reputation:update
             ▼
  ┌──────────────────────┐
  │  PeerReputation      │  ← peer-reputation.ts (folklore port)
  │  - subject-scoped    │
  │  - InMemory + hook   │
  └──────────┬───────────┘
             │ update(subject, peerId, score)
             ▼
  ┌──────────────────────┐
  │  ReputationCore      │  ← reputation.ts (HiveBear port)
  │  - Bayesian-EMA      │
  │  - tier function     │
  └──────────┬───────────┘
             │ reputation ∈ [0, 1]
             ▼
  ┌──────────────────────┐
  │  CreditAccount       │  ← credit-account.ts (pinkybrain port)
  │  - 4-tier mapping    │
  │  - monthlyCreditFor  │
  └──────────┬───────────┘
             │ tier + monthly credits
             ▼
  ┌──────────────────────┐
  │  CoReceiptLedger     │  ← co-receipt.ts (자체 작성)
  │  - hysteresis        │
  │  - grace tokens      │
  └──────────────────────┘
```

### 2.3 트러스트 검증 흐름

```
  Outbound request to peer P
             │
             ▼
  ┌──────────────────────┐
  │  TrustVerifier       │  ← trust-verifier.ts (HiveBear port)
  │  - TOFU key cache    │
  │  - probabilistic     │
  │    verification log  │
  └──────────┬───────────┘
             │
       ┌─────┴──────┐
       │            │
       ▼            ▼
   VERIFIED     UNVERIFIED
       │            │
       ▼            ▼
   reputation   reputation
    (++)         (-)
       │            │
       └─────┬──────┘
             ▼
       PeerReputation.update(...)
```

---

## 3. 모듈별 통합 사양

### 3.1 `packages/credits/src/reputation.ts` — Bayesian-EMA

**출처**: HiveBear `crates/hivebear-mesh/src/trust/reputation.rs` (6769 bytes, MIT)
**참조 확인**: §1 of IMPORTABLE-SOURCE-MAP.md / 5-1 of INTEGRATED-CODE-PLAN.md

**포트 방식**: Rust → TS 변환 (semantic equivalent, MIT verbatim attribution)

**목표 인터페이스**:

```ts
// packages/credits/src/reputation.ts

/**
 * Bayesian-EMA reputation score (HiveBear crates/hivebear-mesh/src/trust/reputation.rs port).
 *
 * Model:
 *   posterior(α, β) — Beta distribution parameters updated by positive/negative signals
 *   mean = α / (α + β)            // expected score in [0, 1]
 *   variance = αβ / ((α+β)²(α+β+1))  // uncertainty — used for trust thresholding
 *
 * Update rule:
 *   positive signal: α ← α + 1
 *   negative signal: β ← β + 1
 *   prior: α = β = 1 (uniform Beta(1,1))
 */

export interface ReputationState {
  peerId: string;
  alpha: number;     // positive signal count + prior
  beta: number;      // negative signal count + prior
  updatedAt: number;
}

export interface ReputationSignal {
  peerId: string;
  positive: boolean;
  weight?: number;   // default 1.0; for partial signals (e.g., minor dispute = 0.5)
  timestamp: number;
}

export function initialReputation(peerId: string): ReputationState {
  return { peerId, alpha: 1, beta: 1, updatedAt: Date.now() };
}

export function applySignal(state: ReputationState, signal: ReputationSignal): ReputationState {
  const w = signal.weight ?? 1.0;
  return signal.positive
    ? { peerId: state.peerId, alpha: state.alpha + w, beta: state.beta, updatedAt: signal.timestamp }
    : { peerId: state.peerId, alpha: state.alpha, beta: state.beta + w, updatedAt: signal.timestamp };
}

export function mean(state: ReputationState): number {
  return state.alpha / (state.alpha + state.beta);
}

export function variance(state: ReputationState): number {
  const sum = state.alpha + state.beta;
  return (state.alpha * state.beta) / (sum * sum * (sum + 1));
}

export class ReputationStore {
  private states = new Map<string, ReputationState>();

  ensure(peerId: string): ReputationState {
    let s = this.states.get(peerId);
    if (!s) {
      s = initialReputation(peerId);
      this.states.set(peerId, s);
    }
    return s;
  }

  update(signal: ReputationSignal): ReputationState {
    const current = this.ensure(signal.peerId);
    const next = applySignal(current, signal);
    this.states.set(signal.peerId, next);
    return next;
  }

  get(peerId: string): ReputationState | undefined {
    return this.states.get(peerId);
  }

  all(): ReputationState[] {
    return Array.from(this.states.values());
  }
}
```

**테스트 커버리지**:

```ts
// packages/credits/src/reputation.test.ts
- initialReputation: mean == 0.5
- applySignal(positive): alpha += 1
- applySignal(negative): beta += 1
- applySignal(weight=0.5): partial update
- mean: monotonic in alpha/beta ratio
- variance: peaks at alpha = beta = 1, decreases with evidence
- ReputationStore.update: idempotent re-update changes state
- ReputationStore.all: returns N entries
```

### 3.2 `packages/credits/src/credit-account.ts` — 4-tier

**출처**: pinkybrain `src/credit_system.py` (16987 bytes, MIT)
**참조 확인**: §3 of IMPORTABLE-SOURCE-MAP.md / 5-2 of INTEGRATED-CODE-PLAN.md

**포트 방식**: Python → TS 변환 (MIT verbatim attribution)

**목표 인터페이스**:

```ts
// packages/credits/src/credit-account.ts

/**
 * 4-tier credit account (pinkybrain src/credit_system.py port).
 *
 * Tiers:
 *   free        : reputation < 0.2  — new peers, grace tokens only
 *   contributor : 0.2 <= r < 0.5    — earns base + reputation-weighted bonus
 *   power       : 0.5 <= r < 0.8    — earns base + monthly_rewards
 *   unlimited   : r >= 0.8          — full monthly_rewards + no spend cap
 */

export type CreditTier = "free" | "contributor" | "power" | "unlimited";

export const BASE_ALLOCATION = 100;
export const CARRY_OVER_PCT = 0.5;
export const REPUTATION_THRESHOLDS = { contributor: 0.2, power: 0.5, unlimited: 0.8 } as const;

export interface CreditAccount {
  peerId: string;
  tier: CreditTier;
  monthlyRewards: number;
  baseAllocation: number;
  carryOverPct: number;
  balance: number;        // current cycle balance (snapshot for hysteresis)
  reputation: number;     // ∈ [0, 1], from ReputationStore
}

export function tierForReputation(reputation: number): CreditTier {
  if (reputation < REPUTATION_THRESHOLDS.contributor) return "free";
  if (reputation < REPUTATION_THRESHOLDS.power) return "contributor";
  if (reputation < REPUTATION_THRESHOLDS.unlimited) return "power";
  return "unlimited";
}

export function monthlyCreditFor(account: CreditAccount): number {
  return account.baseAllocation + Math.floor(account.reputation * account.monthlyRewards);
}

export function applyCarryOver(prevBalance: number, baseAllocation: number): number {
  return Math.floor(prevBalance * CARRY_OVER_PCT) + baseAllocation;
}

export class CreditAccountBook {
  private accounts = new Map<string, CreditAccount>();

  upsert(peerId: string, reputation: number, monthlyRewards = 0): CreditAccount {
    const account: CreditAccount = {
      peerId,
      tier: tierForReputation(reputation),
      monthlyRewards,
      baseAllocation: BASE_ALLOCATION,
      carryOverPct: CARRY_OVER_PCT,
      balance: 0,
      reputation,
    };
    this.accounts.set(peerId, account);
    return account;
  }

  get(peerId: string): CreditAccount | undefined {
    return this.accounts.get(peerId);
  }

  tierOf(peerId: string): CreditTier | undefined {
    return this.accounts.get(peerId)?.tier;
  }

  all(): CreditAccount[] {
    return Array.from(this.accounts.values());
  }
}
```

**테스트 커버리지**:

```ts
// packages/credits/src/credit-account.test.ts
- tierForReputation: 4 boundary cases (0.19, 0.2, 0.5, 0.8)
- monthlyCreditFor: reputation=0 → baseAllocation; reputation=1 → baseAllocation + monthlyRewards
- applyCarryOver: 100 prev → 50 carry + base
- CreditAccountBook.upsert: tier recomputed on reputation change
- CreditAccountBook.tierOf: undefined for unknown peer
```

### 3.3 `packages/credits/src/co-receipt.ts` — 자체 작성

**출처**: **없음 (p2ptokens 패턴만 차용, 코드는 자체 작성)**
**사유**: p2ptokens GitHub repo에 LICENSE 파일 없음 (404) — IMPORTABLE-SOURCE-MAP §1 참조
**결정 필요**: 사용자 확인 (§11)

**목표 인터페이스**:

```ts
// packages/credits/src/co-receipt.ts

/**
 * Co-receipts metering ledger.
 *
 * Pattern reference: p2ptokens (no LICENSE — pattern only, code self-authored).
 * Each resource consumption between two peers produces a signed receipt.
 * A ratio = resources_provided / resources_consumed is maintained per peer.
 * Hysteresis prevents oscillation when ratio hovers near threshold.
 *
 * Design decisions:
 *   - Signatures use libp2p PrivateKey (peerId derivation in-band)
 *   - Receipts are append-only; ratio is a derived cache
 *   - NEWCOMER_GRACE_TOKENS = 100 (prevents cold-start penalization)
 *   - HYSTERESIS_BAND = 0.05 (ratio delta required to flip pay/drain mode)
 */

import type { PrivateKey } from "@libp2p/interface";

export interface CoReceipt {
  id: string;
  payerPeerId: string;
  payeePeerId: string;
  resourceUnits: number;       // compute-seconds, tokens-processed, etc.
  agreedRatio: number;         // ratio agreed at handshake time
  timestamp: number;
  payerSignature: string;      // base64(ed25519_sign(privateKey, receipt-id || resourceUnits))
  payeeSignature?: string;     // optional counter-sign for non-repudiation
}

export const NEWCOMER_GRACE_TOKENS = 100;
export const HYSTERESIS_BAND = 0.05;

export class CoReceiptLedger {
  private receipts = new Map<string, CoReceipt>();
  private ratios = new Map<string, number>();           // peerId → ratio (provided / consumed)
  private graceTokens = new Map<string, number>();       // peerId → remaining grace
  private modeCache = new Map<string, "pay" | "drain">(); // peerId → hysteresis state

  append(receipt: CoReceipt): void {
    this.receipts.set(receipt.id, receipt);
    // Recompute ratio from this peer
    const myProvided = Array.from(this.receipts.values())
      .filter((r) => r.payeePeerId === receipt.payerPeerId)
      .reduce((s, r) => s + r.resourceUnits, 0);
    const myConsumed = Array.from(this.receipts.values())
      .filter((r) => r.payerPeerId === receipt.payerPeerId)
      .reduce((s, r) => s + r.resourceUnits, 0);
    this.ratios.set(receipt.payerPeerId, myConsumed === 0 ? 0 : myProvided / myConsumed);
  }

  ratio(peerId: string): number {
    return this.ratios.get(peerId) ?? 0;
  }

  consumeGrace(peerId: string, tokens: number): boolean {
    const remaining = this.graceTokens.get(peerId) ?? NEWCOMER_GRACE_TOKENS;
    if (remaining < tokens) return false;
    this.graceTokens.set(peerId, remaining - tokens);
    return true;
  }

  /**
   * Hysteresis: flip mode only if ratio has crossed the threshold + band.
   * Prevents thrashing when ratio oscillates around the boundary.
   */
  shouldPay(peerId: string, threshold = 1.0): boolean {
    const ratio = this.ratio(peerId);
    const prev = this.modeCache.get(peerId) ?? "pay";
    if (prev === "pay") {
      const next = ratio < threshold - HYSTERESIS_BAND ? "drain" : "pay";
      this.modeCache.set(peerId, next);
      return next === "pay";
    } else {
      const next = ratio > threshold + HYSTERESIS_BAND ? "pay" : "drain";
      this.modeCache.set(peerId, next);
      return next === "pay";
    }
  }

  size(): number { return this.receipts.size; }
}

export async function signReceipt(
  privateKey: PrivateKey,
  receiptId: string,
  resourceUnits: number,
): Promise<string> {
  // Pattern: ed25519 sign over canonical encoding
  // Implementation deferred to step S3 (signing helper extracted from identity.ts)
  throw new Error("signReceipt: implement in S3 — see §3.1 of identity.ts");
}
```

**테스트 커버리지**:

```ts
// packages/credits/src/co-receipt.test.ts
- CoReceiptLedger.append: ratio computed correctly
- CoReceiptLedger.ratio: 0 for unknown peer
- CoReceiptLedger.consumeGrace: succeed up to NEWCOMER_GRACE_TOKENS, fail beyond
- CoReceiptLedger.shouldPay: hysteresis prevents flipping within band
- CoReceiptLedger.shouldPay: flips when ratio drops below threshold - HYSTERESIS_BAND
```

### 3.4 `packages/p2p/src/trust-verifier.ts` — TOFU + probabilistic

**출처**: HiveBear `crates/hivebear-mesh/src/trust/verification.rs` (4967 bytes, MIT)
**참조 확인**: §2 of IMPORTABLE-SOURCE-MAP.md

**포트 방식**: Rust → TS 변환 (MIT verbatim attribution)

**목표 인터페이스**:

```ts
// packages/p2p/src/trust-verifier.ts

/**
 * TOFU + probabilistic trust verifier (HiveBear crates/hivebear-mesh/src/trust/verification.rs port).
 *
 * Strategy:
 *   - First encounter: trust-on-first-use (TOFU) — accept and record public key
 *   - Subsequent: probabilistic verification based on observed behavior
 *     - successful message roundtrip: positive signal
 *     - protocol violation / disconnect: negative signal
 *
 * Output feeds into PeerReputation (peer-reputation.ts) via callback.
 */

import type { PeerId, PublicKey } from "@libp2p/interface";
import { peerIdFromString } from "@libp2p/peer-id";

export interface VerificationRecord {
  peerId: string;
  publicKey: PublicKey;
  firstSeen: number;
  lastVerified: number;
  verifiedCount: number;
}

export interface VerificationOutcome {
  peerId: string;
  status: "verified" | "tofu" | "unverified" | "mismatch";
  publicKey?: PublicKey;
  reason?: string;
}

export class TrustVerifier {
  private records = new Map<string, VerificationRecord>();

  verify(peerId: string, publicKey: PublicKey): VerificationOutcome {
    const pid = peerIdFromString(peerId);
    const prev = this.records.get(peerId);

    if (!prev) {
      // TOFU: trust first observation
      this.records.set(peerId, {
        peerId,
        publicKey,
        firstSeen: Date.now(),
        lastVerified: Date.now(),
        verifiedCount: 1,
      });
      return { peerId, status: "tofu", publicKey };
    }

    // Compare keys (deep equality on the multihash / bytes)
    const prevKeyBytes = prev.publicKey.raw;
    const newKeyBytes = publicKey.raw;
    if (prevKeyBytes.length !== newKeyBytes.length ||
        !prevKeyBytes.every((b, i) => b === newKeyBytes[i])) {
      return { peerId, status: "mismatch", reason: "public key changed" };
    }

    prev.lastVerified = Date.now();
    prev.verifiedCount += 1;
    return { peerId, status: "verified", publicKey };
  }

  isKnown(peerId: string): boolean {
    return this.records.has(peerId);
  }

  get(peerId: string): VerificationRecord | undefined {
    return this.records.get(peerId);
  }

  remove(peerId: string): boolean {
    return this.records.delete(peerId);
  }
}
```

**테스트 커버리지**:

```ts
// packages/p2p/src/trust-verifier.test.ts
- verify(first time): returns "tofu" + records key
- verify(same key): returns "verified", increments count
- verify(different key): returns "mismatch"
- isKnown / get / remove round-trip
```

### 3.5 `packages/p2p/src/peer-reputation.ts` — subject-scoped

**출처**: folklore `src/domain/peer-reputation.ts` (14922 bytes, MIT) + `src/infrastructure/peer-reputation-store.ts`
**참조 확인**: §4 of IMPORTABLE-SOURCE-MAP.md

**포트 방식**: TS → TS (verbatim + adaptation)

**목표 인터페이스**:

```ts
// packages/p2p/src/peer-reputation.ts

/**
 * Subject-scoped peer reputation (folklore src/domain/peer-reputation.ts port).
 *
 * Reputation is per-(subject, peer) pair — same peer can have different
 * reputation scores for different resources/services (e.g., a peer may be
 * reliable for chat but unreliable for compute).
 *
 * Subject is a string identifier; default subject is "*" (catch-all).
 */

import type { ReputationSignal, ReputationState, ReputationStore } from "@agentmesh/credits";

export interface PeerReputation {
  subject: string;
  peerId: string;
  score: number;             // ∈ [0, 1]
  variance: number;          // uncertainty
  updatedAt: number;
}

export class PeerReputationRegistry {
  // subject → peerId → ReputationState
  private states = new Map<string, Map<string, ReputationState>>();
  private reputationStore: ReputationStore;

  constructor(store?: ReputationStore) {
    this.reputationStore = store ?? new ReputationStore();
  }

  update(subject: string, signal: ReputationSignal): { score: number; variance: number } {
    let subjectMap = this.states.get(subject);
    if (!subjectMap) {
      subjectMap = new Map();
      this.states.set(subject, subjectMap);
    }
    const state = this.reputationStore.update({ ...signal, peerId: signal.peerId });
    subjectMap.set(signal.peerId, state);
    return {
      score: state.alpha / (state.alpha + state.beta),
      variance: (state.alpha * state.beta) / Math.pow(state.alpha + state.beta, 2) / (state.alpha + state.beta + 1),
    };
  }

  reputationFor(subject: string, peerId: string): PeerReputation | undefined {
    const subjectMap = this.states.get(subject);
    const state = subjectMap?.get(peerId);
    if (!state) return undefined;
    return {
      subject,
      peerId,
      score: state.alpha / (state.alpha + state.beta),
      variance: (state.alpha * state.beta) / Math.pow(state.alpha + state.beta, 2) / (state.alpha + state.beta + 1),
      updatedAt: state.updatedAt,
    };
  }

  subjectsForPeer(peerId: string): string[] {
    const out: string[] = [];
    for (const [subject, m] of this.states) {
      if (m.has(peerId)) out.push(subject);
    }
    return out;
  }
}
```

**테스트 커버리지**:

```ts
// packages/p2p/src/peer-reputation.test.ts
- update: creates subject map on first signal
- update: same peer in two subjects → independent scores
- reputationFor: undefined for unknown subject
- reputationFor: returns score ∈ [0, 1]
- subjectsForPeer: returns subjects where peer has signals
```

---

## 4. 통합 순서 (5단계)

각 step은 **독립적으로 revert 가능**하도록 git tag를 단다.

### S1 — types & shared interfaces (~30 LOC, no deps)

**산출물**:
- `packages/credits/src/reputation.ts` — types만 (no impl yet) → **§3.1 전체**

**왜 먼저**: 다른 모든 모듈이 `ReputationSignal`, `ReputationState`를 import해야 함.

**검증**:
```bash
pnpm -F @agentmesh/credits typecheck   # 0 errors
```

**Rollback**: `git reset --hard tag/phase2-s1-types` — reputation.ts 단일 파일 revert.

---

### S2 — credit-account tier mapping (~50 LOC, depends on S1)

**산출물**:
- `packages/credits/src/credit-account.ts` — **§3.2 전체**
- `packages/credits/src/credit-account.test.ts` — vitest

**왜 두 번째**: tier 함수는 reputation의 mean을 사용하지만, Bayesian-EMA 자체는 아직 WIP여도 됨 (mock으로 대체).

**검증**:
```bash
pnpm -F @agentmesh/credits test src/credit-account.test.ts
pnpm -F @agentmesh/credits typecheck
```

**Rollback**: S2 tag → credit-account.ts + test.ts revert.

---

### S3 — co-receipt ledger (~120 LOC, depends on S1+S2)

**산출물**:
- `packages/credits/src/co-receipt.ts` — **§3.3 전체**
- `packages/credits/src/co-receipt.test.ts` — vitest (signReceipt는 deferred, mark with skip)

**왜 세 번째**: reputation tier 결과(`CreditTier`)를 consume하여 ratio 기반 decision에 사용.

**sub-task**: `signReceipt` 구현 — `identity.ts`에서 ed25519 sign helper 추출 (`@noble/curves/ed25519.sign`).

**검증**:
```bash
pnpm -F @agentmesh/credits test
```

**Rollback**: S3 tag → co-receipt.ts + test.ts revert.

---

### S4 — trust-verifier (~80 LOC, no credits dep)

**산출물**:
- `packages/p2p/src/trust-verifier.ts` — **§3.4 전체**
- `packages/p2p/src/trust-verifier.test.ts` — vitest
- `packages/p2p/src/index.ts` — export 추가

**왜 네 번째**: p2p 패키지 단독 검증 가능 (credits 무관). PeerCatalog의 이벤트와 연결 준비.

**검증**:
```bash
pnpm -F @agentmesh/p2p typecheck
pnpm -F @agentmesh/p2p test
```

**Rollback**: S4 tag → trust-verifier.ts + test.ts + index.ts (3 files) revert.

---

### S5 — peer-reputation wiring + integration (~100 LOC, depends on S1+S4)

**산출물**:
- `packages/p2p/src/peer-reputation.ts` — **§3.5 전체**
- `packages/p2p/src/peer-reputation.test.ts` — vitest
- `packages/p2p/src/transport.ts` — `peer:connect` 핸들러에서 `TrustVerifier.verify()` + `PeerReputationRegistry.update()` 호출 추가
- `packages/p2p/src/index.ts` — exports 추가
- `packages/p2p/package.json` — `@agentmesh/credits: "workspace:*"` 의존성 추가 (type-only)

**왜 마지막**: 모든 primitive가 갖춰진 후 wiring.

**주의**: p2p → credits 의존성 추가는 **type-only** (runtime import 없음). 빌드 시점에 tsc가 트리쉐이크하여 runtime은 무관.

**검증**:
```bash
pnpm -F @agentmesh/p2p typecheck
pnpm -F @agentmesh/p2p test
pnpm -F @agentmesh/credits test
pnpm -r typecheck
```

**Rollback**: S5 tag → transport.ts, peer-reputation.ts revert + package.json deps revert.

---

## 5. License attribution matrix

| 모듈 | 출처 | 라이선스 | 표기 의무 |
|---|---|---|---|
| `reputation.ts` | HiveBear `trust/reputation.rs` | MIT | 파일 상단 attribution 주석 |
| `credit-account.ts` | pinkybrain `credit_system.py` | MIT | 파일 상단 attribution 주석 |
| `trust-verifier.ts` | HiveBear `trust/verification.rs` | MIT | 파일 상단 attribution 주석 |
| `peer-reputation.ts` | folklore `domain/peer-reputation.ts` | MIT | 파일 상단 attribution 주석 |
| `co-receipt.ts` | 자체 작성 (p2ptokens 패턴만 차용) | — | p2ptokens 표기 불필요 (코드 차용 없음) |

**표기 템플릿** (각 파일 상단):

```ts
/**
 * Ported from <repo> <path> (<commit-hash or release>)
 * Original: <copyright-line from LICENSE>
 * License: MIT (verbatim port — attribution preserved per MIT §4(b))
 *
 * Local changes:
 *   - <bullet 1>
 *   - <bullet 2>
 */
```

**peerd / agentfm (Apache-2.0)은 사용하지 않음** — IMPORTABLE-SOURCE-MAP.md §3 참조.

**p2ptokens / p2pclaw (LICENSE 부재)** — 코드 차용 0건, 패턴 reference만 (co-receipt.ts의 hysteresis + grace tokens 패턴은 자체 작성).

---

## 6. 테스트 전략

### 6.1 단위 테스트 (vitest, 각 모듈별)

| 모듈 | 테스트 파일 | 케이스 수 (목표) |
|---|---|---|
| `reputation.ts` | `reputation.test.ts` | 8 |
| `credit-account.ts` | `credit-account.test.ts` | 6 |
| `co-receipt.ts` | `co-receipt.test.ts` | 5 |
| `trust-verifier.ts` | `trust-verifier.test.ts` | 4 |
| `peer-reputation.ts` | `peer-reputation.test.ts` | 5 |

**총 28 케이스** — 모든 케이스가 외부 IO 없이 in-memory.

### 6.2 통합 테스트 (멀티 peer)

`packages/p2p/src/tests/integration/peer-reputation-flow.test.ts` (S5 완료 후):

```
시나리오:
  1. peer A, B, C 생성 (3개 TransportHandle)
  2. A.discover(B) → B.discover(A)
  3. expect: TrustVerifier에 A↔B TOFU 등록
  4. B가 A에게 5회 positive signal 발송
  5. expect: PeerReputationRegistry["*"].reputationFor(A, B).score > 0.5
  6. A disconnect → reconnect (같은 키)
  7. expect: status="verified", verifiedCount 증가
  8. 같은 peerId, 다른 키로 재접속 시도
  9. expect: status="mismatch", reputation 감소
```

### 6.3 회귀 테스트

기존 15/15 tests + 신규 28 tests = **43 tests** 모두 pass 필요.

```bash
pnpm -F @agentmesh/p2p test
pnpm -F @agentmesh/credits test
```

---

## 7. 위험 + 완화

| 위험 | 영향 | 완화 |
|---|---|---|
| HiveBear Rust API가 TS와 의미 불일치 | reputation 계산 오류 | mean/variance 단위 테스트 + golden value (3 fixed input → fixed output) |
| pinkybrain 4-tier boundary가 reputation.mean과 불일치 | tier 플립핑 | INTEGRATED-CODE-PLAN §10.2 그대로 (0.2/0.5/0.8) — 변경 시 ADR 필요 |
| co-receipt `signReceipt` 의존성 | S3 blocked | S3에서는 skip + S3.5 (helper 추출)로 분리, 또는 `identity.ts`에서 inline import |
| p2p → credits 의존성 cycle | 빌드 실패 | type-only import + `verbatimModuleSyntax` + 트리쉐이크 검증 |
| folklore peer-reputation 14922B가 너무 큰 port | LOC 폭증 | §3.5는 interface만, 구현은 `ReputationStore`에 위임 (~100 LOC) |
| p2ptokens 패턴 차용이 저작권 경계 모호함 | LICENSE 위험 | §3 결정 — 코드 0건 차용, 패턴 reference만 (§11 사용자 확인) |
| Bayesian-EMA variance 공식 오류 | trust threshold 오작동 | §3.1 공식 + golden test로 검증 |
| Hysteresis band 너무 좁음/넓음 | thrashing / mode deadlock | HYSTERESIS_BAND = 0.05 (기본값), 테스트로 검증 |

---

## 8. Rollback Plan

### 8.1 모듈 단위 롤백

각 step 완료 시 git tag:
- `tag/phase2-s1-types`
- `tag/phase2-s2-credit-account`
- `tag/phase2-s3-co-receipt`
- `tag/phase2-s4-trust-verifier`
- `tag/phase2-s5-peer-reputation-wiring`

문제 발견 시 `git reset --hard tag/phase2-s{n}` — 이전 step까지 복원.

### 8.2 부분 롤백 (한 모듈만)

```bash
git checkout tag/phase2-s3 -- packages/credits/src/co-receipt.ts
git checkout tag/phase2-s3 -- packages/credits/src/co-receipt.test.ts
```

### 8.3 완전 롤백

```bash
git checkout main -- packages/credits/src/
git checkout main -- packages/p2p/src/peer-reputation.ts packages/p2p/src/trust-verifier.ts
git checkout main -- packages/p2p/package.json
```

M1+M2 (transport, identity, peer-catalog, bandwidth, pubsub)는 영향 없음 — 이 플랜은 순수 additive.

### 8.4 DB 마이그레이션 (해당 시)

co-receipt ledger + credit-account는 in-memory only (현재 스펙). Phase 4에서 Prisma 테이블 추가 시:
- `prisma migrate dev --name phase2_credits`
- 마이그레이션 파일을 `db/migrations/` 에 저장
- 적용 전 `pnpm db:studio`로 기존 스키마 백업

---

## 9. 검증 명령 (재현성)

전체 통합 후 다음 명령으로 회귀 검증:

```bash
# 1. 타입 체크
pnpm -F @agentmesh/credits typecheck
pnpm -F @agentmesh/p2p typecheck
pnpm -r typecheck

# 2. 단위 테스트
pnpm -F @agentmesh/credits test
pnpm -F @agentmesh/p2p test

# 3. 빌드
pnpm -F @agentmesh/credits build
pnpm -F @agentmesh/p2p build

# 4. License 헤더 검증 (모든 새 파일 상단에 attribution)
grep -l "Ported from" packages/credits/src/{reputation,credit-account,co-receipt}.ts
grep -l "Ported from" packages/p2p/src/{trust-verifier,peer-reputation}.ts

# 5. p2ptokens/p2pclaw 코드 차용 0건 검증
grep -r "p2ptokens\|p2pclaw" packages/credits/src/ packages/p2p/src/  # 결과: 0건 (README 주석 제외)

# 6. 토폴로지 검증 (p2p → credits는 type-only)
grep -r "from \"@agentmesh/credits\"" packages/p2p/src/*.ts | grep -v "// type-only"  # runtime import 0건
```

---

## 10. 체크리스트

### Phase 2a (Credits)

- [ ] S1.1 `packages/credits/src/reputation.ts` 작성 (§3.1)
- [ ] S1.2 `reputation.test.ts` 8/8 pass
- [ ] S2.1 `packages/credits/src/credit-account.ts` 작성 (§3.2)
- [ ] S2.2 `credit-account.test.ts` 6/6 pass
- [ ] S2.3 `pnpm -F @agentmesh/credits typecheck` 0 errors

### Phase 2b (Co-receipt)

- [ ] S3.1 사용자 확인 — 자체 작성 결정 (§11)
- [ ] S3.2 `packages/credits/src/co-receipt.ts` 작성 (§3.3)
- [ ] S3.3 `co-receipt.test.ts` 5/5 pass
- [ ] S3.4 `signReceipt` helper in `identity.ts` or `co-receipt.ts` (skip 없이)
- [ ] S3.5 `pnpm -F @agentmesh/credits test` all green

### Phase 2c (P2P trust)

- [ ] S4.1 `packages/p2p/src/trust-verifier.ts` 작성 (§3.4)
- [ ] S4.2 `trust-verifier.test.ts` 4/4 pass
- [ ] S4.3 `packages/p2p/src/index.ts` export 추가
- [ ] S4.4 `pnpm -F @agentmesh/p2p test` all green (기존 15 + 신규 4)

### Phase 2c wiring

- [ ] S5.1 `packages/p2p/src/peer-reputation.ts` 작성 (§3.5)
- [ ] S5.2 `peer-reputation.test.ts` 5/5 pass
- [ ] S5.3 `packages/p2p/src/transport.ts` — `peer:connect` 핸들러에 `TrustVerifier.verify()` + `PeerReputationRegistry.update()` 추가
- [ ] S5.4 `packages/p2p/package.json` — `@agentmesh/credits: "workspace:*"` 추가 (type-only)
- [ ] S5.5 `pnpm -r typecheck` 0 errors
- [ ] S5.6 모든 테스트 통과 (43/43)
- [ ] S5.7 grep 검증 — license attribution 5/5, p2ptokens/p2pclaw 코드 차용 0건
- [ ] S5.8 통합 테스트 — 3-peer 시나리오 pass

### Phase 3 (deferred — 다음 플랜)

- [ ] HiveBear 5-tier ContributionTier (별도 ADR)
- [ ] folklore reputation-store persistence layer (Prisma + Redis 옵션)
- [ ] payment-mesh libp2p 통합 (Phase 4+)

---

## 11. 사용자 확인 필요

### D-Phase2-1: co-receipt 자체 작성 결정

**사안**: `packages/credits/src/co-receipt.ts`의 출처 표기

**옵션**:
- **A. 자체 작성 (권장)** — 패턴 reference만 (hysteresis + grace tokens), 코드 0건 차용
  - 장점: LICENSE 위험 0, ADR-0003 §1 결정과 일치
  - 단점: 디자인 결정 전부 우리 책임
- **B. 패턴 + 공식 reference 링크 명시** — `co-receipt.ts` 상단에 "design inspired by p2ptokens (no LICENSE — pattern reference only)" 주석
  - 장점: 출처 투명성
  - 단점: 라이선스 부재 repo reference에 대한 회사 정책 확인 필요
- **C. p2ptokens repo fork + LICENSE 추가 요청** — upstream에 PR
  - 장점: 정식 attribution 가능
  - 단점: 1~2주 지연, upstream 응답 불확실

**권고**: **A** — INTEGRATED-CODE-PLAN.md §11 (비-차용 결정)에 명시된 "p2ptokens: BitTorrent-style ratio → Phase 4+ 이연" 정신과 일치. co-receipts만 즉시 통합하지만 코드 차용 0건.

**확인 요청**: A로 진행해도 되는지?

**사용자 결정 (2026-09-07)**: ✅ **A 채택** — `co-receipt.ts` 자체 작성으로 진행.

**이유**:
- ADR-0003 §1의 LICENSE 검증 결과와 일치 (p2ptokens는 LICENSE 부재로 concept-only)
- INTEGRATED-CODE-PLAN.md §11의 "p2ptokens: BitTorrent-style ratio → Phase 4+ 이연" 정신 유지
- co-receipts의 hysteresis + grace tokens 패턴은 일반적인 ledger 디자인 패턴으로 자체 작성 가능
- 향후 p2ptokens이 LICENSE를 추가할 경우 attribution 보강 가능 (현재 시점에서는 보류)

**결과**: `packages/credits/src/co-receipt.ts` 상단에 "Pattern reference: p2ptokens (no LICENSE — design inspired by)" 주석만 표기. 코드 차용 0건.

---

## 12. 다음 단계 (이번 세션 이후)

| # | Action |
|---|---|
| 1 | 사용자 확인 대기 (§11) |
| 2 | S1 시작 — `reputation.ts` + types (D-Phase2-1 확인 후) |
| 3 | git tag `phase2-s1-types` |
| 4 | S2 → S3 → S4 → S5 순차 진행 |
| 5 | 모든 step 완료 후 `INTEGRATED-CODE-PLAN.md` §13 (체크리스트 #18~19) → 완료 표시 |
| 6 | Phase 3 (5-tier ContributionTier + persistence) 별도 플랜 작성 |

---

**문서 종료**. 다음 작업은 사용자 확인 후 S1 시작.
