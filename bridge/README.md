# bitterbot ↔ VSCode 브릿지 (v1)

**방향**: Bitterbot(텔레그램) → `bridge/inbox/` → Kilo/CodeGPT 실행 → `bridge/outbox/` → `task_handoffs` 기록 → Bitterbot이 회신
**원칙**: 데몬의 상태 전이는 건드리지 않음. 브릿지는 `tasks` 읽기(SELECT) + `task_handoffs` 추가(INSERT)만 함.

## Kilo/CodeGPT 지시문 (그대로 붙여넣기)
1. `bridge/inbox/`에서 `.json`을 하나 가져가라
2. `goal`과 `done_criteria`를 읽고 작업을 수행하라
3. 결과물을 `bridge/outbox/<같은파일명>.json`으로 써라 (`{"task_id": "...", "result": "..."}`)
4. inbox 파일을 지우지 마라 (브릿지가 수거함)
5. `source`가 `vscode-bridge`가 아닌 작업도 처리 가능하다

## CLI 사용법
```bash
# Bitterbot 미처리 작업을 inbox로 내보내기 (읽기 전용)
node bridge/export.mjs

# outbox 결과를 task_handoffs에 기록 (INSERT만)
node bridge/report.mjs
```
