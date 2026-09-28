/**
 * @agentmesh/opsmaxx-bridge — public surface.
 *
 * See `./types.ts` for the full contract and `./factory.ts` for the
 * runtime selection (production IPC vs in-memory mock).
 */

export { type BridgeMode, createOpsMaxxBridge, type FactoryOptions } from "./factory.js";
export { createInMemoryBridge } from "./mock.js";
export { createHttpTransport, createStdioTransport, type Transport } from "./transport.js";
export * from "./types.js";
