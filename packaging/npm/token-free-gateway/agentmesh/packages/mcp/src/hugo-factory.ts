/**
 * Hugo + MCP Site Factory Engine
 * Handles dynamic Hugo scaffolding, data injection, .well-known/mcp.json generation,
 * and simulated/live IPFS CID + DNSLink resolution.
 *
 * Emits three surfaces per store:
 *   1. index.html            — human, static, themed
 *   2. .well-known/mcp.json  — agent tools (what it can DO)
 *   3. a2ui/surface.jsonl    — agent UI wire (what it can SHOW)
 */

import { type A2UIMessage, a2uiSurfaceBuilder } from "./a2ui-surface.js";

export interface StoreFactoryInput {
	name: string;
	category: string;
	description: string;
	subdomain: string;
	phone?: string;
	address?: string;
	hours?: string;
	/** Amenities shown on the human surface and exposed to agents (e.g. "Wi-Fi"). */
	services?: string[];
	/** Human-readable price band, e.g. "₫100,000–200,000". */
	pricePerPerson?: string;
	/** WGS84 coordinates for map links / geo-aware anycast. */
	lat?: number;
	lng?: number;
	items?: Array<{ name: string; price: number; description?: string }>;
}

export interface McpToolDefinition {
	name: string;
	description: string;
	type: "static_resource" | "p2p_action";
	source?: string;
	target_skill?: string;
	parameters?: Record<string, unknown>;
}

export interface McpManifest {
	name: string;
	version: string;
	description: string;
	tools: McpToolDefinition[];
}

export interface FactorySpawnResult {
	success: boolean;
	subdomain: string;
	cid: string;
	websiteUrl: string;
	mcpUrl: string;
	cosmicStarId: string;
	manifest: McpManifest;
	storeData: Record<string, unknown>;
	/** A2UI wire format (JSONL) for the store menu surface — agent-renderable UI. */
	a2uiJsonl: string;
	createdAt: string;
}

export class StoreAgentAdapter {
	readonly id: string;
	readonly type: "mcp" = "mcp" as const;
	readonly displayName: string;
	private readonly manifest: McpManifest;
	private readonly store: Record<string, unknown>;
	private readonly mcpUrl: string;

	constructor(result: FactorySpawnResult) {
		this.id = `store:${result.subdomain}`;
		const storeName =
			typeof result.storeData?.store === "object" && result.storeData.store !== null
				? (result.storeData.store as { name?: string }).name
				: undefined;
		this.displayName = storeName ?? result.subdomain;
		this.manifest = result.manifest;
		this.store = result.storeData ?? {};
		this.mcpUrl = result.mcpUrl;
	}

	capabilities(): string[] {
		return this.manifest.tools.map((t) => t.name);
	}

	health() {
		return Promise.resolve({ online: true, latency: 1, checkedAt: Date.now() });
	}

	execute(request: { id: string; question: string }) {
		return Promise.resolve({
			requestId: request.id,
			agentId: this.id,
			answer: `Store agent ${this.displayName} received: ${request.question}`,
			confidence: 0.9,
			latencyMs: 1,
		});
	}

	getManifest(): McpManifest {
		return this.manifest;
	}

	getStoreData(): Record<string, unknown> {
		return this.store;
	}

	getMcpUrl(): string {
		return this.mcpUrl;
	}
}

export class HugoMcpFactory {
	/**
	 * Generates the standard .well-known/mcp.json manifest for an individual store.
	 */
	generateMcpManifest(input: StoreFactoryInput): McpManifest {
		return {
			name: input.subdomain,
			version: "1.0.0",
			description: `${input.name} (${input.category}) 공식 AI 에이전트 인터페이스`,
			tools: [
				{
					name: "get_menu",
					description: "최신 메뉴 목록, 가격, 원산지 정보 조회",
					type: "static_resource",
					source: "data/menu.json",
				},
				{
					name: "get_business_hours",
					description: "영업 시간 및 정기 휴무일 확인",
					type: "static_resource",
					source: "data/store.json",
				},
				{
					name: "request_reservation",
					description: "테이블 예약 요청 (점주 에이전트로 실시간 라우팅)",
					type: "p2p_action",
					target_skill: "reservation_service",
					parameters: {
						type: "object",
						properties: {
							guest_name: { type: "string" },
							phone: { type: "string" },
							party_size: { type: "integer" },
							datetime: { type: "string" },
						},
						required: ["guest_name", "phone", "party_size", "datetime"],
					},
				},
			],
		};
	}

