# MuhanAI × KBizHub: 1-Click Hugo + MCP + IPFS Factory System 작업 명세서

> **문서 버전:** 1.0.0
> **최종 갱신일:** 2026-09-16
> **상태:** 확정 및 구현 준비 (Ready for Implementation)
> **대상 도메인:** `muhanai.com`, `find.muhanai.com`, `kbizhub.com`

---

## 1. 프로젝트 비전 및 핵심 개념

### 1.1 Dual-Surface Web (인간-에이전트 이중 표면 웹)
단 한 번의 원클릭으로 소상공인/개인 비즈니스를 위한 **인간용 초고속 반응형 웹사이트(Hugo)**와 **AI 에이전트용 실행 인터페이스(MCP: Model Context Protocol)**를 동시에 생성하여 분산 네트워크(IPFS)에 영구 배포하는 차세대 비즈니스 노드 팩토리 시스템.

```text
               [ 소상공인 / 사용자 ]
                         │
        상호명 / 메뉴 / 영업시간 입력 후 [1-Click 생성]
                         │
                         ▼
             [ MuhanAI Factory Engine ]
                         │
        ┌────────────────┴────────────────┐
        ▼                                 ▼
[ 인간 인터페이스 ]               [ 에이전트 인터페이스 ]
   Hugo SSG 빌드                      MCP Manifest 생성
 (HTML/CSS/JS/반응형)             (.well-known/mcp.json)
        │                                 │
        └────────────────┬────────────────┘
                         ▼
        [ IPFS Content Bundle (단일 CID) ]
                         │
        ┌────────────────┴────────────────┐
        ▼                                 ▼
[ Cloudflare IPFS Gateway ]       [ Universal MCP Runtime ]
  https://store.kbizhub.com         sse://mcp.muhanai.com/...
        │                                 │
   웹 브라우저 유저                   Claude / ChatGPT / Agent
```

### 1.2 핵심 가치 (Unit Economics)
- **월 29,000원 AI Business Node**: 웹 호스팅 + 도메인 + 24시간 자율 AI 운영 + MCP API 포트 통합 제공.
- **인프라 원가 $0 (Zero-Token & Zero-Server)**:
  - **추론**: Token-Free Gateway(TFG)의 브라우저 세션 활용 ($0)
  - **스토리지/호스팅**: IPFS 분산 저장 + Cloudflare Free/Pro Gateway ($0)
  - **컴퓨팅**: 정적 생성(Static Generation) 방식으로 유지보수 서버 불필요.

---

## 2. 시스템 아키텍처 및 계층 분리

| 계층 | 기술 스택 | 담당 역할 |
|---|---|---|
| **생성/조정 계층** | MuhanAI AgentMesh / Fastify API (`:3001` or `:3012`) | 프롬프트 가공, 템플릿 주입, 파이프라인 오케스트레이션 |
| **추론 계층** | Token-Free Gateway (`:3456`) | Claude 3.7 / DeepSeek R1 기반 콘텐츠 및 스키마 자동 생성 |
| **빌드 엔진** | Hugo (Extended Edition) | 0.1초 내 `public/` 정적 사이트 컴파일 |
| **스토리지 계층** | IPFS (Kubo / Helia / Pinning Service) | 콘텐츠 주소(CID) 기반 불변 번들 저장 및 영구 Pinning |
| **엣지/도메인** | Cloudflare IPFS Gateway + DNSLink | TXT 레코드 변경을 통한 1초 무중단 전 세계 엣지 배포 |
| **P2P 액션 계층** | AgentAnycast / MoltMesh (A2A daemon) | 실시간 예약, 주문 등 상태 변경(Mutation) 메시지 라우팅 |

---

## 3. kbizhub.com 메뉴 구성 및 사이트 통합 계획

### 3.1 상단 네비게이션(Navbar) 메뉴 개편
`kbizhub.com`(`packaging/kbizhub-site/index.html`)의 상단 메뉴를 팩토리 시스템 및 MuhanAI 연동에 맞춰 재구성합니다.

```html
<ul class="nav-links" id="navLinks">
  <li><a href="#starter">29,000원 스타터</a></li>
  <li><a href="#factory">🚀 1-Click 팩토리</a></li>     <!-- 신규: 즉시 웹+MCP 생성 -->
  <li><a href="#mybiz">My AI Business</a></li>
  <li><a href="#mcp-showcase">MCP 연동</a></li>          <!-- 신규: 에이전트 도구 체험 -->
  <li><a href="#topology">Cosmic 성좌도</a></li>        <!-- 신규: find.muhanai.com 연동 -->
  <li><a href="#marketplace">마켓플레이스</a></li>
  <li><a href="#economy">크레딧 경제</a></li>
</ul>
```

