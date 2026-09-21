/**
 * `@agentmesh/cosmos-core` — event-log-first cosmic knowledge core.
 *
 * Public surface:
 *  - `types`          — event/reaction/ontology vocabulary
 *  - `log`            — append-only log (memory + JSONL)
 *  - `ontology`       — concept identity + relation projection
 *  - `ingest`         — world-feed normalization + reaction/relation writes
 *  - `amplification`  — reaction → significance score
 *  - `projections`    — log → read models (concepts, relations, rankings)
 *
 * The package is dependency-free by design: `services/api` wires it to the
 * Pythia/Osiris routes and the Pulse stream, but the core never imports them.
 */

export * from "./types.js";
export * from "./log.js";
export * from "./ontology.js";
export * from "./ingest.js";
export * from "./amplification.js";
export * from "./projections.js";
