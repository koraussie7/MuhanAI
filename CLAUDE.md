---
description: Use Bun instead of Node.js, npm, pnpm, or vite.
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: false
---

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.

<!-- anytime-agent:dev-cycle-guidance v1 -->
## 開発基本スキル（anytime-agent 拡張が管理・手動編集しない）

- 開発指示（実装・修正・リファクタ・一気通貫、Codex / ollama への委譲、サブエージェント回転）は `anytime-dev-cycle` スキル（`.claude/skills/anytime-dev-cycle/`）を基本として実行する。入口 3 モード・工程ルート・ゲートは同スキルを参照する。
- 初回またはスキル更新後は、本編前にプリフライト（`node .claude/skills/anytime-dev-cycle/preflight.cjs`）を必ず実行する。
<!-- /anytime-agent:dev-cycle-guidance -->

---

# Phase 3-A 진행 상황 요약 (2025-09-04)

## 완료된 커밋 (3개, 각각 빌드+테스트 게이트 통과)

1. `dd6f034` — `[refactor] introduce React Router and route registry`
   - react-router-dom v7 도입, `App.tsx`의 36개 if 체인 제거
   - `routes/section-config.tsx`: 라우트/id/라벨/아이콘/컴포넌트 단일 설정 배열
   - `layouts/AppLayout.tsx`: Sidebar + TopBar + RightPanel 공통 셸

2. `d75ff65` — `[refactor] split DashPages/SpecPages into per-page modules`
   - 33개 페이지 모듈로 분해 (`pages/{dashboard,mesh,human,knowledge,ai,resources,marketplace,economy,workspace,system}/`)
   - `components/common/spec.tsx`, `services/api.ts` 통합

3. `47f3g13` — `[feat] redesign Dashboard and Sidebar around Network Needs You`
   - Sidebar 재편 (🔥NETWORK / 🤖INTELLIGENCE / 👤HUMAN / ⚡RESOURCES / 🛒MARKETPLACE / 💰ECONOMY / WORKSPACE / ⚙SYSTEM)
   - Dashboard 히어로 재구성 ("NETWORK NEEDS YOU" + 5개 티커)

## Phase 3-A 추가 진행 상황

1. `2410940` — `[feat(agent)] wire AgentRegistry as the live source for network stats`
   - AgentMeshPage.tsx 재작성 (실제 /api/agents 데이터 사용)
   - registry.ts에 `topology()` 메서드 추가
   - server.ts /api/network에 topology 필드 추가

2. **Agent Cast 실제 실행**
   - AgentCast.tsx 버그 수정: `question: setQuestion` → `question` 값 전송
   - `toggleAgent` 모듈 스텁 → 컴포넌트 상태 함수로 이동
   - `apiPost` 헬퍼 사용, `/api/agents`에서 실제 에이전트 목록 로드

3. **WebSocket / Live Network (SSE)**
   - services/api.ts에 `useNetworkEvents` 훅 추가
   - server.ts에 `/api/events` SSE 엔드포인트 추가 (5초 간격 /api/stats 스트림)

## 현재 발견된 문제점

- **AgentMeshPage.tsx 빌드 에러 (L193)**: `Expected identifier but found "/"`
  - 파일 끝(`</Page>\n);\n}`)은 정상이지만 diff 중복 적용으로 인해 파일이 손상됨
  - **해결 필요**: 파일을 처음부터 다시 작성하거나, 문제 부분만 정확히 교체

## 다음 단계 (Phase 3-A #4~#5)

1. AgentMeshPage.tsx 빌드 에러 해결
2. NetworkPulse 컴포넌트가 `/api/network/stats`에서 실시간 데이터 구독하도록 수정 (useNetworkEvents 사용)
3. Knowledge Engine / Search / Verification 페이지에서 API 실시간 풀링
4. Agent Mesh topology 시각화 (SVG 기반, 향후 React Flow)
5. Contribution Credit / Token Bank 페이지에서 `/api/contributions` 실시간 연결

## 참고 문서

- `agentmesh/CLAUDE.md` — agentmesh 워크스페이스 내부 지침 (별도 존재)
- `agentmesh/docs/route-map.md` — 페이지 ↔ API ↔ 패키지 매핑표 (참조용)
