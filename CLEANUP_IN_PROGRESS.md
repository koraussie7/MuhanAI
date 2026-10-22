# Cleanup in Progress — 다른 에이전트 필독

**시작**: 2026-10-20 | **수행**: Muse Code (정리 범위: 사용자 승인済 — 맥북+110 둘 다 / 아카이브 후 삭제 / 110 전체)
**읽는 순서**: 이 문서 → `HANDOFF_NEXT_AGENT.md` → `INTEGRATION_MASTERPLAN.md`

## 지금 하고 있는 일
맥북 `integration-finalize` + 110 서버(`/root`) 정리. 무작정 삭제 금지 — **아카이브 후 삭제** 원칙.

## 완료됨 (맥북 `integration-finalize`)
- 루트 loose 파일 60개 + stray 디렉토리 9개를 `/tmp/_archive-20261020-finalize/`로 이동 (1.6G)
  - `root-loose/`: 스크린샷 PNG, `etoland_*.py` 7개, `fix-kilo-*`, `test-wasm*`, 구 분석 `.md` 8개 등 (전부 git-ignored 확인済)
  - `dirs/`: `Users/`(중복 복사본), `root/`, `__pycache__`, `dist/`, `find-src/`, `bitterbot-stubs/`, `pythia_connector/`, `privseai-trystero/`(1.1G), `kbizhub-dashboard/`(431M)
- 손대지 않은 것: 추적 루트 파일 9개(`README.md`, `HANDOFF_NEXT_AGENT.md`, `INTEGRATION_MASTERPLAN.md` 등), `packages/`, `minima-integration/`, `apps/`, `scripts/`, `docs/`, `web-app/`, `minima-integration/minima/minidapps/`(현재 작업, untracked)
- 검증: `git status` clean (기존 modified 3 + untracked 1 유지), busabase 25/25 통과
- `integration-finalize-2`는 별도 체크아웃(kbizhub 브랜치) — 손대지 말 것

## 완료됨 (110 서버, `root@185.55.240.110`, alias `110`) — Phase 1
- Phase 1 완료: 쉘 오타 junk 7점(`"`, `%{http_code}n`, `%{redirect_url}n`, `&&/`, `>>/`, 개행 포함 파일 1개, `__pycache__`) + 구 백업 중복(`agent-fix-backup-20260801-104414`, 신본 `-104429` 유지) → `/root/_archive-20261020/`로 이동
- ⚠️ **운영 컨테이너 25+개 실행 중** (litellm, loops, latitude, kamra, shadowbroker 등) — 관련 디렉토리 절대 삭제 금지
- Phase 2 (보류 — 컨테이너 연관 없음 확인済이나 2.5G라 사용자 확인 후): `openclaw-zero-token`(2.5G, 참조 컨테이너/compose 없음), `600/`, `700/`, `cat/`, `chmod/`, `echo/` 등 명령어 오타 추정 디렉토리, `openclaw-*` 구 백업 4종

## Orca 오케스트레이션 (2026-10-20 시작)
- Run: `run_65da4b1d6490` ("integration-finalize와 110 서버 정리 역할분담")
- `task_43a7990e71a9` 110 Phase-2 조사 읽기전용 (ready)
- `task_64c13d84f4ce` 110 junk 추정 디렉토리 아카이브 (ready)
- `task_efd64c07668b` 맥북 아카이브 검증 (ready)
- 역할분담: 설계·리뷰 = Muse Code, 실행 = Kilo/CodeGPT (VSCode 확장은 Orca worker가 아니므로 spec을 직접 붙여넣어 실행)
- worker dispatch는 coordinator 터미널(Terminal 1)에서 수행

## 리뷰 결과 (2026-10-20, Muse Code)
- `task_64c13d84f4` (110 junk 아카이브): ✅ 직접 완료 — 빈 디렉토리 5개(600/700/cat/chmod/echo, 전부 4K 빈껍데기) + openclaw 구 백업 4종 + openclaw-zero-token(2.5G, 참조 컨테이너/compose 없음 확인) → `/root/_archive-20261020/` 이동. 잔류 0, 컨테이너 28개 정상. Orca 상태는 `completed`로 갱신 필요 — 샌드박스에서 런타임 접속 불가라 사용자 터미널에서 실행할 것.
- `task_43a7990e71a9` (110 Phase-2 조사): openclaw-zero-token 조사 항목은 위 이동으로 해소. 종료 가능.
- `task_efd64c0766` (맥북 아카이브 검증): `/tmp/_archive-20261020-finalize/` (1.6G) 사용자 확인 대기.
- kbizhub 브랜치 push: ✅ origin과 동기화됨 (06e0037). TRUE.
- golivewiki 분리: ✅ `~/CodeGPT/golivewiki/` 존재. TRUE (위치는 -2 체크아웃 안이 아님).
- i18n: ⚠️ 0 missing 통과이나 218 keys — 보고된 227과 불일치.
- `npm run build` 성공: 미확인 (미실행).
- 신규 mess 주의: `-2` 체크아웃에 untracked 재증식 (`Users/`, HANDOFF_*.md, WORKLOG_*.md, `.wrangler/`).
- Phase-2 리포트 검증: ❌ "67/67" 거짓이었으나 Y.js WIP fix로 해소 — 실측 busabase 25/0, affine 25/0, proposal 21/0 (test-all.sh 성공 메시지는 하드코딩이라 신뢰 금지). Fix: `npm install` (cache /tmp 우회) + store.ts의 `./blocks.js` → `./blocks.ts` (strip-types 규칙). 기존 affine.test.ts가 커버. 원인: 미커밋 Y.js WIP (`affine-adapter/src/store.ts` 157줄 diff)가 `yjs` import → 패키지 미설치. ✅ loopback EPERM 재현됨. ⚠️ 마스터플랜은 v0.18 (보고서 v0.15는 구버전). points 56/56·sam-tools·dadabot-cli는 미실행이라 미확인.

## 아카이브 삭제 규칙
- `/tmp/_archive-20261020-finalize/` (맥북): 사용자가 확인 후 직접 삭제 — 재부팅 시 `/tmp` 자동 정리될 수 있음
- 어떤 아카이브도 **사용자 확인 없이 삭제 금지**
