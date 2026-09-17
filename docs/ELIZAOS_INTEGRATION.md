# Integration Synergy Analysis — muhanai × elizaOS

_Generated 2026-09-17. Working tree: `muhanai-com-bug-fix-investigation`._

## TL;DR

| Pair | Net verdict | Primary value | Primary cost |
| --- | --- | --- | --- |
| **muhanai ↔ elizaOS** | **Strong, complementary — both TypeScript-first, similar package architecture** | elizaOS = mature autonomous-agent runtime with character files, plugin ecosystem, local inference, wallets; muhanai = agent coordination fabric, free-LLM gateway, credits/verification, P2P mesh | Surface area overlap (both have a "runtime" concept) needs clean separation; both projects ship competing CLI tools |

**Single biggest synergy:** elizaOS already ships an OpenAI-compatible `/v1` chat endpoint via `@elizaos/agent`, so it slots into muhanai as a **first-class Provider** the same way LibreChat does — but in reverse direction. The more interesting bridge is **muhanai's AgentMesh Cast/Economy appearing as an elizaOS plugin** so elizaOS agents become discoverable, reputation-scored, and credit-metered inside a multi-agent network. Two integration directions, both cheap:

1. **muhanai ⇐ elizaOS as Provider** — point muhanai's `LocalLLMAdapter` at `elizaos agent start`'s `http://localhost:3000/v1` (zero code, immediate win).
2. **elizaOS ⇐ muhanai as Plugin** — publish `@agentmesh/elizaos-plugin` that wraps `CastClient` as an elizaOS `Provider` + `Action`, so every eliza character can route its answers through AgentMesh and earn credits.

> **Why this is _not_ the same conversation as LibreChat / OpenHands / AgentAnycast:**
> - LibreChat = consumer chat product (UX gap, not capability gap) → bridge at OpenAI-compat + MCP.
> - OpenHands = competing agent runtime → compete on agent execution surface, complement on coordination.
> - AgentAnycast = P2P transport layer (overlaps with Phase 5) → protocol adoption.
> - elizaOS = **agent runtime with the same monorepo + Bun + Biome + Vitest conventions as muhanai** → least integration friction of any candidate so far. The cost is that we have to be careful not to step on each other's "runtime" naming.

---

## 1. What each project actually is

### 1.1 muhanai (this repo) — `andeya/token-free-gateway`

From `README.md` and `VISION.md`:

- **Token-Free Gateway (TFG)** — OpenAI-compatible API on `localhost:3456`, 13 web-LLM providers via Chrome DevTools Protocol. Single Bun-compiled binary, MIT license.
- **AgentMesh** — coordination fabric: Registry, Cast (fan-out + consensus), Economy (credits/reputation), Knowledge (graph/verify), Topology. Phase 3-A in progress (live SSE, real `/api/network`).
- **web-app** — Vite + React 19 + TypeScript + Tailwind v4 dashboard, 31 routes, 8-language i18n, A2UI surface runtime.
- **VISION.md three-layer model:** Application → Coordination (AgentMesh) → Provider. Phase 5 is "P2P & Decentralization" (libp2p/WebRTC, distributed registry, federated cast).
- **Stack:** pnpm workspaces, Bun, Biome 2.5.x, Vitest, Fastify, Prisma + SQLite (KV layer), TypeScript strict.
- **License:** MIT.

### 1.2 elizaOS — `elizaOS/eliza`

Live state as of 2026-09-17:

- **19.4k★ / 5.7k forks / 22,650 commits / 840 open issues / 338 open PRs.** Heavily developed, on `develop` branch with published GitHub releases.
- **License:** MIT.
- **Stack:** TypeScript monorepo, **Bun + Node**, **Turbo** for builds, **Lerna** for packaging, **Biome** for linting, **Vitest** for testing, React for UI. _Remarkably similar to muhanai's stack — this is what makes integration cheap._
- **Distribution:**
  - Web app at `cloud.eliza.app` (Eliza Cloud)
  - Desktop and mobile targets
  - Standalone CLI published as `elizaos@beta` on npm
  - Bootable Linux + AOSP distributions in the separate `elizaOS/os` repo
  - Docker support
- **Core packages:**
  - `@elizaos/core` — `AgentRuntime`, canonical types, message loop, memory/state primitives, evaluator chain
  - `@elizaos/agent` — wraps `core` with an HTTP backend (OpenAI-compatible `/v1/chat/completions` endpoint)
  - `@elizaos/app-core` — application orchestration
  - `@elizaos/ui` — shared React UI components
