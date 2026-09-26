# Integration Synergy Analysis — muhanai × OpenHands × AgentAnycast

_Generated 2026-09-16. Working tree: `muhanai-com-bug-fix-investigation`._

## TL;DR

| Pair | Net verdict | Primary value | Primary cost |
| --- | --- | --- | --- |
| **muhanai ↔ OpenHands** | **Strong, complementary** | muhanai = free LLM gateway + agent fabric; OpenHands = mature agent orchestration & dev UX | API/protocol alignment (ACP vs OpenAI-compat) |
| **muhanai ↔ AgentAnycast** | **Direct overlap / partial merger** | AgentAnycast IS muhanai's Phase 5 (P2P, federated AgentMesh) | Brand/governance collision, low contributor base |
| **OpenHands ↔ AgentAnycast** | **Adjacent, low direct overlap** | OpenHands = agent runtime; AgentAnycast = peer transport | Thin shared surface today |
| **Three-way** | **Best when each owns its lane** | muhanai: gateway+fabric · OpenHands: dev canvas+ACP · AgentAnycast: P2P transport for AgentMesh | Three parties, three licenses, three repos |

**Single biggest synergy:** adopt AgentAnycast's P2P/A2A protocol as the transport for muhanai's Phase 5, and make OpenHands ACP-conformant agents first-class Provider Layer adapters. muhanai becomes the substrate both ecosystems run on.

---

## 1. What each project actually is

### 1.1 muhanai (this repo) — `andeya/token-free-gateway`

- **Token-Free Gateway (TFG)** — OpenAI-compatible API on `localhost:3456`, backed by 13 web-AI providers via Chrome DevTools Protocol. Single Bun-compiled binary, MIT license, `v0.5.2`, actively shipping.
- **AgentMesh** — coordination fabric: Registry, Cast (fan-out + consensus), Economy (credits/reputation), Knowledge (graph/verify), Topology. Phase 3-A in progress (live SSE, real `/api/network`).
- **web-app** — Vite + React 19 + TypeScript + Tailwind v4 dashboard, 31 routes, 8-language i18n, already built.
- **VISION.md three-layer model:** Application → Coordination (AgentMesh) → Provider. Phase 5 is explicitly "P2P & Decentralization" with libp2p/WebRTC, distributed registry, federated cast.

### 1.2 OpenHands — `OpenHands/OpenHands`

- 88k★ / 11.5k forks / MIT / Beta. Multi-repo system:
  - `OpenHands/OpenHands` — Agent Canvas (frontend), local-stack orchestration
  - `OpenHands/software-agent-sdk` — Python SDK + canonical Agent Server (REST)
  - `OpenHands/typescript-client` — browser-compatible client
  - `OpenHands/automation` — scheduling, webhooks
- Runs multiple agents (OpenHands, Claude Code, Codex, Gemini) plus any **ACP-compatible** third-party agent.
- Install paths: `npm install -g @openhands/agent-canvas` (full FS), Docker sandbox, or source.
- Pre-built integrations: Slack, GitHub, Notion, Linear (webhook triggers).

### 1.3 AgentAnycast — the `AgentAnycast` org (10 repos)

> **Resolved 2026-09-16 (later pass):** Appendix B Q1 asked whether AgentAnycast has a
> protocol spec / SDK outside its `website` repo. It does. The org publishes **10
> repositories**, so §2.2's "low maturity" risk is materially lower than the first
> pass assumed.

- **What it is:** a decentralized P2P runtime for the **A2A (Agent-to-Agent) protocol** —
  "The Connection Layer for AI Agents". Marketplace-facing pitch: connect agents across
  any network end-to-end encrypted, NAT traversal built in, zero configuration.
- **Distribution:** `pip install agentanycast` (Python SDK) · `npm install agentanycast`
  (TypeScript SDK) · `uvx agentanycast-mcp` (MCP server, claims 13+ AI tool platforms).
- **Repos and language split:**

  | Repo | Role | Lang |
  | --- | --- | --- |
  | `agentanycast` | Docs, protocol definitions, examples — *start here* | Shell |
  | `agentanycast-python` | Python SDK | Python |
  | `agentanycast-ts` | TypeScript SDK | TypeScript |
  | `agentanycast-mcp` | MCP server | Python |
  | `agentanycast-node` | Go daemon — P2P, encryption, NAT traversal, A2A engine | Go |
  | `agentanycast-relay` | Relay server — Circuit Relay v2, skill registry, federation | Go |
  | `agentanycast-identity` | W3C DID, VC 2.0, SPIFFE/OIDC | Go |
  | `website` | Official site | TypeScript |
  | `agentanycast-proto` | Protobuf/gRPC defs *(archived)* | Shell |
  | `.github` | Org profile + community health files | — |
