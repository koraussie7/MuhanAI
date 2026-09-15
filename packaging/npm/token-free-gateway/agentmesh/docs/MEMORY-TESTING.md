# Memory Testing & Bound Policy — MuhanAI web

> Short, practical guidance for "the dashboard leaks / feels slow after hours"
> reports. Companion to bottom-up diagnosis (`scripts/memory-probe.mjs`).

_Last updated: 2026-09-08 (agent-cline)_

---

## 1. How to probe (headless, no deps)

```bash
# 1. web app (dev server is fine)
pnpm --filter @agentmesh/web run dev

# 2. headless Chrome with debugging port (--expose-gc enables forced GC)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --no-first-run \
  --remote-debugging-port=9222 --js-flags=--expose-gc \
  --user-data-dir=/tmp/muhanai-chrome about:blank

# 3. run the probe (requires Node >= 22; no npm install needed)
node scripts/memory-probe.mjs
# env overrides: CDP_PORT, APP_URL, IDLE_SECONDS, CYCLES,
#                MAX_IDLE_GROWTH_MB, MAX_CYCLE_GROWTH_MB
```

What it does:
- **Scenario A — idle**: load `/`, sample `performance.memory.usedJSHeapSize`
  every 5s, then force GC. Fail if retention exceeds `MAX_IDLE_GROWTH_MB`.
- **Scenario B — navigation**: visit every dashboard section × `CYCLES`
  (mount/unmount), force GC between cycles. Fail if end-of-cycle heap grows
  more than `MAX_CYCLE_GROWTH_MB`.

## 2. Current baseline (2026-09-08, headless Chrome 152, macOS)

| sample | heap |
|---|---|
| boot (`/`) | ~14 MB |
| idle 40s | 12.8–16.4 MB (no trend) |
| idle + GC | 12.4 MB |
| 4× section cycles + GC | 23.7 MB (flat), Δ −0.9 MB |

**No leak observed with idle/navigation alone.** The probes now guard against
regression in CI/dev instead.

## 3. Bounded-growth policy (implemented)

| surface | bound | why / implemented where |
|---|---|---|
| Cosmic mesh nodes | `MAX_MESH_NODES = 500` | `FindPage.tsx` `appendMeshNode` FIFO eviction |
| Cosmic mesh edges | `MAX_MESH_EDGES = 650` | `FindPage.tsx` `appendMeshEdge` FIFO eviction |
| Pulse SSE buffer | 50 msgs FIFO | `useGossipPulse` `bufferSize` |
| Event logs per node | 14 rows | `FindPage.addEvent` `slice(0, 14)` |
| Shockwave particles | 1.4s TTL | `spawnShockwave` timer cleanup |
| Block stream | 6 cards | `LiveBlockStream` `slice(0, 5)` |
| fast visual timers | paused when tab hidden | `useVisibilityAwareInterval` (SwarmRadar 50ms, Latency 1500ms, BlockStream 4000ms); renderLoop already pauses canvas when hidden |

Rule of thumb for reviewers: **any `setState` that appends to an
array/client-rendered list must be bounded** (cap + FIFO eviction, or an
explicit TTL removal). If you see an unbounded `[...prev, item]`, flag it
like a `TODO` on the PR — it is a memory leak by construction.

## 4. Known pre-existing failures

- `apps/web/src/components/Sidebar.test.ts` — NAV_GROUPS id-collision and
  unsupported `iconKey` assertions fail on `main` (pre-existing, unrelated
  to memory work; expected to clear once NAV_GROUPS data is fixed).

## 5. When to run a soak test

The probe is a fast (≈80s) regression gate. For **sustained** sessions
(1–8h), keep the tab open with a live API (`pnpm dev:api`) and re-run
scenario A with `IDLE_SECONDS=3600`. The SSE reconnection path
(`/api/pulse/stream`) only exercises when the API is actually up, so it is
the least measured surface — watch it in soak.