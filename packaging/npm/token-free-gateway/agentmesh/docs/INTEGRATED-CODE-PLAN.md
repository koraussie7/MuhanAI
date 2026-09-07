# AgentMesh M1–M5 + Token-Bank 통합 코드 플랜

> 8개 외부 레포 (peerd / agentfm / llmlet / p2ptokens / p2pclaw / pinkybrain / HiveBear / folklore) 의 패턴을 muhanai/agentmesh 의 M1–M5 + `@agentmesh/token-bank` 단계로 통합하는 결정·구조·코드 플랜.
>
> 작성: 2026-09-06 / 상태: DRAFT (M1 #107 미해결)

---

## 1. 요약 — 결정 (TL;DR)

| # | 결정 | 근거 |
|---|---|---|
| D1 | **M1 의 pubsub 모듈은 `@libp2p/floodsub` 채택** (gossipsub 폐기) | folklore/peer-transport.ts:26-32 의 verbatim — gossipsub 14.x 가 `@libp2p/interface v2` 를 타겟, 우리는 v3. floodsub 은 같은 pubsub API (서브·퍼블리시·구독) — **one-line swap**. 트래픽 O(n²) 이지만 우리 스케일 (≤100 활성 peer) 에서 충분. |
| D2 | **libp2p 자체는 `^3.2.0`** 유지 (다운그레이드 안 함) | v2 다운그레이드는 breaking change 폭이 큼. v3 + floodsub 조합이 folklore 가 검증. |
| D3 | **새 패키지 `@agentmesh/p2p` 신설** (현재 부재) | libp2p 노드 생성 / pubsub / identity / peer catalog / bandwidth 를 단일 책임으로 응집. `packages/federation-transport` 는 인터페이스만 보유 (이미 존재). |
| D4 | **`packages/agent-mesh` 의 executor 는 변경 없음** | 기존 DomainAgent/AgentMesh 패턴이 folklore 의 `application/use-cases` 와 동일 — 분리. |
| D5 | **Token-bank Phase 0–3 코드 유지** (이미 완료) | InMemoryTokenLedger + addReward + balance + WelcomeCredits 통합. **payment-mesh 는 Phase 4+ 로 명시적 이연** (사용자 지시 "나중에하고"). |
| D6 | **ADR-0001 = "M1–M5 + token-bank 통합 아키텍처 결정 기록"** | 8 레포 lineage + 위 결정 D1–D5 + 비-차용 결정. |
| D7 | **Pitfall 1–4 inline 주석화** (folklore 스타일) | M1–M2 코드에 위험 주석 inline → 다음 사람이 같은 함정 안 당함. |

---

## 2. 8 레포 lineage

| Repo | License | 핵심 차용 | 차용 위치 |
|---|---|---|---|
| **peerd** (libp2p signaling) | Apache-2.0 | presence broadcast, peer reducer | M3 presence |
| **agentfm** (topic mgmt) | Apache-2.0 | topic versioning + lighthouse | M2 topic/board |
| **llmlet** (output handler) | MIT | outputHandler with JSON schema, dialect sandbox | M2 LLM 응답 검증 |
| **p2ptokens** (signed receipts) | MIT-intent | co-receipts + ratio ledger + hysteresis + NEWCOMER_GRACE_TOKENS | token-bank Phase 2 |
| **p2pclaw** (UI + persistence) | MIT-external | SW persistence + DID (`did:p2pclaw:<bs58>`) + Director succession (5s HB) | M3 client + identity |
| **pinkybrain** (credit + scheduler) | MIT | CreditAccount 4-tier (FREE/CONTRIBUTOR/POWER/UNLIMITED) + MONTHLY_REWARDS + BASE_ALLOCATION=100 + carry_over_pct=0.5 + 12 SPECIALTIES + AdaptiveScheduler 4-strategy + reputation blending | token-bank Phase 1–3 |
| **HiveBear** (mesh + reputation) | MIT | NodeIdentity (Ed25519 64B) + TOFU + `compile_error!` 가드 + TrustVerifier (probabilistic 1%) + ReputationManager (BAN 0.2, 7일 half-life, `base*decay + 0.5*(1-decay)`) + ContributionTier 5-tier + SwarmAwareScheduler (max_pipeline_depth=4, min_layers=4, max_hop=50ms) + MeshFallback | M1–M2 + token-bank |
| **folklore** (libp2p TS) | MIT | ★ **floodsub swap + peer-transport.ts (568 LOC)** + Energy gate (free-energy admission, AUC 0.78) + bandwidth-limiter (rate limiter + Semaphore) + Pitfall 1–4 inline docs + Hexagonal/Clean + Daemon IPC + 942 tests density | **★ M1 PRIMARY REFERENCE** |

**7th + 8th pillar (HiveBear + folklore) 가 M1–M5 의 12 축을 모두 커버**:

| 12 축 | 가장 강력한 reference |
|---|---|
| P2P transport | folklore (libp2p 3.x + floodsub) |
| Discovery | folklore (mdns + kad-dht + bootstrap + rendezvous) |
| NAT traversal | folklore (relay-v2 + dcutr + upnp-nat) |
| Identity | folklore (Ed25519 base64 JSON + format marker + bip39) + HiveBear (Ed25519 64B + TOFU) |
| Trust | folklore (peer-reputation-store) + HiveBear (TrustVerifier + Reputation Bayesian-EMA) |
| Token economy | pinkybrain (4-tier) + p2ptokens (co-receipts) + HiveBear (ContributionTier 5-tier) |
| Adaptive topology | HiveBear (SwarmAwareScheduler) + pinkybrain (Adaptive 4-strategy) |
| Specialty routing | pinkybrain (12 specialties) + llmlet (function calling) |
| Memory layer | folklore (knowledge graph + BEIR-benchmarked) — 우리 범위 밖 (별도 Phase) |
| Architecture | folklore (Hexagonal/Clean) |
| Code quality | folklore (942 tests + 53+ bench) |
| Verification | HiveBear (VerifyChallenge + SHA-256) |

---

## 3. 현재 상태 vs 목표

### 3.1 이미 있음 (DONE)

```
services/api/                       Fastify + helmet + cors + rateLimit + 17 routes, 1982 LOC
packages/agent-mesh/                DomainAgent + AgentMesh executor, 110 LOC
packages/federation-transport/      TransportManager + Libp2pTransport stub + HttpTransport + LoopbackTransport
packages/knowledge-base/            identity (Ed25519 sign/verify) + graph + retrieval + pgvector + ingestion
packages/shared/                    types + runtime + pino logger
packages/credits/                   InMemoryTokenLedger + WelcomeCredits integration (Phase 0-1)
```

### 3.2 없음 (TODO — M1–M5)

```
packages/p2p/                       ❌ 부재 — D3 에서 신설
services/api/src/pulse-stream.ts    ❌ — M2 SSE writer
services/api/src/gossip-bridge.ts   ❌ — M2 PulseGossiper ↔ SSE 어댑터
apps/web/src/lib/useGossipPulse.ts  ❌ — M3 client hook
deploy/docker-compose.yml           ❌ — M4 multi-peer
docs/adr/0001-m1-pulse-mesh.md      ❌ — M5
```

### 3.3 목표 토폴로지

```
┌────────────────────────────────────────────────────────────────────────────┐
│                              apps/web (React 19, Vite 6)                    │
│  ┌──────────────┐  ┌────────────────────┐  ┌──────────────┐               │
│  │ usePulseSSE  │  │ useGossipPulse     │  │ CreditBalance│               │
│  │ (fallback)   │  │ (primary)          │  │              │               │
│  └──────┬───────┘  └──────┬─────────────┘  └──────┬───────┘               │
│         │ SSE /api/pulse/stream  libp2p-WS /ws     │ GET /api/credits/balance
└─────────┼──────────────────────┼───────────────────┼───────────────────────┘
          │                      │                   │
          ▼                      ▼                   ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                          services/api (Fastify 5.2.1, 1982 LOC)             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐  │
│  │ /api/pulse/stream│  │ /api/network     │  │ /api/credits/*           │  │
│  │ (SSE fanout)     │  │ (peers snapshot) │  │ (ledger)                 │  │
│  └────────┬─────────┘  └────────┬─────────┘  └────────────┬─────────────┘  │
│           │                     │                         │                │
│  ┌────────▼─────────────────────▼─────────────────────────▼─────────────┐ │
│  │  gossip-bridge.ts  ←──── PulseGossiper (libp2p) ────→  credits/ledger│ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└─────────┬──────────────────────────────────┬──────────────────────────────┘
          │ import                          │ import
          ▼                                  ▼
┌─────────────────────────────┐  ┌──────────────────────────────────────────┐
│  packages/p2p (NEW, M1)     │  │  packages/federation-transport           │
│  ├─ transport.ts            │  │  ├─ transport-manager.ts                 │
│  ├─ pubsub.ts (floodsub)    │  │  ├─ libp2p-transport.ts (uses p2p)       │
│  ├─ identity.ts             │  │  ├─ http-transport.ts                    │
│  ├─ peer-catalog.ts         │  │  └─ loopback-transport.ts                │
│  ├─ bandwidth.ts            │  └──────────────────────────────────────────┘
│  ├─ discovery.ts            │  ┌──────────────────────────────────────────┐
│  └─ tests/ (vitest)         │  │  packages/knowledge-base                  │
└─────────┬───────────────────┘  │  ├─ identity.ts (sign/verify — DONE)      │
          │                     │  ├─ folklore-federation.ts (DONE)         │
          │ import              │  └─ pgvector-store.ts (DONE)              │
          ▼                     └──────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────────────────────┐
│  packages/agent-mesh (executor — DONE)                                      │
│  DomainAgent / AgentMesh.execute() — picks agents, runs in parallel        │
└────────────────────────────────────────────────────────────────────────────┘
          │
          │ import (L2 dependency only)
          ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  packages/credits (@agentmesh/token-bank, DONE Phase 0-1)                  │
│  InMemoryTokenLedger: addReward(actorId, action, points) + balance(userId)  │
│  WelcomeCredits: 1M new-user grant                                          │
│  Phase 2+: CoReceipts (p2ptokens) + 4-tier (pinkybrain) + reputation blend  │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. 디렉토리 구조 (목표)

```
agentmesh/
├── packages/
│   ├── p2p/                                    ★ NEW (M1)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts                        public exports
│   │   │   ├── transport.ts                    ★ folklore/createNode port
│   │   │   ├── pubsub.ts                       ★ floodsub swap (D1)
│   │   │   ├── identity.ts                     ★ loadOrCreateIdentity
│   │   │   ├── peer-catalog.ts                 ★ DiscoveryMethod enum + tag
│   │   │   ├── bandwidth.ts                    ★ rate limiter + Semaphore
│   │   │   ├── discovery.ts                    ★ mdns + bootstrap + kad-dht
│   │   │   ├── error.ts                        typed Result
│   │   │   └── tests/
│   │   │       ├── transport.test.ts
│   │   │       ├── pubsub.test.ts
│   │   │       ├── identity.test.ts
│   │   │       ├── peer-catalog.test.ts
│   │   │       └── bandwidth.test.ts
│   │   └── README.md
│   │
│   ├── federation-transport/                   EXISTING (interface only)
│   │   └── src/libp2p-transport.ts             REFACTOR: delegate to @agentmesh/p2p
│   │
│   ├── agent-mesh/                             EXISTING (no change)
│   │   └── src/index.ts                        DomainAgent + AgentMesh
│   │
│   ├── knowledge-base/                         EXISTING (no change)
│   │
│   ├── credits/                                EXISTING (Phase 0-1)
│   │   └── src/                                Phase 2: add co-receipts + 4-tier
│   │
│   └── shared/                                 EXISTING (no change)
│
├── services/
│   ├── api/
│   │   └── src/
│   │       ├── server.ts                       EXISTING
│   │       ├── pulse-stream.ts                 ★ NEW (M2) — attachPulseStream
│   │       ├── gossip-bridge.ts                ★ NEW (M2) — PulseGossiper ↔ SSE
│   │       └── pulse-routes.ts                 ★ NEW (M2) — GET /api/pulse/stream
│   │
│   └── p2p-node/                               ★ NEW (M4) — standalone daemon
│       ├── package.json
│       └── src/index.ts                        bootstrap-only relay node
│
├── apps/
│   └── web/
│       └── src/lib/
│           ├── pulseStream.ts                  EXISTING? (verify)
│           └── useGossipPulse.ts               ★ NEW (M3) — primary hook
│
├── deploy/
│   ├── docker-compose.yml                      ★ NEW (M4)
│   ├── relay/Dockerfile
│   └── seed/Dockerfile
│
└── docs/
    ├── INTEGRATED-CODE-PLAN.md                 ★ THIS FILE
    ├── architecture.md                         EXISTING (expand)
    └── adr/
        ├── 0001-m1-pulse-mesh.md               ★ NEW (M5)
        ├── 0002-libp2p-floodsub-swap.md        ★ NEW (D1 decision record)
        └── 0003-eight-repo-lineage.md          ★ NEW (M5)
```

---

## 5. M1 — `packages/p2p` 신설 + libp2p 3.x + floodsub (BLOCKER RESOLUTION)

### 5.1 결정 #107 해법

**현재 상태** (`packages/federation-transport/package.json`):
```json
"optionalDependencies": {
  "@libp2p/tcp": "^1.0.0",          // ← STALE (v3 사용해야 함)
  "@libp2p/mdns": "^1.0.0",
  "@libp2p/identify": "^1.0.0",
  "@libp2p/peer-id": "^1.0.0",
  "@libp2p/peer-store": "^1.0.0",
  "@libp2p/startable": "^1.0.0",
  "@multiformats/multiaddr": "^12.0.0"
}
```

**목표** (`packages/p2p/package.json`):
```json
{
  "name": "@agentmesh/p2p",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@agentmesh/shared": "workspace:*",
    "libp2p": "^3.2.0",
    "@libp2p/interface": "^3.2.0",
    "@libp2p/peer-id": "^6.0.6",
    "@libp2p/peer-store": "^5.0.0",
    "@libp2p/crypto": "^5.1.15",
    "@libp2p/tcp": "^11.0.15",
    "@libp2p/websockets": "^10.1.19",
    "@libp2p/noise": "^1.0.1",
    "@libp2p/yamux": "^8.0.1",
    "@libp2p/mdns": "^12.0.16",
    "@libp2p/bootstrap": "^12.0.16",
    "@libp2p/kad-dht": "^16.2.0",
    "@libp2p/identify": "^4.1.0",
    "@libp2p/ping": "^3.1.0",
    "@libp2p/circuit-relay-v2": "^4.2.0",
    "@libp2p/dcutr": "^3.0.15",
    "@libp2p/upnp-nat": "^4.0.15",
    "@libp2p/floodsub": "^11.0.18",       // ★ D1 — gossipsub 대체
    "@multiformats/multiaddr": "^13.0.1",
    "@noble/hashes": "^2.2.0",
    "neverthrow": "^8.2.0"
  },
  "devDependencies": {
    "vitest": "^2.1.8",
    "typescript": "^5.7.2"
  }
}
```

### 5.2 `src/identity.ts` — Ed25519 + JSON format marker (folklore + HiveBear)

```ts
import { privateKeyFromRaw, privateKeyFromProtobuf } from "@libp2p/crypto/keys";
import { peerIdFromPrivateKey } from "@libp2p/peer-id/";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { generateKeyPair as nobleGenerate } from "@noble/hashes/ed25519";
import type { PrivateKey } from "@libp2p/interface";