- **Architecture (as documented):** thin SDK (Python/TS) ← gRPC over Unix socket → local
  **Go daemon** ← libp2p → remote agent. LAN peers find each other via mDNS; across
  networks a self-hosted relay provides NAT traversal (DCUtR + relay fallback) plus a
  **skill registry** for capability-based anycast routing — the relay sees only ciphertext
  (Noise_XX).
- **Reachability model:** `send_task(peer_id=…)` (by Peer ID) · `send_task(skill=…)` (anycast) ·
  `send_task(url=…)` (HTTP bridge to standard A2A agents).
- **Ecosystem:** adapters for CrewAI, LangGraph, Google ADK, OpenAI Agents SDK, Claude Agent
  SDK, AWS Strands; bidirectional **MCP Tool ↔ A2A Skill** mapping; W3C DID (`did:key`)
  identity with Verifiable Credentials.
- **Stage:** the org's umbrella repo (`agentanycast`) has the most traction (~79★); the SDK
  repos are fresh. License: **Apache-2.0** throughout (vs muhanai's MIT).
- Conceptually borrows "anycast" from networking (route to the topologically optimal node)
  and applies it to AI agents.

---

## 2. Pair-wise synergy analysis

### 2.1 muhanai ↔ OpenHands

**Where they are complementary**

| Dimension | muhanai brings | OpenHands brings |
| --- | --- | --- |
| Model access | 13 web providers, $0 cost, function calling via prompt injection | Bring-your-own-LLM, sandboxed runtime |
| Agent runtime | AgentMesh adapters (claude/chatgpt/deepseek/etc.) wrapping provider APIs | Agent Server (REST), Docker sandboxes, scheduling, webhooks |
| Coordination | Cast (fan-out + consensus), Registry, Economy, Knowledge graph | Conversation history, multi-agent sessions, automation workflows |
| UX | 31-page live dashboard, SSE, i18n | Agent Canvas — polished coding-agent console |
| Distribution | Single-binary CLI; npm; cross-platform | npm global; Docker; Vercel frontend; cloud option |

**Concrete synergy opportunities**

1. **OpenHands agents as AgentMesh Provider Layer adapters.** OpenHands' Agent Server is a REST API; muhanai's provider factory (`src/providers/factory/`) already speaks HTTP. Wrapping Agent Server behind the `ProviderAdapter` interface lets every OpenHands agent (Claude Code, Codex, Gemini, custom ACP) appear as a first-class "agent" inside AgentMesh's Registry/Cast. No muhanai user can run them today; this single integration unlocks them.
2. **Free-LLM hook for OpenHands.** OpenHands users normally pay per-token for Claude/Codex/etc. Pointing OpenHands' LLM client at `localhost:3456/v1/chat/completions` (with `api_key=any-string`) gives them free access via muhanai's web-session bridge. Risk: OpenHands assumes real API keys (rate limits, retries); muhanai sessions can be slow or fail under Cloudflare. Need a thin "session-aware client" wrapper.
3. **Agent Canvas as AgentMesh's operator UI.** OpenHands Canvas already solves "run multiple coding agents, view their state, trigger automations" — exactly the Operator Dashboard listed in muhanai's Phase 6. Rather than rebuild, embed it (Vercel-style) inside `web-app` behind a route guard.
4. **Agent-Client Protocol (ACP) becomes a Provider Layer standard.** Today muhanai adapters hand-roll provider-specific code. ACP would let any ACP-conformant agent (OpenHands, future ones) plug in without writing muhanai code. Cost: muhanai implements an ACP client in `src/providers/factory/`.

**Risks / costs**

- **License collision (none — both MIT).** ✓
- **Operational divergence:** OpenHands runs as long-lived processes / Docker; muhanai is stateless per-request. Bridging the lifecycle is non-trivial.
- **Token economics conflict:** OpenHands assumes paid LLMs with quota; muhanai's free-LLM route may break OpenHands features (long context, streaming, retries).
- **Scope creep:** muhanai is a small repo; adopting OpenHands' runtime pulls in Node 22, Docker, ACP server — a 10x surface-area jump. Should be a sibling project, not an inline dep.

**Recommended path:** implement an **ACP adapter for AgentMesh** (low risk, high value), document `OpenAIBaseURL=http://localhost:3456/v1` for OpenHands users (zero integration cost), but **do not** fork Agent Canvas into muhanai.

---

### 2.2 muhanai ↔ AgentAnycast

**Where they are nearly the same project**

| Dimension | muhanai | AgentAnycast/website |
| --- | --- | --- |
| Stack | Vite + React + TS + Tailwind v4 | Vite + React + TS + Tailwind v4 |
| Theme | Agents + provider federation | Agents + peer-to-peer |
| Stage | Phase 3-A (live data, dashboard shipping) | 9 commits, single landing page |
| License | MIT | Apache-2.0 |
| Roadmap phase | **Phase 5 = P2P & Decentralization** (libp2p, federated cast, distributed registry) | "Decentralized P2P runtime for A2A" — exact match |
| Target user | Developers + agents + humans | AI agents |

AgentAnycast is in spirit muhanai's **Phase 5 in a separate repo**. The naming ("AgentAnycast" = anycast routing applied to agents) maps cleanly onto muhanai's planned "Distributed Registry" / "Cross-Network Cast".

**Concrete synergy options**

1. **Pull AgentAnycast into muhanai as the Phase-5 reference implementation.**
   - **Cheapest:** add AgentAnycast as a workspace package (`packages/agentanycast-transport`), import its components, ship a unified brand.
   - **Cleaner:** upstream the homepage content into `web-app/src/pages/Landing.tsx` (or `/landing/:locale`), deprecate `AgentAnycast/website`, redirect `agentanycast.github.io/website` → `muhanai.com`.
2. **Use AgentAnycast's brand as a sub-product.** Position AgentAnycast as muhanai's "P2P distribution" layer — same brand surface, different deployment target (browser-PWA + libp2p node).
3. **Co-launch governance.** muhanai already has maintainer `andeya`; AgentAnycast repo has none visible. Offer maintainership, then merge.

**Risks / costs**

- **Brand dilution** if the user communities expect distinct projects.
- **Apache-2.0 vs MIT:** both permissive, but contributions to one license can't retroactively become the other. A merge needs an explicit license decision (pick MIT for compatibility with muhanai).
- **~~Low contributor base~~ → corrected:** the 9-commit / 0-star figure applied to
  `AgentAnycast/website` only. The org has **10 repos with real SDKs, a Go daemon, a relay,
  and an identity library**. Bus factor is still unknown (no visible external contributors),
  but the "spec is immature / undocumented" concern is **not** supported — see §1.3.
- **Overlapping scope, not just missing scope:** AgentAnycast already ships what §2.2
  proposes to build (`skill registry`, `relay`, `DID identity`, `MCP server`). Adopting it
  means choosing *reuse vs. own implementation* for each of those, not just filling Phase 5.

**Recommended path:** **adopt, don't merge.** Make `packages/agent-anycast` the canonical Phase-5 transport in muhanai. Repoint `AgentAnycast/website`'s landing copy to muhanai's branding. If the upstream maintainer engages, governance-share; otherwise fork into muhanai-org and credit.

---

### 2.3 OpenHands ↔ AgentAnycast

**Where they overlap**

Both care about "agents running somewhere and talking to other agents." OpenHands assumes a centralized Agent Server; AgentAnycast assumes no center. Direct integration today is thin because:

- OpenHands ACP is HTTP/REST, not P2P.
- AgentAnycast has no public SDK to plug into.

**Realistic synergy**

- An ACP-conformant agent registered into AgentAnycast's P2P mesh would be reachable from OpenHands Canvas. This is the **three-way** payoff (see §3).
- OpenHands' automation webhook system could trigger AgentAnycast anycasts (e.g., a GitHub PR opens → cast question to nearest available Codex agent).

**Risks:** two ecosystems that don't yet know about each other; this is the lowest-maturity leg of the triangle.

---

## 3. Three-way synergy (the strategic picture)

```
                          ┌──────────────────────────┐
                          │      Application         │
                          │  OpenHands Agent Canvas  │   ←─ coding-agent UX
                          │  Cursor / VS Code / SDK  │   ←─ OpenAI clients
                          └────────────┬─────────────┘
                                       │ OpenAI-compat / ACP / A2A
                  ┌────────────────────┼────────────────────┐
                  ▼                    ▼                    ▼
        ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
        │   muhanai TFG    │  │  AgentMesh       │  │  AgentAnycast    │
        │   (gateway)      │  │  (coordination)  │  │  (P2P transport) │
        │ 13 free LLMs     │  │ Registry/Cast/   │  │ A2A anycast      │
        │ function-calling │  │ Economy/Knowledge│  │ peer discovery   │
        └──────────────────┘  └──────────────────┘  └──────────────────┘
                  ▲                    ▲                    ▲
                  └────────────────────┴────────────────────┘
                                       │ Provider adapters
                          ACP / OpenAI-compat / A2A wire protocols
```

**Each party owns a distinct layer:**

| Layer | Owner | muhanai's role |
| --- | --- | --- |
| **Free-LLM gateway** | muhanai | Sole owner |
| **Agent coordination / cast / economy** | muhanai (AgentMesh) | Sole owner; the moat |
| **Coding-agent UX** | OpenHands | Embeddable as `web-app` route, not rebuilt |
| **P2P transport between AgentMesh instances** | AgentAnycast (today) → muhanai Phase 5 (target) | Adopted, rebranded |
| **Agent-Client Protocol (ACP)** | OpenHands | Adopt as standard adapter interface |

**Concrete three-way wins:**

1. **ACP + A2A dual-protocol Provider Layer.** Every agent registers with both an ACP endpoint (OpenHands-compatible) and an A2A peer ID (AgentAnycast-compatible). muhanai's Registry speaks both.
2. **OpenHands → muhanai as the default LLM backend.** Distribute a preset config (`~/.openhands/config.toml`) that points at `localhost:3456/v1`. Free models for OpenHands users; usage telemetry flows back to muhanai.
3. **AgentAnycast mesh as the testbed for Phase-5 cast.** muhanai users opt into a federated ring; gossip-based registry sync runs over AgentAnycast's libp2p transport. Phase-5 acceptance criteria = "two muhanai nodes can do Cross-Network Cast over AgentAnycast."
4. **Unified landing experience.** `AgentAnycast/website` becomes the public-facing "agent mesh" page inside muhanai's web-app; OpenHands Canvas is embedded as a route for power users; SDKs ship from a single monorepo.

---

## 4. Cost & risk roll-up

| Initiative | Engineering (rough) | Risk | ROI |
| --- | --- | --- | --- |
| ACP adapter inside AgentMesh | ~1–2 weeks | Low | High (unlocks 5+ OpenHands agents for free) |
| OpenHands Canvas embed route | ~3–5 days | Medium (UI scope creep) | Medium (UX win, no new capability) |
| `OpenAIBaseURL=http://localhost:3456/v1` config doc + smoke test | ~2 days | Low (session flakiness) | High (free LLMs for OpenHands users) |
| Pull AgentAnycast homepage into muhanai landing | ~1 day | Low (brand) | Medium (one fewer repo) |
| Make AgentAnycast P2P transport the canonical Phase-5 implementation | ~4–8 weeks | Medium-High (spec immaturity) | **Highest strategic value** |
| Three-way federation demo (two muhanai nodes + OpenHands agent + AgentAnycast peer discovery) | ~2 weeks | Medium | High (proves the thesis) |

---

## 5. Prioritized roadmap (next 90 days)

**Phase S1 — Low-risk wins (weeks 1–3)**
1. Add ACP adapter to `src/providers/factory/` (skeleton + one working agent, e.g. Codex via OpenHands Agent Server).
2. Publish `docs/integrations/openhands.md` documenting `OPENAI_BASE_URL=http://localhost:3456/v1` for OpenHands users.
3. Merge `AgentAnycast/website` content into `web-app/src/pages/Landing.tsx`, redirect GitHub Pages → muhanai.com, archive the standalone repo.

**Phase S2 — Strategic moat (weeks 4–8)**
4. Adopt AgentAnycast's P2P layer as `packages/agent-anycast-transport`. Wire it into muhanai's existing Registry gossip loop.
5. Implement "Cross-Network Cast" — two muhanai instances discover each other via AgentAnycast and execute a fan-out query end-to-end.
6. Embed OpenHands Agent Canvas behind `/console/openhands` in `web-app`, gated by capability flag.

**Phase S3 — Standardization (weeks 9–12)**
7. Co-author a public "A2A-over-ACP" spec doc that other AgentMesh implementations can conform to.
8. Ship muhanai as the default backend image in OpenHands' Docker compose.
9. Joint release announcement across muhanai + OpenHands + AgentAnycast channels (if governance alignment achieved).

---

## 6. What to do **first** if only one thing is possible

**Adopt AgentAnycast's P2P/A2A transport as muhanai's Phase-5 implementation.** Reasons:

- It is the only initiative that closes a roadmap gap (Phase 5 is on the books but unstarted).
- It removes a competing brand from the ecosystem instead of fragmenting it.
- It is independently valuable even if OpenHands integration never happens.
- **Correction to "smallest repo":** AgentAnycast is *not* the smallest of the three — the
  org spans 10 repos and three languages (Go/Python/TS). The
  bounded-cost argument still holds, but only if we adopt **one** artifact
  (`agentanycast-node` for the daemon, or `agentanycast-ts` for SDK-side integration) rather
  than the whole stack.

OpenHands integration is the second-best use of time, but only after AgentMesh's Phase-5 substrate exists — otherwise we have a polished UX layer on top of an unfinished coordination layer.

---

## Appendix A — Evidence used
- `andeya/token-free-gateway` — `README.md`, `package.json`, `docs/VISION.md`, `src/server.ts`, `src/providers/` tree
- `OpenHands/OpenHands` — README + repo metadata fetched via GitHub
- `AgentAnycast/website` — README + homepage at `https://agentanycast.io/` (live)
- **`AgentAnycast` org** — org README + all 10 repo listings, fetched via GitHub
  (`https://github.com/AgentAnycast`), 2026-09-16. Used to resolve Appendix B Q1.
- **muhanai local tree** — `services/api/src/server.ts:44` (`GATEWAY_URL` default),
  `packages/{peer-mesh,federation,agent-mesh,p2p}/`, `docs/adr/0001-multi-agent-coordination.md`
  (used for the §2.2 overlap audit and the Appendix B Q7 follow-up).

## Appendix C — Status of this document's action items
| Item | Status |
| --- | --- |
| `GATEWAY_URL` default `:8080` vs gateway `:3456` mismatch (§4 risk, A-priority fix) | **FIXED 2026-09-16** — `services/api/src/server.ts:46` now defaults to `http://localhost:3456` |
| Appendix B Q1 (AgentAnycast SDK/spec existence) | **RESOLVED** — see §1.3 |

## Appendix D — Related in-repo doc
- `docs/trueforge-integration-design.md` — a separate integration design (TrueForge) that
  predates this analysis; keep distinct, do not merge the two documents.

## Appendix B — Open questions to resolve before any merge
1. ~~Does `AgentAnycast` have a protocol spec / SDK outside the `website` repo? If yes, where?~~
   **ANSWERED 2026-09-16:** yes — the `AgentAnycast` org has 10 repos including
   `agentanycast-node` (Go daemon), `agentanycast-python`, `agentanycast-ts`,
   `agentanycast-mcp`, `agentanycast-relay`, and `agentanycast-identity`. Protocol
   definitions live in the `agentanycast` umbrella repo; `agentanycast-proto` (gRPC/Protobuf)
   is archived. See §1.3.
2. Who maintains AgentAnycast? Is there a path to shared governance, or is muhanai acquiring it?
   **Still open** — no visible external maintainers on the org; needs a direct approach.
3. Does OpenHands want muhanai as a recommended LLM backend (mutual announcement, doc linking)?
   **Still open.**
4. License decision if AgentAnycast is merged: keep Apache-2.0 in a sub-package, or relicense to MIT?
5. What governance / trademark protections exist for the "AgentAnycast" name? **Still open.**
6. **NEW — which single artifact to adopt?** Given §1.3, the choice is now:
   - `agentanycast-ts` + `agentanycast-node` → browser/muhanai-native P2P (matches
     `web-app` + Phase-5 "distributed registry"), or
   - `agentanycast-mcp` → cheapest surface (MCP server only), or
   - full stack → highest cost, duplicates muhanai's `peer-mesh` / `federation` / `p2p` pkgs.
7. **NEW — overlap audit.** muhanai already ships `packages/peer-mesh`,
   `packages/federation` (with `libp2p-transport.ts`), and `packages/p2p`. Decide per module
   whether AgentAnycast **replaces**, **wraps**, or **coexists with** those before merging.