	/**
	 * Generates store data and menu data structures
	 */
	generateStoreData(input: StoreFactoryInput) {
		const store = {
			name: input.name,
			category: input.category,
			description: input.description,
			phone: input.phone || "02-1234-5678",
			address: input.address || "서울특별시 강남구 테헤란로 123",
			hours: input.hours || "매일 10:00 - 22:00 (연중무휴)",
			// Optional listing details — omitted (not nulled) when unset so the
			// agent-facing JSON stays terse for stores that only have the basics.
			...(input.services?.length ? { services: input.services } : {}),
			...(input.pricePerPerson ? { pricePerPerson: input.pricePerPerson } : {}),
			...(input.lat !== undefined && input.lng !== undefined
				? { geo: { lat: input.lat, lng: input.lng } }
				: {}),
			updatedAt: new Date().toISOString(),
		};

		const menu = {
			store: input.name,
			currency: "KRW",
			items:
				input.items && input.items.length > 0
					? input.items
					: [
							{
								name: "시그니처 대표 메뉴 A",
								price: 15000,
								description: "신선한 재료로 당일 조리",
							},
							{ name: "인기 세트 메뉴 B", price: 28000, description: "2인 추천 베스트셀러" },
							{ name: "사이드 스페셜 C", price: 8000, description: "가볍게 즐기는 사이드" },
						],
		};

		return { store, menu };
	}

	/**
	 * Materialize a static file bundle that the factory can hand to a real
	 * IPFS adapter. Layout mirrors a minimal Hugo output:
	 *
	 *   index.html                       ← storefront landing page
	 *   data/store.json                  ← store metadata
	 *   data/menu.json                   ← menu items
	 *   .well-known/mcp.json             ← machine-readable agent manifest
	 *
	 * Returned as a string-keyed map so both `MockIpfsAdapter.add` and
	 * `KuboHttpIpfsAdapter.add` can consume it without changes.
	 */
	generateStaticBundle(input: StoreFactoryInput): Record<string, string> {
		const manifest = this.generateMcpManifest(input);
		const { store, menu } = this.generateStoreData(input);
		const index = this.renderIndexHtml(input, menu);
		const css = this.renderThemeCss();
		const surface = this.generateAgentSurface(input, menu.items);
		return {
			"index.html": index,
			"assets/style.css": css,
			".well-known/mcp.json": JSON.stringify(manifest, null, 2),
			"data/store.json": JSON.stringify(store, null, 2),
			"data/menu.json": JSON.stringify(menu, null, 2),
			// Third surface: the A2UI render payload an agent ships to a renderer
			// so it can *show* the store, not just read its JSON.
			"a2ui/surface.jsonl": surface.jsonl,
			"a2ui/surface.json": JSON.stringify(surface.messages, null, 2),
		};
	}

	/**
	 * Builds the A2UI (Agent-to-UI) surface for a store.
	 *
	 * Framework-neutral: the output is JSON authored against the A2UI v1.0
	 * spec, so any renderer (React, Svelte, native) can consume it. See
	 * `a2ui-surface.ts` for the wire rules this honors.
	 */
	generateAgentSurface(
		input: StoreFactoryInput,
		items: Array<{ name: string; price: number; description?: string }>,
	): { messages: A2UIMessage[]; jsonl: string } {
		const messages = a2uiSurfaceBuilder.buildStoreMenuSurface({
			surfaceId: `${input.subdomain}-menu`,
			storeName: input.name,
			...(input.hours ? { hours: input.hours } : {}),
			...(input.pricePerPerson ? { pricePerPerson: input.pricePerPerson } : {}),
			...(input.services?.length ? { services: input.services } : {}),
			items,
		});
		return { messages, jsonl: `${a2uiSurfaceBuilder.toJsonl(messages)}\n` };
	}

