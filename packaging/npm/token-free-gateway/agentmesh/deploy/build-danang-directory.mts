/**
 * danang.kbizhub.com Directory & MCP Builder
 *
 * Reads 274 stores from deploy/.ekoreatown/stores.json and builds a complete
 * static bundle with:
 *   1. Root directory (index.html) with real-time search & category tabs
 *   2. Root MCP manifest (/.well-known/mcp.json) with search/lookup tools
 *   3. Root A2A Agent Card (/.well-known/agent.json) for Ghost desktop
 *   4. Machine-readable database (/data/stores.json)
 *   5. Individual store pages + per-store MCP & A2UI surfaces (/store/<category>/<id>/)
 *
 * Usage:
 *   bun run deploy/build-danang-directory.mts
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hugoMcpFactory, type StoreFactoryInput } from "../packages/mcp/src/hugo-factory.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const STORES_FILE = join(HERE, ".ekoreatown", "stores.json");
const OUT_DIR = join(HERE, "..", "dist-danang");

interface StoreRecord {
	category: string;
	id: string;
	name: string;
	itemName?: string;
	storeName?: string;
	price?: string;
	url: string;
	description?: string;
	phone?: string;
	address?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
	korearestaurant: "한국식당",
	sidedish: "반찬 / 배달",
	koreafood: "한식 메뉴",
	yellowpage: "업소 / 옐로우페이지",
	spa: "스파 / 마사지",
	localfood: "로컬 맛집",
};

function categoryName(cat: string): string {
	return CATEGORY_LABELS[cat] ?? cat;
}

function escapeHtml(s: string): string {
	return s.replace(
		/[<>&"]/g,
		(c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] ?? c,
	);
}

// ------------------------------------------------------------------ Load data
if (!existsSync(STORES_FILE)) {
	console.error(`Missing stores file: ${STORES_FILE}. Run deploy/crawl-ekoreatown.mts first.`);
	process.exit(1);
}

const rawData = JSON.parse(readFileSync(STORES_FILE, "utf8"));
const stores: StoreRecord[] = rawData.stores ?? [];
console.log(`[build-danang] loaded ${stores.length} stores from stores.json`);

if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

// ------------------------------------------------------------------ 1. Root CSS
const THEME_CSS = `:root{
  --bg:#0d1117; --surface:#161b22; --surface-hover:#1f242c; --border:#30363d;
  --text:#e6edf3; --muted:#8b949e; --accent:#e6b422; --accent-dim:#3d3418;
  --tag-bg:#21262d; --accent-green:#3fb950;
}
*{box-sizing:border-box}
body{
  margin:0; background:var(--bg); color:var(--text);
  font:15px/1.6 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Segoe UI",sans-serif;
  -webkit-font-smoothing:antialiased;
}
.wrap{max-width:1100px; margin:0 auto; padding:40px 20px 80px}
header.hero{
  text-align:center; padding-bottom:32px; border-bottom:1px solid var(--border);
  margin-bottom:32px;
}
.hero-badge{
  display:inline-block; font-size:.75rem; font-weight:700; letter-spacing:.08em;
  text-transform:uppercase; color:var(--accent); background:var(--accent-dim);
  border:1px solid #5c4a1a; border-radius:99px; padding:4px 14px; margin-bottom:14px;
}
.hero h1{margin:0 0 10px; font-size:2.4rem; letter-spacing:-.02em}
.hero p{margin:0 auto; max-width:680px; color:var(--muted); font-size:1.05rem}
.stats-bar{
  display:flex; justify-content:center; gap:24px; margin-top:20px; flex-wrap:wrap;
}
.stat-pill{
  font-size:.85rem; color:var(--muted); background:var(--surface);
  border:1px solid var(--border); border-radius:99px; padding:4px 14px;
}
.stat-pill strong{color:var(--text)}

/* Search & filter */
.controls{margin-bottom:28px}
.search-box{margin-bottom:16px}
.search-input{
  width:100%; padding:14px 18px; font-size:1rem; background:var(--surface);
  border:1px solid var(--border); border-radius:10px; color:var(--text);
  outline:none; transition:border .2s;
}
.search-input:focus{border-color:var(--accent)}
.tabs{display:flex; gap:8px; flex-wrap:wrap}
.tab-btn{
  background:var(--surface); border:1px solid var(--border); color:var(--muted);
  padding:8px 16px; border-radius:99px; cursor:pointer; font-size:.85rem; font-weight:600;
  transition:all .15s;
}
.tab-btn:hover{color:var(--text); border-color:var(--accent)}
.tab-btn.active{background:var(--accent); color:#000; border-color:var(--accent)}

/* Store Grid */
.store-grid{
  display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr));
  gap:16px; margin-bottom:48px;
}
.card{
  background:var(--surface); border:1px solid var(--border); border-radius:12px;
  padding:18px 20px; display:flex; flex-direction:column; justify-content:space-between;
  transition:transform .15s, border-color .15s, background .15s; text-decoration:none; color:inherit;
}
.card:hover{
  border-color:var(--accent); background:var(--surface-hover); transform:translateY(-2px);
}
.card-header{display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:8px}
.card-title{font-size:1.1rem; font-weight:700; margin:0; color:var(--text); line-height:1.35}
.card-cat{
  font-size:.72rem; padding:2px 8px; border-radius:4px; background:var(--tag-bg);
  color:var(--muted); border:1px solid var(--border); white-space:nowrap; flex-shrink:0;
}
.card-price{
  font-size:.95rem; font-weight:700; color:var(--accent); margin:6px 0;
  font-variant-numeric:tabular-nums;
}
.card-desc{color:var(--muted); font-size:.85rem; margin:6px 0 12px; line-height:1.5}
.card-footer{
  display:flex; justify-content:space-between; align-items:center;
  font-size:.75rem; color:var(--muted); border-top:1px solid var(--border);
  padding-top:10px; margin-top:8px;
}
.mcp-badge{
  font-size:.7rem; color:var(--accent-green); background:rgba(63,185,80,0.1);
  padding:2px 6px; border-radius:4px; border:1px solid rgba(63,185,80,0.25);
}

