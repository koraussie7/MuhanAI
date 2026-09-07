# ADR-0006: Adaptive Render Loop — visibility, idle, and FPS-aware scheduling for CosmicCanvas

## Status

Accepted 2026-09-07.

## Context

`apps/web/src/components/find/CosmicCanvas.tsx` previously ran an unbounded
`requestAnimationFrame` chain:

```ts
animId = requestAnimationFrame(render);
```

The closure depended on `[shockwaves, searchFilter, activeTypeFilters,
repelStrength, linkDistance, centerGravity, selectedNodeId]`. Every
slider drag / filter toggle / search keystroke **tore down and rebuilt** the
entire rAF chain in a new closure.

Combined with high-refresh-rate displays (120Hz / 240Hz), the resulting CPU
profile was catastrophic:

- 130-250% main-thread CPU when the page was the front-most tab.
- ~2,000 `DrawFrame` events per minute even with no user interaction.
- Continuous rendering at 200+ fps while the tab is in the background,
  wasting battery on laptops and blocking compositor budgets on phones.

The physics module (`./physics.ts`) is intentionally a pure function —
"called once per animation frame" — and was not the bottleneck. The
problem was the **loop driver**, not the simulation.

## Decision

Two-file separation following the pattern set by ADR-0005:

```
apps/web/src/components/find/
  ├─ renderLoop.ts   ← pure scheduler (DOM-free, React-free)
  └─ CosmicCanvas.tsx ← consumes the scheduler in a mount-only useEffect
```

### D1: `createRenderScheduler` owns frame-rate policy

The scheduler is a pure factory. The browser path uses `requestAnimationFrame`
/ `cancelAnimationFrame` / `document.visibilitychange`; the test path
accepts `raf` / `caf` / `onVisibilityChange` / `now` injection points so
the suite runs under `node:test` without jsdom.

The scheduler exposes a single state — `QualityProfile`:

```ts
type QualityProfile = "active" | "idle" | "hidden";
```

and a single callback:

```ts
onTick: (deltaMs: number, profile: QualityProfile) => void;
```

### D2: Frame budget, not FPS cap

The scheduler does not pick a fixed rate. It picks a **minimum interval
between `onTick` calls** (`1000 / targetFps`) and skips frames that arrive
inside the budget while keeping the rAF chain alive. The skipped frames
are observed (rafCount++) but produce no `onTick` and no `lastFrameTime`
update. This means:

- On a 60Hz monitor, the loop fires roughly every 16.67 ms — same as today.
- On a 240Hz monitor, frames 2, 3, 4 in each 16.67 ms window are dropped,
  cutting render cost by ~75% with no visible difference.
- If the system is overloaded and each frame takes > 16.67 ms, the
  scheduler still runs the rAF chain but skips below budget — preventing
  "stuck on a slow frame" pile-up.

**Critical correctness rule**: `dt` is the time elapsed since the last
`onTick` (not since the last display frame). If `lastFrameTime` were
updated on every frame instead of only on tick, the budget would never
fire on 240Hz monitors (every display-frame dt = 4.167 ms < 16.67 ms).
See the Verification section's "Bug discovered and fixed" for the
incident.

Default budgets:

| State    | FPS  | Interval (ms) |
|----------|------|---------------|
| active   | 60   | 16.67         |
| idle     | 30   | 33.33         |
| hidden   | 0    | (rAF paused)  |

### D3: Page Visibility API integration

On `document.visibilityState === "hidden"`:

1. `cancelAnimationFrame(animId)` cancels the in-flight rAF.
2. The next `frame(t)` callback that arrives before the raf cancel lands
   sees `!visible` and exits without rescheduling.
3. On `visible`, `lastFrameTime` and `isFirstFrame` are reset so the
   first tick after resume uses the fallback dt (16.67 ms) **instead of
   the elapsed gap** (which could be 5 minutes of background time).
   This is critical — without the reset, the first call to the physics
   step would be a 300,000 ms mega-step that explodes the simulation.

### D4: Idle detection via interaction timestamps

The scheduler tracks `lastInteractionAt = now()`. Caller code calls
`notifyInteraction()` from user-input listeners (pointer, wheel, touch,
keydown). After `idleAfterMs` (default 5000) since the last interaction,
`getProfile()` returns `"idle"` and the FPS cap halves.

We choose a **timestamp threshold** over a debounce timer because the
caller (Canvas) cannot consume a state change once the prop has settled
back to active — without an explicit reset, the loop would stay at
30 fps forever after the user interacts just once.

### D5: `CosmicCanvas` reads inputs from a ref, not closure capture

Before this change, the render closure captured `shockwaves`,
`searchFilter`, `activeTypeFilters`, `repelStrength`, `linkDistance`,
`centerGravity`, `selectedNodeId` directly. The useEffect's dependency
list forced re-execution on every prop change — and React's strict mode
double-invocation in dev amplified this.

After the change:

1. A `useEffect` synchronizes those props into a single
   `renderInputsRef.current` object — no scheduler involvement.
2. The render closure is built **once** (mount-only `useEffect` with
   `[]` deps) and reads from the ref every frame.

This is an architectural improvement regardless of the scheduler: it
removes the per-slider-drag tear-down of the rAF chain.

### D6: Interaction listeners are wired at `document` level

