# Stellavault → MuhanAI Integration Value Analysis

> **결론**: Stellavault를 fork하지 않는다. **muhanai `@agentmesh/knowledge-base`를 canonical 구현으로 유지**하면서, Stellavault가 검증한 **FSRS 기억 감쇠 · Weighted RRF + entity-linking · 광범위 파일 형식 캡처 · 공유 레벨 모델** 4가지를 MIT 라이선스 하에 **port**한다. Electron 데스크톱 앱과 Hyperswarm federation은 **ignore**한다.

- 작성일: 2026-09-07
- 대상 의사결정: `token-free-gateway/agentmesh/packages/knowledge-base` + `packages/personal-mcp` 레벨
- 선행: `docs/CODE-INTEGRATION-PLAN.md` (AgentMesh Phase 2b 완료), `docs/IMPORTABLE-SOURCE-MAP.md` (출처 매핑), `docs/HAPPY-INTEGRATION-ANALYSIS.md` (동일 템플릿)
- 분석 대상: github.com/Evanciel/stellavault **v0.9.0** (MIT, 362+ commits, 1,200+ tests)

---

## 1. 왜 fork가 아닌 port인가

| 접근 | 장점 | 단점 |
|---|---|---|
| **Stellavault fork** (full copy) | 기능 즉시 사용 | 지식 패키지 2벌 유지, Electron/CLI/desktop 전체 책임, 우리가 이미 가진 libp2p federation과 충돌 |
| **Stellavault submodule** (vendored) | upstream 동기화 가능 | muhanai의 shared/types·federation·personal-mcp와 타입/스토어 불일치, 패키지 2개가 병렬 동작 |
| **✅ Muhanai port** (추천) | knowledge-base의 타입·스토어·퍼미션 모델 유지, 필요한 4개 알고리즘만 MIT로 이식 | port 후에도 개선은 우리 책임, 업스트림 신기능은 재선별 필요 |

핵심 관찰: **Stellavault의 가치는 (1) FSRS decay engine, (2) weighted RRF + entity-linking 검색, (3) 14개 이상 파일 형식 인제스트, (4) federation 공유 레벨 모델** 4개 모듈이다. 이 4개는 순수 TS/순수 함수이므로 **muhanai 스택(타입·퍼미션·libp2p)에 그대로 이식 가능**하다. 반면 Electron 데스크톱, R3F 3D viz, Hyperswarm transport는 우리 스택과 중복되거나 비호환이다.

---

## 2. 모듈 매트릭스: port / adapt / reference / ignore

```
┌──────────────────────┬─────────────┬──────────────────────────────────────────┐
│ Stellavault 모듈      │ 처리        │ 이유                                      │
├──────────────────────┼─────────────┼──────────────────────────────────────────┤
│ FSRS decay engine    │ port (HIGH) │ knowledge-base에 없음. 순수 함수          │
│ (fsrs.ts, decay-     │             │ (computeRetrievability/updateStability).  │
│  engine.ts)          │             │ MIT. 60줄 정도.                           │
├──────────────────────┼─────────────┼──────────────────────────────────────────┤
│ 검색: weighted RRF +  │ port (MED)  │ hybrid-search.ts가 단순 가중합            │
│ entity-linking +     │             │ (0.55/0.2/0.5/0.15, RRF 아님).            │
│ recency multiplier   │             │ rrf.ts(rrfFusionN) + entity-extractor.ts가 │
│                      │             │ 깔끔한 순수 함수.                         │
├──────────────────────┼─────────────┼──────────────────────────────────────────┤
│ 파일 형식 인제스트    │ port (HIGH) │ muhanai sources.ts는 registry만,           │
│ (file-extractors.ts, │             │ ingestion.ts는 naive 텍스트 추출.          │
│  ingest-pipeline.ts) │             │ stellavault는 PDF/DOCX/PPTX/XLSX/JSON/CSV/ │
│                      │             │ XML/YAML/HTML/RTF/YouTube/URL/text/folder  │
│                      │             │ 14종 파서 어댑터.                          │
├──────────────────────┼─────────────┼──────────────────────────────────────────┤
│ federation 공유 레벨  │ adapt (MED) │ muhanai SignedRecord는 권한이 있으나       │
│ (node.ts myNodeLevel │             │ 레벨 개념(0=수신전용, 1+=공유)이 없음.      │
│  0/1/2)              │             │ level 개념만 우리 퍼미션에 결합.            │
├──────────────────────┼─────────────┼──────────────────────────────────────────┤
│ 캡처 파이프라인       │ reference   │ raw/ → _wiki/ compile 패턴.                │
│ (raw/→_wiki/ compile)│ (MED)       │ muhanai index-pipeline.ts 개념과 유사.     │
│                      │             │ 형식 어댑터만 port하고 파이프는 참고.       │
├──────────────────────┼─────────────┼──────────────────────────────────────────┤
│ R3F 3D 그래프 viz     │ reference   │ 우리는 apps/web (Cosmic Canvas) 보유.       │
├──────────────────────┼─────────────┼──────────────────────────────────────────┤
│ MCP 서버 (21 tools)   │ reference   │ 우리는 personal-mcp 보유 (서버/클라 기능).  │
│                      │             │ tool 목록만 벤치마크.                      │
├──────────────────────┼─────────────┼──────────────────────────────────────────┤
│ Hyperswarm federation│ ignore      │ 우리는 libp2p + floodsub (ADR-0002) 보유.   │
│                      │             │ 프로토콜 비호환.                           │
├──────────────────────┼─────────────┼──────────────────────────────────────────┤
│ Electron 데스크톱 앱  │ ignore      │ 우리는 apps/web. 빌드/배포 책임 없음.       │
└──────────────────────┴─────────────┴──────────────────────────────────────────┘
```