/* AI Agent Section */
.agent-banner{
  background:var(--surface); border:1px solid var(--border); border-radius:14px;
  padding:28px; margin-top:48px;
}
.agent-banner h2{margin:0 0 10px; font-size:1.3rem; color:var(--text)}
.agent-banner p{color:var(--muted); margin:0 0 16px; font-size:.92rem}
.agent-endpoints{
  display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr));
  gap:12px;
}
.ep-box{
  background:var(--bg); border:1px solid var(--border); border-radius:8px;
  padding:12px 16px; font-family:ui-monospace,SFMono-Regular,Consolas,monospace;
  font-size:.82rem;
}
.ep-box span.method{color:var(--accent); font-weight:700; margin-right:6px}
.ep-box a{color:var(--text); text-decoration:none}
.ep-box a:hover{text-decoration:underline}

footer{
  text-align:center; padding-top:40px; margin-top:40px;
  border-top:1px solid var(--border); color:var(--muted); font-size:.82rem;
}
@media(max-width:600px){
  .wrap{padding:24px 14px 60px}
  .hero h1{font-size:1.8rem}
  .store-grid{grid-template-columns:1fr}
}
`;
mkdirSync(join(OUT_DIR, "assets"), { recursive: true });
writeFileSync(join(OUT_DIR, "assets", "style.css"), THEME_CSS);

// ------------------------------------------------------------------ 2. Root Index HTML
const categoriesCount = stores.reduce(
	(acc, s) => {
		acc[s.category] = (acc[s.category] ?? 0) + 1;
		return acc;
	},
	{} as Record<string, number>,
);

function buildRootHtml(): string {
	const total = stores.length;

	const tabsHtml = [
		`<button class="tab-btn active" data-cat="all">전체 (${total})</button>`,
		...Object.entries(categoriesCount).map(
			([cat, count]) =>
				`<button class="tab-btn" data-cat="${escapeHtml(cat)}">${escapeHtml(categoryName(cat))} (${count})</button>`,
		),
	].join("\n      ");

	const cardsHtml = stores
		.map((s) => {
			const storeUrl = `/store/${s.category}/${s.id}/`;
			const priceHtml = s.price ? `<div class="card-price">${escapeHtml(s.price)}</div>` : "";
			const subText =
				s.storeName && s.itemName ? `<div class="card-desc">${escapeHtml(s.storeName)}</div>` : "";

			return `<a href="${storeUrl}" class="card" data-cat="${escapeHtml(s.category)}" data-name="${escapeHtml(s.name.toLowerCase())}" data-id="${escapeHtml(s.id)}">
        <div>
          <div class="card-header">
            <h3 class="card-title">${escapeHtml(s.name)}</h3>
            <span class="card-cat">${escapeHtml(categoryName(s.category))}</span>
          </div>
          ${priceHtml}
          ${subText}
        </div>
        <div class="card-footer">
          <span class="mcp-badge">⚡ MCP Enabled</span>
          <span>ID: #${escapeHtml(s.id)}</span>
        </div>
      </a>`;
		})
		.join("\n    ");

	return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>다낭 K-BizHub — 다낭 한국 업소 디렉토리 & AI Agent Hub</title>
  <meta name="description" content="베트남 다낭의 ${total}개 한국 식당, 반찬 배달, 스파/마사지, 교민 업소 총집합. 사람과 AI 에이전트를 위한 MCP 디렉토리." />
  <meta property="og:title" content="다낭 K-BizHub (Danang Korean Business Hub)" />
  <meta property="og:description" content="다낭 ${total}개 한인 업소 & 맛집 MCP 인덱스" />
  <meta property="og:type" content="website" />
  <link rel="stylesheet" href="/assets/style.css" />
  <link rel="alternate" type="application/json" title="MCP Manifest" href="/.well-known/mcp.json" />
  <link rel="alternate" type="application/json" title="A2A Agent Card" href="/.well-known/agent.json" />
</head>
<body>
<div class="wrap">
  <header class="hero">
    <span class="hero-badge">MuhanAI Decentralized Agent Mesh</span>
    <h1>다낭 K-BizHub</h1>
    <p>베트남 다낭의 한국 식당, 반찬 배달, 뷰티/스파, 비즈니스 업소 <strong>${total}곳</strong>을 사람과 AI 에이전트(MCP)를 위해 제공합니다.</p>
    <div class="stats-bar">
      <div class="stat-pill">등록 업소 <strong>${total}개</strong></div>
      <div class="stat-pill">식당 <strong>${categoriesCount.korearestaurant ?? 0}곳</strong></div>
      <div class="stat-pill">반찬/배달 <strong>${categoriesCount.sidedish ?? 0}개</strong></div>
      <div class="stat-pill">스파 <strong>${categoriesCount.spa ?? 0}곳</strong></div>
      <div class="stat-pill">MCP <strong>Active</strong></div>
    </div>
  </header>

  <div class="controls">
    <div class="search-box">
      <input type="text" id="searchInput" class="search-input" placeholder="업소명, 메뉴, 키워드로 검색 (예: 삼겹살, 김치, 스파, 해운대)..." autocomplete="off" />
    </div>
    <div class="tabs" id="categoryTabs">
      ${tabsHtml}
    </div>
  </div>

  <div class="store-grid" id="storeGrid">
    ${cardsHtml}
  </div>

  <div id="noResults" style="display:none; text-align:center; padding:40px; color:var(--muted)">
    검색 결과가 없습니다.
  </div>

  <section class="agent-banner">
    <h2>🤖 AI Agent & MCP Developers</h2>
    <p>이 디렉토리는 사람이 보는 웹페이지뿐만 아니라, Claude, Cursor, Ghost, Cline 등의 AI 에이전트가 호출할 수 있는 표준 MCP 및 A2A 프로토콜로 열려 있습니다.</p>
    <div class="agent-endpoints">
      <div class="ep-box"><span class="method">MCP</span> <a href="/.well-known/mcp.json">/.well-known/mcp.json</a></div>
      <div class="ep-box"><span class="method">A2A</span> <a href="/.well-known/agent.json">/.well-known/agent.json</a></div>
      <div class="ep-box"><span class="method">DATA</span> <a href="/data/stores.json">/data/stores.json (${total} items)</a></div>
    </div>
  </section>

  <footer>
    <p>Powered by MuhanAI 1-Click Factory · danang.kbizhub.com · Data source: ekoreatown.net</p>
  </footer>
</div>

<script>
(function() {
  const searchInput = document.getElementById("searchInput");
  const tabBtns = document.querySelectorAll(".tab-btn");
  const cards = document.querySelectorAll(".card");
  const noResults = document.getElementById("noResults");

  let activeCat = "all";
  let query = "";

  function filterStores() {
    let visible = 0;
    const q = query.trim().toLowerCase();

    cards.forEach(card => {
      const cat = card.getAttribute("data-cat");
      const name = card.getAttribute("data-name") || "";
      const id = card.getAttribute("data-id") || "";

      const matchCat = activeCat === "all" || cat === activeCat;
      const matchQuery = !q || name.includes(q) || id.includes(q);

      if (matchCat && matchQuery) {
        card.style.display = "";
        visible++;
      } else {
        card.style.display = "none";
      }
    });

    noResults.style.display = visible === 0 ? "block" : "none";
  }

  searchInput.addEventListener("input", function(e) {
    query = e.target.value;
    filterStores();
  });

  tabBtns.forEach(btn => {
    btn.addEventListener("click", function() {
      tabBtns.forEach(b => b.classList.remove("active"));
      this.classList.add("active");
      activeCat = this.getAttribute("data-cat");
      filterStores();
    });
  });
})();
</script>
</body>
</html>`;
}