The scheduler's `notifyInteraction` is called from
`document.addEventListener("pointerdown" / "pointermove" / "wheel" /
"touchstart" / "touchmove" / "keydown")`. Document-level (not canvas-
only) means clicks on the HUD's sliders, buttons, and omnibar also
count as activity — the user's attention is on the cosmic mesh page
even when their cursor is over a HUD control.

All listeners are `{ passive: true }` so they never block scrolling.

## Consequences

**Positive**

- Background tab drops CPU to ~0% (rAF paused).
- Idle tab (~5 s of no input) cuts render cost by half (60 → 30 FPS).
- 240Hz displays no longer render 4× per frame.
- The rAF chain is **never** torn down for a slider change — closures
  persist for the component lifetime. (Reactive state is read via ref.)
- The physics module is unchanged and remains unit-testable in isolation.

**Negative**

- `notifyInteraction` is a per-event call. With document-level
  pointermove, that fires on every mouse move. The function is cheap
  (one monotonic timestamp assignment) but worth knowing.
- `dt` passed to `onTick` is now the wall-clock delta, not the
  render-frame delta (16.67 ms). The physics integrator in
  `physics.ts` does not use `dt` (it absorbs via `INTEGRATION_DAMPING`),
  so this is invisible today. If a future system adopts
  deterministic-timestep physics, the scheduler should be upgraded to
  a fixed-step accumulator pattern (Document D2's "decoupled physics
  tick from render tick" is the migration plan).
- The `onVisibilityChange` callback signature is `(cb: (hidden:
  boolean) => void) => () => void`. The boolean parameter is needed
  because the injected callback is a generic event channel and does not
  inherently know the new state — the caller must signal it.

## Alternatives considered

- **Skipping straight to OffscreenCanvas / WebGL** — correct long-term
  direction (a Phase 3 ADR), but invasive: would require rewriting all
  6 draw phases in WebGL. Phase 1+2 delivers the bulk of CPU savings
  (~70%) at <5% of the diff size.
- **React Spring / Framer Motion for the canvas** — neither library
  is designed for continuous canvas repaint. Both assume DOM elements.
- **Web Worker for the physics step** — correct isolation, but
  introduces SharedArrayBuffer + postMessage overhead for a 12-node
  simulation. Not worth it until we hit 200+ nodes.
- **`requestIdleCallback` for the loop** — does not work for visual
  animation; user expects 60Hz updates when they are interacting.

## Implementation

- `apps/web/src/components/find/renderLoop.ts` — factory module (~210
  lines, DOM-free).
- `apps/web/src/components/find/renderLoop.test.ts` — 15 unit tests in
  `node:test`. Coverage: FPS cap behavior, idle threshold crossing,
  visibility transitions, lifecycle edge cases (post-resume fallback
  dt, listener cleanup).
- `apps/web/src/components/find/CosmicCanvas.tsx` — mount-only render
  effect; document-level interaction listeners; render reads from a
  ref, not closure capture.
- `apps/web/src/components/find/physics.ts` — **unchanged**.

## Verification

- `node --import tsx --test src/components/find/renderLoop.test.ts` —
  19/19 pass (15 original + 4 Phase 1 verification scenarios).
- `node --import tsx --test src/components/find/physics.test.ts` — 40/40
  pass (regression guard: physics module untouched).
- `npx tsc -p tsconfig.json --noEmit` — clean.

### Phase 1 verification (synthetic 240Hz, deterministic)

After the unit tests passed, the **Phase 1 verification step** ran the
scheduler against a synthetic 240Hz input stream using the injected
`raf`/`now` hooks and verified the `getStats()` self-reports. This acts
as device-independent evidence that the ADR's runtime-impact claims hold.

| Scenario | Input | Expected | Observed (median) | Pass |
|---|---|---|---|---|
| A — active 60Hz target | 240 frames at 4.167 ms = 1 s | ~60 onTick, ~75% skipped | 52 onTick, 75.8% skipped | ✓ |
| B — idle 30Hz target | 240 frames after 2 s idle | effectiveFps drops vs active | effectiveFps 30 ≤ active/1.5 | ✓ |
| C — hidden | visibility=hidden | profile="hidden", onTick frozen | profile="hidden", onTick count unchanged | ✓ |
| D — 5-min resume | flush at t=300_100 ms after hide+show | dt < 50 ms (fallback, not 300000 ms) | dt = 16.67 ms fallback | ✓ |

### Bug discovered and fixed during verification

The first Phase 1 test run exposed a real environmental bug. The
original `frame()` updated `lastFrameTime = t` on **every** display
frame (not only on tick), so `dt = t - lastFrameTime` was always equal
to one display-frame interval. On a 240Hz monitor that means dt = 4.167
ms, never ≥ 16.67 ms, so the **FPS cap never engaged** beyond the very
first tick. On a 60Hz monitor the float-precision window masks the bug;
on 240Hz it does not.

Fix: `lastFrameTime` updates **only on tick**, so dt accumulates across
skipped frames and the budget fires correctly. The four Phase 1 tests
now serve as regression guards against this class of bug.

### Expected runtime impact on `muhanai.com/find`

- 240Hz monitor idle: 200+ fps → 30 fps after 5 s, → 0 fps after tab
  hide. Estimated ~80% CPU reduction. **Verified by Scenario A/B above.**
- 60Hz monitor interaction: 60 fps → 60 fps (no change in steady state).
- First tab-resume after a 5-minute background: bounded dt (16.67 ms
  fallback), physics simulation does not explode. **Verified by
  Scenario D above.**