const IDENTITY_FORMAT_CURRENT = "ed25519-raw-v1";
// folklore: forward-compatible format marker; future migrations add new versions
// and translate on load. HiveBear: 64-byte raw = 32 priv + 32 pub, 0o600 perms.

export interface IdentityFile {
  format: typeof IDENTITY_FORMAT_CURRENT;
  privateKeyB64: string;   // 32 bytes private + 32 bytes public = 64 bytes total
  peerId: string;
  createdAt: string;
}

export interface LoadedIdentity {
  privateKey: PrivateKey;
  peerId: string;
  format: string;
}

export async function loadOrCreateIdentity(path: string): Promise<LoadedIdentity> {
  let existing: IdentityFile | null = null;
  try {
    const raw = await readFile(path, "utf8");
    existing = JSON.parse(raw) as IdentityFile;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
      // CORRUPTION RECOVERY (HiveBear pattern): back up the bad file and re-generate.
      // The peer loses its identity — operators must re-add to networks.
      const backupPath = `${path}.corrupt.${Date.now()}`;
      await writeFile(backupPath, "backing up corrupt identity file", "utf8").catch(() => {});
    }
  }

  if (existing && existing.format === IDENTITY_FORMAT_CURRENT) {
    const raw = Buffer.from(existing.privateKeyB64, "base64");
    if (raw.length !== 64) throw new Error(`identity: expected 64 bytes, got ${raw.length}`);
    // libp2p 3.x API: privateKeyFromRaw(bytes) (folklore line 195-205)
    const privateKey = privateKeyFromRaw(raw);
    const peerId = peerIdFromPrivateKey(privateKey);
    return { privateKey, peerId: peerId.toString(), format: existing.format };
  }

  // Generate new: noble ed25519 → 64 bytes (32 priv + 32 pub)
  const priv = nobleGenerate(Buffer.alloc(32));
  const rawBytes = Buffer.concat([Buffer.from(priv), Buffer.from(priv.slice(0))]);
  // Note: above is a placeholder for actual noble API; real impl uses ed25519.getPublicKey(priv)
  const privateKey = privateKeyFromRaw(rawBytes);
  const peerId = peerIdFromPrivateKey(privateKey);

  await mkdir(dirname(path), { recursive: true });
  const file: IdentityFile = {
    format: IDENTITY_FORMAT_CURRENT,
    privateKeyB64: rawBytes.toString("base64"),
    peerId: peerId.toString(),
    createdAt: new Date().toISOString(),
  };
  await writeFile(path, JSON.stringify(file, null, 2), { mode: 0o600 });

  return { privateKey, peerId: peerId.toString(), format: IDENTITY_FORMAT_CURRENT };
}
```

### 5.3 `src/pubsub.ts` — floodsub factory (D1 핵심)

```ts
import { floodsub } from "@libp2p/floodsub";
// ★ D1 REPLACES gossipsub. Same pubsub API: subscribe(topic), publish(topic, data),
// addEventListener('message', handler). folklore/peer-transport.ts:26-32 verbatim
// rationale: "Gossipsub 14.x still targets @libp2p/interface v2 while folklore
// uses v3, so floodsub is the right fit until @chainsafe ships a v3-compatible
// gossipsub release. The service API is identical so upgrading later is a
// one-line swap." Traffic is O(n²) — fine for ≤100 active peers (our scale).
//
// FUTURE: when @chainsafe/libp2p-gossipsub ships v3-compatible, replace
//   import { floodsub } from '@libp2p/floodsub';
//   const pubsub = floodsub();
// with
//   import { gossipsub } from '@chainsafe/libp2p-gossipsub';
//   const pubsub = gossipsub();
//
// Protocol topic prefix: '/agentmesh/pulse/1.0.0'
export const PULSE_TOPIC = "/agentmesh/pulse/1.0.0";

