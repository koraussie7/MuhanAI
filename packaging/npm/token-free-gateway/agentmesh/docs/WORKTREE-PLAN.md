# Per-Package Worktree Plan (Phase 2/2+)

> **상위**: `docs/INTEGRATED-CODE-PLAN.md` (M1–M5 + token-bank) ·
> **모듈 스펙**: `docs/CODE-INTEGRATION-PLAN.md` (Phase 2/2+ 사양)
> **작성일**: 2026-09-07 · **상태**: DRAFT (M1 #107 완료)

이 문서는 **남은 모듈을 어떤 git worktree / branch에서 병렬 작업할지** 결정한다.
모듈 자체의 인터페이스는 CODE-INTEGRATION-PLAN.md §3에 정의되어 있으므로 여기서는 **병렬화 가능성과 merge 순서**만 다룬다.

---

## 1. 병렬화 원칙

- **Single-owner**: 같은 파일을 두 worktree가 동시에 수정하지 않는다.
- **Dependency-first**: 의존하는 쪽은 의존받는 쪽의 merge 이후에 시작한다.
- **Rollback unit**: 1 worktree = 1 PR = 1 revert.
- **Test gate**: 각 worktree는 `pnpm -F <pkg> typecheck && pnpm -F <pkg> test` 통과 후 merge.

## 2. 의존 그래프 (남은 모듈)

```
┌──────────────────────────────────────────────────────────────┐
│  W0 main (M1 done, @noble/curves migration done)             │
└────────────┬─────────────────────────────────────────────────┘
             │
   ┌─────────┴─────────┐
   ▼                   ▼
┌──────────────┐   ┌─────────────────────┐
│ W1 credits-  │   │ W2 p2p-trust        │
│     phase2a  │   │     (trust+repute)  │
│ reputation   │   │ - trust-verifier    │
│ credit-      │   │ - peer-reputation   │
│   account    │   │                     │
└──────┬───────┘   └──────────┬──────────┘
       │                      │
       ▼                      │
┌──────────────┐              │
│ W3 credits-  │              │
│     phase2b  │              │
│ co-receipt   │              │
└──────┬───────┘              │
       │                      │
       └──────────┬───────────┘
                  ▼
         ┌────────────────────┐
         │ W4 services-api    │
         │ gossip-bridge +    │
         │ pulse-stream +     │
         │ reputation routes  │
         └────────┬───────────┘
                  ▼
         ┌────────────────────┐
         │ W5 apps-web        │
         │ useGossipPulse +   │
         │ CreditBalance tie  │
         └────────┬───────────┘
                  ▼
         ┌────────────────────┐
         │ W6 docker-compose  │
         │ multi-peer E2E     │
         │ + ADR-0004         │
         └────────────────────┘
```

## 3. Worktree 정의

### W0 — main (DONE)

- **Branch**: `main`
- **상태**: M1 (libp2p transport) + `@noble/curves` migration 완료. 49/49 tests pass.
- **머지 후**: 모든 후속 worktree의 base.

### W1 — `wt/credits-phase2a` (reputation + credit-account)

- **담당**: `packages/credits/src/reputation.ts`, `packages/credits/src/credit-account.ts`
- **소스**: HiveBear `reputation.rs` (Bayesian-EMA) + pinkybrain `CreditAccount` (4-tier)
- **새 의존**: 없음 (pure-TS, math + types만)
- **테스트**: `packages/credits/src/tests/reputation.test.ts`, `credit-account.test.ts`
  - α/β update 규칙
  - tier boundary (FREE 0–10 / CONTRIBUTOR 10–100 / POWER 100–1000 / UNLIMITED 1000+)
  - monthlyCreditFor() with `BASE_ALLOCATION=100, carry_over_pct=0.5`
- **소요**: S (1–2일)
- **병렬 가능**: W2와 동시 작업 (서로 다른 패키지, 서로 다른 파일)

### W2 — `wt/p2p-trust` (trust-verifier + peer-reputation)

- **담당**: `packages/p2p/src/trust-verifier.ts`, `packages/p2p/src/peer-reputation.ts`
- **소스**: HiveBear `TrustVerifier` (TOFU + probabilistic) + folklore `peer-reputation-store`
- **연계**: transport.ts의 `peer:connect` 핸들러는 이미 `trustVerifier.verify()` + `reputationRegistry.update()` 호출 중 (transport.ts:209–236). 모듈만 추가하면 wire-up 완료.
- **테스트**: 기존 trust-verifier.test.ts (15 tests), peer-reputation.test.ts (19 tests) 통과 — 이미 M1에서 작성됨.
- **소요**: XS (모듈 이미 존재, M1 단계에서 함께 작성됨)
- **병렬 가능**: W1과 동시 작업

### W3 — `wt/credits-phase2b` (co-receipt)

- **담당**: `packages/credits/src/co-receipt.ts`
- **소스**: **자체 작성** (p2ptokens의 `co-receipts.rs`는 LICENSE 부재 — INTEGRATED-CODE-PLAN.md §11 사용자 확인 필요)
- **연계**: credit-account.ts의 `monthlyCreditFor()` 결과를 입력으로 받아 hysteresis 적용
- **테스트**: `packages/credits/src/tests/co-receipt.test.ts`
  - grace tokens 소진 후 hysteresis 곡선
  - signed receipt 직렬화
- **소요**: S (1–2일) — 사용자 확인 1건 필요
- **블로커**: W1 머지 이후 (credit-account.ts 시그니처에 의존)

### W4 — `wt/services-api-pulse` (gossip-bridge + pulse-stream)

- **담당**: `services/api/src/gossip-bridge.ts`, `services/api/src/pulse-stream.ts`, `services/api/src/pulse-routes.ts`
- **연계**:
  - W1의 `reputation.ts`를 import하여 `/api/network/reputation/:peerId` 노출
  - W2의 `trust-verifier`를 import하여 trust events를 SSE로 fan-out
  - W3의 `co-receipt`을 import하여 signed receipts 검증 (선택)
- **테스트**: services/api/test/* 추가 — vitest route tests (fastify inject)
- **소요**: M (3–5일)
- **블로커**: W1, W2, W3 모두 머지 이후

### W5 — `wt/apps-web-pulse` (useGossipPulse + CreditBalance)

- **담당**: `apps/web/src/lib/useGossipPulse.ts`, `apps/web/src/components/CreditBalance.tsx` (M2 Pulse view)
- **연계**: W4의 `/api/pulse/stream` SSE endpoint를 구독
- **테스트**: react-testing-library 또는 vitest + happy-dom
- **소요**: S (1–2일)
- **블로커**: W4 머지 이후

### W6 — `wt/docker-e2e` (multi-peer + ADR)

- **담당**: `deploy/docker-compose.yml`, `deploy/docker-compose.e2e.yml`, `scripts/e2e-multi-peer.sh`, `docs/adr/0004-multi-peer-deployment.md`
- **연계**: 모든 worktree 머지 후 최종 통합 검증
- **검증**: 3 peer 컨테이너 (Alice/Bob/Carol) 동시 부팅 → peer:discovery → reputation propagation → co-receipt 발행 → E2E 통과
- **소요**: M (3–5일)
- **블로커**: W5 머지 이후

## 4. 머지 순서 (Sequencing)

```
W0 → (W1 ‖ W2) → W3 → W4 → W5 → W6
```

| Step | 작업 | PR | 머지 후 tag |
|---|---|---|---|
| 1 | W1 credits-phase2a | `feat(credits): bayesian-ema reputation + 4-tier credit account` | `v0.2.0-credits-phase2a` |
| 2 | W2 p2p-trust | `feat(p2p): trust verifier + subject-scoped peer reputation` (이미 작성됨 — PR만) | `v0.2.0-p2p-trust` |
| 3 | W3 credits-phase2b | `feat(credits): co-receipts (self-authored, MIT)` | `v0.2.0-co-receipt` |
| 4 | W4 services-api-pulse | `feat(api): gossip-bridge + SSE pulse stream` | `v0.3.0-pulse-api` |
| 5 | W5 apps-web-pulse | `feat(web): useGossipPulse hook + pulse UI` | `v0.3.0-pulse-web` |
| 6 | W6 docker-e2e | `chore(deploy): multi-peer compose + ADR-0004` | `v0.3.0-e2e` |

## 5. Worktree 명령어 (cheatsheet)

```bash
# main 기준점에서 새 worktree
cd /Users/brianyeon/muhanai/muhanai/packaging/npm/token-free-gateway/agentmesh
git worktree add -b wt/credits-phase2a ../wt-credits-phase2a main
git worktree add -b wt/p2p-trust      ../wt-p2p-trust      main

# 작업 후 머지 (각 worktree에서)
git add -p  # 구체 파일만 add
git commit -m "feat(credits): ..."
git push origin wt/credits-phase2a
gh pr create --base main --head wt/credits-phase2a ...

# 머지 후 cleanup
git worktree remove ../wt-credits-phase2a
git branch -d wt/credits-phase2a
```

## 6. 위험 요소 (Risk Register)

| 위험 | 영향 | 완화 |
|---|---|---|
| W3 사용자 확인 지연 | W4 블로킹 | W1/W2는 W3와 무관하게 진행 가능. 사용자 확인은 W3 시작 시점에 받음. |
| gossip-bridge의 backpressure | SSE 메모리 폭증 | W4에서 fastify `reply.hijack()` + Node stream + backpressure 명시적 처리. |
| multi-peer 컨테이너 부팅 시간 | E2E CI > 5분 | W6에서 `--reuse-volumes` + `--no-build` 캐시 + healthcheck로 단축. |
| docker bridge mDNS 실패 | W6 E2E flaky | gossip-sub는 floodsub이라 mDNS 무관. mdns는 best-effort, bootstrap 고정 list로 대체 가능. |

## 7. 즉시 실행 (Next Action)

다음 작업자는 **W1**부터 시작:

```bash
git worktree add -b wt/credits-phase2a ../wt-credits-phase2a main
cd ../wt-credits-phase2a
# packages/credits/src/reputation.ts 구현 (CODE-INTEGRATION-PLAN.md §3.1)
# packages/credits/src/credit-account.ts 구현 (§3.2)
pnpm -F @agentmesh/credits typecheck && pnpm -F @agentmesh/credits test
git add packages/credits/src/{reputation,credit-account}.ts packages/credits/src/tests/
git commit -m "feat(credits): bayesian-ema reputation + 4-tier credit account"
```

W2는 이미 M1에서 모듈 작성 완료 — PR만 작성하면 됨.
