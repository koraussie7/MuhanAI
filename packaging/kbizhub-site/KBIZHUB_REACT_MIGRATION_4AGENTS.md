# KBIZHUB_REACT_MIGRATION_4AGENTS.md

**작성일:** 2026-10-23
**대상:** `packaging/kbizhub-site/index.html` (3,887줄 / 12섹션) → Vite + React + TS
**목적:** 4명의 에이전트가 **파일 충돌 없이** 동시에 작업할 수 있도록 범위를 분할한다.

---

## 0. 공통 컨텍스트 (모든 에이전트 필독)

### 0.1 현재 상태

```
packaging/kbizhub-site/index.html    3,887줄 / 123KB / 단일 파일
├── <style>      956줄 (CSS 변수 15개)
├── <section>    12개
└── <script>      56줄 (함수 6개)
```

**서버:** `https://kbizhub.com` — 정적 HTML. React 프레임워크 없음.

### 0.2 이미 존재하는 동적 로직 (반드시 React로 이전)

| JS 함수                                      | 역할             | 이전 대상                              |
| -------------------------------------------- | ---------------- | -------------------------------------- |
| `submitStarterOrder()`                       | 주문 제출        | `lib/orders.ts` (Part D)               |
| `openStarterModal()` / `closeStarterModal()` | 결제 모달        | `components/StarterModal.tsx` (Part D) |
| `toggleTeamAgent()`                          | 팀 에이전트 선택 | `sections/TeamBuilder.tsx` (Part C)    |
| `toggleNavMenu()`                            | 모바일 메뉴      | `components/Nav.tsx` (Part A)          |
| `localStorage` (2회)                         | 상태 저장        | 각 컴포넌트의 hook (Part A)            |

### 0.3 섹션 크기 — 파트 배분 근거

| 섹션                     | 줄 수 | 파트  |
| ------------------------ | ----: | ----- |
| `starter` (Hero)         |   102 | **A** |
| `why`                    |   146 | **A** |
| `comparison`             |   103 | **A** |
| `pipeline`               |   442 | **B** |
| `agent-seo`              |   120 | **B** |
| `marketplace`            |   219 | **B** |
| `human-expert`           |   166 | **B** |
| `mybiz`                  |   344 | **C** |
| `team-builder`           |   185 | **C** |
| `economy`                |   194 | **C** |
| `message-center`         |   133 | **D** |
| `template-studio`        |   187 | **D** |
| _(StarterModal, orders)_ |     — | **D** |

### 0.4 절대 금지

- ❌ **`index.html` 원본 삭제** — 마이그레이션 완료 전까지 유일한 기준. 읽기 전용으로만 취급
- ❌ **다른 파트의 파일 생성/수정** — 아래 소유권 표를 지킬 것
- ❌ `muhanai.com` / `110` 서버 직접 수정 — 배포는 총괄이 통합 후 1회
- ❌ 기존 CSS 클래스명 변경 — 시각 회귀 위험

### 0.5 공통 명령

```bash
cd /Users/brianyeon/CodeGPT/integration-finalize/packaging/kbizhub-site
node_modules/.bin/tsc --noEmit      # 0 errors 필수
node_modules/.bin/vite build        # 빌드 성공 필수
```

---

## 1. 소유권 표 (충돌 방지의 핵심)

