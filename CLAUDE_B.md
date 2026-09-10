# Nx 통합 — 에이전트 B 작업지시서

## 역할과 목표

에이전트 A가 만든 Nx project graph와 target을 기반으로 GitHub Actions CI, Nx Cloud 연동, affected 실행 및 분산 task 실행을 구성한다. Nx core 설정과 패키지 manifest는 수정하지 않는다.

## 작업 위치

- 저장소 루트: `/Users/brianyeon/muhanai/muhanai`
- 실제 pnpm workspace: `/Users/brianyeon/muhanai/muhanai/packaging/npm/token-free-gateway/agentmesh`
- CI 기본 working directory: `packaging/npm/token-free-gateway/agentmesh`
- 패키지 매니저: `pnpm@10.0.0`
- Node 요구사항: `>=20`

## 선행 조건

에이전트 A의 변경이 같은 branch에 반영된 상태에서 시작한다. A의 `nx.json`, package manifest, lockfile 변경을 B가 다시 편집하지 않는다. A의 변경이 아직 병합되지 않았다면 A의 worktree/branch를 base로 삼고, A의 파일은 읽기 전용으로 취급한다.

## 허용된 변경 파일

- `.github/workflows/ci.yml`
- 필요한 경우 새로 생성하는 `.github/workflows/nx.yml` 또는 Nx 전용 CI workflow
- GitHub Actions에서 사용하는 CI 전용 설정 파일

## 금지된 변경 파일

- `nx.json`
- 루트 또는 workspace `package.json`
- `pnpm-lock.yaml`
- 모든 패키지 manifest와 `project.json`
- 모든 소스 코드, UI, 스타일
- 문서, 라이선스, 배포 파일
- 다른 에이전트가 이미 수정 중인 파일
- `.kilo/agent-manager.json`

## CI 설계 요구사항

1. 기존 `typecheck`, `test`, `biome`, `integrity` job을 즉시 제거하지 않는다. 먼저 기존 검사를 보존한 채 Nx job을 추가할지, 기존 job을 안전하게 통합할지 판단한다.
2. `actions/checkout`, `pnpm/action-setup`, `actions/setup-node`를 사용한다.
3. pnpm 버전을 workspace의 `packageManager`와 일치하도록 검토한다. 현재 manifest는 `pnpm@10.0.0`을 선언한다.
4. pnpm cache dependency path를 실제 lockfile 경로로 설정한다.
5. `pnpm install --frozen-lockfile` 후 Nx 명령을 실행한다.
6. PR과 main push에서 `nx affected`를 사용하며, event에 따라 base/head를 안정적으로 계산한다.
7. `build`, `typecheck`, `test`, `lint` target 중 CI에 필요한 target을 명확히 지정한다.
8. Nx cache와 CI cache를 중복 또는 충돌하지 않게 설정한다.
9. Nx Cloud 접근 토큰은 `NX_CLOUD_ACCESS_TOKEN` GitHub secret으로만 참조한다. 토큰 값, 하드코딩된 endpoint credential, 개인 키를 파일에 작성하지 않는다.
10. 분산 실행은 설치된 Nx/Nx Cloud 버전이 지원하는 방식으로 설정한다. CI 머신 수와 timeout을 과도하게 늘리지 않는다.
11. 테스트 결과는 기존 JUnit 보고 흐름과 충돌하지 않게 유지한다.

## 권장 검증 흐름

CI에서 최소한 다음 명령의 동작을 검증한다.

```bash
pnpm exec nx graph
pnpm exec nx affected -t build,typecheck,test,lint --base=origin/main --head=HEAD
```

PR 환경에서는 `origin/main`이 존재하지 않을 수 있으므로, GitHub event에 맞는 base 계산 방식을 사용한다. `nx affected --dry-run`으로 대상 프로젝트를 먼저 확인하고, 실제 target 실행은 필요한 범위로 제한한다.

## 완료 조건

- YAML 파싱과 GitHub Actions 문법이 유효하다.
- CI가 workspace 경로에서 pnpm 10과 Node 20 이상을 사용한다.
- Nx Cloud token이 secret 참조 방식으로만 설정된다.
- affected CI가 PR과 main push에서 재현 가능하게 동작한다.
- 기존 CI 검사가 의도치 않게 사라지지 않는다.
- 허용된 CI 파일 외의 diff가 없다.
- workflow 이름, job 이름, 실행 target, cache 범위, 실패 시 동작을 최종 응답에 명시한다.

## 충돌 방지와 인계

- A가 아직 작업 중이면 B는 Nx 설정 파일을 수정하지 말고 A의 완료 결과를 기다린다.
- CI에서 필요한 Nx 명령 옵션만 A에게 요청하며, A의 파일을 직접 고치지 않는다.
- 현재 저장소의 기존 변경을 revert, reset, commit, push하지 않는다.
- 사용자가 별도로 요청하지 않으면 commit/push하지 않는다.
- 변경 파일, 검증 명령, CI에서 감지된 Nx 설정 문제와 해결 방향을 최종 응답에 명시한다.