	/**
	 * Theme CSS — a self-contained "FixIt/PaperMod-lite" dark theme.
	 * No CDN, no webfonts: it must render identically offline and inside IPFS.
	 */
	private renderThemeCss(): string {
		return `:root{
    --bg:#0d1117; --surface:#161b22; --border:#30363d;
    --text:#e6edf3; --muted:#8b949e; --accent:#e6b422; --accent-dim:#3d3418;
  }
  *{box-sizing:border-box}
  body{
    margin:0; background:var(--bg); color:var(--text);
    font:16px/1.65 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Segoe UI",sans-serif;
    -webkit-font-smoothing:antialiased;
  }
  .wrap{max-width:760px; margin:0 auto; padding:48px 20px 80px}
  .hero{border-bottom:1px solid var(--border); padding-bottom:28px; margin-bottom:32px}
  .hero h1{margin:0 0 8px; font-size:2.1rem; letter-spacing:-.02em}
  .hero .cat{
    display:inline-block; font-size:.72rem; font-weight:700; letter-spacing:.08em;
    text-transform:uppercase; color:var(--accent); background:var(--accent-dim);
    border:1px solid #5c4a1a; border-radius:99px; padding:4px 12px; margin-bottom:14px;
  }
  .hero p{margin:0; color:var(--muted)}
  .facts{display:grid; gap:1px; background:var(--border); border:1px solid var(--border);
    border-radius:12px; overflow:hidden; margin:32px 0}
  .fact{display:flex; gap:14px; background:var(--surface); padding:14px 18px; font-size:.94rem}
  .fact .k{color:var(--muted); min-width:88px; flex-shrink:0}
  .fact .v{color:var(--text); word-break:break-word}
  .fact a{color:var(--accent); text-decoration:none}
  .fact a:hover{text-decoration:underline}
  .chips{display:flex; flex-wrap:wrap; gap:8px; margin-top:10px}
  .chip{font-size:.78rem; padding:3px 10px; border:1px solid var(--border);
    border-radius:99px; color:var(--muted); background:var(--bg)}
  h2{font-size:1.05rem; letter-spacing:.04em; text-transform:uppercase;
    color:var(--muted); margin:0 0 14px; font-weight:700}
  .menu{list-style:none; margin:0; padding:0}
  .menu li{display:flex; justify-content:space-between; align-items:baseline; gap:20px;
    padding:15px 0; border-bottom:1px solid var(--border)}
  .menu li:last-child{border-bottom:0}
  .menu .d{min-width:0}
  .menu .n{font-weight:600}
  .menu .desc{display:block; font-size:.85rem; color:var(--muted); margin-top:3px}
  .menu .p{font-variant-numeric:tabular-nums; color:var(--accent);
    font-weight:600; white-space:nowrap}
  .agent{margin-top:44px; padding:22px; border:1px solid var(--border);
    border-radius:12px; background:var(--surface)}
  .agent h2{margin-bottom:10px}
  .agent p{margin:0 0 14px; font-size:.88rem; color:var(--muted)}
  .agent code{font-size:.82rem; color:var(--accent); background:var(--bg);
    border:1px solid var(--border); border-radius:6px; padding:4px 8px; display:inline-block}
  footer{margin-top:48px; padding-top:22px; border-top:1px solid var(--border);
    color:var(--muted); font-size:.78rem}
  @media(max-width:520px){
    .wrap{padding:32px 16px 64px}
    .hero h1{font-size:1.65rem}
    .fact{flex-direction:column; gap:2px}
    .fact .k{min-width:0}
  }
  `;
	}