| 파일/디렉터리                                     | 소유 파트 | 다른 파트 |
| ------------------------------------------------- | --------- | --------- |
| `index.html` (진입점, 4줄)                        | **총괄**  | 읽기만    |
| `package.json`, `vite.config.ts`, `tsconfig.json` | **총괄**  | 읽기만    |
| `src/main.tsx`, `src/App.tsx`                     | **총괄**  | 읽기만    |
| `src/styles/tokens.css`                           | **총괄**  | 읽기만    |
| `src/components/Nav.tsx`                          | **A**     | —         |
| `src/components/Section.tsx`                      | **A**     | —         |
| `src/sections/Hero.tsx`                           | **A**     | —         |
| `src/sections/Why.tsx`                            | **A**     | —         |
| `src/sections/Comparison.tsx`                     | **A**     | —         |
| `src/sections/Pipeline.tsx`                       | **B**     | —         |
| `src/sections/AgentSeo.tsx`                       | **B**     | —         |
| `src/sections/Marketplace.tsx`                    | **B**     | —         |
| `src/sections/HumanExpert.tsx`                    | **B**     | —         |
| `src/sections/MyBiz.tsx`                          | **C**     | —         |
| `src/sections/TeamBuilder.tsx`                    | **C**     | —         |
| `src/sections/Economy.tsx`                        | **C**     | —         |
| `src/sections/MessageCenter.tsx`                  | **D**     | —         |
| `src/sections/TemplateStudio.tsx`                 | **D**     | —         |
| `src/components/StarterModal.tsx`                 | **D**     | —         |
| `src/lib/orders.ts`                               | **D**     | —         |

> ⚠️ **`App.tsx`는 총괄 전용.** 파트 에이전트는 섹션 파일만 만들고, 등록은 총괄이 한다.

---

## 2. 총괄 준비 작업 — ✅ 완료됨

에이전트가 바로 코드를 쓸 수 있도록 스캐폴딩을 **미리 만들어 두었다.**

```
kbizhub-site/
├── index.html          ← 원본 (3,887줄) — 수정 금지, 시각 기준
├── index.legacy.html   ← 원본 백업
├── app.html            ← React 진입점 (Vite input)
├── package.json        ← react 18, vite 6, ts 5.7
├── vite.config.ts      ← input: app.html
├── tsconfig.json       ← strict + noUncheckedIndexedAccess
├── node_modules/       ← 설치 완료
└── src/
    ├── main.tsx        ✅ StrictMode + createRoot
    ├── App.tsx         ✅ 12개 섹션 placeholder (총괄 전용)
    ├── styles/
    │   └── global.css  ✅ 954줄 이전 완료 (14.8KB)
    ├── components/     ← A, D가 채움
    ├── sections/       ← A, B, C, D가 채움
    └── lib/            ← D가 채움
```

**검증됨:** `tsc --noEmit` 0 errors, `vite build` 성공 (46KB gzip).

> ⚠️ **`index.html`은 절대 수정하지 말 것.** 마이그레이션 완료 후 총괄이 `dist/app.html`로교체한다.
> 빌드 결과는 `dist/app.html`이다 — 파일명이 다른 이유는 원본 보존 때문이다.

**`App.tsx`는 placeholder 상태:**

```tsx
function Pending({ id }: { id: string }) {
  return <section id={id} data-migration="pending" />;
}

export function App() {
  return (
    <>
      <Pending id="starter" />   {/* Part A */}
      <Pending id="mybiz" />     {/* Part C */}
      ...
    </>
  );
}
```

각 파트가 섹션을 완성하면 **총괄이 `Pending`을 실제 컴포넌트로 교체**한다. 앵커 링크(`#starter` 등)는 이미 동작한다.

---

## PART A — 셸 + 상단 섹션

**소유 파일**

```
src/components/Nav.tsx
src/components/Section.tsx
src/sections/Hero.tsx          ← #starter (102줄)
src/sections/Why.tsx           ← #why (146줄)
src/sections/Comparison.tsx    ← #comparison (103줄)
```

### A.1 목표

공통 셸(내비게이션)과 상단 3개 섹션을 React 컴포넌트로 이전한다.

### A.2 Nav.tsx — `toggleNavMenu` 이전

원본의 `toggleNavMenu()`를 `useState`로 바꾼다:

