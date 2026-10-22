# 에이전트 작업 할당 계획 (3번안: 설계·리뷰=Muse Code, 실행=Kilo/CodeGPT)

**Run**: `run_46e58b342a04` (구 `run_65da4b1d6490`에서 이관) | **원칙**: 실행 전 읽기 → 아카이브 우선 → 삭제는 승인 후 → 완료 후 리뷰
**공통 규칙**: `integration-finalize/CLEANUP_IN_PROGRESS.md` 필독. 운영 컨테이너·추적 파일·타인 WIP 함부로 삭제 금지.

## Task A — Y.js WIP 커밋 (Kilo 실행 → Muse Code 검증)
- `packages/affine-adapter/package.json` + `src/store.ts` 변경분을 별도 커밋 (메시지: `feat(affine): Y.js CRDT store upgrade`)
- `package-lock.json`은 untracked — 커밋 포함 여부 결정 후 처리 (`node_modules/`는 ignore 확인済)
- 완료 조건: `busabase 25/0 + affine 25/0 + proposal 21/0` 실측 출력 첨부

## Task B — test-all.sh 실측 카운트 수정 (Kilo 실행 → Muse Code 검증)
- 현재 성공 메시지가 하드코딩됨. 각 스위트의 `ℹ pass/fail`를 합산해 실제 숫자를 출력하도록 수정
- 완료 조건: 수정 후 실행 출력 + exit code 0 첨부

## Task C — 수치 검증 (Kilo 실행 → Muse Code 리뷰)
- `packages/points` 56/56, `sam-tools` 15/15, `dadabot-cli` 8/22 주장 재현
- 각 스위트 실측 pass/fail + 실패 시 첫 에러 로그 10줄 보고. 수정 금지 (보고만)

## Task D — 아카이브 최종 삭제 (사용자 승인 게이트 → Kilo 실행)
- 게이트: 사용자가 두 아카이브 확인 후 "삭제 승인" 선언해야 시작
- 대상 1: 맥북 `/tmp/_archive-20261020-finalize/` (kbizhub-dashboard·privseai-trystero는 Domains로 구조済라 제외됨)
- 대상 2: 110 서버 `/root/_archive-20261020/` (SSH로 삭제, 컨테이너 28개 재확인)
- 완료 조건: 삭제 후 `ls` + 110 `df -h` 첨부

## Task E — -2 체크아웃 untracked 정리 (Kilo 실행 → Muse Code 리뷰)
- 대상: `integration-finalize-2`의 `Users/`, `.wrangler/`, `*.bak`, `*_BACKUP*` → `~/Archive-20261020/home2/`로 이동
- 제외: `HANDOFF_*.md`, `WORKLOG_*.md` (사용자 판단 필요 — 목록만 보고)
- 완료 조건: 이동 목록 + `git status --short` 첨부

## Task F — 문서 마무리 (Muse Code 직접)
- 전 Task 완료 후: README 대문 배너 제거, `CLEANUP_IN_PROGRESS.md`에 최종 상태 기록, Orca 태스크 `completed` 갱신

## 등록된 태스크 (run_46e58b342a04, 전부 ready)
- `task_c5a0a4e8d253` C 수치 검증
- `task_7e80d55a6848` A Yjs WIP 커밋
- `task_2be99643741e` B test-all 실측 수정
- `task_4f609099cb12` D 아카이브 삭제 승인대기
- `task_0cb9a65bba03` E home2 untracked 정리

## 순서
C → A → B → D(게이트) → E → F. C가 먼저인 이유: 현 상태 스냅샷이 있어야 회귀를 구분할 수 있음.
