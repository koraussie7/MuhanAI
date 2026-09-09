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
┌────────────────────────────────┬─────────────┬──────────────────────────────────────────┐
│ Stellavault 모듈                │ 처리        │ 이유                                      │
├────────────────────────────────┼─────────────┼──────────────────────────────────────────┤
│ FSRS decay engine              │ port (HIGH) │ knowledge-base에 없음. 순수 함수          │
│ src/intelligence/fsrs.ts       │             │ computeRetrievability/updateStability)    │
│ (60 lines)                     │             │ MIT. 60줄 정도.                           │
├────────────────────────────────┼─────────────┼──────────────────────────────────────────┤
│ Weighted RRF + recency         │ port (MED)  │ hybrid-search.ts가 단순 가중합            │
│ src/search/rrf.ts (70 lines)   │             │ (0.55/0.2/0.5/0.15, RRF 아님).            │
│                                │             │ rrf.ts(rrfFusionN) 깔끔한 순수 함수.       │
├────────────────────────────────┼─────────────┼──────────────────────────────────────────┤
│ entity-linking (extract)       │ port (MED)  │ wikilink/tag/heading 추출.               │
│ src/indexer/entity-extractor.ts│             │ 언어 무관 (한글/중국어/일어 모두 동작).    │
│ (196 lines)                    │             │                                        │
├────────────────────────────────┼─────────────┼──────────────────────────────────────────┤
│ 파일 형식 파서 (14종)          │ port (HIGH) │ muhanai sources.ts는 registry만,         │
│ src/intelligence/file-        │             │ ingestion.ts는 naive 텍스트 추출.          │
│ extractors.ts (270 lines)      │             │ PDF/DOCX/PPTX/XLSX/JSON/CSV/XML/YAML/    │
│                                │             │ HTML/RTF/YouTube/URL/text/folder         │
├────────────────────────────────┼─────────────┼──────────────────────────────────────────┤
│ federation 공유 레벨            │ adapt (MED) │ SignedRecord에 visibility 필드 있음.      │
│ src/federation/sharing.ts      │             │ level 개념(0/1/2/3/4) 추가.              │
│ (321 lines)                    │             │                                        │
├────────────────────────────────┼─────────────┼──────────────────────────────────────────┤
│ 캡처 파이프라인 (raw→_wiki)    │ reference   │ muhanai index-pipeline.ts 개념과 유사.    │
│ (ingest-pipeline)              │ (MED)       │ 형식 어댑터만 port하고 파이프는 참고.       │
├────────────────────────────────┼─────────────┼──────────────────────────────────────────┤
│ R3F 3D 그래프 viz              │ reference   │ 우리는 apps/web (Cosmic Canvas) 보유.     │
├────────────────────────────────┼─────────────┼──────────────────────────────────────────┤
│ MCP 서버 (21 tools)            │ reference   │ 우리는 personal-mcp 보유.                 │
│ src/mcp/tools/*.ts (21 files)  │             │ tool 목록만 벤치마크.                     │
├────────────────────────────────┼─────────────┼──────────────────────────────────────────┤
│ Hyperswarm federation          │ ignore      │ 우리는 libp2p + floodsub (ADR-0002) 보유.  │
│ src/federation/node.ts (536 l) │             │ 프로토콜 비호환.                         │
├────────────────────────────────┼─────────────┼──────────────────────────────────────────┤
│ Electron 데스크톱 앱           │ ignore      │ 우리는 apps/web. 빌드/배포 책임 없음.       │
└────────────────────────────────┴─────────────┴──────────────────────────────────────────┘
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

**Port할 파일 (5)**: `intelligence/fsrs.ts`→`knowledge-base/src/decay/fsrs.ts`, `search/rrf.ts`→`knowledge-base/src/search/rrf.ts`, `indexer/entity-extractor.ts`→`knowledge-base/src/search/entity.ts`, `intelligence/file-extractors.ts`→`knowledge-base/src/ingest/extractors.ts`, `federation/sharing.ts`→`knowledge-base/src/federation/levels.ts`. **전부 순수 TS, 무거운 의존성은 선택형 lazy import**.

### Source-to-target mapping

| Stellavault source (v0.9.0) | MuhanAI target | Lines |
|---|---|---|
| `packages/core/src/intelligence/fsrs.ts` | `knowledge-base/src/decay/fsrs.ts` | 114 |
| `packages/core/src/search/rrf.ts` | `knowledge-base/src/search/rrf.ts` | 70 |
| `packages/core/src/indexer/entity-extractor.ts` | `knowledge-base/src/search/entity.ts` | 196 |
| `packages/core/src/intelligence/file-extractors.ts` | `knowledge-base/src/ingest/extractors.ts` | 270 |
| `packages/core/src/federation/sharing.ts` | `knowledge-base/src/federation/levels.ts` (adapt) | 321 |
| `packages/core/src/intelligence/decay-engine.ts` | `knowledge-base/src/decay/engine.ts` (new, wraps FSRS) | 276 |
| `packages/core/src/store/types.ts` (VectorStore) | `shared/types` (KnowledgeNode) | 129 |
| `packages/core/src/types/search.ts` | `knowledge-base/src/retrieval.ts` (ScoredKnowledge) | 40 |

---

## 5. 포트 상세 (코드 예시 포함)

### 5.1 FSRS decay — `packages/core/src/intelligence/fsrs.ts` (port: HIGH)

**Source file**: `@stellavault/core/src/intelligence/fsrs.ts` (114 lines, pure functions)
**Target**: `packages/knowledge-base/src/decay/fsrs.ts`

```ts
// Ported from stellavault (MIT) — github.com/Evanciel/stellavault
export const FSRS_PARAMS = {
  initialStability: 7.0, difficulty: 5.0,
  a: 0.4, b: 0.6, c: 0.2, d: 1.0,
  sizeFactor: 0.5, connectionFactor: 1.0,
} as const;

// R(t) = (1 + t/(9S))^(-1) — FSRS power forgetting curve
export function computeRetrievability(stabilityDays: number, elapsedDays: number): number {
  if (elapsedDays <= 0) return 1.0;
  if (stabilityDays <= 0) return 0.0;
  return Math.pow(1 + elapsedDays / (9 * stabilityDays), -1);
}

// S' = S * (1 + a * D^(-b) * S^(-c) * (e^(d*(1-R)) - 1)), capped at 365 days
export function updateStability(currentS: number, difficulty: number, currentR: number): number {
  const { a, b, c, d } = FSRS_PARAMS;
  const growth = a * Math.pow(difficulty, -b) * Math.pow(currentS, -c)
    * (Math.exp(d * (1 - currentR)) - 1);
  return Math.min(currentS * (1 + Math.max(0, growth)), 365);
}
```

**MuhanAI integration**: Create `decay/engine.ts` wrapping FSRS in the existing store (mirrors `decay-engine.ts:30-56` table schema). Hook into `retrieval.ts` access logging — after each search, call `decayEngine.recordAccess({ documentId, type: 'search' })`, then build `recencyScores = Map(chunkId → R)` for use in RRF.

**Existing pattern to follow**: `knowledge-base/src/hybrid-search.ts:22-87` (search flow) + `knowledge-base/src/retrieval.ts` (access logging).

### 5.2 Weighted RRF — `packages/core/src/search/rrf.ts` (port: MEDIUM)

**Source file**: `@stellavault/core/src/search/rrf.ts` (70 lines, pure function)
**Target**: `packages/knowledge-base/src/search/rrf.ts`

```ts
// Ported from stellavault (MIT). Backward-compatible: rrfFusion(listA, listB)
// preserves the 2-list API while rrfFusionN adds recency + weights.
export function rrfFusionN(
  lists: Array<Array<{ node: KnowledgeNode; score: number }>>,
  k: number = 60,
  limit: number = 10,
  opts: { weights?: number[]; recencyScores?: Map<string, number>; recencyWeight?: number } = {},
): Array<{ node: KnowledgeNode; score: number }> {
  // score(d) = Σ w_i · 1/(k + rank_i)
  // recency: multiply by (1 + recencyWeight * (R - 0.5)), centered at R=0.5
  const { weights, recencyScores, recencyWeight = 0 } = opts;
  const scores = new Map<string, number>();
  for (let li = 0; li < lists.length; li++) {
    const w = weights?.[li] ?? 1;
    for (let i = 0; i < lists[li].length; i++) {
      const id = lists[li][i].node.id;
      scores.set(id, (scores.get(id) ?? 0) + w * (1 / (k + i + 1)));
    }
  }
  if (recencyWeight > 0 && recencyScores) {
    for (const [id, s] of scores) {
      const r = recencyScores.get(id) ?? 0.5;
      scores.set(id, s * (1 + recencyWeight * (r - 0.5)));
    }
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => lists.flat().find(h => h.node.id === id)!);
}
```

**Replace** the simple weighted sum in `hybrid-search.ts:61-87`:
```ts
// OLD (hybrid-search.ts:61-67): score = 0.55 * confidence + 0.2 (linear merge)
// NEW: rrfFusionN([vectorHits, keywordHits], 60, limit, {
//   weights: [1.0, 1.0],  // semantic, bm25
//   recencyScores,       // from FSRS decay engine
//   recencyWeight: 0.2,   // ±10% bound
// });
```

### 5.3 Entity-linking — `packages/core/src/indexer/entity-extractor.ts` (port: MEDIUM)

**Source file**: `@stellavault/core/src/indexer/entity-extractor.ts` (196 lines, pure functions)
**Target**: `packages/knowledge-base/src/search/entity.ts`

```ts
// Ported from stellavault (MIT). Language-agnostic: wikilinks/tags work
// for Korean/CJK vaults; Title-Case heuristics only fire on Latin script.
import { parseWikilinks } from '../links/wikilink';

export function extractEntities(content: string, heading?: string, tags?: string[]): string[] {
  const entities = new Set<string>();
  // 1. #tags — directly from KnowledgeNode.tags (shared/types already has string[])
  if (tags) for (const tag of tags) entities.add(tag.toLowerCase());
  // 2. [[wikilinks]] — parsed from content (hallucination-free, deterministic)
  for (const link of parseWikilinks(content)) entities.add(link.target.trim().toLowerCase());
  // 3. Headings — Title-Case + acronym extraction (Latin only, fallback)
  if (heading) {
    const tc = /\b([A-Z][a-z0-9]+(?:\s+[A-Z][a-z0-9]+){1,4})\b/g;
    let m;
    while ((m = tc.exec(heading)) !== null) entities.add(m[1].toLowerCase());
  }
  // Cap: 30/chunk (prevents entity table bloat, keeps signal precise)
  return Array.from(entities).slice(0, 30);
}
```

**MuhanAI integration**: `KnowledgeNode.tags` (string[]) in `shared/types` → promote to entity signal. When query term matches a tag, boost via RRF weight (default entity weight = 1.5× as in stellavault `DEFAULT_SIGNAL_WEIGHTS`).

### 5.4 파일 형식 파서 — `packages/core/src/intelligence/file-extractors.ts` (port: HIGH)

**Source file**: `@stellavault/core/src/intelligence/file-extractors.ts` (270 lines, lazy dynamic imports)
**Target**: `packages/knowledge-base/src/ingest/extractors.ts`

```ts
// Ported from stellavault (MIT). Dependencies lazy-imported to avoid
// bloating the core bundle. Security: isEvalSupported=false on pdfjs
// (mitigates GHSA-hq66-cqwq-w95j PDF → JS RCE).
import { readFileSync, statSync } from 'node:fs';
import { extname, basename } from 'node:path';

const BINARY_EXTS = new Set(['.pdf', '.docx', '.pptx', '.xlsx', '.xls']);
const MAX_FILE_SIZE = 50 * 1024 * 1024;

export async function extractFileContent(filePath: string): Promise<ExtractedContent> {
  const ext = extname(filePath).toLowerCase();
  const buffer = readFileSync(filePath);
  switch (ext) {
    case '.pdf': return extractPdf(buffer, filePath);    // unpdf + pdfjs-dist
    case '.docx': return extractDocx(buffer, filePath);   // mammoth
    case '.pptx': return extractPptx(buffer, filePath);
    case '.xlsx': case '.xls': return extractXlsx(buffer, filePath);  // xlsx
    case '.json': return { text: JSON.stringify(JSON.parse(readFileSync(filePath, 'utf-8')), null, 2), metadata: { wordCount: 0 }, sourceFormat: 'text' };
    case '.csv': return { text: readFileSync(filePath, 'utf-8'), metadata: { wordCount: 0 }, sourceFormat: 'text' };
    // ... XML, YAML, HTML, RTF, YouTube, URL, text, folder (14 formats total)
    default: return extractText(filePath);
  }
}
```

**MuhanAI integration**: Extend `sources.ts` to dispatch binary formats to these extractors. Current `sources.ts` only handles text — this adds 14 format support. The `ingestion.ts` file needs to call `extractFileContent` before chunking.

### 5.5 Federation 공유 레벨 — `packages/core/src/federation/sharing.ts` (adapt: MEDIUM)

**Source files**: `@stellavault/core/src/federation/sharing.ts` (321 lines), `types.ts` (57 lines)
**Target**: Extend `knowledge-base/src/folklore-federation.ts`

```ts
// Stellavault sharing levels (from sharing.ts:14):
//   0 = Blocked (not searchable)
//   1 = Title + similarity only
//   2 = Title + 50-char snippet (DP-noised)
//   3 = Full text on request (approval needed)
//   4 = Full text auto-shared
// Default: myNodeLevel=0 (receive-only), defaultLevel=1 (no snippets)

// In folklore-federation.ts, add level parameter:
// Transport.query (line 6): add opts.sharingLevel
async query(peerId: string, query: string, embedding?: number[], opts?: { sharingLevel?: SharingLevel }) {
  // Only return records with matching or lower visibility level
  // Never transmit content/snippet unless level >= 2 AND DP-masked
}

// Transport.push (line 7): tag records with level-based visibility
async push(peerId: string, records: SignedRecord[]) {
  // Tag each record with visibility based on sharing rules
  // Level 0: push nothing. Level 1: title+sim only. Level 2+: snippet (DP-masked).
}
```

**MuhanAI integration**: The `SignedRecord` interface in `shared/types` already has `visibility: 'local' | 'peer-summary' | 'peer'`. Add `sharingLevel?: SharingLevel` (0-4) and modify `Transport.query/push` to respect the level boundary. The `privacy.ts` `maskSnippet()` function provides DP masking for snippets at level 2.

---

## 6. 마이그레이션 단계

| Phase | 내용 | 검증 |
|---|---|---|
| **P1** (1일) | `fsrs.ts` → `knowledge-base/src/decay/fsrs.ts` + `engine.ts` port | `computeRetrievability(7, 1)` = 0.674 단위 테스트 |
| **P2** (1일) | `rrf.ts` → `search/rrf.ts`, `entity-extractor.ts` → `search/entity.ts` port, `hybrid-search.ts` 결합 | 기존 search 테스트 회귀 없음 + NDCG 샘플 |
| **P3** (2~3일) | `file-extractors.ts` → `ingest/extractors.ts` port (lazy import), `sources.ts` 확장 | PDF/DOCX/XLSX/CSV 스모크 테스트 |
| **P4** (0.5일) | federation level adapt: `sharing.ts` levels → `folklore-federation.ts` SignedRecord.visibility | level 0/1/2 push/query 테스트 |
| **P5** (상시) | stellavault 지속 조사: 신규 발표(0.9.0+) 중 필요한 것 재선별 | docs 갱신

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