```tsx
import { useState } from "react";

const LINKS = [
  { href: "#starter", label: "Starter" },
  { href: "#mybiz", label: "MyBiz" },
  { href: "#pipeline", label: "Pipeline" },
  { href: "#team-builder", label: "Team Builder" },
  { href: "#marketplace", label: "Marketplace" },
  { href: "#why", label: "Why" },
] as const;

export function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="nav">
      <a href="#starter" className="nav-logo">
        kbizhub
      </a>
      <button
        type="button"
        className="nav-toggle"
        aria-expanded={open}
        aria-controls="nav-menu"
        onClick={() => setOpen((v) => !v)}
      >
        ☰
      </button>
      <ul id="nav-menu" className={`nav-menu ${open ? "is-open" : ""}`}>
        {LINKS.map((l) => (
          <li key={l.href}>
            <a href={l.href} onClick={() => setOpen(false)}>
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

> **`localStorage` 2회**: 원본이 어디서 쓰는지 확인하고, 모바일 메뉴 상태면 위처럼 단순화한다(휘발성 상태로 충분). 다른 용도면 총괄에게 보고.

### A.3 Section.tsx — 공통 래퍼

12개 섹션이 반복하는 구조를 흡수한다:

```tsx
import type { ReactNode } from "react";

interface Props {
  id: string;
  eyebrow?: string;
  title?: string;
  children: ReactNode;
}

export function Section({ id, eyebrow, title, children }: Props) {
  return (
    <section id={id} className="section">
      {eyebrow && <p className="section-eyebrow">{eyebrow}</p>}
      {title && <h2 className="section-title">{title}</h2>}
      {children}
    </section>
  );
}
```

### A.4 섹션 이전 규칙 (모든 파트 공통)

1. **원본 HTML을 그대로 옮긴다.** 구조·클래스명·텍스트를 바꾸지 않는다
2. `class` → `className`
3. `style="..."` → `style={{ ... }}`
4. 인라인 `<svg>`는 그대로 복사 (변환 금지)
5. `&amp;` 같은 엔티티는 그대로 두거나 실제 문자로 (렌더 결과 동일해야 함)
6. **`dangerouslySetInnerHTML` 사용 금지**

### A.5 검증

```bash
node_modules/.bin/tsc --noEmit
node_modules/.bin/vite build
```

**시각 검증:** 빌드 결과를 띄우고 원본과 스크린샷 비교 (총괄이 자동화 제공)

### A.6 완료 조건

- [ ] 원본과 픽셀 단위로 동일 (텍스트·색·간격)
- [ ] 모바일 메뉴 토글 동작
- [ ] tsc 0 errors, build 성공
- [ ] 커밋: `refactor(kbizhub): migrate nav and top sections to React`

---

## PART B — 파이프라인 + 확장 섹션

**소유 파일**

```
src/sections/Pipeline.tsx      ← #pipeline (442줄, 최대)
src/sections/AgentSeo.tsx      ← #agent-seo (120줄)
src/sections/Marketplace.tsx   ← #marketplace (219줄)
src/sections/HumanExpert.tsx   ← #human-expert (166줄)
```

### B.1 목표

가장 큰 섹션(`pipeline`, 442줄)을 포함한 4개를 이전한다.

### B.2 `pipeline` 주의사항

442줄로 **단일 파일에서 가장 큽니다.** 내부가 반복 카드 구조라면 **로컬 서브컴포넌트**로 쪼갠다:

```tsx
// Pipeline.tsx 안에서만 사용 — export 하지 않는다
function StageCard({ stage }: { stage: Stage }) { ... }