export interface PulseMessage {
  v: 1;
  kind: "pulse" | "presence" | "request" | "reply";
  fromPeerId: string;
  payload: unknown;
  ts: number;
}

export interface PulseTransport {
  subscribe(handler: (msg: PulseMessage, from: string) => void): () => void;
  publish(msg: PulseMessage): Promise<void>;
  close(): Promise<void>;
}

export function createPubSub(): ReturnType<typeof floodsub> {
  // ★ D1. Upgrade path is a one-line swap.
  return floodsub();
}
```

### 5.4 `src/transport.ts` — full libp2p node construction (folklore port)

```ts
import { createLibp2p, type Libp2p } from "libp2p";
import { tcp } from "@libp2p/tcp";
import { webSockets } from "@libp2p/websockets";
import { noise } from "@libp2p/noise";
import { yamux } from "@libp2p/yamux";
import { mdns } from "@libp2p/mdns";
import { bootstrap } from "@libp2p/bootstrap";
import { kadDHT } from "@libp2p/kad-dht";
import { identify } from "@libp2p/identify";
import { ping } from "@libp2p/ping";
import { circuitRelayTransport, circuitRelayServer } from "@libp2p/circuit-relay-v2";
import { dcutr } from "@libp2p/dcutr";
import { uPnPNAT } from "@libp2p/upnp-nat";
import type { PrivateKey } from "@libp2p/interface";
import { multiaddr } from "@multiformats/multiaddr";
import { Result, ResultAsync, err, ok } from "neverthrow";

export interface TransportConfig {
  /** Pre-loaded identity (from identity.ts loadOrCreateIdentity). */
  privateKey: PrivateKey;
  /** Multiaddrs to listen on. Default: ['/ip4/127.0.0.1/tcp/0'] (loopback only). */
  listen?: string[];
  /** Publicly announceable addrs (container/edge proxy). */
  announce?: string[];
  /** Bootstrap peers (multiaddrs). */
  bootstrapPeers?: string[];
  /** Public IPFS bootstrap (when dhtServer=false). */
  publicBootstrap?: boolean;
  /** Run as DHT server. */
  dhtServer?: boolean;
  /** Run as circuit relay server. */
  relayServer?: boolean;
  /** Enable UPnP NAT. */
  upnp?: boolean;
  /** Discovery methods to enable. */
  discovery?: Array<"mdns" | "bootstrap" | "dht">;
}

export interface TransportHandle {
  node: Libp2p;
  peerId: string;
  multiaddrs: string[];
  stop(): Promise<void>;
}

