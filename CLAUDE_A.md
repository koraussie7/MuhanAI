# Nx 통합 — 에이전트 A 작업지시서

## 역할과 목표

MuhanAI의 실제 pnpm monorepo에 Nx project graph와 target을 도입한다. 소스 기능, UI, 배포 로직은 변경하지 않으며 기존 명령의 동작과 출력 경로를 보존한다.

## 작업 위치

- 저장소 루트: `/Users/brianyeon/muhanai/muhanai`
- 실제 pnpm workspace: `/Users/brianyeon/muhanai/muhanai/packaging/npm/token-free-gateway/agentmesh`
- workspace 패키지: `apps/*`, `packages/*`, `services/*`
- 패키지 매니저: `pnpm@10.0.0`
- Node 요구사항: `>=20`

현재 루트 CI는 workspace 내부에서 실행되도록 설정되어 있다. 루트 `package.json`의 기존 script가 workspace로 이동하는 구조이므로, 기존 script를 임의로 삭제하지 말고 Nx 도입 후에도 호환되는지 확인한다.

## 허용된 변경 파일

- `packaging/npm/token-free-gateway/agentmesh/nx.json`
- `packaging/npm/token-free-gateway/agentmesh/package.json`
- `packaging/npm/token-free-gateway/agentmesh/pnpm-lock.yaml`
- 각 `apps/*`, `packages/*`, `services/*`의 `package.json`에 추가하는 `nx` 설정
- 필요한 경우 새로 생성하는 각 패키지의 `project.json`
- Nx가 필요로 하는 루트 설정 파일

## 금지된 변경 파일

- 모든 소스 코드(`src/`, `apps/web/src/`, `services/*/src/`)
- UI 컴포넌트와 스타일
- `.github/workflows/*`
- 문서, 라이선스, 배포 파일
- 다른 에이전트가 이미 수정 중인 파일
- `.kilo/agent-manager.json`

## 작업 절차

1. 별도 Git worktree/branch에서 시작한다.
2. 작업 전 `git status --short`와 `git diff --name-only`를 확인한다. 현재 저장소는 변경 사항이 많으므로 기존 변경을 되돌리거나 포괄적으로 fix하지 않는다.
3. 실제 workspace의 `package.json`, `pnpm-workspace.yaml`, 각 패키지 manifest와 build/typecheck/test/lint 스크립트를 조사한다.
4. Nx를 최소한의 의존성으로 추가한다. 사용하지 않는 Nx plugin을 대량 설치하지 않는다.
5. `nx.json`에서 pnpm workspace 기반 project discovery와 `build`, `typecheck`, `test`, `lint` target을 설정한다.
6. 기존 package script를 최대한 재사용하고, target의 입력/출력/캐시 설정은 실제 산출물에 맞게 지정한다.
7. 다음 예외를 임의로 숨기지 않는다.
   - `database`는 현재 script와 `tsconfig.json`가 없을 수 있다.
   - `noema`는 존재하지 않는 `@agentmesh/shared` 참조가 있을 수 있다.
   - `shared-types`는 `dist`를 생성하지만 manifest의 `main`/`types`가 `types/index.ts`를 가리킬 수 있다.
   - 일부 패키지는 `dist`, 일부는 `types`를 생성한다.
8. 변경 후 기존 루트 및 workspace 명령이 계속 동작하는지 확인한다.

## 필수 검증

workspace 디렉터리에서 실행한다.

```bash
pnpm install --frozen-lockfile
pnpm exec nx graph
pnpm exec nx show projects
pnpm exec nx show project <project-name>
pnpm exec nx affected -t build,typecheck,test,lint --base=origin/main
```

가능한 경우 전체 target도 검증한다.

```bash
pnpm exec nx run-many -t typecheck,test,lint --all
```

`build`는 실제 기존 build 산출물과 배포 동작을 훼손하지 않는 범위에서 검증한다. 실패한 패키지는 Nx 설정으로 오류를 무시하지 말고, 기존 manifest/출력 경로 문제인지 Nx target 문제인지 구분하여 보고한다.

## 완료 조건

- `nx graph`가 workspace 패키지를 정상적으로 표시한다.
- `nx affected`가 기존 Git 변경 기반 프로젝트와 target을 정상적으로 계산한다.
- 기존 `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build` 동작이 유지된다.
- lockfile이 현재 pnpm 버전과 일관된다.
- 허용된 파일 외의 diff가 없다.
- 변경 파일, 검증 명령과 출력, 미해결 패키지 문제를 최종 응답에 명시한다.

## 커밋 규칙

사용자가 별도로 요청하지 않으면 commit/push하지 않는다. 작업 결과는 현재 worktree의 변경 상태로 남기고, 다른 에이전트가 이어서 사용할 수 있도록 정확한 파일 목록과 검증 결과를 인계한다.