writeFileSync(join(OUT_DIR, "index.html"), buildRootHtml());

// ------------------------------------------------------------------ 3. Data files
mkdirSync(join(OUT_DIR, "data"), { recursive: true });
writeFileSync(join(OUT_DIR, "data", "stores.json"), JSON.stringify(stores, null, 2));
writeFileSync(
	join(OUT_DIR, "data", "categories.json"),
	JSON.stringify(
		{
			total: stores.length,
			counts: categoriesCount,
			labels: CATEGORY_LABELS,
			updatedAt: new Date().toISOString(),
		},
		null,
		2,
	),
);

// ------------------------------------------------------------------ 4. Root MCP Manifest
mkdirSync(join(OUT_DIR, ".well-known"), { recursive: true });
const rootMcpManifest = {
	schema_version: "v1",
	name_for_model: "danang_kbizhub_directory",
	name_for_human: "Danang K-BizHub Korean Business Directory",
	description_for_model: `Comprehensive directory of ${stores.length} Korean businesses, restaurants, sidedish delivery, and spas in Da Nang, Vietnam. Query stores by keyword, category, or ID.`,
	description_for_human: `다낭 ${stores.length}개 한국 업소, 식당, 배달, 마사지 실시간 검색 MCP`,
	server_version: "1.0.0",
	transport: {
		type: "static_resource",
		database_url: "https://danang.kbizhub.com/data/stores.json",
	},
	capabilities: {
		tools: true,
		resources: true,
	},
	tools: [
		{
			name: "search_danang_stores",
			description: "다낭 한국 업소/메뉴 검색 (키워드, 카테고리별 필터링)",
			parameters: {
				type: "object",
				properties: {
					query: {
						type: "string",
						description: "검색할 업소명 또는 메뉴명 (예: 삼겹살, 국밥, 스파)",
					},
					category: {
						type: "string",
						enum: Object.keys(categoriesCount),
						description:
							"카테고리 필터 (korearestaurant, sidedish, koreafood, yellowpage, spa, localfood)",
					},
					limit: { type: "integer", default: 20 },
				},
			},
		},
		{
			name: "get_danang_store_detail",
			description: "특정 업소 ID의 상세 정보 (전화번호, 주소, 메뉴, 가격, MCP 엔드포인트) 조회",
			parameters: {
				type: "object",
				properties: {
					id: { type: "string", description: "업소 고유 ID (예: 3026)" },
				},
				required: ["id"],
			},
		},
		{
			name: "list_danang_categories",
			description: "등록된 카테고리 목록 및 카테고리별 업소 수 조회",
		},
	],
	resources: [
		{
			name: "all_stores",
			uri: "https://danang.kbizhub.com/data/stores.json",
			description: `Full JSON database of all ${stores.length} stores`,
			mimeType: "application/json",
		},
		{
			name: "categories_summary",
			uri: "https://danang.kbizhub.com/data/categories.json",
			description: "Category breakdown and counts",
			mimeType: "application/json",
		},
	],
};
writeFileSync(join(OUT_DIR, ".well-known", "mcp.json"), JSON.stringify(rootMcpManifest, null, 2));

