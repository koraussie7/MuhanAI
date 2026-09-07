# ADR-0003: 8-repo lineage for AgentMesh

## Status

Accepted 2026-09-06.

## Purpose

Codify the patterns we adopt (and explicitly do NOT adopt) from 8
peer-reviewed OSS repos, so future contributors can trace design
decisions back to a known-good reference.

## License vetting summary

| Repo | License | Verdict | Notes |
|---|---|---|---|
| peerd | Apache-2.0 | ✅ Reference | explicit license + NOTICE file |
| agentfm | Apache-2.0 | ✅ Reference | explicit license + NOTICE file |
| llmlet | MIT | ✅ Reference | LICENSE file + package.json |
| p2ptokens | MIT-intent | ✅ Concept | LICENSE file (intent: dual MIT/Apache — confirmed by author correspondence) |
| p2pclaw | MIT-external | ✅ Concept | external authors; non-commercial-friendly MIT |
| pinkybrain | MIT | ✅ Direct | LICENSE + pyproject |
| HiveBear | MIT | ✅ Direct | LICENSE + Cargo.toml `license = "MIT"` |
| folklore | MIT | ✅ Direct | LICENSE + package.json `license: "MIT"` (`gh api` returns null — GitHub detection quirk) |

**4× MIT clean (llmlet, pinkybrain, HiveBear, folklore)** — code can be
ported with attribution.

## Pattern adoption matrix (12 axes × 8 repos)

| Axis | Adopted from | Reference |
|---|---|---|
| **P2P transport** | **folklore** ★ | libp2p 3.2.0 + floodsub 11.0.18 (see [ADR-0002](./0002-libp2p-floodsub-swap.md)) |
| **Discovery (mdns)** | **folklore** ★ | `@libp2p/mdns ^12.0.16` + Pitfall 2 try/catch |
| **Discovery (bootstrap)** | **folklore** ★ | `@libp2p/bootstrap ^12.0.16` with `timeout: 5000` |
| **Discovery (DHT)** | **folklore** ★ | `@libp2p/kad-dht ^16.2.0` with self-sovereign protocol prefix |
| **Discovery (rendezvous)** | folklore | `@libp2p/rendezvous` — Phase 4+ |
| **NAT traversal** | **folklore** ★ | `@libp2p/circuit-relay-v2 ^4.2.0` (client + server) + `dcutr` + `upnp-nat` |
| **Identity (Ed25519)** | **folklore + HiveBear** ★ | 64-byte raw + JSON format marker + corruption recovery |
| **Identity (DID)** | p2pclaw | `did:p2pclaw:<bs58(ed25519)>` — Phase 4+ |
| **Identity (bip39)** | folklore | `@scure/bip39` mnemonic recovery — Phase 4+ |
| **TOFU cert pinning** | **HiveBear** ★ | compile_error! gate + TofuVerifier |
| **Trust verification (probabilistic)** | **HiveBear** ★ | TrustVerifier with MIN_VERIFICATION_RATE=0.01 + SHA-256 |
| **Trust reputation (Bayesian-EMA)** | **HiveBear** ★ | `base*decay + 0.5*(1-decay)` + 7-day half-life |
| **Token economy (4-tier)** | **pinkybrain** ★ | FREE/CONTRIBUTOR/POWER/UNLIMITED + MONTHLY_REWARDS |
| **Token economy (co-receipts)** | **p2ptokens** ★ | signed payer + optional payee signature + ratio gate |
| **Token economy (contribution tier)** | **HiveBear** ★ | 5-tier from VRAM with auto-recommend model |
| **Adaptive topology** | **HiveBear + pinkybrain** | SwarmAwareScheduler + AdaptiveScheduler — Phase 4+ |
| **Specialty routing** | **pinkybrain** ★ | 12 SPECIALTIES + SPECIALTY_KEYWORDS |
| **Adaptive scheduler** | **pinkybrain** ★ | 4 strategies (latency/cost/quality/balanced) |
| **Output handler (JSON schema)** | llmlet | dialect sandbox — separate concept |
| **Topic versioning + lighthouse** | agentfm | Phase 4+ (topic/board model) |
| **Signaling + presence** | peerd | Phase 4+ (separate peer-presence product) |
| **Daemon IPC** | folklore | typed command protocol — pattern only (monorepo single-process) |
| **Hexagonal/Clean arch** | **folklore** ★ | domain/infrastructure/application split — reference for future refactors |
| **Code density (tests)** | **folklore** ★ | 942 tests in 75K LOC ≈ 1 test per 80 LOC |
| **Hexagonal + tests + pits** | **folklore** ★ | canonical combination for our long-term direction |

## Concepts explicitly NOT adopted

| Concept | Source | Reason |
|---|---|---|
| Knowledge graph + RAG layer | folklore | Out of scope (separate product) |
| Yjs CRDT | folklore + p2pclaw | Out of scope (claw.muhanai.com) |
| Tauri/Electron desktop | folklore | Out of scope |
| SQLite-vec + @xenova/transformers | folklore | We use Prisma + pgvector + Ollama |
| Bloom filter privacy | folklore | Out of scope for v1 |
| `tree-sitter` code parser | folklore | Out of scope |
| `@mozilla/readability` | folklore | Out of scope |
| Daemon IPC (33x speedup) | folklore | We run as monorepo single-process |
| Circuit relay server (production) | folklore | Phase 4+ (we're consumers first) |
| Custom DID method | p2pclaw | Phase 4+ |
| SW persistence | p2pclaw | claw.muhanai.com scope |
| Adaptive scheduler (latency/cost/quality/balanced) | pinkybrain | Phase 3 |
| Specialty keywords router (12 SPECIALTIES) | pinkybrain | Phase 4+ |
| ContributionTier 5-tier auto-recommend | HiveBear | Phase 3 |

## Decision lineage

This ADR is companion to:

- [ADR-0001](./0001-m1-pulse-mesh.md) — overall M1–M5 architecture
- [ADR-0002](./0002-libp2p-floodsub-swap.md) — D1 detail (floodsub vs gossipsub)

## Future ADRs

When Phase 2 (token-bank) work begins, write:

- ADR-0004: Co-receipts metering pattern (p2ptokens → @agentmesh/credits)
- ADR-0005: 4-tier CreditAccount (pinkybrain → @agentmesh/credits)
- ADR-0006: Bayesian-EMA reputation (HiveBear → @agentmesh/credits)
- ADR-0007: TOFU + TrustVerifier for HTTPS mesh (HiveBear → packages/p2p)

When Phase 3 (token-bank) begins:

- ADR-0008: Swarm-aware adaptive scheduler (HiveBear + pinkybrain hybrid)
- ADR-0009: ContributionTier auto-recommend (HiveBear → on-chain signals)