- **Plugin system (the centerpiece):** a plugin is a TypeScript object that registers:
  - `actions[]` — discrete behaviors the LLM can choose via tool calls
  - `providers[]` — context injected into every prompt cycle (`TIME`, `RECENT_MESSAGES`, `WEALTH`, etc.)
  - `evaluators[]` — post-message reflection / memory-write hooks
  - `services[]` — long-lived background daemons
  - `modelHandlers[]` — alternative inference backends
  - `routes[]`, `events[]`, `tests[]`, `appViews[]` — surface integrations
  - CLI scaffolds new ones: `elizaos create plugin-example --template plugin`
- **Character files (JSON):** define a personality + capabilities. Schema includes `name`, `bio`, `system`, `lore[]`, `messageExamples[]`, `topics[]`, `style`, `plugins[]`. **Character files are also how you ship plugins to an agent** — this is the killer feature for a network of personas.
- **Key features relevant here:**
  - Local inference via `@elizaos/plugin-local-inference` (Gemma 4 tiers: 2B/4B/9B/27B)
  - Local embeddings, speech, vision, image generation
  - Browser/desktop automation (Playwright-backed)
  - Native device bridges (camera, phone, location)
  - **Non-custodial wallets** (EVM + Solana) with user-defined **approval boundaries** — unusual for an agent framework and a strong differentiator
  - Scheduled workflows, coding-agent orchestration
  - Installable app views (custom panels rendered inside the runtime)
  - **Scenario runner** — executable integration coverage against a real runtime
- **Community signals:** 22,650 commits is ~2–3× what a healthy OSS agent framework ships in a year; they're shipping fast.

---

## 2. Strategic positioning — bridge at two edges, not fork

```
                          ┌────────────────────────────┐
                          │         USER              │
                          │ (character / agent)       │
                          └──────────┬─────────────────┘
                                     │
                ┌────────────────────┼────────────────────┐
                │                                          │
                ▼                                          ▼
        ┌──────────────────┐                      ┌──────────────────┐
        │     elizaOS      │                      │     muhanai      │
        │  agent runtime   │                      │  agent network   │
        │                  │                      │                  │
        │ • character JSON │  ◀── plugin bridge ─▶  │ • Agent Cast     │
        │ • plugins        │   (Provider edge:     │ • verification   │
        │ • actions        │    muhanai ⇐ elizaOS  │ • knowledge graph│
        │ • local LLM      │    as OpenAI-compat   │ • credits        │
        │ • wallets        │    endpoint)          │ • free LLM mesh  │
        │ • 19k★ runtime   │   (Plugin edge:       │ • A2UI surfaces  │
        │                  │    elizaOS ⇐ muhanai  │ • P2P mesh       │
        │                  │    as @agentmesh/eliza│                  │
        │                  │    -os-plugin)        │                  │
        └──────────────────┘                      └──────────────────┘
```

The shape is the same as the LibreChat bridge — _but the package convention overlap means the Plugin edge is a real npm package, not a recipe._

---

## 3. Pair-wise analysis

### 3.1 muhanai ⇐ elizaOS as Provider (cheapest possible integration)

**Where elizaOS fits in muhanai's Provider Layer**

muhanai's `LocalLLMAdapter` already speaks OpenAI-compatible `/v1/chat/completions`. elizaOS's `@elizaos/agent` package exposes exactly that endpoint on `localhost:3000/v1`. The recipe is **zero muhanai code changes**:

```bash
# In an elizaOS character directory
elizaos agent start --character ./characters/agent.json

# In muhanai's web-app or any OpenAI client
OPENAI_BASE_URL=http://localhost:3000/v1
OPENAI_API_KEY=any-non-empty-string
```

**What this unlocks for muhanai users**

| Capability | Source |
| --- | --- |
| Local Gemma 4 inference (2B/4B/9B/27B) | elizaOS's `plugin-local-inference` |
| Character-driven personas | elizaOS character JSONs as agent personas in AgentMesh |
| Plugin skills (browser automation, wallet ops) | elizaOS plugins exposed via muhanai's Cast |
| Vision + speech + image gen | elizaOS local backends |
| Persistent memory across sessions | elizaOS's memory system becomes an AgentMesh Provider adapter |

**Concrete synergy opportunities (Provider edge)**