// ------------------------------------------------------------------ 5. Root A2A Agent Card
const rootAgentCard = {
	name: "Danang K-BizHub Agent",
	description: `Decentralized AI Directory for Korean Businesses in Da Nang (${stores.length} venues).`,
	url: "https://danang.kbizhub.com",
	version: "1.0.0",
	capabilities: ["local_file_search", "offline_inference"],
	skills: [
		{ id: "search_danang_stores", name: "Search Da Nang Stores" },
		{ id: "get_danang_store_detail", name: "Get Store Detail" },
		{ id: "list_danang_categories", name: "List Categories" },
	],
	protocol: {
		a2a: "jsonrpc-2.0",
		mcp: "https://danang.kbizhub.com/.well-known/mcp.json",
	},
};
writeFileSync(join(OUT_DIR, ".well-known", "agent.json"), JSON.stringify(rootAgentCard, null, 2));

// ------------------------------------------------------------------ 6. Individual Store MCP Pages
console.log(`[build-danang] generating individual MCP surfaces for ${stores.length} stores...`);

let storeGenerated = 0;
for (const s of stores) {
	const storeDir = join(OUT_DIR, "store", s.category, s.id);
	mkdirSync(storeDir, { recursive: true });

	const storeInput: StoreFactoryInput = {
		name: s.name,
		category: categoryName(s.category),
		description: s.description ?? `다낭 ${categoryName(s.category)} 업소: ${s.name}. ID #${s.id}.`,
		subdomain: `danang-${s.category}-${s.id}`,
		phone: s.phone,
		address: s.address,
		pricePerPerson: s.price,
		items: s.price
			? [
					{
						name: s.itemName ?? s.name,
						price: Number.parseInt(s.price.replace(/[^\d]/g, ""), 10) || 0,
					},
				]
			: undefined,
	};

	const bundle = hugoMcpFactory.generateStaticBundle(storeInput);

	// Custom HTML for the sub-page with a "back to directory" link
	const subHtml = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(s.name)} — 다낭 K-BizHub</title>
  <meta name="description" content="${escapeHtml(s.name)} (${categoryName(s.category)}) - 다낭 한인 업소 정보" />
  <link rel="stylesheet" href="/assets/style.css" />
  <link rel="alternate" type="application/json" title="MCP manifest" href="mcp.json" />