export function Pipeline() {
  return (
    <Section id="pipeline" eyebrow="..." title="...">
      {STAGES.map((s) => <StageCard key={s.id} stage={s} />)}
    </Section>
  );
}
```

**데이터는 상수 배열로 분리** — JSX 반복을 줄이고 나중에 API로 교체하기 쉽게.

### B.3 `Section` 컴포넌트 의존

`Section.tsx`는 **Part A 소유**다. B는 **import만** 한다:

```tsx
import { Section } from "../components/Section";
```

A가 아직 파일을 안 만들었으면 **임시로 `<section>` 직접 사용**하고, A 완료 후 교체한다. (충돌 방지를 위해 A 파일을 만들지 말 것)

### B.4 검증 / 완료 조건

A와 동일.

- [ ] 4개 섹션 렌더, 텍스트·레이아웃 원본과 동일
- [ ] tsc 0 errors, build 성공
- [ ] 커밋: `refactor(kbizhub): migrate pipeline and marketplace sections to React`

---

## PART C — 비즈니스 + 협업 섹션

**소유 파일**

```
src/sections/MyBiz.tsx         ← #mybiz (344줄)
src/sections/TeamBuilder.tsx   ← #team-builder (185줄, 동적)
src/sections/Economy.tsx       ← #economy (194줄)
```

### C.1 목표

핵심 기능 섹션 3개를 이전한다. `TeamBuilder`는 **동적 상태**가 있다.

### C.2 TeamBuilder.tsx — `toggleTeamAgent` 이전

**원본 (index.html `<script>`에서 확인):**

```js
function toggleTeamAgent(el, role) {
  el.classList.toggle("selected");
  const count = document.querySelectorAll(".team-agent-card.selected").length;
  const counterEl = document.getElementById("selectedTeamCount");
  if (counterEl) counterEl.textContent = count;
}
```

React로:

```tsx
const [selected, setSelected] = useState<Set<string>>(new Set());

const toggle = (id: string) =>
  setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
```

DOM 조작(`classList.toggle`)을 상태로 바꾸는 것이 이 파트의 핵심이다.
선택 상태에 따라 클래스를 렌더 시 계산한다:

```tsx
className={`team-agent-card ${selected.has(agent.id) ? "selected" : ""}`}
```

카운터(`#selectedTeamCount`)는 직접 DOM을 쓰지 않고 **파생값**으로 렌더한다:

```tsx
<span id="selectedTeamCount">{selected.size}</span>
```

### C.3 완료 조건

- [ ] 에이전트 카드 클릭 시 선택 토글 (원본과 동일한 시각 변화)
- [ ] 3개 섹션 레이아웃 동일
- [ ] tsc 0 errors, build 성공
- [ ] 커밋: `refactor(kbizhub): migrate business and team sections to React`

---

## PART D — 주문 흐름 + 하단 섹션

**소유 파일**

```
src/sections/MessageCenter.tsx  ← #message-center (133줄)
src/sections/TemplateStudio.tsx ← #template-studio (187줄)
src/components/StarterModal.tsx ← 결제 모달
src/lib/orders.ts               ← submitStarterOrder
```

### D.1 목표

**동적 기능의 핵심인 주문 흐름**을 React로 이전한다. 이 파트가 가장 중요하다.

### D.2 StarterModal.tsx

**원본 (index.html `<script>`에서 확인):**

```js
function openStarterModal() {
  document.getElementById("starterModal").classList.add("active");
}
function closeStarterModal() {
  document.getElementById("starterModal").classList.remove("active");
}
function submitStarterOrder(e) {
  e.preventDefault();
  const bizName = document.getElementById("orderBizName").value;
  const industry = document.getElementById("orderIndustry").value;
  const email = document.getElementById("orderEmail").value;
  const website = document.getElementById("orderWebsite").value;
  if (bizName && email) {
    const orders = JSON.parse(localStorage.getItem("kbizhub_orders") || "[]");
    orders.push({ bizName, industry, email, website, date: new Date().toISOString(), amount: 29000 });
    localStorage.setItem("kbizhub_orders", JSON.stringify(orders));
    document.getElementById("orderForm").style.display = "none";
    document.getElementById("orderSuccess").style.display = "block";
  }
}
```

**중요:** localStorage 키는 **`kbizhub_orders`** 다 (제안한 `kbizhub:orders` 아님).
기존 사용자 데이터와 호환되도록 원본 키를 그대로 쓴다.

React:

