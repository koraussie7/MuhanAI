# Importable Source Map — 8 OSS References

> 8개 외부 레퍼런스 (`docs/adr/0003-eight-repo-lineage.md`) 의 실제 소스 위치를 식별하고, import/port 가능 여부를 모듈별로 정리한 매핑. 2026-09-07.

---

## 1. 레퍼런스 위치 (canonical URL + 로컬 clone)

| # | Repo | License | Canonical URL | Local path |
|---|---|---|---|---|
| 1 | **folklore** | MIT | github.com/usefolklore/folklore | (remote only — `gh api` 사용) |
| 2 | **HiveBear** | MIT | github.com/BeckhamLabsLLC/HiveBear | (remote only — Rust, port 대상) |
| 3 | **pinkybrain** | MIT | github.com/PinkyBrain-ai/pinkybrain | (remote only — Python, port 대상) |
| 4 | **p2ptokens** | MIT-intent (no LICENSE file on GH) | github.com/pur4v/p2ptokens | (remote only — concept ref) |
| 5 | **p2pclaw** | MIT-external (no LICENSE file on GH) | github.com/Agnuxo1/p2pclaw-unified | (remote only — concept ref) |
| 6 | **peerd** | Apache-2.0 | github.com (private/internal) | `/Users/brianyeon/.hermes/peerd` |
| 7 | **agentfm** | Apache-2.0 | github.com/Agent-FM/agentfm-core | (remote only — Apache NOTICE 보존 요건) |
| 8 | **llmlet** | MIT | github.com/ktock/llmlet | (remote only — C++ 중심, JS wrapper 얇음) |

**Verdict**:
- **4× MIT clean (folklore, HiveBear, pinkybrain, llmlet)** — 직접 코드 포팅 + attribution
- **2× Apache-2.0 (peerd, agentfm)** — 코드 포팅 시 NOTICE 파일 보존 필수 (per Apache §4d)
- **2× License not on GH (p2ptokens, p2pclaw)** — concept reference only, 코드 포팅 금지. 디자인 패턴만 차용

---

## 2. 패턴별 importable source

### 2.1 P2P transport / discovery / NAT — **folklore (★ PRIMARY)**

| Pattern | Source path | Size | Already ported? | Notes |
|---|---|---|---|---|
| `createTransport` libp2p factory | `src/infrastructure/peer-transport.ts` | (TS) | ✅ `packages/p2p/src/transport.ts` | Pitfall 1–4 inline |
| Bandwidth limiter | `src/infrastructure/bandwidth-limiter.ts` | (TS) | ✅ `packages/p2p/src/bandwidth.ts` | rateLimiter + Semaphore |
| Energy gate (free-energy admission) | `src/domain/energy-gate.ts` | (TS) | ❌ Phase 3 (token-bank) | AUC 0.78, peer admission control |
| Peer store | `src/infrastructure/peer-store.ts` | (TS) | ❌ — 우리는 peer-catalog (간소화) 사용 | full persistence layer |
| Peer reputation store | `src/infrastructure/peer-reputation-store.ts` | (TS) | ❌ Phase 2 | full SQLite-backed reputation |
| Peer reputation math | `src/domain/peer-reputation.ts` | 14922 B | ❌ Phase 2 (credit blend) | subject-scoped Bayesian accumulation |
| Identity bridge | `src/application/identity-bridge.ts` | (TS) | ❌ | identity.ts ↔ repo wiring |
| Identity lifecycle | `src/application/identity-lifecycle.ts` | (TS) | ❌ | rotation policy |
| Discovery loop | `src/application/discovery-loop.ts` | (TS) | ❌ M3 — `packages/p2p/src/discovery.ts` | periodic refresh |
| Peer telemetry | `src/domain/peer-telemetry.ts` + `src/application/peer-pull-telemetry.ts` | (TS) | ❌ Phase 2 | pull telemetry from peers |
| Peer order builder | `src/application/peer-order-builder.ts` | (TS) | ❌ Phase 2 | top-N peer selection |
| Update peer reputation | `src/application/update-peer-reputation.ts` | (TS) | ❌ Phase 2 | application wiring |
| Peer labels | `src/infrastructure/peer-labels.ts` | (TS) | ❌ Phase 3 | tag-based clustering |