### 3.2 1-Click Factory 모달 및 UI 흐름
1. **입력 폼**:
   - 상호명 (예: `다낭 반미 하우스`)
   - 업종 카테고리 (외식업, 미용/뷰티, 전문직 컨설팅, 전자상거래 등)
   - 기본 정보 (대표 메뉴/서비스 3~5개, 영업시간, 주소, 연락처)
   - 서브도메인 선택 (예: `danang-banhmi.kbizhub.com` 또는 `.muhanai.com`)
2. **실행 버튼**: `[ 🚀 10초 만에 AI 비즈니스 노드 발행 ]`
3. **진행 상태 표시기**:
   - `[1/4]` AI 카피라이팅 및 스키마 생성 중... (TFG)
   - `[2/4]` Hugo 초고속 반응형 웹 빌드 중... (0.1s)
   - `[3/4]` IPFS 분산 네트워크 업로드 및 영구 Pinning...
   - `[4/4]` Cloudflare DNSLink 레코드 엣지 전파 완료!
4. **완료 대시보드 카드**:
   - 🌐 **인간용 웹사이트:** `https://danang-banhmi.kbizhub.com`
   - 🤖 **에이전트 MCP 엔드포인트:** `sse://mcp.muhanai.com/store/danang-banhmi`
   - 📦 **IPFS CID:** `bafybeidanangbanhmi123...` (불변 영수증)
   - 🌌 **Cosmic Topology:** `find.muhanai.com`에 황금 별 노드로 즉시 점등

---

## 4. 단일 IPFS CID 내부 번들 명세 (MUSS: Muhan Universal Site Spec)

Hugo 빌드 결과물 디렉터리(`public/`) 전체가 단 하나의 CID로 묶입니다.

```text
ipfs://<Store-CID>/
├── index.html                   ← 인간용 모바일 퍼스트 랜딩 웹페이지
├── menu/
│   └── index.html               ← 메뉴 및 서비스 상세 페이지
├── assets/
│   ├── css/style.min.css
│   └── images/
│
├── data/                        ← 단일 진실 공급원 (Single Source of Truth)
│   ├── store.json               ← 업소 기본정보 (전화번호, 주소, 영업시간)
│   └── menu.json                ← 메뉴/가격/옵션/품절 상태
│
└── .well-known/
    ├── mcp.json                 ← AI 에이전트를 위한 MCP Tool 스키마 정의
    └── agent-card.json          ← A2A (Agent-to-Agent) 신원 카드
```

### `.well-known/mcp.json` 스펙
```json
{
  "name": "danang-banhmi",
  "version": "1.0.0",
  "description": "다낭 반미 하우스 공식 AI 에이전트 인터페이스",
  "tools": [
    {
      "name": "get_menu",
      "description": "최신 메뉴 목록, 가격, 원산지 정보 조회",
      "type": "static_resource",
      "source": "data/menu.json"
    },
    {
      "name": "get_business_hours",
      "description": "영업 시간 및 정기 휴무일 확인",
      "type": "static_resource",
      "source": "data/store.json"
    },
    {
      "name": "request_reservation",
      "description": "테이블 예약 요청 (점주 에이전트로 실시간 라우팅)",
      "type": "p2p_action",
      "target_skill": "reservation_service",
      "parameters": {
        "type": "object",
        "properties": {
          "guest_name": { "type": "string" },
          "phone": { "type": "string" },
          "party_size": { "type": "integer" },
          "datetime": { "type": "string" }
        },
        "required": ["guest_name", "phone", "party_size", "datetime"]
      }
    }
  ]
}
```

---

## 5. 백엔드 구현 디테일 (`services/api`)

### 5.1 엔드포인트 설계
- `POST /api/factory/spawn`: 신규 비즈니스 노드 1-Click 생성
- `GET /api/factory/sites`: 발행된 비즈니스 노드 목록 조회
- `POST /api/factory/rollback`: 이전 IPFS CID로 1초 롤백 (DNSLink 갱신)
- `GET /api/mcp/proxy/:subdomain`: 에이전트용 동적 MCP SSE 게이트웨이

### 5.2 DNSLink 자동 갱신 메커니즘
Cloudflare API를 통해 `_dnslink.<subdomain>.kbizhub.com`의 DNS TXT 레코드를 원격 갱신합니다:
```bash
# DNS TXT 레코드 형식
_dnslink.danang-banhmi.kbizhub.com TXT "dnslink=/ipfs/<NEW_CID>"
```
- TTL을 60초 또는 Cloudflare Auto로 설정하여 전 세계 엣지 네트워크에 즉각 반영.
- 이전 CID는 IPFS 히스토리에 보존되어 필요 시 1초 만에 이전 버전으로 복구 가능.