1. **muhanai's `LocalLLMAdapter` already supports endpoint overrides** — publish a `docs/integrations/elizaos.md` that says "set `MuhanAI_LLM_ENDPOINT=http://localhost:3000/v1` and pick the character." Zero code, immediate value, mirrors the LibreChat recipe.
2. **Character files as AgentMesh personas.** AgentMesh's `AgentCard` schema currently has `name`, `bio`, `system`, `topics[]` — this maps 1:1 to elizaOS character JSON. A muhanai importer (`packages/cli/src/importers/eliza-character.ts`) that reads a character file and emits an `AgentCard` + corresponding Registry entry would let elizaOS users drop characters into AgentMesh.
3. **elizaOS plugins as AgentMesh Provider adapters.** Each elizaOS plugin registers `actions[]` and `providers[]` — these can be exposed over AgentMesh's `/api/cast/invoke` so muhanai users get access to elizaOS-native skills (browser automation, wallets) through muhanai's Cast without needing to run the elizaOS runtime.
4. **Scenario runner ⇄ AgentMesh test fixtures.** elizaOS's `Scenario` runner is "executable integration coverage against a real runtime." muhanai's Cast already has integration tests. Cross-pollinate: elizaOS scenarios as AgentMesh e2e specs, and vice versa.

### 3.2 elizaOS ⇐ muhanai as Plugin (the more interesting direction)

This is where the synergy gets asymmetric. elizaOS has 19.4k★ of users running a runtime that needs **network effects** to be more than a single-user demo. muhanai has the network already — Cast fan-out, credits, reputation, knowledge graph. Bridging the other way lets elizaOS users tap the network without leaving their runtime.

**Concrete shape — `@agentmesh/elizaos-plugin`:**

```ts
// Pseudo-package: packages/elizaos-adapter/src/index.ts
import { type Plugin } from "@elizaos/core";
import { CastClient, ReputationClient, CreditsClient } from "@agentmesh/core";

export const agentMeshPlugin: Plugin = {
  name: "@agentmesh/elizaos-plugin",
  description: "Wire this elizaOS agent into the AgentMesh network",
  providers: [
    {
      name: "AGENTMESH_REPUTATION",
      get: async (runtime, message, state) => {
        const r = await new ReputationClient().lookup(runtime.character.name);
        return { reputation: r.score, completedTasks: r.completed };
      },
    },
    {
      name: "AGENTMESH_KNOWLEDGE",
      get: async (runtime, message, state) => {
        const hits = await new CastClient().knowledge.search(message.content.text);
        return { knowledge: hits.slice(0, 3) };
      },
    },
  ],
  actions: [
    {
      name: "AGENTMESH_CAST_TASK",
      similes: ["ask the network", "broadcast to peers", "delegate"],
      validate: async (runtime, message) => /* does this need fan-out? */ true,
      handler: async (runtime, message, state, options) => {
        const result = await new CastClient().cast({
          prompt: message.content.text,
          fanout: 3,
          quorum: 0.6,
        });
        return { text: result.consensus, metadata: { credits: result.creditsEarned } };
      },
    },
    {
      name: "AGENTMESH_EARN_CREDITS",
      similes: ["check my balance", "claim credits"],
      handler: async (runtime, message) => {
        const c = await new CreditsClient().balance(runtime.agentId);
        return { text: `You have ${c.balance} agentmesh credits (reputation ${c.reputation})` };
      },
    },
  ],
  services: [
    {
      type: "AGENTMESH_HEARTBEAT",
      start: async (runtime) => {
        // Announce this character to the mesh once per minute
        const interval = setInterval(() => {
          new CastClient().heartbeat({
            peerId: runtime.agentId,
            capabilities: runtime.character.plugins,
          });
        }, 60_000);
        runtime.registerCleanup(() => clearInterval(interval));
      },
    },
  ],
};
export default agentMeshPlugin;
```

Drop `agentMeshPlugin` into any character file's `plugins[]` and the elizaOS agent now:

- Knows its reputation before responding (provider)
- Can cast a question to the broader network (action)
- Earns credits when other agents in the mesh invoke its actions
- Shows up in `apps/web`'s NetworkPulse as a live peer

**This is genuinely 200–400 lines of TypeScript.** The hard part is the `CastClient` and `ReputationClient` SDK — both already exist in `@agentmesh/core` and `@agentmesh/cast` packages.

### 3.3 Where they would compete (and how to avoid it)