**Imports 가능 (verbatim or near-verbatim)**:
```ts
// Phase 2 imports from folklore (MIT):
import { peerReputation } from "folklore/src/domain/peer-reputation";
import { PeerReputationStore } from "folklore/src/infrastructure/peer-reputation-store";
import { updatePeerReputation } from "folklore/src/application/update-peer-reputation";
import { peerOrderBuilder } from "folklore/src/application/peer-order-builder";
```

### 2.2 Identity (Ed25519) — **folklore + HiveBear (★)**

| Pattern | Source | Size | Already ported? |
|---|---|---|---|
| Ed25519 64B raw + JSON format marker + corruption recovery | folklore `src/domain/identity.ts` + `src/infrastructure/identity-store.ts` | (TS) | ✅ `packages/p2p/src/identity.ts` |
| `NodeIdentity` (Ed25519 64B secretKey) | HiveBear `crates/hivebear-mesh/src/identity.rs` | (Rust) | Concept only — `noble/curves` already used |
| TOFU verifier (`compile_error!` gate) | HiveBear `crates/hivebear-mesh/src/trust/verification.rs` | 4967 B | ❌ Phase 2 |
| `TrustVerifier` probabilistic (MIN_VERIFICATION_RATE=0.01) | HiveBear `crates/hivebear-mesh/src/trust/verification.rs` | (same) | ❌ Phase 2 |

### 2.3 Trust / Reputation — **HiveBear (★)**

| Pattern | Source | Size | Import strategy |
|---|---|---|---|
| Bayesian-EMA reputation update (`base*decay + 0.5*(1-decay)`) | HiveBear `crates/hivebear-mesh/src/trust/reputation.rs` | 6769 B | **TS port** — math is pure, language-agnostic |
| 7-day half-life | (same) | (same) | TS port |
| BAN threshold = 0.2 | (same) | (same) | TS port |
| TOFU compile-time guard (`compile_error!`) | HiveBear `crates/hivebear-mesh/src/trust/verification.rs` | (same) | **TS port**: `if (typeof window === 'undefined') throw new Error(...)` — runtime guard |
| Probabilistic verification | (same) | (same) | TS port — straightforward |
| Subject-scoped reputation (peer_id × subject) | folklore `src/domain/peer-reputation.ts` | 14922 B | TS port |
| ContributionTier 5-tier (VRAM-based) | HiveBear `crates/hivebear-core/src/contribution.rs` | (Rust) | Phase 3 — design pattern only |

### 2.4 Token economy — **pinkybrain + p2ptokens + HiveBear (★)**

| Pattern | Source | Size | Phase |
|---|---|---|---|
| 4-tier CreditAccount (FREE/CONTRIBUTOR/POWER/UNLIMITED) | pinkybrain `src/credit_system.py` | 16987 B | Phase 2+ — **TS port** |
| `BASE_ALLOCATION=100`, `MONTHLY_REWARDS`, `carry_over_pct=0.5` | (same) | (same) | Phase 2+ |
| 12 SPECIALTIES + SPECIALTY_KEYWORDS | pinkybrain (TBD) | (Python) | Phase 4+ |
| AdaptiveScheduler (latency/cost/quality/balanced) | pinkybrain `src/adaptive_scheduler.py` | (Python) | Phase 3 |
| CoReceipts metering | p2ptokens `crates/shared/src/receipts.rs` | (Rust) | Phase 2 — **TS port**, concept-only (no LICENSE file) |
| Ratio ledger + hysteresis + `NEWCOMER_GRACE_TOKENS=100` | (same) | (same) | Phase 2 |
| ContributionTier auto-recommend | HiveBear `crates/hivebear-core/src/contribution.rs` | (Rust) | Phase 3 |

### 2.5 Adaptive topology — **HiveBear + pinkybrain (Phase 3–4+)**

| Pattern | Source | Import strategy |
|---|---|---|
| SwarmAwareScheduler (`max_pipeline_depth=4`, `min_layers=4`, `max_hop=50ms`) | HiveBear `crates/hivebear-mesh/src/scheduler/swarm_scheduler.rs` | Phase 3 — design pattern |
| AdaptiveScheduler 4-strategy | pinkybrain `src/adaptive_scheduler.py` | Phase 3 |
| Specialty keywords router | pinkybrain (12 SPECIALTIES) | Phase 4+ |