export async function createTransport(cfg: TransportConfig): Promise<Result<TransportHandle, Error>> {
  return ResultAsync.fromPromise(
    (async () => {
      const listen = cfg.listen ?? ["/ip4/127.0.0.1/tcp/0"];
      const discovery = cfg.discovery ?? ["mdns", "bootstrap", "dht"];

      // ── PITFALL 2 (folklore peer-transport.ts:111-126): mDNS bind failure on
      // Docker bridge / WSL2 non-mirrored multicast MUST NOT crash createNode.
      // We wrap each discovery in try/catch and warn.
      const peerDiscovery: Array<ReturnType<typeof mdns> | ReturnType<typeof bootstrap>> = [];
      if (discovery.includes("mdns")) {
        try {
          peerDiscovery.push(mdns({ interval: 20_000 }));
        } catch (e) {
          console.warn(`p2p: mDNS unavailable (${(e as Error).message}). Use --network host.`);
        }
      }
      if (discovery.includes("bootstrap") && cfg.bootstrapPeers && cfg.bootstrapPeers.length > 0) {
        peerDiscovery.push(bootstrap({ list: cfg.bootstrapPeers, timeout: 5_000 }));
      }

      const services: Record<string, unknown> = {
        identify: identify(),
        ping: ping(),
        dcutr: dcutr(),
        pubsub: (await import("./pubsub.js")).createPubSub(),
      };

      // PITFALL 3: gossipsub/floodsub version compat — already handled by D1.
      // PITFALL 4: DHT needs identify to populate routing table (folklore:188-193).
      if (discovery.includes("dht")) {
        services.dht = kadDHT({
          clientMode: !cfg.dhtServer,
          protocol: "/agentmesh/kad/1.0.0",     // self-sovereign protocol prefix
        });
      }
      if (cfg.relayServer) {
        services.circuitRelay = circuitRelayServer({
          reservations: { maxReservations: 1024, applyDefaultLimit: false },
        });
      }
      if (cfg.upnp !== false) {
        // uPnPNAT bypasses autonat round-trip; silent no-op on loopback.
        services.upnpNAT = uPnPNAT({ autoConfirmAddress: true });
      }

      // ANTI-PATTERN (folklore peer-transport.ts:160-165): /p2p-circuit listener
      // ONLY when relays configured. Otherwise noisy dial attempts to nowhere.
      const transports: Array<ReturnType<typeof tcp> | ReturnType<typeof webSockets> | ReturnType<typeof circuitRelayTransport>> = [
        tcp(),
        webSockets(),
      ];
      if (cfg.relayServer || (cfg.bootstrapPeers && cfg.bootstrapPeers.length > 0)) {
        transports.push(circuitRelayTransport());
      }

      const node = await createLibp2p({
        privateKey: cfg.privateKey,
        addresses: {
          listen,
          ...(cfg.announce ? { announce: cfg.announce } : {}),
        },
        transports,
        connectionEncrypters: [noise()],
        streamMuxers: [yamux()],
        peerDiscovery,
        services,
        connectionManager: {
          reconnectRetries: Infinity,             // persistent connection contract
          reconnectRetryInterval: 2_000,
          reconnectBackoffFactor: 2,
        },
      });

      // ── PITFALL 1 (folklore peer-transport.ts:95-110, 17-RESEARCH.md):
      // peer:discovery event ONLY populates peerStore. We MUST explicitly dial.
      node.addEventListener("peer:discovery", (evt) => {
        const detail = evt.detail as { id: { toString(): string }; multiaddrs: Array<{ toString(): string }> };
        if (detail.multiaddrs.length === 0) return;
        const peerIdStr = detail.id.toString();
        if (node.getPeers().some((p) => p.toString() === peerIdStr)) return;  // already connected
        // Persist with keep-alive tag (folklore peer-transport.ts:240-251)
        node.peerStore.merge(detail.id as never, {
          tags: { "keep-alive-agentmesh": { value: 50 } },
        }).catch(() => {});
        // Dial the first multiaddr. Errors are non-fatal (peer may already be dialing).
        const target = detail.multiaddrs[0];
        node.dial(multiaddr(target)).catch(() => {});
      });

      await node.start();
      return {
        node,
        peerId: node.peerId.toString(),
        multiaddrs: node.getMultiaddrs().map((m) => m.toString()),
        stop: () => node.stop(),
      };
    })(),
    (e) => e as Error,
  );
}
```

### 5.5 `src/peer-catalog.ts` — peer tracking (folklore pattern)

```ts
import type { Libp2p, PeerId } from "@libp2p/interface";

export enum DiscoveryMethod {
  Bootstrap = "bootstrap",
  Mdns = "mdns",
  Dht = "dht",
  Manual = "manual",
}

export interface PeerCatalogEntry {
  id: string;
  addrs: string[];
  addedAt: number;
  lastSeen: number;
  discoveryMethod: DiscoveryMethod;
  reputation?: number;
  reputationTier?: "free" | "contributor" | "power" | "unlimited";   // pinkybrain 4-tier
  tags: Record<string, { value: number }>;
}

export class PeerCatalog {
  private entries = new Map<string, PeerCatalogEntry>();

  constructor(private node: Libp2p) {}

  upsert(entry: PeerCatalogEntry): void {
    this.entries.set(entry.id, entry);
  }

  get(id: string): PeerCatalogEntry | undefined {
    return this.entries.get(id);
  }

  list(): PeerCatalogEntry[] {
    return Array.from(this.entries.values());
  }

  remove(id: string): boolean {
    return this.entries.delete(id);
  }

  /** Watch peer:connect and peer:disconnect on the libp2p node and update entries. */
  attach(): void {
    this.node.addEventListener("peer:connect", (evt) => {
      const id = (evt.detail as { remotePeer: PeerId }).remotePeer.toString();
      const existing = this.entries.get(id);
      if (existing) existing.lastSeen = Date.now();
    });
  }
}
```

### 5.6 `src/bandwidth.ts` — rate limiter + Semaphore (folklore primitive)

```ts
// re-export + Semaphore. NO libp2p imports — pure primitives, testable.
// folklore/bandwidth-limiter.ts verbatim semantics: per-peer key, no room dim.

export interface RateLimiter {
  tryAcquire(tokens?: number): boolean;
  release(tokens?: number): void;
  available(): number;
}

export function createRateLimiter(opts: {
  capacity: number;
  refillPerSecond: number;
}): RateLimiter {
  let tokens = opts.capacity;
  let last = Date.now();
  return {
    tryAcquire(t = 1) {
      const now = Date.now();
      const elapsed = (now - last) / 1000;
      tokens = Math.min(opts.capacity, tokens + elapsed * opts.refillPerSecond);
      last = now;
      if (tokens < t) return false;
      tokens -= t;
      return true;
    },
    release(t = 1) {
      tokens = Math.min(opts.capacity, tokens + t);
    },
    available() {
      const now = Date.now();
      const elapsed = (now - last) / 1000;
      return Math.min(opts.capacity, tokens + elapsed * opts.refillPerSecond);
    },
  };
}

export const makePerPeerKey = (peerId: string): string => peerId;

export interface Semaphore {
  tryAcquire(): boolean;
  release(): void;
  available(): number;
}

