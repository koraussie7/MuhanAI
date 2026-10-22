# golive.wiki — Dashboard ↔ Service-Request 통합 플랜

> 두 화면을 **하나의 대시보드 SPA-like 멀티뷰**로 통합해, 사용자가 페이지를 떠나지 않고 카테고리 선택 → 의뢰 작성 → 카운터오퍼 수신까지 진행하도록 한다.

---

## 0. 배경 및 용어 정리

대상 파일은 두 개이지만, 둘 다 이름 때문에 오해하기 쉽습니다. 통합 전 정정합니다.

| 화면                        | 실제 정체성                                                                              | 비고                                                                 |
| --------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `screens-04-dashboard.html` | **워커용 대시보드**: 지도 + 작업 리스트 + 활동 피드                                      | 작업 탐색·수락·활동 확인                                             |
| `screens-07-ride.html`      | **의뢰자용 서비스 호출 플로우**: 카테고리 → 의뢰서 작성 → inDrive 스타일 카운터오퍼 협상 | 페이지 이름은 "ride"지만 코드·i18n·UX 모두 "Airtasker식 서비스 호출" |

따라서 "탑승 중 화면을 대시보드에 통합"이 아니라, **"의뢰자 측의 3-스텝 호출 플로우를 워커 대시보드와 한 화면에서 토글/이행할 수 있게 한다"**가 정확한 작업 범위입니다.

`styles/i18n.js`의 `ride_*` 키 두 그룹(예: `ride_step1`="1단계: 경로 입력" vs `ride_step1_title`="어떤 서비스가 필요하신가요?")이 공존하는 것도 이 혼선을 반영합니다.

---

## 1. 통합 목표 (Goals)

| #   | 목표                                                                                                                         | 검증 기준                                                                |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| G1  | 의뢰자/워커 양쪽 입장이 **단일 URL**(`screens-04-dashboard.html`)에서 토글된다                                               | URL 변경 없이 모드 전환 가능                                             |
| G2  | 호출 플로우의 3단계(카테고리 → 의뢰서 → 카운터오퍼 수신)를 **모달 또는 우측 드로어**로 띄워 컨텍스트(지도/리스트)를 유지한다 | 의뢰 진행 중에도 지도·리스트가 살아 있음                                 |
| G3  | 호출 완료(제안 수락/거절) 시 **자동으로 대시보드 활동 피드/지도 마커**에 반영된다                                            | 같은 state 저장소 사용                                                   |
| G4  | 기존 빌드(Vite MPA)와 배포 라우팅이 깨지지 않는다                                                                            | `vite build` 무오류, `https://golive.wiki/screens-04-dashboard.html` 200 |
| G5  | 다국어(i18n)와 절대 URL 정책(이전 작업으로 적용됨)이 유지된다                                                                | `data-i18n` 누락 0, 외부 진입 링크 정상                                  |

---

## 2. 비-목표 (Non-Goals)

- 의뢰자/워커 로그인·권한 분리 (현재는 단일 데모 세션)
- Supabase RLS·인증 플로우 (기존 `js/supabase-client.js` 그대로 사용)
- 지도 라이브러리 교체 (Leaflet 유지)
- 새로운 디자인 시스템 도입 (기존 `tokens.css` 재사용)

---

## 3. 현재 코드 지도

### 3.1 `screens-04-dashboard.html` (601줄)

- 상단 `.topbar` (검색바, 언어 스위처, "+ 일 올리기" 버튼)
- 3-패널 레이아웃:
  - `.task-list-panel` — 필터 + 작업 카드 4개 (`.browse-card`)
  - `.map-panel` — `#real-map` Leaflet, 가격 마커
  - `.activity-panel` — `.activity-item` 4건
- 인라인 `<script>` 2개:
  - Leaflet 초기화 + 작업 마커 (`tasks` 배열 하드코딩, `focusTask(lat,lng,title)`)
  - 언어 스위처 폴백

### 3.2 `screens-07-ride.html` (617줄)

- 상단 `.topbar` (브랜드 + "SERVICE REQUEST" 배지 + 언어 + 메인으로)
- `.step-bar` — 3개의 `.step-pill` (active 토글)
- `.container` 안에 3개 `.step`:
  - `#step-1`: `#cat-grid` (카테고리 18개 동적 렌더)
  - `#step-2`: 의뢰서 폼 + 가격 슬라이더 (`#offer-slider`, `updateOffer`, `submitRequest`)
  - `#step-3`: 카운터오퍼 리스트 (`#offers-list`, `acceptThis`/`declineThis`/`counterThis`)