</head>
<body>
<div class="wrap" style="max-width:760px">
  <div style="margin-bottom:20px">
    <a href="/" style="color:var(--accent); text-decoration:none; font-size:.9rem">← 다낭 K-BizHub 전체 목록으로 돌아가기</a>
  </div>

  <header class="hero" style="text-align:left; padding-bottom:20px">
    <span class="hero-badge">${escapeHtml(categoryName(s.category))}</span>
    <h1 style="font-size:2rem; margin-bottom:6px">${escapeHtml(s.name)}</h1>
    <p style="margin:0">${escapeHtml(s.description ?? "다낭 현지 한인 업소")}</p>
  </header>

  <div style="background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:20px; margin:24px 0">
    <h2 style="font-size:1rem; margin:0 0 14px; text-transform:uppercase; color:var(--muted)">업소 정보</h2>
    ${s.price ? `<div style="margin-bottom:10px"><strong>가격 / 메뉴:</strong> <span style="color:var(--accent); font-weight:700">${escapeHtml(s.price)}</span></div>` : ""}
    ${s.phone ? `<div style="margin-bottom:10px"><strong>전화번호:</strong> <a href="tel:${escapeHtml(s.phone)}" style="color:var(--accent)">${escapeHtml(s.phone)}</a></div>` : ""}
    ${s.address ? `<div style="margin-bottom:10px"><strong>주소:</strong> ${escapeHtml(s.address)}</div>` : ""}
    <div style="margin-bottom:10px"><strong>고유 번호:</strong> #${escapeHtml(s.id)}</div>
    <div><strong>원문 링크:</strong> <a href="${escapeHtml(s.url)}" target="_blank" rel="noopener" style="color:var(--accent)">ekoreatown 상세 보기 ↗</a></div>
  </div>

  <section class="agent-banner" style="margin-top:28px">
    <h2>⚡ AI Agent Interface (MCP & A2UI)</h2>
    <p>이 개별 업소의 실시간 메타데이터 및 에이전트 연동 엔드포인트입니다.</p>
    <div class="agent-endpoints">
      <div class="ep-box"><span class="method">MCP</span> <a href="mcp.json">mcp.json</a></div>
      <div class="ep-box"><span class="method">STORE</span> <a href="store.json">store.json</a></div>
      <div class="ep-box"><span class="method">A2UI</span> <a href="surface.jsonl">surface.jsonl</a></div>
    </div>
  </section>

  <footer>
    <a href="/" style="color:var(--accent); text-decoration:none">다낭 K-BizHub 홈으로</a> · Powered by MuhanAI
  </footer>
</div>
</body>
</html>`;

	writeFileSync(join(storeDir, "index.html"), subHtml);
	writeFileSync(join(storeDir, "mcp.json"), bundle[".well-known/mcp.json"] ?? "{}");
	writeFileSync(join(storeDir, "store.json"), bundle["data/store.json"] ?? "{}");
	writeFileSync(join(storeDir, "surface.jsonl"), bundle["a2ui/surface.jsonl"] ?? "");

	storeGenerated++;
}

console.log(`[build-danang] generated ${storeGenerated} store MCP sub-pages`);
console.log(`[build-danang] complete! Output at ${OUT_DIR}`);