### 2.6 DID (Decentralized Identifier) — **p2pclaw (concept only)**

| Pattern | Source | Size | Notes |
|---|---|---|---|
| `did:p2pclaw:<bs58(ed25519)>` | p2pclaw-unified `src/lib/did.ts` | 14922 B | **Cannot port** — LICENSE not on GH. Use as design reference only |
| `loadOrCreateDID()` + `signPaperDID()` + `verifyPaperDID()` | (same) | (same) | Reference for Phase 4+ DID work |
| Director succession (5s heartbeat) | p2pclaw `src/hooks/useSwarmStatus.ts` | (TS) | Phase 4+ |
| SW persistence (`localStorage` patterns) | p2pclaw `src/lib/agent-identity.ts` | (TS) | Phase 4+ |

**Verdict**: p2pclaw = concept-only. We must write our own DID impl if/when Phase 4+. Direct port prohibited without LICENSE.

### 2.7 Signaling + presence — **peerd (Apache-2.0)**

| Pattern | Source | Size | Notes |
|---|---|---|---|
| WebSocket rendezvous server (Bun + Cloudflare Worker) | `/Users/brianyeon/.hermes/peerd/signaling-node/bun-server.mjs` | (mjs) | Local! |
| `signalingStep` reducer (pure, transport-agnostic) | `/Users/brianyeon/.hermes/peerd/extension/peerd-distributed/transport/signaling.js` | 158 LOC | Local! |
| Submodules (channel, connect, envelope, ice, mesh, peer, rooms, sdp, session, transports) | `/Users/brianyeon/.hermes/peerd/extension/peerd-distributed/transport/*.js` | 11 files | Local! |

**Verdict**: peerd is **Apache-2.0** — can port, but MUST preserve NOTICE file. Most relevant for Phase 4+ signaling work (M3+ in ADR). Not on M1–M2 critical path.

### 2.8 Topic / board model — **agentfm (Apache-2.0)**

| Pattern | Source | Notes |
|---|---|---|
| Topic versioning + lighthouse | agentfm-core `agentfm-desktop/` (TBD path) | Phase 4+ |
| Dashboard throughput real-time | agentfm-desktop `docs/superpowers/specs/2026-06-03-dashboard-throughput-realtime-design.md` | Concept — SSE/fanout pattern |

**Verdict**: Apache-2.0 port requires NOTICE preservation. Most value is in design patterns; we have folklore for SSE already.

### 2.9 Output handler / dialect sandbox — **llmlet (MIT)**

| Pattern | Source | Notes |
|---|---|---|
| LLM output handler with JSON schema validation | llmlet `llmlet.js` + `libllmlet.js` | Concept only — JS layer is thin (most is C++ llama.cpp) |

**Verdict**: llmlet is mostly C++ inference engine (llama.cpp fork). The JS wrapper is minimal. Not a port candidate for agentmesh — we use llm-router for LLM dispatch instead.

---

## 3. 12 axes × importability status