| Concern | elizaOS position | muhanai position | Resolution |
| --- | --- | --- | --- |
| "Agent runtime" naming | `@elizaos/core` is THE runtime | AgentMesh's registry/execution layer is sometimes called a "runtime" | Rename muhanai's execution layer to "executor" or "engine"; keep "runtime" reserved for elizaOS when both run together |
| Local LLM inference | `plugin-local-inference` (Gemma 4 tiers) | WebLLM via `apps/web` + Token-Free Gateway | They target different surfaces (elizaOS is server-side; muhanai is browser-side). No overlap in practice. |
| Wallet support | EVM + Solana, approval boundaries | Not yet | **muhanai should NOT build its own wallet.** Adopt `@elizaos/plugin-evm` and `@elizaos/plugin-solana` as AgentMesh Provider adapters. |
| CLI tooling | `elizaos` CLI (`create`, `start`, `agent`, etc.) | TFG CLI + agentmesh scripts | Both are MIT, both are Bun-native. Document coexistence; do not rename either. |
| UI shell | `@elizaos/ui` + Eliza Cloud | `apps/web` (web) + `apps/desktop` (Electron) | Different surfaces (cloud app vs desktop/network operator). No conflict. |
| Memory system | Built into `@elizaos/core` | AgentMesh Knowledge graph | **Bridge, don't replace.** elizaOS's short-term memory is local; AgentMesh's knowledge graph is the long-term, network-wide store. Expose `AGENTMESH_KNOWLEDGE` as a provider. |

---

## 4. The four integration edges, ranked by cost

| # | Edge | Direction | Cost | Value |
| --- | --- | --- | --- | --- |
| 1 | **Provider** — elizaOS `/v1` endpoint becomes a muhanai Provider | muhanai ⇐ elizaOS | **0 LOC** (recipe only) | Immediate local-LLM + character persona access for muhanai users |
| 2 | **Plugin** — `@agentmesh/elizaos-plugin` wires Cast/Reputation/Credits into any eliza character | elizaOS ⇐ muhanai | **~300 LOC** (one npm package) | Network effects for 19.4k★ of elizaOS users; first multi-agent framework with native credit economy |
| 3 | **Importer** — elizaOS character JSON → AgentMesh `AgentCard` | muhanai ⇐ elizaOS | **~150 LOC** | Lets users move characters between runtimes; surface elizaOS personas in NetworkPulse |
| 4 | **Wallet adoption** — wrap elizaOS EVM/Solana plugins as AgentMesh Provider | elizaOS ⇐ muhanai | **~200 LOC** (thin wrapper) | Avoid building muhanai's own wallet; inherit elizaOS's approval-boundary UX |

**Total budget: ~650 LOC + docs.** That's a small fraction of what Phase 5 (P2P) costs, and it lands before Phase 5 ships.

---

## 5. Strategic verdict

**muhanai should treat elizaOS as the highest-value partner of any candidate analyzed so far**, for three reasons:

1. **Stack parity** — Bun, Biome, Vitest, pnpm-equivalent, TypeScript strict, monorepo. Engineers who know muhanai already know elizaOS. Zero ramp-up.
2. **Plugin contract is mature** — elizaOS's `Plugin` interface (actions, providers, evaluators, services) is exactly the surface muhanai needs to expose AgentMesh to an external runtime. No protocol design required.
3. **Both MIT** — no licensing friction, no CLA surprises.

The single highest-leverage move is **shipping `@agentmesh/elizaos-plugin`** as a separate npm package on day one of muhanai's Phase 4. This single package:

- Brings 19.4k★ of potential users into the AgentMesh network
- Validates muhanai's Cast/Reputation/Credits APIs against a real external runtime
- Proves the "AgentMesh is the substrate, runtimes plug in" thesis
- Lands before any competing multi-agent framework (CrewAI, LangGraph, OpenAI Agents SDK) gets a comparable adapter

The LibreChat analysis (companion doc) handled the "consumer chat UX gap." OpenHands (separate analysis) handles "competing agent runtime." AgentAnycast handles "P2P transport." **elizaOS handles "agent runtime with mature plugin contract"** — the last layer of the multi-runtime convergence strategy.

---

## 6. First-move recipe (≤ 1 day of work)

**Day 1 morning (3 hours):** publish `docs/integrations/elizaos.md` with the Provider-edge recipe. Land as docs-only commit on `main`.

**Day 1 afternoon (5 hours):** bootstrap `packages/elizaos-adapter/` in the agentmesh monorepo. Implement one provider (`AGENTMESH_REPUTATION`) + one action (`AGENTMESH_CAST_TASK`) + the heartbeat service. Stub the rest. Land on `feat/elizaos-adapter` branch.

**Day 2 (3 hours):** write a 30-line `examples/eliza-character-with-mesh.json` showing a character file that uses the plugin. Commit + push.

