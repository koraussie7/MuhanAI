/**
 * @agentmesh/p2p — libp2p 3.x transport, pubsub (floodsub), identity, peer catalog,
 * and bandwidth primitives for the AgentMesh M1–M5 pulse mesh.
 *
 * See docs/INTEGRATED-CODE-PLAN.md and docs/adr/0001-m1-pulse-mesh.md for
 * the full architecture rationale and 8-repo lineage.
 */

export * from "./bandwidth.js";
export * from "./error.js";
export * from "./identity.js";
export * from "./peer-catalog.js";
export * from "./peer-reputation.js";
export * from "./pubsub.js";
export * from "./transport.js";
export * from "./trust-verifier.js";
export * from "./device-capabilities.js";