```tsx
interface Props {
  open: boolean;
  onClose: () => void;
  onSubmitted: (order: StarterOrder) => void;
}

export function StarterModal({ open, onClose, onSubmitted }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit(form: FormData) {
    setSubmitting(true);
    setError(null);
    try {
      const order = await submitStarterOrder(form);
      onSubmitted(order);
    } catch (e) {
      setError(e instanceof Error ? e.message : "주문에 실패했습니다");
    } finally {
      setSubmitting(false);
    }
  }
  // form 필드명: bizName, industry, email, website
}
```

### D.3 lib/orders.ts — 타입 지정 주문 API

원본 `submitStarterOrder()`는 **`localStorage`의 `kbizhub_orders` 키**에 저장한다.

```ts
export interface StarterOrder {
  bizName: string;
  industry: string;
  email: string;
  website: string;
  date: string;
  amount: 29000;
}

/**
 * 주문을 제출한다.
 *
 * 현재 백엔드가 없으므로 localStorage에 저장한다. 실제 결제 연동 시 이 함수
 * 본문만 교체하면 UI는 그대로 동작한다.
 *
 * 키 `kbizhub_orders`는 원본 index.html과 동일하다 — 기존 사용자 데이터 호환.
 */
export async function submitStarterOrder(
  form: FormData,
): Promise<StarterOrder> {
  const order: StarterOrder = {
    bizName: String(form.get("bizName") ?? "").trim(),
    industry: String(form.get("industry") ?? "").trim(),
    email: String(form.get("email") ?? "").trim(),
    website: String(form.get("website") ?? "").trim(),
    date: new Date().toISOString(),
    amount: 29000,
  };

  if (!order.bizName || !order.email) {
    throw new Error("업체명과 이메일은 필수입니다");
  }

  const existing = JSON.parse(
    localStorage.getItem("kbizhub_orders") ?? "[]",
  ) as StarterOrder[];
  localStorage.setItem(
    "kbizhub_orders",
    JSON.stringify([...existing, order]),
  );
  return order;
}
```

> ⚠️ **실제 결제 API는 이번 범위 아님.** 타입과 경계만 확정하고, 나중에 교체 가능하게 만든다.

### D.4 완료 조건

- [ ] 모달 열기/닫기 동작 (Esc, 배경 클릭 포함)
- [ ] 제출 시 localStorage에 주문 저장
- [ ] 필수 입력 누락 시 에러 표시
- [ ] tsc 0 errors, build 성공
- [ ] 커밋: `refactor(kbizhub): migrate order flow and bottom sections to React`

---

## 3. 통합 절차 (총괄)

```bash
cd packaging/kbizhub-site

# 1) 4파트 커밋 수집
git log --oneline main..HEAD

# 2) 게이트
node_modules/.bin/tsc --noEmit
node_modules/.bin/vite build

# 3) 원본과 시각 비교
node <browser-skill>/browser.mjs file://.../dist/index.html --screenshot /tmp/new.png
# 원본 index.html과 픽셀 비교

# 4) 배포 (총괄만)
```

## 4. 예상 효과

| 항목              | 이전           | 이후       |
| ----------------- | -------------- | ---------- |
| 파일 수           | 1 (3,887줄)    | 18         |
| 주문 상태         | DOM 조작       | `useState` |
| 타입 안전         | 없음           | TS         |
| 동적 기능 추가    | 3,887줄에 삽입 | 파일 1개   |
| muhanai 코드 공유 | 불가           | 가능       |

## 5. 충돌 매트릭스

|       | A   | B                   | C                   | D                   |
| ----- | --- | ------------------- | ------------------- | ------------------- |
| **A** | —   | `Section` import ⚠️ | `Section` import ⚠️ | `Section` import ⚠️ |
| **B** | ⚠️  | —                   | 없음                | 없음                |
| **C** | ⚠️  | 없음                | —                   | 없음                |
| **D** | ⚠️  | 없음                | 없음                | —                   |

**규칙:** `Section.tsx`는 **A만 생성**한다. B/C/D는 import만 하고, 파일이 없으면 `<section>` 직접 사용 후 A 완료 시 교체.

`App.tsx`는 **총괄 전용** — 어떤 파트도 수정하지 않는다.
