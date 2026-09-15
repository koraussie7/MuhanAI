#!/usr/bin/env node
/**
 * MuhanAI memory probe — headless Chrome (CDP) regression gate.
 *
 * Measures JS heap growth across (A) idle-on-home and (B) section
 * mount/unmount cycles, then exits non-zero if growth exceeds threshold.
 *
 * Why: the dashboard mounts many interval/SSE/canvas visuals. This probes
 * "leave it open" and "switch tabs" memory behavior the way a human would —
 * see docs/MEMORY-TESTING.md.
 *
 * Usage:
 *   # 1. start your web app (dev or build preview)
 *   pnpm --filter @agentmesh/web run dev
 *
 *   # 2. start headless Chrome with debugging port
 *   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *     --headless=new --disable-gpu --no-first-run \
 *     --remote-debugging-port=9222 --js-flags=--expose-gc \
 *     --user-data-dir=/tmp/muhanai-chrome about:blank
 *
 *   # 3. run the probe (defaults match the commands above)
 *   node scripts/memory-probe.mjs
 *
 * Env overrides: CDP_PORT, APP_URL, IDLE_SECONDS, CYCLES,
 * MAX_IDLE_GROWTH_MB, MAX_CYCLE_GROWTH_MB.
 *
 * Requires Node >= 22 (global WebSocket) — no npm dependencies.
 */

const CDP_PORT = Number(process.env.CDP_PORT ?? 9222);
const APP = process.env.APP_URL ?? "http://localhost:5173/";
const IDLE_SECONDS = Number(process.env.IDLE_SECONDS ?? 40);
const CYCLES = Number(process.env.CYCLES ?? 4);

// How much growth is OK after forced GC. Leaking mounts crash-debug-bad.
const MAX_IDLE_GROWTH_MB = Number(process.env.MAX_IDLE_GROWTH_MB ?? 8);
const MAX_CYCLE_GROWTH_MB = Number(process.env.MAX_CYCLE_GROWTH_MB ?? 10);

const CDP = `http://localhost:${CDP_PORT}`;

const wsUrl = await (async () => {
  const list = await (await fetch(`${CDP}/json/list`)).json();
  const page = list.find((t) => t.type === "page") ?? list[0];
  return page.webSocketDebuggerUrl;
})();

const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});

let seq = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(m.error.message)) : res(m.result);
  }
};
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function evalJs(expression) {
  const r = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  });
  if (r.exceptionDetails) throw new Error("eval failed: " + JSON.stringify(r.exceptionDetails));
  return r.result.value;
}

async function snap(label) {
  const s = await evalJs(`(() => {
    const pm = globalThis.performance?.memory;
    return {
      jsHeapMB: pm ? +(pm.usedJSHeapSize / 1048576).toFixed(2) : -1,
      domNodes: document.getElementsByTagName('*').length,
    };
  })()`);
  console.log(JSON.stringify({ label, ...s }));
  return s;
}

async function gc() {
  await evalJs(`if (window.gc) { for (let i = 0; i < 3; i++) gc(); }`);
  await sleep(400);
}

async function navigate(path) {
  await evalJs(`history.pushState(null, "", ${JSON.stringify(path)});
window.dispatchEvent(new PopStateEvent("popstate")); 1;`);
  await sleep(1200);
}

await send("Page.enable");
await send("Runtime.enable");
await send("Page.navigate", { url: APP });
await sleep(4000);

console.log("== boot ==");
await snap("boot");

// ---- Scenario A: idle on home ----
console.log("== scenario A: idle ==");
const idleSamples = [];
for (let i = 0; i <= Math.ceil(IDLE_SECONDS / 5); i++) {
  const s = await snap(`idle-${i * 5}s`);
  idleSamples.push(s.jsHeapMB);
  await sleep(5000);
}
await gc();
const idleGc = await snap("idle+gc");

// ---- Scenario B: mount/unmount cycles ----
console.log("== scenario B: cycles ==");
const CYCLE_PATHS = [
  "/",
  "/agent-cast",
  "/agent-mesh",
  "/network",
  "/monitor",
  "/compute-mesh",
  "/mcp-skills",
  "/knowledge",
  "/verification",
  "/search",
  "/token-bank",
  "/semantic-vote",
];
const cycleEnds = [];
for (let cycle = 1; cycle <= CYCLES; cycle++) {
  for (const p of CYCLE_PATHS) await navigate(p);
  await gc();
  const s = await snap(`cycle-${cycle}-gc`);
  cycleEnds.push(s.jsHeapMB);
}

const base = idleSamples[0];
const idleEnd = idleSamples[idleSamples.length - 1];
const idleGrowth = idleEnd - base;
const cycleGrowth = cycleEnds[cycleEnds.length - 1] - cycleEnds[0];

const fail = [];
if (Math.max(0, idleGc.jsHeapMB - base) > MAX_IDLE_GROWTH_MB) {
  fail.push(`idle retention ${idleGc.jsHeapMB}MB vs boot ${base}MB (max ${MAX_IDLE_GROWTH_MB}MB)`);
}
if (cycleGrowth > MAX_CYCLE_GROWTH_MB) {
  fail.push(`cycle retention ${cycleGrowth}MB over ${CYCLES} cycles (max ${MAX_CYCLE_GROWTH_MB}MB)`);
}

console.log("\n===== SUMMARY =====");
console.log(`idle: boot ${base}MB → end ${idleEnd}MB (Δ ${(idleEnd - base).toFixed(2)}MB) → GC ${idleGc.jsHeapMB}MB`);
console.log(`cycles: ${cycleEnds.join(" → ")} (Δ ${cycleGrowth.toFixed(2)}MB)`);

if (fail.length > 0) {
  console.error("✗ MEMORY FAIL:");
  for (const f of fail) console.error(`  - ${f}`);
  process.exitCode = 1;
} else {
  console.log("✓ memory ok");
}
ws.close();