- 외부 모듈: `./js/services-app.js` (window 전역: `goStep`, `updateOffer`, `submitRequest`, `acceptThis`, `declineThis`, `counterThis`)
- 데이터: `./js/data/categories.js` (`CATEGORIES` 18개)

### 3.3 공유 자원

- `styles/i18n.js` — 7개 언어(ko/en/vi/ja/zh/hi/es), 두 화면 키 모두 포함
- `styles/tokens.css` — 컬러/타이포 토큰
- `js/supabase-client.js`, `js/api.js`, `js/realtime.js`, `js/rideflow.js` — 백엔드 글루

---

## 4. 아키텍처 결정

### 4.1 통합 방식 선택지

| 방식                                                                     | 장점                                                                  | 단점                                                          | 권장              |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------- |
| A. 두 HTML 파일을 **물리적으로 병합** (대시보드 안에 호출 DOM 직접 삽입) | URL 1개, 빌드 단순                                                    | 파일 비대, 모드 전환 시 DOM show/hide 복잡, SEO·공유 URL 불리 | ❌                |
| B. **드로어/모달 패턴**으로 호출 플로우를 대시보드 위에 띄움 (iframe X)  | 컨텍스트 유지, 단계 진행 중에도 지도·리스트 visible, 코드 모듈성 유지 | JS 상태 공유·이벤트 버스 설계 필요                            | ✅                |
| C. **iframe**으로 `screens-07-ride.html`을 드로어 안에 임베드            | 격리·재사용 쉬움                                                      | 메시지/상태 동기화 복잡, 다국어 전환 두 번, 스타일 충돌       | ❌                |
| D. **단일 SPA 재작성** (React/Vue 도입)                                  | 깨끗한 상태 관리                                                      | 코드베이스 전면 개편, 위험 큼                                 | ❌ (현재 범위 외) |

**결정: B. 드로어 패턴 + 공유 상태 객체**. 기존 Vite MPA를 유지하면서 두 화면을 한 HTML에서 토글합니다.

### 4.2 상태 공유 모델

기존 두 화면의 상태를 단일 **단일 진실 소스(SSOT)**로 통합:

```
js/state-store.js (신규)
├─ mode: 'idle' | 'browse' | 'request-step1' | 'request-step2' | 'request-step3' | 'request-done'
├─ userRole: 'worker' | 'requester' (기본 'worker')
├─ selectedCategory, taskDraft, offers[], acceptedOffer
├─ dashboardTasks[], activityFeed[]
└─ pub/sub: subscribe(event, fn)  ← Leaflet 마커·활동 피드·드로어가 모두 구독
```

- `js/services-app.js`는 `state-store`를 import하도록 리팩터(전역 window 함수 제거 또는 wrapper로 호환).
- 대시보드의 하드코딩 `tasks` 배열은 `state-store.dashboardTasks`로 이동, Leaflet 마커는 store 변경 시 재렌더.

### 4.3 URL·라우팅 정책

- 정식 URL: `https://golive.wiki/screens-04-dashboard.html` (단일 진입점)
- 기존 `screens-07-ride.html`은 **별칭으로 보존**:
  - 파일은 그대로 두되 상단에 `<script>location.replace('https://golive.wiki/screens-04-dashboard.html?mode=request')</script>` 추가
  - 또는 postbuild에서 `screens-07-ride.html`을 `screens-04-dashboard.html`로의 메타 리프레시 HTML로 생성
- **선택안**: 첫 번째(간단, robots/SEO 영향 미미). 이전 작업의 절대 URL 정책과 일관성 유지.

### 4.4 모드 토글 UX

- 대시보드 상단 `.topbar` 우측에 **모드 스위처** 추가:
  - `[🔍 워커 모드] [📞 의뢰 모드]` (segmented control)
  - 의뢰 모드 진입 시 → 우측에서 드로어 슬라이드인 → 카테고리 그리드(step-1) 자동 표시
- 드로어 너비: 데스크톱 480px, 모바일 100%
- 드로어 헤더: X 닫기 + `.step-bar` (3-pill 그대로) + 진행률

---

## 5. 단계별 실행 계획

### Phase 0 — 사전 점검 (0.5 day)