라이선스: **전체 MIT (LICENSE 확인됨)** — port 시 attribution 주석 + README 기여 표기만 준수.
---

## 3. capability matrix (Stellavault vs MuhanAI)

| 기능 | Stellavault (v0.9.0) | MuhanAI knowledge-base (0.1.0) | 격차 | 가치 |
|---|---|---|---|---|
| 인제스트 형식 | 14+ 파서 (PDF/DOCX/PPTX/XLSX/…) | sources registry + naive 텍스트 | **큼** | 🔴 HIGH |
| 하이브리드 검색 | Weighted RRF (semantic+BM25+entity) | 단순 가중합 (0.55/0.2/0.5/0.15) | 중간 | 🟡 MEDIUM |
| 기억 감쇠 (FSRS) | FSRS-6 (S', R, decay journal) | **없음** | **큼** | 🔴 HIGH |
| 엔티티 연결 | wikilink/tag/heading + Title-Case | **없음** | 중간 | 🟡 MEDIUM |
| 3D 그래프 viz | React Three Fiber | Cosmic Canvas (apps/web ✅) | 없음 | ⚪ LOW |
| MCP 서버 | 21 tools | personal-mcp (서버) | 낮음 | ⚪ LOW |
| federation | Hyperswarm (opt-in) | libp2p+floodsub (ADR-0002) | 프로토콜 상이 | ⚪ LOW |
| federation 공유 모델 | myNodeLevel 0/1/2 | SignedRecord 퍼미션 | concept만 | 🟡 MEDIUM |
| 데스크톱 앱 | Electron + TipTap | apps/web | 중복 | ⚪ IGNORE |

---
## 4. 권장 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│  packages/knowledge-base (canonical 유지)                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ [port] src/decay/fsrs.ts          (순수 함수)          │  │
│  │ [port] src/decay/decay-engine.ts  (노트 단위 래퍼)     │  │
│  │ [port] src/search/rrf.ts          (weighted RRF)      │  │
│  │ [port] src/search/entity.ts       (entity extraction) │  │
│  │ [port] src/ingest/extractors.ts   (14형식 어댑터)      │  │
│  │ [adapt] src/federation/levels.ts  (퍼미션+레벨 결합)   │  │
│  ├───────────────────────────────────────────────────────┤  │
│  │ (기존) chunking·embeddings·graph·retrieval·pgvector-   │  │
│  │        store·folklore-federation·sources·wheel         │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
        hybridSearch() 확장:   ▼  (RRF + recency + entity)
┌─────────────────────────────────────────────────────────────┐
│  packages/personal-mcp → /search, /ask, /recall             │
│  (기존 tool surface 유지, 내부 랭킹만 교체)                   │
└─────────────────────────────────────────────────────────────┘
```

**Port할 파일 (5)**: `fsrs.ts`→`decay/fsrs.ts`, `rrf.ts`→`search/rrf.ts`, `entity-extractor.ts`→`search/entity.ts`, `file-extractors.ts`→`ingest/extractors.ts`, `node.ts(myNodeLevel)`→`federation/levels.ts`. **전부 순수 TS, 무거운 의존성은 선택형 lazy import**.

---

## 5. Port 상세

### 5.1 FSRS decay — `@stellavault/core/src/intelligence/fsrs.ts` (port: HIGH)

```ts
// stellavault (MIT) → muhanai packages/knowledge-base/src/decay/fsrs.ts
export const FSRS_PARAMS = { initialStability: 7.0, difficulty: 5.0, a: 0.4, b: 0.6, c: 0.2, d: 1.0, ... };
export function computeRetrievability(stabilityDays, elapsedDays) // R = (1 + t/(9S))^-1
export function updateStability(currentS, difficulty, currentR)   // S' 증가, cap 365
```

- **왜 HIGH**: muhanai에 기억 감쇠 개념이 없음. 순수 함수 60줄, MIT, 1,200+ tests로 검증됨.
- **적용 지점**: `knowledge-base`에 `decay/` 신설 → `retrieval.ts`에 `accessRecency` 훅 → hybrid search score에 multiplier.

### 5.2 Weighted RRF + recency — `rrf.ts` (port: MEDIUM)

```ts
// stellavault → packages/knowledge-base/src/search/rrf.ts
export function rrfFusionN(lists, k = 60, limit = 10, opts: { weights?, recencyScores?, recencyWeight? })
export function rrfFusion(listA, listB, k = 60, limit = 10)
```

- **왜 MEDIUM**: 기존 hybrid-search.ts가 keyword/vector 2신호로 이미 동작하나 단순 가중합. RRF로 바꾸면 순위 품질(NDCG) 향상. entity 신호는 별도 port 필요.
- **호환**: 기존 콜러는 `rrfFusion(listA, listB)`로 동일 시그니처 유지 (`ScoredChunk` 타입만 어댑트).

### 5.3 Entity-linking — `entity-extractor.ts` (port: MEDIUM)

```ts
// hallucination-free: wikilink [[…]] / #tags / headings 우선, Latin은 Title-Case 폴백
// cap 30/chunk, CJK 대응 내장 (한글 볼트도 동작)
```

- **왜 MEDIUM**: muhanai `KnowledgeNode`에 이미 tags 있음 (`shared/types`). tags를 entity 신호로 승격 → 검색 리랭킹. NER 모델 불필요 (결정적, 오프라인).

### 5.4 형식 파서 — `file-extractors.ts` + `ingest-pipeline.ts` (port: HIGH)

- **왜 HIGH**: 격차가 가장 큼. stellavault는 PDF(pdfjs-dist)/DOCX(mammoth)/PPTX/XLSX(xlsx)/JSON/CSV/XML/YAML/HTML/RTF/YouTube/URL/text/folder 14종. muhanai는 텍스트만.
- **전략**: 어댑터를 `knowledge-base/src/ingest/extractors.ts`로 port하되, **pdfjs/mammoth 등 무거운 의존성은 선택형 dynamic import** (설치 비용·스캔 부담 완화).
- **보안**: stellavault `6a29805` PDF-ingest RCE 수정 이력 반영 (external 실행 파일 금지, minimal extractor).

### 5.5 federation 공유 레벨 — `node.ts` myNodeLevel (adapt: MEDIUM)

| Level | Stellavault 의미 | muhanai 매핑 |
|---|---|---|
| 0 | 수신 전용 (기본) | SignedRecord: query 응답 허용, push 불가 |
| 1 | 제목+50자 스니펫 공유 | `visibility:"peer-summary"` 퍼미션 |
| 2 | 추가 메타데이터 공유 | `visibility:"peer"` |

- `folklore-federation.ts`의 `SignedRecord.push`/`query`에 level 파라미터 1개 추가. **원문 전송 금지** 원칙 유지.
---

## 6. 마이그레이션 단계

| Phase | 내용 | 검증 |
|---|---|---|
| **P1** (1일) | `decay/fsrs.ts` + 테스트 port | `computeRetrievability` 단위 테스트 |
| **P2** (1일) | `search/rrf.ts` + `search/entity.ts` port, hybrid-search 결합 | 기존 search 테스트 회귀 없음 + NDCG 샘플 |
| **P3** (2~3일) | `ingest/extractors.ts` port (lazy import), personal-mcp `/ingest` 확장 | PDF/DOCX/XLSX/CSV 스모크 테스트 |
| **P4** (0.5일) | federation level adapt (SignedRecord 레벨 파라미터) | level 0/1/2 push/query 테스트 |
| **P5** (상시) | stellavault 지속 조사: 신규 발표(0.9.0+) 중 필요한 것 재선별 | docs 갱신 |

---

## 7. 리스크 / 트레이드오프

| 리스크 | 완화 |
|---|---|
| 업스트림 stellavault 버전 빠른 진화 (v0.7.4 → 0.9.0 단기간) | port한 4개 모듈은 순수 함수 → 재-sync 30분 이내. 신기능은 필요 시 재선별 |
| pdfjs-dist 등 무거운 의존성 (node 20+, ~100MB) | **lazy import + 서버 사이드만**. 검색 코어(FSRS/RRF)는 의존성 0 |
| FSRS 파라미터가 knowledge note용(flashcard 아님)으로 튜닝됨 | muhanai 노트 분포로 파라미터 재튜닝 여부 P2에서 측정 |
| entity cap 30/chunk가 한글 볼트에서 놓칠 수 있음 | wikilink/tag 신호는 언어 무관 → 한글 볼트에서도 동작 (이식 검증 대상) |
| 라이선스 속성 누락 | port 파일 상단에 `// Ported from stellavault (MIT) — github.com/Evanciel/stellavault` 주석 |
| federation level을 퍼미션에 억지 결합 | level 0은 기존 동작과 동일 → 기본값 보수적 (기존 서명 검증/권한 유지) |

---

## 8. 라이선스 부록

- **stellavault**: MIT License — `Copyright (c) 2026 Evan (KHS)`. Copyright notice + permission notice 유지 조건 (LICENSE 참조).
- port 허용: **예** (MIT, © copyright notice 보존 + README "기여 소스" 섹션 기재).
- re-export 불필요: 정적 port (동적 dependency 아님) — upstream 동기화는 수동 워치.