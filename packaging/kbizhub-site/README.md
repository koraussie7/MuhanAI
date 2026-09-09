# KBizHub 랜딩 페이지

- **자산**: `index.html` (단일 HTML, 외부 의존성 없음 — Google Fonts만 CDN)
- **원본 위치**: `/Users/brianyeon/kbizhub_index.html` (작업 전 임시 위치)
- **편입일**: 2026-09-09
- **목적**: KBizHub (29,000원 AI Business Node) 프로모션 랜딩 — MuhanAI + OmniRoute + WeKnora 임베드 사례 마케팅 페이지

## 디렉토리 구성

```
packaging/kbizhub-site/
├── index.html               ← 랜딩 페이지 (110 KB, 단일 HTML)
├── polsia_analysis.md       ← 경쟁사(Polsia) 분석 메모 (28 KB)
├── kbizhub-shot.png         ← 풀 페이지 스크린샷
├── kbizhub-full.png         ← 풀 페이지 (3.1 MB, 고해상도)
├── kbizhub-shot2.png        ← 데스크탑 뷰
├── kbizhub-shot3.png        ← 모바일 뷰
├── kbizhub-shot-fixed.png   ← 결함 수정 후 데스크탑
├── kbizhub-modal.png        ← 생성 모달 (수정 전)
├── kbizhub-modal-fixed.png  ← 생성 모달 (수정 중)
├── kbizhub-modal-perfect.png← 생성 모달 (수정 완료)
├── kbizhub-section-mybiz.png← MyBiz 섹션
├── kbizhub-sec-mybiz.png    ← MyBiz 섹션 (다른 캡처)
├── kbizhub-sec-mybiz-detail.png ← MyBiz 상세
├── kbizhub-sec-dashboard.png← Dashboard 섹션
├── kbizhub-sec-pipeline.png ← Pipeline 섹션
├── kbizhub-sec-starter.png  ← Starter 섹션
├── kbizhub-weknora-shot.png ← WeKnora 연동 캡처
└── README.md                ← 이 문서
```

## 로컬 실행

빌드 파이프라인이 전혀 없는 단일 HTML 파일입니다. 어느 위치든 같은 결과를 보장합니다.

```bash
# 가장 간단한 방법
open packaging/kbizhub-site/index.html

# 또는 정적 서버로 띄우기 (CORS/폰트 로딩이 더 안정적)
cd packaging/kbizhub-site
python3 -m http.server 8000
# → http://localhost:8000
```

## 외부 의존성

- Google Fonts (Plus Jakarta Sans + JetBrains Mono) — CDN, `<link>`로만 참조
- 그 외 자원은 모두 inline (CSS, JS, 데이터)

## 2026-09-09 코드 무결성 검사 + 결함 수정 이력

Cline (Playwright 실측) + 파서 기반 정적 분석 결과:

### 검사 결과 (전부 PASS)

| 항목 | 결과 |
| --- | --- |
| HTML 태그 정합성 (stack 파서) | 미닫힘/stray 태그 0건 |
| CSS { / } 균형 | 134 / 134 일치 |
| 중복 id | 0건 (20개 전부 고유) |
| 앵커 타깃 (`#starter` 등 9개) | missing 0건 |
| `onclick` 핸들러 | 4/4 전부 정의됨 |
| 콘솔 에러 (Playwright 실렌더) | errors 0, warnings 0 |

### 수정된 결함 3건

1. **모바일 햄버거 CSS 순서 버그 (치명)** — `@media (max-width: 900px)` 블록이 전역 `.hamburger { display: none }` 보다 앞에 와서 미디어쿼리가 덮어써졌음. 390px에서도 햄버거가 0×0. → **순서 뒤집음**: base 선언 먼저 → 미디어쿼리 나중. 추가로 `@media (max-width: 560px)` 신규 추가 (좁은 화면에서 MuhanAI 보조 버튼 숨김 + CTA/로고 축소).
2. **깨진 이모지 (PILLAR 04 Agent SEO 카드)** — `<div class="feat-icon">�</div>` (U+FFFD) → `🎯` 교체.
3. **구브랜드 주석 잔재** — `<!-- Polsia vs KBizHub Comparison Table -->` → `<!-- KBizHub Competitive Comparison Table -->` (본문 비교표는 이미 일반화 완료, 주석만 잔존).

### UI 적용 확인 (Playwright 실측)

- **Desktop 1440×900** — 네비 7개 링크 동일 top=27 단일 행, 햄버거 `display: none`, 가로 오버플로 없음 (docW=1425 ≤ 1440), 생성 모달 cardH=510 ≤ vh=900 피팅.
- **Mobile 390×844** — 햄버거 40×40 정상 표시, 토글 시 7/7 링크 노출, CTA가 네비바 내부 (ctaRight=324 ≤ 390), 가로 오버플로 없음 (docW=375), 모달 343×566 ≤ 390×844 피팅, 팀빌더 8카드 + localStorage 주문 저장 경로 정상.

## 추후 호스팅

지금은 정적 자산만 보관. 추후 GitHub Pages 또는 자체 호스팅이 필요해지면 `packaging/kbizhub-site/.github/workflows/pages.yml` 정도면 충분합니다 (빌드 단계 없음, 단순 `actions/upload-pages-artifact`로 `index.html` 업로드).
