# Agent 1: Knowledge Engine + Evaluator

## Role
Implement Knowledge Graph (graphiti pattern) + Evaluator (LLM-as-Judge).
Also responsible for final integration of all 4 agents' work.

## Packages
- `packages/knowledge/` (new — implement KnowledgeGraph interface)
- `packages/evaluator/` (enhance existing evaluate)

## Contracts to Implement
```ts
import type {
  KnowledgeGraph, Evaluator, Entity, Relation, Episode,
  SearchOpts, Evaluation,
} from "@agentmesh/core";
```

## Files to Create
```
packages/knowledge/src/
  knowledge-store.ts     — in-memory KnowledgeGraph (entity/relation/episode CRUD)
  knowledge-graph.ts     — graph traversal, temporal queries
  search.ts              — hybrid vector+keyword search (sqlite-vec or pure JS)
  verification.ts        — AI+Human consensus verification flow
  index.ts               — re-exports

packages/evaluator/src/
  quality-scorer.ts      — LLM-as-Judge scoring (use FreeLLMAPI/Gemini)
  consensus-checker.ts   — multi-agent agreement detection
  index.ts               — re-exports
```

## Reference Patterns
- **graphiti** (Apache-2.0): temporal knowledge graph, entity extraction, episodes
  → Adapt: Entity/Relation/Episode model, time-based queries
- **WeKnora** (MIT): document pipeline (parse → chunk → embed → store)
  → Adapt: Document ingestion flow

## Integration Points
- `services/api/src/server.ts`: wire KnowledgeGraph + Evaluator into Agent Cast pipeline
- Agent Cast → Evaluator → Knowledge → Token Bank (reward)

## Open Source Libraries (import)
```bash
pnpm add sqlite-vec      # lightweight vector search (pure JS, no native deps)
# OR keep pure-JS embeddings to avoid native deps
```

## Output
- KnowledgeGraph interface fully implemented
- Evaluator with quality-scorer + consensus-checker
- Tests: `packages/knowledge/src/*.test.ts`, `packages/evaluator/src/*.test.ts`
- Gate: `pnpm typecheck && pnpm test` must pass

## Do NOT Modify
- `packages/token-bank/`, `packages/human/` → Agent 2
- `packages/p2p/` → Agent 3
- `packages/mcp/`, `apps/extension/` → Agent 4
- `services/api/src/server.ts` → only add knowledge/eval endpoints

## Security
- No external API keys stored
- Knowledge candidates from imported answers are `verified: false` by default