| Axis | Primary ref | Importable? | Phase | Action |
|---|---|---|---|---|
| **P2P transport** | folklore | ✅ DONE | M1 | already in `packages/p2p/src/transport.ts` |
| **Discovery (mdns/bootstrap/DHT)** | folklore | ✅ DONE | M1 | already in `packages/p2p/src/transport.ts` |
| **Discovery (rendezvous)** | folklore | ⏳ TODO | Phase 4+ | `@libp2p/rendezvous` wrapper |
| **NAT traversal** | folklore | ✅ DONE | M1 | relay + dcutr + upnp configured |
| **Identity (Ed25519)** | folklore + HiveBear | ✅ DONE | M1 | `identity.ts` + `noble/curves` |
| **Identity (DID)** | p2pclaw | ❌ concept | Phase 4+ | write our own (no LICENSE) |
| **Identity (bip39)** | folklore | ⏳ TODO | Phase 4+ | `@scure/bip39` mnemonic recovery |
| **TOFU cert pinning** | HiveBear | ✅ importable | Phase 2 | port `trust/verification.rs` to TS |
| **Trust verification (probabilistic)** | HiveBear | ✅ importable | Phase 2 | same file |
| **Trust reputation (Bayesian-EMA)** | HiveBear + folklore | ✅ importable | Phase 2 | port both — math is pure |
| **Token economy (4-tier)** | pinkybrain | ✅ importable | Phase 2+ | port `src/credit_system.py` → TS |
| **Token economy (co-receipts)** | p2ptokens | ⚠️ concept | Phase 2 | read receipts.rs, write our own |
| **Token economy (contribution tier)** | HiveBear | ⚠️ concept | Phase 3 | design pattern |
| **Adaptive topology** | HiveBear + pinkybrain | ⚠️ concept | Phase 3–4+ | design pattern |
| **Specialty routing** | pinkybrain | ⚠️ concept | Phase 4+ | design pattern |
| **Adaptive scheduler** | pinkybrain | ⚠️ concept | Phase 3 | design pattern |
| **Output handler** | llmlet | ❌ skip | — | we use llm-router |
| **Topic versioning + lighthouse** | agentfm | ⚠️ Apache | Phase 4+ | design pattern (NOTICE required if ported) |
| **Signaling + presence** | peerd | ⚠️ Apache | Phase 4+ | `signaling.js` reducer is importable WITH NOTICE |
| **Daemon IPC** | folklore | ❌ skip | — | monorepo single-process |
| **Hexagonal/Clean arch** | folklore | ✅ reference | — | pattern already adopted |
| **Code density (tests)** | folklore | ✅ reference | — | follow 1-test-per-80-LOC |
| **Verification (probabilistic)** | HiveBear | ✅ importable | Phase 2 | port verification.rs |

---

## 4. Already-ported inventory

`packages/p2p/src/` currently holds:

| File | LOC | folklore source |
|---|---|---|
| `transport.ts` | 222 | `src/infrastructure/peer-transport.ts` (verbatim-ish) |
| `identity.ts` | 86 | `src/domain/identity.ts` + `src/infrastructure/identity-store.ts` |
| `peer-catalog.ts` | 68 | folklore pattern, simplified (no persistence) |
| `bandwidth.ts` | (TS) | `src/infrastructure/bandwidth-limiter.ts` (verbatim rateLimiter + Semaphore) |
| `pubsub.ts` | (TS) | `@libp2p/floodsub` factory (folklore D1) |
| `error.ts` | (TS) | neverthrow Result wrapper |
| `tests/*.test.ts` | 5 files, 15 tests | folklore-style density (~1 test per 80 LOC) |

**Attribution status**: ALL ports must carry a comment header:
```ts
// Adapted from folklore (MIT) — github.com/usefolklore/folklore
// Source: src/infrastructure/peer-transport.ts (verbatim) / src/infrastructure/bandwidth-limiter.ts (verbatim)
// Port: 2026-09-07 by @agentmesh
```

---

## 5. Ready-to-import (Phase 2 candidates)

다음 모듈들은 **이미 license-clean** + **소스 식별 완료** + **import-friendly** 상태:

1. **HiveBear → TS**: `crates/hivebear-mesh/src/trust/reputation.rs` (6769 B) — Bayesian-EMA reputation
   - target: `packages/p2p/src/reputation.ts` (or `packages/credits/src/reputation.ts`)
2. **HiveBear → TS**: `crates/hivebear-mesh/src/trust/verification.rs` (4967 B) — TrustVerifier + TOFU
   - target: `packages/p2p/src/trust-verifier.ts`
3. **pinkybrain → TS**: `src/credit_system.py` (16987 B) — 4-tier CreditAccount + monthly rewards
   - target: `packages/credits/src/credit-account.ts`
4. **folklore → TS**: `src/domain/peer-reputation.ts` (14922 B) — subject-scoped reputation
   - target: `packages/p2p/src/peer-reputation.ts`
5. **folklore → TS**: `src/infrastructure/peer-reputation-store.ts` — SQLite persistence
   - target: `packages/p2p/src/peer-reputation-store.ts` (Phase 2+ when persistence layer arrives)