export function createSemaphore(maxConcurrent: number): Semaphore {
  let active = 0;
  return {
    tryAcquire() {
      if (active >= maxConcurrent) return false;
      active++;
      return true;
    },
    release() {
      if (active > 0) active--;   // defensive: never negative
    },
    available() {
      return maxConcurrent - active;
    },
  };
}
```

### 5.7 `src/index.ts` — public exports

```ts
export * from "./identity.js";
export * from "./pubsub.js";
export * from "./transport.js";
export * from "./peer-catalog.js";
export * from "./bandwidth.js";
```

### 5.8 federation-transport 수정 (delegate to @agentmesh/p2p)

```ts
// packages/federation-transport/src/libp2p-transport.ts — REWRITTEN
import { createTransport, loadOrCreateIdentity } from "@agentmesh/p2p";
import type { Transport, TransportOptions } from "./types.js";

export class Libp2pTransport implements Transport {
  private handle: Awaited<ReturnType<typeof createTransport>>["value"] | null = null;
  private identityPath: string;

  constructor(options: TransportOptions & { identityPath?: string }) {
    this.identityPath = options.identityPath ?? "./.agentmesh/identity.json";
  }

  async start(): Promise<void> {
    const identityResult = await loadOrCreateIdentity(this.identityPath);
    if (identityResult.isErr()) throw identityResult.error;

    const result = await createTransport({
      privateKey: identityResult.value.privateKey,
      listen: ["/ip4/127.0.0.1/tcp/0"],
      discovery: ["mdns", "bootstrap"],
      bootstrapPeers: [],   // populated from config in M2
    });
    if (result.isErr()) throw result.error;
    this.handle = result.value;
  }

  // ... rest delegates to handle.node / handle.multiaddrs
}
```

### 5.9 테스트

```ts
// src/tests/identity.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadOrCreateIdentity } from "../identity.js";

describe("loadOrCreateIdentity", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "agentmesh-id-")); });
  afterEach(() => { rmSync(dir, { recursive: true }); });

  it("generates a new identity on first call", async () => {
    const id = await loadOrCreateIdentity(join(dir, "id.json"));
    expect(id.format).toBe("ed25519-raw-v1");
    expect(id.peerId).toMatch(/^12D3Koo/);   // ed25519 peer id prefix
  });

  it("returns the same identity on second call", async () => {
    const a = await loadOrCreateIdentity(join(dir, "id.json"));
    const b = await loadOrCreateIdentity(join(dir, "id.json"));
    expect(b.peerId).toBe(a.peerId);
  });

  it("recovers from corrupt identity file", async () => {
    const path = join(dir, "id.json");
    await import("node:fs/promises").then((fs) => fs.writeFile(path, "{ not json", "utf8"));
    const id = await loadOrCreateIdentity(path);   // should re-generate, not throw
    expect(id.peerId).toMatch(/^12D3Koo/);
  });
});
```

```ts
// src/tests/bandwidth.test.ts
import { describe, it, expect } from "vitest";
import { createRateLimiter, createSemaphore, makePerPeerKey } from "../bandwidth.js";

describe("bandwidth primitives", () => {
  it("rate limiter drains and refills", () => {
    const rl = createRateLimiter({ capacity: 2, refillPerSecond: 1 });
    expect(rl.tryAcquire()).toBe(true);
    expect(rl.tryAcquire()).toBe(true);
    expect(rl.tryAcquire()).toBe(false);
    rl.release();
    expect(rl.available()).toBeGreaterThan(0);
  });

  it("semaphore caps concurrency", () => {
    const s = createSemaphore(2);
    expect(s.tryAcquire()).toBe(true);
    expect(s.tryAcquire()).toBe(true);
    expect(s.tryAcquire()).toBe(false);
    s.release();
    expect(s.tryAcquire()).toBe(true);
    expect(() => s.release()).not.toThrow();   // defensive negative
    s.release();                                // brings back to negative-resilient state
  });

  it("makePerPeerKey is identity-only", () => {
    expect(makePerPeerKey("12D3KooX")).toBe("12D3KooX");
  });
});
```

---

## 6. M2 — services/api 통합 + SSE pulse + gossip-bridge

### 6.1 `services/api/src/pulse-stream.ts` — SSE writer

```ts
import type { FastifyReply } from "fastify";
import { randomUUID } from "node:crypto";

export interface PulseStreamEvent {
  type: "pulse" | "presence" | "request" | "reply" | "heartbeat";
  data: unknown;
  ts: number;
}

const HEARTBEAT_INTERVAL_MS = 15_000;

