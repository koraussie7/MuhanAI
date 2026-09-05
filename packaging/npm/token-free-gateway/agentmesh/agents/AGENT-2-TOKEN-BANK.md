# Agent 2: Token Bank + Reputation + Human

## Role
Implement contribution economy: rewards, reputation, credit ledger.
Also implement Human Agent registry + expert matching.

## Packages
- `packages/token-bank/` (new — implement CreditLedger + TokenRouter)
- `packages/human/` (new — implement HumanAgent registry)

## Contracts to Implement
```ts
import type {
  CreditLedger, TokenRouter, Reward, ReputationScore,
  RewardType, RoutingPolicy, TokenUsage, RouteResult,
  ContributionEvent,
} from "@agentmesh/core";
```

## Files to Create
```
packages/token-bank/src/
  token-ledger.ts        — in-memory credit ledger (award/balance/history)
  rewards.ts             — reward rules: answer +10, verify +5, teach +20, compute +30, mcp +15
  reputation.ts          — reputation scoring (quality·reliability·contributions weighted)
  routing.ts             — tokenbank pattern (free-first, local-first, balanced, fastest, best-quality)
  index.ts               — re-exports

packages/human/src/
  human-registry.ts      — human agent registration/management
  expert-matching.ts     — question → expert matching (capability-based)
  submission.ts          — answer/verify/teach submission handling
  index.ts               — re-exports
```

## Reference Patterns
- **tokenbank** (Apache-2.0): provider routing, token tracking, P2P sharing
  → Adapt: RoutingPolicy enum, TokenUsage tracking, free-first routing logic

## Reward Rules (configurable)
```ts
const REWARDS: Record<RewardType, number> = {
  answer: 10,
  verify: 5,
  teach: 20,
  compute: 30,
  mcp: 15,
  import: 8,
  relay: 12,
};
```

## Reputation Algorithm
```
overall = (quality * 0.4 + reliability * 0.3 + min(contributions/100, 1) * 0.3) * 100
```

## Integration Points
- Agent Cast participation → award reward
- Knowledge contribution → reputation update
- Agent Mesh shows human experts as connectable nodes

## Output
- CreditLedger + TokenRouter interfaces implemented
- Human registry + expert matching
- Tests: `packages/token-bank/src/*.test.ts`, `packages/human/src/*.test.ts`
- Gate: `pnpm typecheck && pnpm test` must pass

## Do NOT Modify
- `packages/knowledge/`, `packages/evaluator/` → Agent 1
- `packages/p2p/` → Agent 3
- `packages/mcp/`, `apps/extension/` → Agent 4