	/** Human surface: renders the themed storefront page. */
	private renderIndexHtml(
		input: StoreFactoryInput,
		menu: { items: Array<{ name: string; price: number; description?: string }> },
	): string {
		const esc = (s: string) =>
			s.replace(
				/[<>&"]/g,
				(c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] ?? c,
			);
		const name = esc(input.name);
		const description = esc(input.description);
		const category = esc(input.category);

		const rows: string[] = [];
		if (input.address) {
			const maps =
				input.lat !== undefined && input.lng !== undefined
					? `https://www.google.com/maps/search/?api=1&query=${input.lat},${input.lng}`
					: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(input.address)}`;
			rows.push(
				`<div class="fact"><span class="k">주소</span><span class="v"><a href="${maps}" rel="noopener">${esc(input.address)}</a></span></div>`,
			);
		}
		if (input.phone) {
			rows.push(
				`<div class="fact"><span class="k">전화</span><span class="v"><a href="tel:${input.phone.replace(/\s/g, "")}">${esc(input.phone)}</a></span></div>`,
			);
		}
		if (input.hours) {
			rows.push(
				`<div class="fact"><span class="k">영업시간</span><span class="v">${esc(input.hours)}</span></div>`,
			);
		}
		if (input.pricePerPerson) {
			rows.push(
				`<div class="fact"><span class="k">1인 가격</span><span class="v">${esc(input.pricePerPerson)}</span></div>`,
			);
		}
		if (input.services?.length) {
			rows.push(
				`<div class="fact"><span class="k">편의시설</span><span class="v"><span class="chips">${input.services
					.map((s) => `<span class="chip">${esc(s)}</span>`)
					.join("")}</span></span></div>`,
			);
		}

		const menuItems = menu.items
			.map(
				(i) =>
					`<li><span class="d"><span class="n">${esc(i.name)}</span>${
						i.description ? `<span class="desc">${esc(i.description)}</span>` : ""
					}</span><span class="p">${i.price.toLocaleString("ko-KR")}₫</span></li>`,
			)
			.join("");

		return `<!doctype html>
  <html lang="ko">
  <head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${name}</title>
  <meta name="description" content="${description}" />
  <meta property="og:title" content="${name}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:type" content="website" />
  <link rel="stylesheet" href="/assets/style.css" />
  <link rel="alternate" type="application/json" title="MCP manifest" href="/.well-known/mcp.json" />
  <script type="application/ld+json">${JSON.stringify({
		"@context": "https://schema.org",
		"@type": "Restaurant",
		name: input.name,
		description: input.description,
		...(input.phone ? { telephone: input.phone } : {}),
		...(input.address ? { address: input.address } : {}),
		...(input.lat !== undefined && input.lng !== undefined
			? { geo: { "@type": "GeoCoordinates", latitude: input.lat, longitude: input.lng } }
			: {}),
		...(input.hours ? { openingHours: input.hours } : {}),
		...(input.pricePerPerson ? { priceRange: input.pricePerPerson } : {}),
	})}</script>
  </head>
  <body>
  <div class="wrap">
   <header class="hero">
      <span class="cat">${category}</span>
      <h1>${name}</h1>
      <p>${description}</p>
   </header>

   <div class="facts">${rows.join("")}</div>

   <section>
      <h2>메뉴</h2>
      <ul class="menu">${menuItems}</ul>
   </section>

   <section class="agent">
      <h2>AI Agent Interface</h2>
      <p>이 매장은 MCP(Model Context Protocol)로도 열려 있습니다. AI 에이전트는 아래 매니페스트로 메뉴·영업시간 조회와 예약을 수행합니다.</p>
      <code>/.well-known/mcp.json</code>
   </section>

   <footer>Generated by muhanai 1-Click Factory · ${new Date().toISOString().slice(0, 10)}</footer>
  </div>
  </body>
  </html>
  `;
	}

	/**
	 * Spawns a new Hugo + MCP node bundle and assigns a deterministic/simulated IPFS CID
	 */
	async spawn(input: StoreFactoryInput): Promise<FactorySpawnResult> {
		const manifest = this.generateMcpManifest(input);
		const { store, menu } = this.generateStoreData(input);

		// Compute pseudo-deterministic CID for offline/dev speed
		const hashSeed = `${input.subdomain}-${Date.now()}`;
		let hash = 0;
		for (let i = 0; i < hashSeed.length; i++) {
			hash = (hash << 5) - hash + hashSeed.charCodeAt(i);
			hash |= 0;
		}
		const cleanHash = Math.abs(hash).toString(36);
		const cid =
			`bafybeikbizhub${cleanHash}${input.subdomain.replace(/[^a-z0-9]/gi, "").toLowerCase()}`.slice(
				0,
				46,
			);

		const websiteUrl = `https://${input.subdomain}.kbizhub.com`;
		const mcpUrl = `sse://mcp.muhanai.com/store/${input.subdomain}`;
		const cosmicStarId = `star-store-${input.subdomain}`;

		// Third surface: A2UI wire so an agent can render this store's UI directly.
		const surface = this.generateAgentSurface(input, menu.items);

		return {
			a2uiJsonl: surface.jsonl,
			success: true,
			subdomain: input.subdomain,
			cid,
			websiteUrl,
			mcpUrl,
			cosmicStarId,
			manifest,
			storeData: { store, menu },
			createdAt: new Date().toISOString(),
		};
	}
}

export const hugoMcpFactory = new HugoMcpFactory();