| 작업                                                                                                                                                                               | 산출물          | 위험                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | -------------------------------------------------- |
| `styles/i18n.js` `ride_*` 키 충돌 정리 — 두 그룹의 의도를 명확히 분리/명명 (`ride_step1_title` → `reqflow_*`로 리네임, 또는 한쪽 폐기)                                             | i18n 키 표      | 기존 화면 깨질 수 있음 → grep으로 사용처 사전 파악 |
| `js/services-app.js` window 전역 의존성 점검 (`goStep`, `updateOffer`, `submitRequest`, `acceptThis`, `declineThis`, `counterThis`) — 통합 시 드로어에서 그대로 호출 가능한지 확인 | 의존성 매트릭스 | 낮음                                               |
| `vite.config.js` MPA 입력에 변화 없는지 확인                                                                                                                                       | 변경 없음       | 없음                                               |

### Phase 1 — 상태 스토어 + 서비스 모듈 리팩터 (1 day)

1. **`js/state-store.js` 신규 생성** (60줄 목표)
   - `state` 객체 + `setState(patch)` + `subscribe(event, fn)`
   - 이벤트 명세: `mode:change`, `category:selected`, `offers:updated`, `task:created`, `offer:accepted`, `offer:declined`

2. **`js/services-app.js` 리팩터**
   - `import { store } from './state-store.js'`
   - `state` → `store` 호출로 치환
   - 기존 `window.goStep = ...` 등은 호환을 위해 유지(드롭다운 안전망)
   - `submitRequest()` 성공 시 `store.emit('task:created', task)` 추가
   - `acceptThis()` 성공 시 `store.emit('offer:accepted', offer)` 추가

3. **대시보드 인라인 스크립트 분리**
   - 현재 `screens-04-dashboard.html` 내장 `<script>`의 `tasks` 배열 + Leaflet 로직을 **`js/dashboard-app.js`**로 추출
   - Leaflet 마커는 `store.subscribe('task:created', ...)`로 의뢰가 들어오면 마커 동적 추가
   - 활동 피드도 `store.subscribe('offer:accepted' | 'task:created', ...)`로 append

### Phase 2 — 드로어 컴포넌트 구현 (1.5 days)

1. **`screens-04-dashboard.html` 구조 변경**

   ```html
   <body>
     <div class="app-layout">... 기존 3-패널 ...</div>
     <aside id="request-drawer" class="drawer" hidden>
       <header class="drawer-head">
         <button class="drawer-close" aria-label="닫기">×</button>
         <div class="step-bar">
           <div class="step-pill" data-step="1" data-i18n="reqflow_step1">
             1. 카테고리
           </div>
           <div class="step-pill" data-step="2" data-i18n="reqflow_step2">
             2. 의뢰서
           </div>
           <div class="step-pill" data-step="3" data-i18n="reqflow_step3">
             3. 카운터오퍼
           </div>
         </div>
       </header>
       <div class="drawer-body">
         <section class="drawer-step" data-step="1">
           <div id="cat-grid"></div>
         </section>
         <section class="drawer-step" data-step="2" hidden>
           ... 폼/슬라이더 ...
         </section>
         <section class="drawer-step" data-step="3" hidden>
           <div id="offers-list"></div>
         </section>
       </div>
     </aside>
   </body>
   ```

2. **드로어 토글·단계 진행**
   - `js/request-drawer.js` (신규, ~120줄)
     - `openDrawer()`, `closeDrawer()`, `goStep(n)`
     - `store.subscribe('mode:change', ...)` → 모드가 `request-*`로 바뀌면 드로어 열기/단계 표시
     - ESC 키·백드롭 클릭 시 `closeDrawer()` (의뢰가 step-2 이상이면 confirm)
   - `selectCategory(cat)` 호출 시 `store.set('selectedCategory', cat)` + `goStep(2)`

3. **모드 스위처 (topbar)**
   - `[워커 모드] / [의뢰 모드]` segmented 버튼
   - 클릭 시 `store.set('mode', mode === 'worker' ? 'request-step1' : 'idle')`
   - 기존 "+ 일 올리기" 버튼도 동일하게 `store.set('mode', 'request-step1')` 호출로 변경

### Phase 3 — i18n·라우팅 정리 (0.5 day)

1. **`styles/i18n.js` 키 정리**
   - `ride_step1_title` 등 호출 플로우 전용 키들을 **`reqflow_*`** 네임스페이스로 이동 (또는 의미적 그룹 분리 주석 강화)
   - `validate-i18n.mjs`가 `screens-04-dashboard.html`에 호출 플로우 키가 쓰여도 OK로 판정하도록 보정

2. **`screens-07-ride.html` 별칭 처리**

   ```html
   <head>
     ...
     <meta
       http-equiv="refresh"
       content="0; url=https://golive.wiki/screens-04-dashboard.html?mode=request"
     />
   </head>
   ```

   - 기존 직접 방문 시 자동으로 대시보드+드로어 오픈 상태로 진입
   - `?mode=request` 쿼리는 `dashboard-app.js`가 읽어 초기 모드 세팅

