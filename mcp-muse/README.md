# mcp-muse — Hermes Desktop → Muse 위임용 MCP 서버

## 등록 (Hermes MCP 설정에 추가)
```json
{
  "name": "mcp-muse",
  "type": "stdio",
  "command": "node",
  "args": ["/Users/brianyeon/CodeGPT/integration-finalize/mcp-muse/server.mjs"],
  "env": {}
}
```

## 도구
- `muse_exec(prompt)` — Muse Code 헤드리스 실행. 코딩·빌드·테스트·조사 위임용.

## 검증済 (2026-10-20, stdio 전구간 실탄 테스트)
- `initialize` → protocolVersion 정상
- `tools/list` → `muse_exec` 노출
- `tools/call` → 실제 muse 서브프로세스에서 `MCP-OK` 수신 (live 출력 확인)
- 주의: 샌드박스 셸에서는 muse 자식이 세션락을 못 잡음. Hermes·사용자 터미널(비샌드박스)에서는 정상 동작.

## 규칙
- muse에게 bitterbot/hermes 호출을 지시하지 말 것 (순환 금지)
- 큰 출력은 파일로 쓰게 할 것