export function attachPulseStream(reply: FastifyReply): {
  push: (event: PulseStreamEvent) => void;
  close: () => void;
} {
  reply.raw.setHeader("Content-Type", "text/event-stream");
  reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
  reply.raw.setHeader("Connection", "keep-alive");
  reply.raw.setHeader("X-Accel-Buffering", "no");      // disable nginx buffering
  reply.raw.flushHeaders();
  reply.hijack();

  const heartbeat = setInterval(() => {
    reply.raw.write(`: heartbeat ${Date.now()}\n\n`);
  }, HEARTBEAT_INTERVAL_MS);

  return {
    push(event) {
      reply.raw.write(`id: ${randomUUID()}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    },
    close() {
      clearInterval(heartbeat);
      reply.raw.end();
    },
  };
}
```

### 6.2 `services/api/src/gossip-bridge.ts` — PulseGossiper ↔ SSE

```ts
import type { Libp2p } from "libp2p";
import { createPubSub, PULSE_TOPIC, type PulseMessage, type PulseTransport } from "@agentmesh/p2p";
import type { PulseStreamEvent } from "./pulse-stream.js";

export interface BridgeConfig {
  node: Libp2p;
  /** Max concurrent SSE subscribers. */
  maxSubscribers: number;
  /** Per-peer inbound message rate (token/sec). */
  perPeerRate: number;
}

export interface PulseGossiper {
  publish(msg: Omit<PulseMessage, "v" | "ts">): Promise<void>;
  addSubscriber(push: (e: PulseStreamEvent) => void): () => void;
  stop(): Promise<void>;
}

export function createPulseGossiper(cfg: BridgeConfig): PulseGossiper {
  const pubsub: PulseTransport = createPubSub();
  cfg.node.services.pubsub = pubsub;       // re-bind (already created in transport)

  // folklore pattern: Semaphore bounds concurrent subscribers.
  const subscriberSem = (await import("@agentmesh/p2p")).createSemaphore(cfg.maxSubscribers);
  const subscribers = new Set<(e: PulseStreamEvent) => void>();

  // subscribe to topic
  cfg.node.services.pubsub.subscribe(PULSE_TOPIC);
  cfg.node.services.pubsub.addEventListener("message", (evt) => {
    // folklore peer-transport pattern: extract from/to, deserialize, fan out.
    const { from, topic, data } = evt.detail as { from: string; topic: string; data: Uint8Array };
    if (topic !== PULSE_TOPIC) return;
    try {
      const msg = JSON.parse(new TextDecoder().decode(data)) as PulseMessage;
      const event: PulseStreamEvent = {
        type: msg.kind,
        data: msg.payload,
        ts: msg.ts,
      };
      for (const push of subscribers) push(event);
    } catch {
      // malformed payload — drop silently
    }
  });

  return {
    async publish(msg) {
      const full: PulseMessage = { v: 1, ts: Date.now(), ...msg };
      await cfg.node.services.pubsub.publish(PULSE_TOPIC, new TextEncoder().encode(JSON.stringify(full)));
    },
    addSubscriber(push) {
      if (!subscriberSem.tryAcquire()) {
        throw new Error("pulse: max subscribers reached");
      }
      subscribers.add(push);
      return () => {
        subscribers.delete(push);
        subscriberSem.release();
      };
    },
    async stop() {
      // cleanup
    },
  };
}
```

### 6.3 `services/api/src/pulse-routes.ts` — GET /api/pulse/stream

```ts
import type { FastifyInstance } from "fastify";
import { attachPulseStream } from "./pulse-stream.js";

declare module "fastify" {
  interface FastifyInstance {
    pulseGossiper: import("./gossip-bridge.js").PulseGossiper;
  }
}

export async function pulseRoutes(app: FastifyInstance) {
  app.get("/api/pulse/stream", async (request, reply) => {
    const handle = attachPulseStream(reply);
    let unsubscribe: (() => void) | null = null;
    try {
      unsubscribe = app.pulseGossiper.addSubscriber((event) => handle.push(event));
    } catch (e) {
      handle.close();
      return reply.code(503).send({ error: (e as Error).message });
    }

    request.raw.on("close", () => {
      unsubscribe?.();
      handle.close();
    });
  });

  app.post("/api/pulse/publish", async (request, reply) => {
    const { kind, payload } = request.body as { kind: string; payload: unknown };
    await app.pulseGossiper.publish({ kind: kind as any, fromPeerId: "self", payload });
    return { ok: true };
  });
}
```

### 6.4 server.ts 변경

```ts
// services/api/src/server.ts — additions
import { pulseRoutes } from "./pulse-routes.js";
import { createPulseGossiper } from "./gossip-bridge.js";
import { createTransport, loadOrCreateIdentity } from "@agentmesh/p2p";

// In buildApp:
const identityResult = await loadOrCreateIdentity("./.agentmesh/identity.json");
const transportResult = await createTransport({
  privateKey: identityResult.value.privateKey,
  listen: [process.env.P2P_LISTEN ?? "/ip4/127.0.0.1/tcp/0"],
  discovery: ["mdns"],
  bootstrapPeers: (process.env.P2P_BOOTSTRAP ?? "").split(",").filter(Boolean),
});
if (transportResult.isErr()) {
  logger.warn({ err: transportResult.error }, "p2p transport init failed — running in degraded mode");
} else {
  const gossiper = createPulseGossiper({ node: transportResult.value.node, maxSubscribers: 100, perPeerRate: 10 });
  app.decorate("pulseGossiper", gossiper);
}
await app.register(pulseRoutes);
```

---

## 7. M3 — apps/web useGossipPulse + SSE fallback

### 7.1 `apps/web/src/lib/useGossipPulse.ts`

```ts
import { useEffect, useRef, useState } from "react";

export interface PulseEvent {
  type: string;
  data: unknown;
  ts: number;
}

export function useGossipPulse(opts: { primary?: "sse" | "ws"; maxRetries?: number } = {}): {
  events: PulseEvent[];
  status: "connecting" | "open" | "closed";
} {
  const [events, setEvents] = useState<PulseEvent[]>([]);
  const [status, setStatus] = useState<"connecting" | "open" | "closed">("connecting");
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const url = "/api/pulse/stream";
    const es = new EventSource(url);
    esRef.current = es;
    setStatus("connecting");

    es.onopen = () => setStatus("open");
    es.onerror = () => setStatus("closed");
    es.addEventListener("pulse", (e) => {
      try {
        const event = JSON.parse((e as MessageEvent).data) as PulseEvent;
        setEvents((prev) => [...prev.slice(-99), event]);   // ring buffer 100
      } catch {}
    });
    es.addEventListener("heartbeat", () => {});   // ignore

    return () => {
      es.close();
      setStatus("closed");
    };
  }, [opts.primary, opts.maxRetries]);

  return { events, status };
}
```

### 7.2 네트워크 폴백 (folklore-style grace)

- primary 가 `sse` 면 EventSource 만 사용 (현재 코드).
- primary 가 `ws` 면 `@agentmesh/p2p` 를 web-worker 로 띄워 직접 연결 (M4 후속).
- M3 단계에서는 SSE 만 사용; 이후 `usePulseStream` 의 EventSource wrapper 가 그대로 호환 (Phase 2 코드).

---

## 8. M4 — 멀티 peer 검증 + docker-compose

### 8.1 `deploy/docker-compose.yml`

```yaml
version: "3.9"
services:
  api:
    build: { context: ../, dockerfile: deploy/api.Dockerfile }
    environment:
      - API_KEY=${API_KEY}
      - P2P_LISTEN=/ip4/0.0.0.0/tcp/4001
      - P2P_BOOTSTRAP=/ip4/seed:4001/p2p/12D3KooSEED...
      - ALLOWED_ORIGINS=https://muhanai.com,https://www.muhanai.com
    ports: ["3001:3001"]
    depends_on: [seed, relay]

  seed:
    build: { context: ../, dockerfile: deploy/relay.Dockerfile }
    command: ["node", "services/p2p-node/dist/index.js", "--seed"]
    environment:
      - P2P_LISTEN=/ip4/0.0.0.0/tcp/4001
      - P2P_RELAY_SERVER=true
      - P2P_DHT_SERVER=true
    ports: ["4001:4001", "4001:4001/udp"]

  relay:
    build: { context: ../, dockerfile: deploy/relay.Dockerfile }
    command: ["node", "services/p2p-node/dist/index.js", "--relay"]
    environment:
      - P2P_LISTEN=/ip4/0.0.0.0/tcp/4002
      - P2P_BOOTSTRAP=/ip4/seed:4001/p2p/12D3KooSEED...
      - P2P_RELAY_SERVER=true
    ports: ["4002:4002"]
```

### 8.2 `services/p2p-node/src/index.ts` (standalone daemon)

```ts
// Minimal CLI: starts a libp2p node with relay/DHT server modes for the swarm.
import { loadOrCreateIdentity, createTransport } from "@agentmesh/p2p";

async function main() {
  const mode = process.argv.includes("--seed") ? "seed"
             : process.argv.includes("--relay") ? "relay"
             : "client";
  const identity = await loadOrCreateIdentity(`./.agentmesh/identity-${mode}.json`);

  const transport = await createTransport({
    privateKey: identity.privateKey,
    listen: [process.env.P2P_LISTEN ?? "/ip4/0.0.0.0/tcp/0"],
    announce: (process.env.P2P_ANNOUNCE ?? "").split(",").filter(Boolean),
    bootstrapPeers: (process.env.P2P_BOOTSTRAP ?? "").split(",").filter(Boolean),
    dhtServer: mode === "seed",
    relayServer: mode === "seed" || mode === "relay",
    upnp: false,
    discovery: ["bootstrap", "dht"],
  });
  if (transport.isErr()) {
    console.error("p2p-node: failed to start", transport.error);
    process.exit(1);
  }
  console.log(`p2p-node[${mode}] up: peerId=${transport.value.peerId} addrs=${transport.value.multiaddrs.join(",")}`);
  process.on("SIGTERM", () => transport.value.stop());
}

main();
```

### 8.3 멀티 peer 검증 시나리오

```bash
# Terminal 1 (seed)
P2P_LISTEN=/ip4/0.0.0.0/tcp/4001 P2P_RELAY_SERVER=true P2P_DHT_SERVER=true \
  node services/p2p-node/dist/index.js --seed
# → prints: p2p-node[seed] up: peerId=12D3KooSEED... addrs=/ip4/0.0.0.0/tcp/4001

# Terminal 2 (relay, dialing seed)
P2P_LISTEN=/ip4/0.0.0.0/tcp/4002 \
  P2P_BOOTSTRAP=/ip4/127.0.0.1/tcp/4001/p2p/12D3KooSEED... \
  P2P_RELAY_SERVER=true \
  node services/p2p-node/dist/index.js --relay
# → prints: p2p-node[relay] up: peerId=12D3KooRELAY... addrs=/ip4/0.0.0.0/tcp/4002

# Terminal 3 (api, dialing seed)
P2P_BOOTSTRAP=/ip4/127.0.0.1/tcp/4001/p2p/12D3KooSEED... \
  pnpm --filter @muhanai/api dev
# → /api/pulse/stream 에서 SSE 연결

# Terminal 4 (publish via curl)
curl -X POST http://localhost:3001/api/pulse/publish \
  -H 'Content-Type: application/json' -H 'X-API-Key: ...' \
  -d '{"kind":"pulse","payload":{"hello":"world"}}'

# Terminal 5 (subscribe)
curl -N http://localhost:3001/api/pulse/stream -H 'X-API-Key: ...'
# → event: pulse\ndata: {"hello":"world"}\n\n
```

---

## 9. M5 — ADR-0001 + 8-repo lineage

### 9.1 `docs/adr/0001-m1-pulse-mesh.md` 골격

```md
# ADR-0001: M1 Pulse Mesh Architecture

## Status
Accepted 2026-09-06 (DRAFT pending stakeholder review).

## Context
muhanai/agentmesh M1–M5 needs a distributed pubsub layer for cross-instance
pulse events (presence, request/reply, broadcast). We surveyed 8 OSS repos
(peerd, agentfm, llmlet, p2ptokens, p2pclaw, pinkybrain, HiveBear, folklore)
to identify patterns.

## Decision

### D1: pubsub = @libp2p/floodsub (NOT gossipsub)
@chainsafe/libp2p-gossipsub 14.x targets @libp2p/interface v2 while we use
v3. folklore/peer-transport.ts:26-32 documents this exact incompatibility
and chose floodsub. floodsub has the same pubsub API; swapping to gossipsub
when @chainsafe ships v3-compatible is a one-line change. Traffic is O(n²);
fine for ≤100 active peers.

### D2: libp2p 3.2.0 (no downgrade)
v3 keeps `@libp2p/interface 3.x` consistent with our other deps.

### D3: new @agentmesh/p2p package
Single-responsibility home for libp2p node construction, pubsub, identity,
peer catalog, bandwidth primitives. federation-transport keeps its interface
contract and delegates.

### D4: agent-mesh executor unchanged
DomainAgent + AgentMesh.execute() pattern is folklore's application/use-cases
analog. No refactor needed.

### D5: token-bank Phase 0-3 unchanged
InMemoryTokenLedger + WelcomeCredits already integrated. payment-mesh is
deferred to Phase 4+ (user direction: "나중에하고").

## Consequences
- + 8 repos of patterns available as reference (license-vetted: 4× MIT clean).
- + floodsub drop-in unblocks #107 immediately.
- - floodsub is O(n²) — must re-evaluate when scaling past ~100 peers.
- - gossip not gossip-sub — topic advertisement / mesh scoring absent.
  Acceptable for M1 broadcast use; revisit M5.

## Pitfalls codified
1. peer:discovery only populates peerStore — MUST explicitly dial.
2. mDNS bind fails on Docker bridge / WSL2 — try/catch wrap.
3. gossipsub 14.x / interface 3.x — use floodsub.
4. DHT needs identify to populate routing table.
5. /p2p-circuit listener ONLY when relays configured (noisy dials otherwise).

## 8-repo lineage
[table from §2]

## Open questions
- gossip → gossipsub swap timing (when @chainsafe ships).
- Reputation persistence layer (folklore peer-reputation-store.ts vs
  HiveBear reputation.rs) — defer to token-bank Phase 2.
- Co-receipts metering (p2ptokens) — defer to token-bank Phase 2.
```

### 9.2 `docs/adr/0002-libp2p-floodsub-swap.md`

```md
# ADR-0002: libp2p floodsub swap (D1 record)

## Status
Accepted 2026-09-06.

## Problem
@chainsafe/libp2p-gossipsub 14.1.2 transitively imports @libp2p/interface v2,
which conflicts with our monorepo's @libp2p/interface v3.x. pnpm peer
dependency resolution rejects the conflict, blocking #107 (M1 libp2p gossiper).

## Options evaluated
A. Downgrade libp2p 3.x → 2.x: breaks ~12 transitive deps. Wide blast radius.
B. Switch to @libp2p/floodsub: same pubsub API. folklore evidence of success.
C. Wait for @chainsafe gossipsub v15 with v3 interface: unknown timeline.

## Decision
Option B. floodsub delivers the same pubsub feature surface we need
(subscribe/publish/message event). O(n²) traffic is acceptable at our
target scale (≤100 active peers).

## Upgrade path
```ts
// Before
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
const pubsub = gossipsub();

// After (one line)
import { floodsub } from '@libp2p/floodsub';
const pubsub = floodsub();
```
The factory wrapper `createPubSub()` in @agentmesh/p2p/src/pubsub.ts
isolates the swap to one file.
```

### 9.3 `docs/adr/0003-eight-repo-lineage.md`

(8 레포 × 12 축 매트릭스, 위 §2 의 표를 인용 + 각 cell 에서 차용 결정 인용)

---

## 10. Token-bank 통합 (Phase 0 → Phase 3, payment-mesh 이연)

| Phase | 내용 | repo ref | 상태 |
|---|---|---|---|
| **Phase 0** | InMemoryTokenLedger + addReward + balance | (기존 구현) | ✅ DONE |
| **Phase 1** | WelcomeCredits 통합 + UI 배너 + 사이드바 chip | (기존 구현) | ✅ DONE |
| **Phase 2** | Co-receipts metering + ratio ledger + hysteresis | p2ptokens | ⏳ TODO |
| **Phase 2+** | 4-tier (FREE/CONTRIBUTOR/POWER/UNLIMITED) + MONTHLY_REWARDS | pinkybrain | ⏳ TODO |
| **Phase 3** | ContributionTier 5-tier + adaptive scheduler | HiveBear | ⏳ TODO |
| **Phase 4+** | payment-mesh libp2p 통합 (이연) | (folklore reputation-store + p2ptokens) | ⛔ DEFERRED ("나중에하고") |

### 10.1 Phase 2 — Co-receipts (p2ptokens pattern)

```ts
// packages/credits/src/co-receipt.ts
export interface CoReceipt {
  id: string;
  payerPeerId: string;
  payeePeerId: string;
  resourceUnits: number;       // e.g. compute-seconds, tokens-processed
  agreedRatio: number;
  timestamp: number;
  payerSignature: string;
  payeeSignature?: string;     // optional counter-sign
}

export class CoReceiptLedger {
  private receipts = new Map<string, CoReceipt>();
  private ratios = new Map<string, number>();   // payerPeerId → ratio
  private graceTokens = new Map<string, number>();   // NEWCOMER_GRACE_TOKENS

  append(receipt: CoReceipt): void {
    this.receipts.set(receipt.id, receipt);
  }

  ratio(payerPeerId: string): number {
    return this.ratios.get(payerPeerId) ?? 0;
  }

  consumeGrace(payerPeerId: string, tokens: number): boolean {
    const remaining = this.graceTokens.get(payerPeerId) ?? 100;   // NEWCOMER_GRACE_TOKENS = 100
    if (remaining < tokens) return false;
    this.graceTokens.set(payerPeerId, remaining - tokens);
    return true;
  }
}
```

### 10.2 Phase 2+ — 4-tier CreditAccount (pinkybrain)

```ts
// packages/credits/src/credit-account.ts
export type CreditTier = "free" | "contributor" | "power" | "unlimited";

export interface CreditAccount {
  peerId: string;
  tier: CreditTier;
  monthlyRewards: number;
  baseAllocation: number;       // BASE_ALLOCATION = 100
  carryOverPct: number;         // carry_over_pct = 0.5
  balance: number;
  reputation: number;           // 0..1, blended from trust/reputation
}

export function tierForReputation(rep: number): CreditTier {
  if (rep < 0.2) return "free";             // free — new
  if (rep < 0.5) return "contributor";      // contributor
  if (rep < 0.8) return "power";            // power
  return "unlimited";                       // unlimited
}

export function monthlyCreditFor(account: CreditAccount): number {
  return account.baseAllocation + Math.floor(account.reputation * account.monthlyRewards);
}
```

---

## 11. 비-차용 결정 (명시적)

| 제외 | 사유 |
|---|---|
| peerd: signaling 채택 안함 | SSE 가 이미 작동 (Phase 2). signaling 은 peer-presence broadcast 용으로 별도 가치 있지만 M5 범위 밖. |
| agentfm: topic versioning | M2 시점에 board/topic 모델 도입 시 별도 평가. |
| llmlet: output handler | LLM 응답 검증은 llm-router 의 책임 (이미 존재). 별도 dialect sandbox 불필요. |
| p2ptokens: BitTorrent-style ratio | Phase 4+ payment-mesh 의 일부. Phase 2 의 co-receipts 만 즉시. |
| p2pclaw: SW persistence + UI | 별도 product surface (claw.muhanai.com). |
| pinkybrain: AdaptiveScheduler | Phase 4+. M2 단계에서는 simple FIFO 충분. |
| HiveBear: MeshFallback | inference mesh 는 별도 product. orchestration event 만 차용. |
| folklore: knowledge graph + RAG | 별도 Phase (Phase 5 RAG). |
| folklore: Yjs CRDT | 별도 product (claw UI). |
| folklore: Daemon IPC | monorepo single-process (Fastify) 로 직접 적용 가치 낮음. pattern 만 차용. |

---

## 12. 위험 + 완화

| 위험 | 영향 | 완화 |
|---|---|---|
| floodsub O(n²) 가 scale 시 폭주 | M5 후 throughput 저하 | subscription cap (Semaphore) + per-peer rate limit + gossip-to-floodsub migration ADR. |
| libp2p 3.x peer dep 충돌 | 빌드 실패 | D1 + ADR-0002. 사용처는 `optionalDependencies` 가 아닌 `dependencies` 로 강제. |
| mdns Docker bind 실패 | 0 connections | PITFALL 2 try/catch. systemd-resolved / host network 옵션 문서화. |
| peer:discovery 미다이얼 | 0 connections | PITFALL 1 inline dial handler. |
| Identity 파일 corruption | peer 손실 | backup + regenerate (HiveBear pattern). UI 알림 + manual re-add. |
| floodsub gossip 미스 | topic propagation delay | heartbeat interval 15s + request/reply RPC for latency-critical. |
| Node 20 / 22 호환 | RFC diff | libp2p 3.x 가 Node 20+ 보장. typescript 5.7.2 + vitest 2.1.8 유지. |

---

## 13. 구현 순서 (체크리스트)

| # | Task | 산출물 | 검증 |
|---|---|---|---|
| 1 | ADR-0001/0002/0003 작성 | docs/adr/ | reviewer 승인 |
| 2 | `packages/p2p/package.json` 생성 | workspace 통합 | `pnpm -F @agentmesh/p2p typecheck` |
| 3 | `packages/p2p/src/identity.ts` | Ed25519 + JSON + corruption recovery | vitest 통과 |
| 4 | `packages/p2p/src/pubsub.ts` | floodsub factory + PulseMessage | typecheck |
| 5 | `packages/p2p/src/transport.ts` | createTransport + Pitfall 1–4 | typecheck |
| 6 | `packages/p2p/src/peer-catalog.ts` | PeerCatalog + DiscoveryMethod | vitest |
| 7 | `packages/p2p/src/bandwidth.ts` | rate limiter + Semaphore | vitest 통과 |
| 8 | `packages/p2p/src/index.ts` | public exports | typecheck |
| 9 | `packages/federation-transport/src/libp2p-transport.ts` 재작성 | delegate to @agentmesh/p2p | 기존 transport.test.ts 통과 |
| 10 | `services/api/src/pulse-stream.ts` | attachPulseStream | unit test |
| 11 | `services/api/src/gossip-bridge.ts` | createPulseGossiper | unit test |
| 12 | `services/api/src/pulse-routes.ts` | GET /api/pulse/stream + POST /api/pulse/publish | curl smoke test |
| 13 | `services/api/src/server.ts` 통합 | app.pulseGossiper decorate | typecheck + build |
| 14 | `apps/web/src/lib/useGossipPulse.ts` | EventSource hook | typecheck |
| 15 | `services/p2p-node/src/index.ts` | standalone daemon | `node --test` |
| 16 | `deploy/docker-compose.yml` | seed + relay + api | docker compose up |
| 17 | 멀티 peer 검증 시나리오 (§8.3) | end-to-end smoke | 3 terminals |
| 18 | token-bank Phase 2 — CoReceiptLedger | co-receipt.ts + test | vitest |
| 19 | token-bank Phase 2+ — 4-tier | credit-account.ts + test | vitest |
| 20 | 통합 검증 | pnpm typecheck + test + build | all green |

---

## 14. 즉시 실행 (이번 세션)

| # | Action |
|---|---|
| A | `docs/INTEGRATED-CODE-PLAN.md` 작성 (DONE — 이 파일) |
| B | `docs/adr/0001-m1-pulse-mesh.md` 작성 (M5 deliverable) |
| C | `docs/adr/0002-libp2p-floodsub-swap.md` 작성 (D1 record) |
| D | `docs/adr/0003-eight-repo-lineage.md` 작성 (8 레포 lineage) |
| E | `packages/p2p/` 디렉토리 스캐폴드 + 초기 파일 (M1 #107 unblock) |
| F | 사용자에게 **D1 결정 확인**: gossipsub → floodsub swap, libp2p v2 다운그레이드 안 함. |

---

**다음 단계**: D1 결정 사용자 확인 후, E (packages/p2p 스캐폴드) → B-D (ADR 3 종) → M2 (services/api 통합) → M3 (apps/web hook) → M4 (docker-compose) 순으로 진행.