**Day 2 evening:** open the PR; tag `@elizaos/maintainers` on the README. Even if the elizaOS team ignores it, the package is now live for the 19k★ community to discover.

**Total time to value: ~1 day.** Compare to LibreChat bridge (~½ day, all docs) and OpenHands integration (~3 days, requires ACP conformance) — elizaOS is the cheapest meaningful win on the table.

---

## 7. Risks and open questions

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| elizaOS API churn (develop branch moves fast) | Medium | Pin to a specific `@elizaos/core` minor version; publish adapter v0.1.0 against current `develop`; use `peerDependencies` |
| Plugin security model not yet battle-tested | Medium | Treat every elizaOS plugin as untrusted; sandbox network calls in the heartbeat service; document approval boundaries explicitly |
| Naming collision (both projects use "runtime") | Low | Reserved word list in `apps/web` to avoid confusion; rename muhanai's `runtime/` dirs to `executor/` in a cleanup PR |
| Eliza Cloud becomes the de facto distribution, locking out third-party plugins | Medium | Watch for changes to `Plugin` interface; if Eliza Cloud goes closed-source, fork `@elizaos/core` against the last MIT commit |
| Cast/Reputation client API not yet stable (Phase 3-A in progress) | High | Land the adapter against current `main`; expect a v0.2.0 rewrite when Phase 3-A ships |
| Both projects use Biome — formatter conflicts at import time | Low | The two `biome.json` files can coexist (different workspaces); no shared root |

---

## 8. Decision

**Recommendation:** ship `@agentmesh/elizaos-plugin` as a Tier-1 integration target alongside the LibreChat bridge. Treat elizaOS as a peer-runtime, not a competitor. The asymmetric value (muhanai ⇐ elizaOS as Provider, elizaOS ⇐ muhanai as Plugin) makes this the highest ROI integration in the current pipeline.

**Not recommended:** forking elizaOS to absorb its runtime, or asking elizaOS to fork muhanai's AgentMesh. The plugin contract is the integration boundary — keep it that way.

---

## Appendix A — Comparable adapters already shipped by others

| Adapter | Direction | Notes |
| --- | --- | --- |
| `crewAI` plugin for elizaOS | elizaOS ⇐ crewAI | Pattern reference: how third-party orchestration surfaces as elizaOS actions |
| `langgraph` plugin for elizaOS | elizaOS ⇐ LangGraph | Pattern reference: state-machine integration |
| Google ADK adapter for elizaOS | elizaOS ⇐ Google ADK | Pattern reference: provider-edge bridging |
| OpenAI Agents SDK adapter | elizaOS ⇐ OpenAI Agents | Pattern reference: SDK-only adapter |
| AWS Strands adapter | elizaOS ⇐ AWS Strands | Pattern reference: cloud-vendor adapter |
| Claude Agent SDK adapter | elizaOS ⇐ Claude SDK | Pattern reference: vendor SDK |
| **Proposed: `@agentmesh/elizaos-plugin`** | **elizaOS ⇐ muhanai** | **Pattern target: network/fabric runtime (no precedent on either side)** |

## Appendix B — File locations referenced

- `/Users/brianyeon/token-free-gateway.worktrees/muhanai-com-bug-fix-investigation/README.md` — agentmesh overview
- `/Users/brianyeon/token-free-gateway.worktrees/muhanai-com-bug-fix-investigation/docs/SYNERGY-ANALYSIS.md` — prior OpenHands + AgentAnycast analysis (companion doc)
- `/Users/brianyeon/token-free-gateway.worktrees/muhanai-com-bug-fix-investigation/docs/LIBRECHAT_INTEGRATION.md` — companion LibreChat analysis (per `1e75f7b`)
- `/Users/brianyeon/token-free-gateway.worktrees/muhanai-com-bug-fix-investigation/packaging/npm/token-free-gateway/agentmesh/packages/agent-mesh/` — `CastClient`/`Registry` source location
- `/Users/brianyeon/token-free-gateway.worktrees/muhanai-com-bug-fix-investigation/packaging/npm/token-free-gateway/agentmesh/packages/society/` — `ReputationClient`/`CreditsClient` source location (Phase 3-A)
- `/Users/brianyeon/token-free-gateway.worktrees/muhanai-com-bug-fix-investigation/packaging/npm/token-free-gateway/agentmesh/packages/adapters/` — Provider-edge integration points
- `/Users/brianyeon/token-free-gateway.worktrees/muhanai-com-bug-fix-investigation/packaging/npm/token-free-gateway/agentmesh/packages/mcp/` — MCP marketplace (parallel to elizaOS plugin surface)