---

## 6. 에이전트 자율 Pinning 및 기억 관리 (Memory Governance)

에이전트는 MuhanAI의 `personal-mcp`를 통해 스토리지 수명주기를 자율 제어합니다.

```text
[ 단기 기억 (Ephemeral) ] : 24시간 챗 로그 → 인메모리 / WebRTC (Unpinned)
[ 중기 기억 (Warm Cache) ] : 30일간 임시 사이트 초안 → 로컬 노드 단독 Pin
[ 장기 기억 (Permanent)  ] : 발행된 공식 사이트 + 검증된 KB → Multi-Node Pinning
```

### 에이전트 전용 6대 MCP Tool:
1. `ipfs_publish_hugo(sourceDir)`: 빌드 및 디렉터리 Add
2. `ipfs_pin_content(cid)`: 특정 CID 영구 핀 고정
3. `ipfs_unpin_old_versions(subdomain, keepCount)`: 구버전 자동 가비지 컬렉션
4. `ipfs_update_dnslink(subdomain, cid)`: 도메인 매핑 갱신
5. `ipfs_verify_status(cid)`: 네트워크 피어 전파 헬스체크
6. `a2a_send_action(targetDid, actionPayload)`: P2P 예약/주문 전달

---

## 7. 단계별 실행 로드맵 (Action Plan)

### Phase 1: 백엔드 팩토리 엔진 스캐폴딩 (P0) — 완료
- [x] `packages/mcp/src/hugo-factory.ts`: 테마 HTML/CSS, `mcp.json`, A2UI JSONL 생성
- [x] `services/api/src/factory-routes.ts`: `/api/factory/spawn` 및 사이트/롤백/토폴로지 라우트
- [x] IPFS/DNSLink Mock 어댑터 연동 및 단위 테스트
- [x] 초원식당 `shop1` 시드 노드 등록 (`shop1.kbizhub.com`)

### Phase 1.5: React A2UI 표면 — 완료
- [x] `apps/web/src/components/a2ui/`: React 19 A2UI wire renderer
- [x] `apps/web/src/pages/resources/FactoryPage.tsx`: 발행 폼 + 사이트 목록 + A2UI 미리보기
- [x] `/factory` 라우트 및 Resources 사이드바 메뉴 등록
- [x] 스폰 응답 `a2uiJsonl` 계약 연결
### Phase 2: kbizhub.com 프론트엔드 연동 (P1) — 연결 계약 준비
> 이 worktree에는 `packaging/kbizhub-site/index.html` 원본이 없으므로 정적 사이트 파일은
> 수정하지 않았습니다. KBizHub가 아래 API를 호출하는 얇은 버튼/모달을 추가하면 됩니다.
- [ ] `kbizhub.com` 네비게이션에서 `https://muhanai.com/factory` 링크 또는 동일 API 모달 연결
- [ ] `POST /api/factory/spawn`에 폼 데이터를 전송하고 결과의 `websiteUrl`, `mcpUrl`, `cid`, `a2uiJsonl` 표시
- [ ] 생성 성공 시 `find.muhanai.com` 성좌도 링크 및 미리보기 팝업 연동
- [ ] KBizHub 정적 사이트 소스가 이 worktree에 들어오면 `#factory` 모달을 실제로 이식
### KBizHub 최소 연결 예시
```html
<button id="open-factory">🚀 1-Click AI Business</button>
<script>
  document.querySelector('#open-factory').addEventListener('click', () => {
    window.open('https://muhanai.com/factory', '_blank', 'noopener');
  });
</script>
```

API를 직접 호출하는 경우 `POST /api/factory/spawn`의 응답은 다음 필드를 사용합니다:
```json
{
  "subdomain": "shop1",
  "websiteUrl": "https://shop1.kbizhub.com",
  "mcpUrl": "sse://mcp.muhanai.com/store/shop1",
  "cid": "bafy...",
  "a2uiJsonl": "{\\"version\\":\\"v1.0\\",...}"
}
```

### Phase 3: Cosmic Topology 실시간 동기화 (P2)
- [ ] 팩토리에서 새 노드 발행 시 `/api/network`의 `AgentRegistry` 및 `topology()`에 자동 등록
- [ ] `CosmicCanvas.tsx`에 신규 점등 애니메이션 트리거 (황금빛 초신성 쇼크웨이브)

### Phase 4: 라이브 DNS & IPFS 노드 배선 (P3)
- [ ] Cloudflare DNSLink API 실키(Token) 연동
- [ ] IPFS Pinning Cluster 연동 및 실제 서브도메인 실측 라운드트립
