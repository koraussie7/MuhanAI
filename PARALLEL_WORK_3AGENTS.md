# PARALLEL_WORK_3AGENTS.md

**작성일:** 2026-10-23
**대상:** `/world` 페이지 빈 화면 장애 (프로덕션 `https://muhanai.com/world`)
**목적:** 3명의 에이전트가 파일 충돌 없이 동시에 작업할 수 있도록 범위를 분할한다.

---

## 0. 공통 컨텍스트 (모든 에이전트 필독)

### 0.1 저장소 / 브랜치

```
repo      https://github.com/koraussie7/MuhanAI
worktree  /Users/brianyeon/CodeGPT/integration-finalize
          (실제 작업 트리는 .git/checkout — GIT_WORK_TREE=.git/checkout)
base      main @ 1d74f0e
작업 브랜치 feat/world-blank-screen-fix  ← 총괄이 먼저 생성
패키지 루트 packaging/npm/token-free-gateway/agentmesh  (이하 $ROOT)
```

**브랜치 규칙 (반드시 준수):**
- `feat/token-bank-minima` 에서 **절대 분기하지 말 것** (pre-squash 이력 보유, diff가 101파일로 부풀어 PR #18 사고 발생)
- 모든 파트는 `feat/world-blank-screen-fix` 하나에서 **파일 단위로만** 수정

### 0.2 확정된 진단 (실측 완료, 재조사 불필요)

| # | 관측 | 값 |
|---|---|---|
| 1 | `/world` `#root` 자식 수 | **0** (`/dashboard`는 1) |
| 2 | `/world` DOM 노드 수 | **2** (`/dashboard`는 1,056) |
| 3 | MutationObserver 발화 | **0회** — 한 번도 렌더되지 않음 |
| 4 | 네비게이션 시간 | 394ms — **느린 게 아님** |
| 5 | 롤백 빌드 재현 | **동일 실패** — 최근 배포가 원인 아님 |
| 6 | `WorldPage` 청크 import | **정상** (`exports: [WorldPage, default, ...]`) |
| 7 | 청크 내 Node 전용 import | **0** (`peer-mesh: 0`, `nodeImports: 0`) |
| 8 | `/world` 502 응답 | **11~12건** (`/api/nodes`, `/api/agents`, `/api/network` 등) |
| 9 | `ErrorBoundary` 개수 | **0** — 프로젝트 전체에 없음 |

**핵심 인과:** `/api/*` 라우트가 404/502 → 렌더 경로에서 예외 → **ErrorBoundary 부재**로 React가 `#root`를 통째로 unmount → 빈 화면. 예외는 콘솔에 남지 않는다.

### 0.3 절대 금지

- ❌ `muhan.com` (15.204.14.220 / IIS) — 완전히 무관한 레거시 사이트. 건드리지 말 것.
- ❌ `charon` 컨테이너 — Pangolin 제품. muhanai와 무관.
- ❌ 운영 서버 직접 수정 (배포는 총괄이 통합 후 1회만)
- ❌ `pnpm install --frozen-lockfile` (서버 lock이 덮어써짐)

### 0.4 공통 검증 명령

```bash
cd $ROOT
npx tsc -p apps/web/tsconfig.json --noEmit          # 0 errors 필수
npx vitest run apps/web                             # 회귀 금지
```

**각 파트는 자기 커밋을 스스로 만들고 push까지 수행한다.** (충돌 방지를 위해 파일이 겹치지 않음)

---

## PART A — ErrorBoundary 격리 장치

**담당 파일 (신규/수정 — 다른 파트와 겹치지 않음)**

```
$ROOT/apps/web/src/components/ErrorBoundary.tsx       ← 신규
$ROOT/apps/web/src/App.tsx                            ← 수정 (아래 2곳만)
```

> ⚠️ **Part C와의 충돌 방지 규칙**: `App.tsx`에서 손대는 곳은 **정확히 2곳**뿐이다.
> (1) import 추가, (2) `<WorldPageLazy />` 를 감싸는 `<ErrorBoundary>` 삽입.
> **다른 어떤 줄도 수정하지 말 것.** 특히 `RightPanel`/`Sidebar` 렌더 구역, `SECTIONS`, `ROUTES`는 Part C 담당이다.

### A.1 목표

한 페이지의 렌더 예외가 앱 전체를 붕괴시키지 못하게 한다. 실패 시 빈 화면 대신 오류 UI를 보여준다.

### A.2 구현

`ErrorBoundary.tsx` — 클래스 컴포넌트 (hooks로는 불가):

```tsx
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  /** 표시할 페이지 이름 — 오류 메시지에 사용 */
  label: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 콘솔을 살린다: React는 경계가 없으면 예외를 삼킨다.
    console.error(`[${this.props.label}] render failed`, error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div data-testid="page-error-boundary" style={{ padding: 40, textAlign: "center" }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
          {this.props.label} 페이지를 표시할 수 없습니다
        </h2>
        <p style={{ fontSize: 12, opacity: 0.7, marginBottom: 16 }}>
          {error.message}
        </p>
        <button type="button" onClick={() => this.setState({ error: null })}>
          다시 시도
        </button>
      </div>
    );
  }
}
```

`App.tsx` 수정 (정확히 2곳):

```tsx
// 1) import 추가 (기존 import 블록 마지막)
import { ErrorBoundary } from "./components/ErrorBoundary";

// 2) 기존:
{activeSection === "world" && (
  <Suspense fallback={<PageSkeleton />}>
    <WorldPageLazy />
  </Suspense>
)}

//    변경:
{activeSection === "world" && (
  <ErrorBoundary label="World">
    <Suspense fallback={<PageSkeleton />}>
      <WorldPageLazy />
    </Suspense>
  </ErrorBoundary>
)}
```

### A.3 i18n

문구는 우선 하드코딩(한국어)으로 시작한다. **i18n 키 추가는 Part A 범위가 아니다** (`i18n.ts`는 Part C가 건드릴 수 있음). 후속 작업으로 분리.

### A.4 검증

```bash
npx tsc -p apps/web/tsconfig.json --noEmit
npx vitest run apps/web
```

**행동 검증:** `ErrorBoundary`에 `throw new Error("test")` 를 넣는 임시 테스트로
`data-testid="page-error-boundary"` 가 렌더되고 앱 셸(사이드바)이 **살아있는지** 확인 후 코드 제거.

### A.5 완료 조건

- [ ] `/world` 실패 시 빈 화면이 아니라 오류 UI 표시
- [ ] 사이드바·다른 페이지는 정상 동작 유지
- [ ] tsc 0 errors, vitest 통과
- [ ] 커밋: `fix(web): isolate page render failures with an ErrorBoundary`

---

## PART B — WorldGlobe 렌더 방어

**담당 파일 (단일 파일 — 완전 독립)**

```
$ROOT/apps/web/src/components/WorldGlobe.tsx          ← 수정
$ROOT/apps/web/src/components/WorldGlobe.test.tsx     ← 신규 (테스트)
```

> ⚠️ `App.tsx`를 **절대 수정하지 말 것**. `WorldPage.tsx`도 이번엔 수정하지 않는다 (필요하면 총괄에게 요청).

### B.1 목표

`globe.gl` 초기화가 실패해도 페이지가 죽지 않고, 캔버스 대신 명확한 폴백 UI를 보여준다.

### B.2 결함 지점

`WorldGlobe.tsx:313-354` 의 `useEffect`:

```tsx
const chart = GlobeChart(el);          // ← try/catch 없음
```

`globe.gl`(three.js)은 WebGL 컨텍스트를 요구한다. 컨텍스트 획득 실패·텍스처 로드 실패·구형 GPU에서 throw하면 이 예외가 **렌더 경계로 전파**된다.

> 진단 #7에 따르면 이 청크의 NS 에러는 아니다. 그러나 Part A가 격리 장치를 넣어도 **페이지는 여전히 "빈 카드"** 가 되므로, B가 실제 복구를 담당한다.

### B.3 구현

1. **`useState` 추가**
   ```tsx
   const [globeError, setGlobeError] = useState<string | null>(null);
   const [ready, setReady] = useState(false);  // 이미 있으면 재사용
   ```

2. **`useEffect` 안을 try/catch로 감싼다**
   ```tsx
   useEffect(() => {
     const el = containerRef.current;
     if (!el) return;

     let chart: GlobeInstance | null = null;
     try {
       chart = GlobeChart(el);
       // ... 기존 설정 그대로 ...
       globeRef.current = chart;
       setReady(true);
       setGlobeError(null);
     } catch (err) {
       // WebGL 없음 / three.js 초기화 실패 — 페이지를 죽이지 않는다.
       setGlobeError(err instanceof Error ? err.message : "지구본을 표시할 수 없습니다");
       setReady(false);
       return;
     }

     const observer = new ResizeObserver(() => {
       chart?.width(el.clientWidth || FALLBACK_WIDTH).height(el.clientHeight || FALLBACK_HEIGHT);
     });
     observer.observe(el);

     return () => {
       observer.disconnect();
       globeRef.current = null;
       try {
         chart?._destructor();
       } catch {
         /* teardown 실패는 무시 */
       }
     };
   }, []);
   ```

3. **폴백 UI** — `containerRef` div 아래에 조건부 렌더:
   ```tsx
   {globeError && (
     <div data-testid="world-globe-fallback"
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs text-white/60">
       <ScanLine size={24} />
       <span>3D 지구본을 표시할 수 없습니다</span>
       <span className="text-white/40">{globeError}</span>
       <span className="text-white/40">이벤트 목록은 아래에서 확인할 수 있습니다</span>
     </div>
   )}
   ```

4. **WebGL 사전 감지** (권장) — 훅 도입으로 불필요한 예외를 예방:
   ```tsx
   const hasWebGL = useMemo(() => {
     try {
       const c = document.createElement("canvas");
       return !!(c.getContext("webgl2") || c.getContext("webgl"));
     } catch { return false; }
   }, []);
   ```
   `!hasWebGL` 이면 effect에서 바로 폴백 상태로 진입.

### B.4 테스트

`WorldGlobe.test.tsx` — globe.gl을 mock해 **throw하는 경우** 폴백이 뜨는지:

```tsx
vi.mock("globe.gl", () => ({
  default: () => { throw new Error("no webgl"); },
}));
// render → expect(screen.getByTestId("world-globe-fallback")).toBeTruthy()
```

### B.5 완료 조건

- [ ] `globe.gl` throw 시 페이지가 살아있고 폴백 UI 표시
- [ ] 정상 환경에서는 기존과 동일하게 캔버스 렌더
- [ ] unmount 시 `_destructor` 호출 유지 (누수 방지)
- [ ] tsc 0 errors, vitest 통과
- [ ] 커밋: `fix(web): keep /world alive when globe.gl fails to initialise`

---

## PART C — API 계약 정합화 (404/502 제거)

**담당 파일 (전부 Part A/B와 겹치지 않음)**

```
$ROOT/apps/web/src/components/RightPanel.tsx       ← 수정 (API 호출)
$ROOT/apps/web/src/hooks/useMeshPulse.ts           ← 수정 (기본 endpoint)
$ROOT/apps/web/src/components/Sidebar.tsx          ← 수정 (필요 시)
$ROOT/services/api/src/network-routes.ts           ← 신규 (스텁 라우트, 권장안)
$ROOT/services/api/src/server.ts                   ← 수정 (라우트 등록 1줄)
```

> ⚠️ `App.tsx`, `WorldGlobe.tsx`, `WorldPage.tsx`는 **건드리지 말 것**.

### C.1 목표

브라우저 콘솔에 뜨는 11~12건의 502/404를 0으로 만든다.

### C.2 존재하지 않는 라우트 (실측)

| 라우트 | 호출처 | 서버 구현 |
|---|---|---|
| `/api/nodes` | `RightPanel.tsx:63` | ❌ 없음 |
| `/api/agents` | `RightPanel.tsx:60` | ⚠️ 확인 필요 |
| `/api/network` | `RightPanel.tsx:57` | ⚠️ 확인 필요 |
| `/api/mesh/pulse` | `useMeshPulse.ts:46` (기본값) | ❌ 없음 |
| `/api/pulse/stream` | — | ❌ 없음 |
| `/api/credits/balance` | — | ❌ 없음 |

### C.3 전략 선택 (권장: **서버 스텁 우선**)

**❌ 호출 제거 방식**은 UI가 영구히 빈 상태가 된다.
**✅ 서버 스텁 방식**을 권장한다 — 기존 UI 계약을 지키고 502를 없앤다.

`services/api/src/network-routes.ts` (신규):

```ts
import type { FastifyInstance } from "fastify";

/**
 * Mesh telemetry contract endpoints.
 *
 * The web shell (RightPanel, useMeshPulse) has always called these; the server
 * never implemented them, so every page load produced 502s. Until the real
 * gossip/credit layer lands, serve an explicitly-empty payload — the UI already
 * renders sensible defaults for empty data.
 */
export async function networkRoutes(app: FastifyInstance) {
  app.get("/api/nodes", async () => []);
  app.get("/api/agents", async () => []);
  app.get("/api/network", async () => ({
    compute: {}, llm: {}, mcp: {}, human: {},
    source: "unconfigured",
  }));
  app.get("/api/mesh/pulse", async () => ({
    peers: 0, bytesUp: 0, bytesDown: 0, latencyMs: 0, source: "unconfigured",
  }));
}
```

`server.ts` 등록 (기존 라우트 등록 블록에 1줄):
```ts
await app.register(networkRoutes);
```

### C.4 502 원인 분리 (중요)

로컬 `:8080 → :3001` 은 **200**, 공개 URL은 **502**. 두 가지를 구분한다:

1. **라우트 미존재** → 이 파트에서 스텁 추가로 해결
2. **프록시 불일치** → nginx `location /api/` 설정 또는 Cloudflare. 이건 **인프라 이슈로 총괄에게 보고**하고 직접 수정하지 않는다.

```bash
# 로컬 검증
ssh 110 "curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: muhanai.com' http://127.0.0.1:8080/api/nodes"
# 공개 검증
curl -s -o /dev/null -w '%{http_code}\n' https://muhanai.com/api/nodes
```
둘이 다르면 → 프록시 문제 (총괄 보고).

### C.5 완료 조건

- [ ] `/api/nodes`, `/api/agents`, `/api/network`, `/api/mesh/pulse` 모두 200
- [ ] 인증 요구 라우트라면 `X-API-Key` 정책 준수 (기존 미들웨어 확인)
- [ ] tsc 0 errors (web + api), vitest 통과
- [ ] 커밋: `fix(api): serve the mesh telemetry contract the web shell calls`

---

## 통합 절차 (총괄 담당, 3파트 완료 후)

```bash
# 1) 3파트 커밋 수집 확인
git log --oneline main..HEAD

# 2) 전체 게이트
cd $ROOT
npx tsc -p packages/cosmos-core/tsconfig.json --noEmit
npx tsc -p services/api/tsconfig.json --noEmit
npx tsc -p apps/web/tsconfig.json --noEmit
npx vitest run packages/cosmos-core services/api apps/web

# 3) API 재빌드 (서버, /root/agentmesh-api-restart/build.sh 사용)
ssh 110 "cd /opt/agentmesh/services/api && /root/agentmesh-api-restart/build.sh && pm2 restart muhanai-agentmesh-api"

# 4) 웹 빌드 + 배포
ssh 110 "cd /opt/agentmesh/apps/web && node_modules/.bin/vite build && \
  cp -r dist/assets/* /var/www/muhanai.com/assets/ && \
  cp dist/index.html /var/www/muhanai.com/index.html"

# 5) 브라우저 검증
node <browser-skill>/browser.mjs https://muhanai.com/world --wait "[data-testid=world-page]"
# 기대: rootKids >= 1, DOM nodes > 100, console errors 0
```

---

## 파트 간 의존성 / 충돌 매트릭스

| | Part A | Part B | Part C |
|---|---|---|---|
| **A** | — | 없음 | `App.tsx` ⚠️ **A 전용** |
| **B** | 없음 | — | 없음 |
| **C** | `App.tsx` ⚠️ | 없음 | — |

**규칙:** `App.tsx`는 **Part A만** 수정한다. Part C가 `App.tsx` 수정이 필요하면 총괄에게 요청 후 순차 적용.

---

## 예상 효과

| 조합 | `/world` 결과 |
|---|---|
| A만 | 빈 화면 → **오류 UI** (앱은 살아있음) |
| B만 | 빈 화면 → 글로브 폴백 카드 (단, A 없으면 다른 예외 시 여전히 전체 붕괴) |
| C만 | 502 소음 제거, 빈 화면은 **그대로** |
| **A+B+C** | **정상 렌더** (글로브 또는 폴백 + 이벤트 목록 + 사이드바) |
