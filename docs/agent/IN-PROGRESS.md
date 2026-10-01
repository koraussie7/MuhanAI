# Agent Status Board — muhanai monorepo

> **Live reservation file.** Every active agent owns exactly one row.
> Read before starting any work: `cat docs/agent/IN-PROGRESS.md`
> Append when starting, edit when done. The human maintainer reconciles conflicts FIFO by commit time.

_Last updated: 2026-10-01 12:58 ICT (Phase 0 complete — device token auth added to server.ts onRequest hook; approval management bottleneck documented)_

---

## active reservations

<!--
Row format:
- <role> | <branch> | <files-glob> | ETA <iso> | <one-line reason>

When done, change to:
- <role> done @ <short-sha> | was: <branch> | summary
-->

- claude-thin-client done @ phase0-complete | was: feat/claude/thin-client-phase0-2026-10-01 | Phase 0 thin-client server routes (13 endpoints, 26 tests) + device token auth in onRequest hook + server.ts registration + docs/thin-client/AGENT-WORK-SPLIT.md §6 updated with contract analysis
- claude-thin-client | feat/claude/thin-client-vendor-2026-10-01 | vendor/sam-mit/** | ETA 2026-10-21T00:00Z | [track A] sam v3.0.0-alpha.1 포크 + MuhanAI 브랜딩 + 백엔드 브릿지 (A트랙; phase0 완료 후 진행)
- agent-4 | feat/agent-4/client-deploy-api-2026-10-01 | services/api/src/client-routes.ts, services/api/src/graph-routes.ts, services/api/src/client-routes.test.ts, services/api/src/graph-routes.test.ts | ETA 2026-10-14T00:00Z | [track B] 배포 API (manifest/download/update-check) + open-dots 그래프 API 포팅 (B트랙; claude-thin-client phase0과 파일 분리 합의 필요)
- agent-6 | ci/agent-6/client-release-pipeline-2026-10-01 | .github/workflows/client-release.yml, scripts/release-client.*, docs/CLIENT-INSTALL.md | ETA 2026-10-21T00:00Z | [track C] 클라이언트 빌드·배포 CI (electron-builder + R2 매니페스트) (C트랙; .github/workflows는 maintainer 리뷰 필수)

### 미해결 병목 (claude-thin-client → Phase 2)

**승인(approval) 관리 인증 충돌**: thin client는 admin API_KEY를 보유하지 않으므로,
`GET /api/thin-client/approvals/:id`와 `POST /api/thin-client/approvals/:id/decision`에 접근할 수 없습니다.
PLAN Phase 2에서 클라이언트가 승인 모달을 띄우는 설계와 충돌합니다.

**해결 필요**: 서버 인증 모델 재설계 — approval 관리에 웹 세션 기반 인증 또는
디바이스 토큰 기반 승인 흐름을 추가해야 합니다. `services/api/src/server.ts`의 `onRequest` hook
및 `thin-client-routes.ts`의 `requireAdmin` 함수가 관련 파일입니다.

_END_OF_BOARD_

---

## how to use

```bash
# 1. reserve
echo "- agent-7 | feat/agent-7/hivebear-tests | packages/hivebear/** | ETA 2026-09-08T15:00Z | adding vitest config" \
  >> docs/agent/IN-PROGRESS.md

# 2. start work in your worktree
cd ../muhanai-agent-7

# 3. when done
sed -i '' \
  "s/^- agent-7 .*/- agent-7 done @ $(git rev-parse --short HEAD) | was: feat\/agent-7\/hivebear-tests | vitest config + 8 new tests/" \
  docs/agent/IN-PROGRESS.md
```

## rules

1. **One row per agent role.** Don't sign up under multiple roles.
2. **ETA is mandatory.** If you blow past it twice, the maintainer will reassign.
3. **Files-glob should be specific.** No `*` or `src/**` wildcards — name the directories.
4. **Conflict resolution**: if your files-glob overlaps an existing reservation, ping the other agent via PR comment or DM.
5. **Stale rows**: anything over 2× ETA without a status update gets pruned by the human.

---

## reservation template (copy-paste)

```markdown
- <your-role> | feat/<role>/<topic> | <paths> | ETA YYYY-MM-DDTHH:MMZ | <reason>
```

---

## see also

- `OWNED-PATHS.md` — who owns which directory long-term
- `CI-FAIL-PATTERNS.md` — known CI failures + how to avoid them
- `../agent-conventions.md` — coding conventions
- `/AGENT-ONBOARDING.md` (monorepo root) — read this first