3. **외부 링크 점검**
   - `index.html`의 `screens-05-create-gig.html` 절대 URL (이전 작업)은 그대로 유지
   - `screens-05-create-gig.html` 끝의 "무료로 일 등록하기"(`screens-06-task-detail.html`) 흐름은 손대지 않음

### Phase 4 — 빌드·배포 (0.5 day)

1. `npm run build` — `target: "es2022"` 유지(이전 작업 결과)
2. 생성물 점검:
   - `dist/screens-04-dashboard.html`에 드로어 DOM 포함 확인
   - `dist/screens-07-ride.html`이 메타 리프레시로 변환됐는지 확인
3. `https://golive.wiki/screens-04-dashboard.html` 라이브 반영
4. 회귀 검증:
   - 워커 모드 진입 → 지도·리스트·활동 피드 정상
   - 의뢰 모드 진입 → 드로어 슬라이드인 → 3단계 진행 → 카운터오퍼 수신 → 수락 시 활동 피드에 append
   - `https://golive.wiki/screens-07-ride.html` 직접 진입 → 대시보드로 자동 리다이렉트

---

## 6. 리스크 & 완화

| 리스크                                                            | 영향                | 완화                                                                   |
| ----------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------- |
| Leaflet 인스턴스가 드로어 표시 중에도 정상 렌더되는지             | 지도 깨짐 가능      | 드로어 `pointer-events`/z-index 조정, `map.invalidateSize()` 호출      |
| 기존 외부 스크립트가 `window.goStep` 등 전역에 의존               | 통합 후 호출 실패   | 호환 래퍼 유지, 콘솔 경고로 단계적 제거                                |
| 다국어 키 충돌(`ride_*` 두 그룹)                                  | 일부 언어 누락 가능 | Phase 0에서 grep + `validate-i18n.mjs`로 사전 검출                     |
| 드로어 내부 폼 상태가 닫기 시 유실                                | UX 불만             | `store`에 보존, 재오픈 시 step-2부터 복원                              |
| `screens-07-ride.html`을 메타 리프레시로 바꾸면 SEO/공유 URL 영향 | 백링크 깨짐 가능    | 이전 작업의 절대 URL 정책에 따라 어차피 단일 URL로 수렴 중 — 수용 가능 |

---

## 7. 산출물 체크리스트

- [ ] `js/state-store.js` 신규
- [ ] `js/services-app.js` 리팩터
- [ ] `js/dashboard-app.js` 신규
- [ ] `js/request-drawer.js` 신규
- [ ] `screens-04-dashboard.html` 구조 확장 (드로어 삽입, 인라인 스크립트 제거)
- [ ] `screens-07-ride.html` 메타 리프레시로 전환
- [ ] `styles/i18n.js` 키 정리 + 7개 언어 동기화
- [ ] `vite.config.js` 입력 키 확인 (변경 없을 가능성 높음)
- [ ] `npm run build` 통과
- [ ] 라이브 회귀 검증

---

## 8. 일정 요약 (총 4 working days)

| Phase    | 작업                        | 예상      |
| -------- | --------------------------- | --------- |
| 0        | 사전 점검·i18n 키 분리      | 0.5 d     |
| 1        | state-store + 두 app 리팩터 | 1.0 d     |
| 2        | 드로어·모드 스위처 구현     | 1.5 d     |
| 3        | i18n·라우팅 정리            | 0.5 d     |
| 4        | 빌드·배포·회귀              | 0.5 d     |
| **합계** |                             | **4.0 d** |

---

## 9. 열린 질문 (사용자 확인 필요)

1. **의뢰자/워커 분리**: 현재는 한 세션 안에서 토글하지만, 향후 로그인을 도입해도 단일 URL을 유지할지, 별도 워크스페이스를 둘지?
2. **`screens-07-ride.html` 보존 여부**: 메타 리프레시로 살려둘지(권장), 아니면 410/리디렉트로 완전히 정리할지?
3. **`screens-05-create-gig.html`(4-step wizard)와의 관계**: 의뢰 모드 진입 시 wizard로 보내는 것보다 드로어에서 직접 3-스텝을 거는 현재 계획이 맞는지? (현재 플랜은 후자.)
4. **데이터 출처**: 카테고리 18개/의뢰/카운터오퍼를 Supabase로 갈지, 현재처럼 로컬 mock(`simulateOffers`)을 유지할지? (현재 플랜은 mock 유지.)