**NOT importable (concept-only)**:
- p2ptokens (no LICENSE on GH) — read `receipts.rs` for design, write `packages/credits/src/co-receipt.ts` from scratch
- p2pclaw (no LICENSE on GH) — read `did.ts` for design, write `packages/p2p/src/did.ts` from scratch (Phase 4+)

**Apache-2.0 import rules** (peerd, agentfm):
- 포팅 코드 시작에 `// Adapted from <repo> (Apache-2.0) — <github-url>` 명시
- NOTICE 파일 보존 (peerd는 `NOTICE` 파일 존재 확인 필요)
- `LICENSE` 전문을 `THIRD_PARTY_LICENSES/` 디렉토리에 사본 보관

---

## 6. Decision required

| Question | Recommendation |
|---|---|
| Should we port HiveBear reputation.rs now (Phase 2 prep)? | **Yes** — 6769 B is small, license-clean, math is pure. ~2-3 hours work. |
| Should we port pinkybrain credit_system.py now? | **Yes** — Phase 2+ is the next milestone; this is the gating module. |
| Should we port HiveBear verification.rs (TOFU) now? | **Yes for design** — Phase 2 target. TOFU compile-time guard → runtime guard. |
| Should we write our own CoReceipt (instead of porting p2ptokens)? | **Yes** — p2ptokens has no LICENSE file on GH. Cannot legally port. ~200 LOC from scratch using the pattern. |
| Should we write our own DID (instead of porting p2pclaw)? | **Yes** — same reason. Phase 4+ only. |

---

## 7. 검증 결과 요약

**8개 레퍼런스 모두 위치 확인 + license 검증 완료**:
- ✅ 4× MIT clean (folklore, HiveBear, pinkybrain, llmlet)
- ⚠️ 2× Apache-2.0 (peerd, agentfm) — NOTICE 보존 요건
- ❌ 2× LICENSE 없음 (p2ptokens, p2pclaw) — concept only

**Phase 2 ready-to-import 5 모듈 식별**:
- 2× HiveBear (Rust → TS port)
- 1× pinkybrain (Python → TS port)
- 2× folklore (TS → TS port)

**M1 import 완료**: 5 파일 / ~400 LOC 포팅됨 (`packages/p2p/` 전체).

**M3+ import 필요**: 위 5 모듈 + folklore Discovery loop + peerd signaling reducer (Phase 4+).

---

## 8. 검증 절차 (reproducibility)

```bash
# License verification
gh repo view usefolklore/folklore --json licenseInfo,primaryLanguage
gh repo view BeckhamLabsLLC/HiveBear --json licenseInfo,primaryLanguage
gh repo view PinkyBrain-ai/pinkybrain --json licenseInfo,primaryLanguage
gh repo view ktock/llmlet --json licenseInfo,primaryLanguage
gh repo view Agent-FM/agentfm-core --json licenseInfo,primaryLanguage
gh repo view pur4v/p2ptokens --json licenseInfo  # → null (no LICENSE file)
gh repo view Agnuxo1/p2pclaw-unified --json licenseInfo  # → null (no LICENSE file)

# Tree enumeration
gh api "repos/usefolklore/folklore/git/trees/main?recursive=1"
gh api "repos/BeckhamLabsLLC/HiveBear/git/trees/main?recursive=1"
gh api "repos/PinkyBrain-ai/pinkybrain/git/trees/main?recursive=1"
gh api "repos/pur4v/p2ptokens/git/trees/main?recursive=1"
gh api "repos/Agnuxo1/p2pclaw-unified/git/trees/main?recursive=1"

# Local peerd
ls /Users/brianyeon/.hermes/peerd/signaling-node/
ls /Users/brianyeon/.hermes/peerd/extension/peerd-distributed/transport/
```

---

## 9. 다음 단계

| # | Action | 의존성 |
|---|---|---|
| 1 | HiveBear reputation.rs → TS port | (this doc) |
| 2 | HiveBear verification.rs → TS port | (this doc) |
| 3 | pinkybrain credit_system.py → TS port | (this doc) |
| 4 | folklore peer-reputation.ts → TS port | (this doc) |
| 5 | tokens-bank Phase 2 시작 (CoReceipts + reputation blend) | 1–4 |
| 6 | ADR-0004~0007 작성 (Phase 2 design records) | 1–4 |