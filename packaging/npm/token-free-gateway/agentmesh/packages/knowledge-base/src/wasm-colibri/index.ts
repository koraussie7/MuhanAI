// packages/knowledge-base/src/wasm-colibri/index.ts
export * from "./types";
export * from "./colibri-bridge";
export * from "./browser-runner";
// browser-runner is browser-only (uses Worker), excluded from Node builds
