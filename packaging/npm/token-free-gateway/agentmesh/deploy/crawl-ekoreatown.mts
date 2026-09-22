/**
 * ekoreatown.net → MCP-able store catalogue crawler.
 *
 * Crawls the public business listings under /home/b/<category>[/<id>] and emits
 * a single stores.json that the MuhanAI factory can turn into MCP bundles
 * (index.html + .well-known/mcp.json + a2ui/surface.jsonl per store).
 *
 * READ-ONLY and polite: one request at a time with a delay between them, no
 * concurrency, no auth bypass. Result lands in deploy/.ekoreatown/stores.json.
 *
 * Usage (from packaging/npm/token-free-gateway/agentmesh):
 *   bun run deploy/crawl-ekoreatown.mts                 # all categories
 *   bun run deploy/crawl-ekoreatown.mts --detail        # also fetch each detail page
 *   bun run deploy/crawl-ekoreatown.mts --category spa  # one category
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "https://ekoreatown.net:49075";
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, ".ekoreatown");

/** Listing categories observed on the site (counts recorded in the run log). */
const CATEGORIES = [
	"sidedish",
	"koreafood",
	"yellowpage",
	"korearestaurant",
	"spa",
	"shop",
	"localfood",
	"koreanfood",
	"koreashop",
	"service",
];

const DELAY_MS = Number(process.env.EK_DELAY_MS ?? 700);
const FETCH_DETAIL = process.argv.includes("--detail");
const onlyCategory = (() => {
	const i = process.argv.indexOf("--category");
	return i >= 0 ? process.argv[i + 1] : undefined;
})();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string): Promise<string | null> {
	try {
		const res = await fetch(url, {
			headers: { "user-agent": "MuhanAI-Catalogue-Crawler/1.0 (+https://muhanai.com)" },
			signal: AbortSignal.timeout(25000),
		});
		if (!res.ok) return null;
		return await res.text();
	} catch {
		return null;
	}
}

const decode = (s: string) =>
	s
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/\s+/g, " ")
		.trim();

export interface CrawledStore {
	category: string;
	id: string;
	name: string;
	itemName?: string;
	price?: string;
	storeName?: string;
	url: string;
	description?: string;
	phone?: string;
	address?: string;
}

/**
 * Parse a listing page into {id, name} pairs.
 *
 * Handles both business directory cards and food item cards:
 *   - Business card: data-subject="상호명" or card-body h5 has store name.
 *   - Food item card (sidedish/koreafood): card-body h5 has menu item name,
 *     price is in card-body (₫ xxx,xxx), and store name is in card-footer h5.
 */
function parseListing(category: string, html: string): CrawledStore[] {
	const stores = new Map<string, CrawledStore>();

	const cards = html.split(/<div class="card"\s+id="item-(\d+)">/);
	for (let i = 1; i < cards.length; i += 2) {
		const id = cards[i];
		const body = cards[i + 1] ?? "";
		if (!id || stores.has(id)) continue;

		let name = "";
		let itemName: string | undefined;
		let storeName: string | undefined;
		let price: string | undefined;

		const subject = body.match(/data-subject="([^"]+)"/);
		if (subject?.[1]) {
			name = decode(subject[1]);
		}

		// Check card-body h5
		const bodyH5 = body.match(/<div class="card-body[^>]*>[\s\S]*?<a[^>]*>\s*<h5>([^<]+)<\/h5>/i);
		const title = bodyH5?.[1] ? decode(bodyH5[1]) : "";

		// Check card-footer for store name (common in sidedish/koreafood)
		const footerH5 = body.match(
			/<div class="card-footer[^>]*>[\s\S]*?<h5>(?:<span[^>]*>)?([^<]+)/i,
		);
		if (footerH5?.[1]) {
			storeName = decode(footerH5[1]).trim();
		}

		// Check price
		const priceMatch = body.match(/₫\s*([\d,]+)/);
		if (priceMatch?.[1]) {
			price = `₫${priceMatch[1]}`;
		}

		if (name) {
			// data-subject was present (business listings)
			if (title && title !== name) itemName = title;
		} else if (storeName && title) {
			// Item card with associated store: use Store (Item) or Store name
			name = storeName ? `${storeName} - ${title}` : title;
			itemName = title;
		} else if (title) {
			name = title;
		} else {
			// Fallback text search
			for (const m of body.matchAll(/>([^<>{}]{2,60})</g)) {
				const candidate = decode(m[1] ?? "");
				if (candidate.length < 2) continue;
				if (/^[\d\s.,:;()-]+$/.test(candidate)) continue;
				if (/^(메뉴|로그인|구독|전체|더보기|홈|배달만 가능|배달가능|영업중)$/.test(candidate))
					continue;
				name = candidate;
				break;
			}
		}

		if (!name || /^(메뉴|로그인|구독|전체|더보기|홈|배달만 가능|배달가능|영업중)$/.test(name))
			continue;

		stores.set(id, {
			category,
			id,
			name,
			...(itemName ? { itemName } : {}),
			...(storeName ? { storeName } : {}),
			...(price ? { price } : {}),
			url: `${BASE}/home/b/${category}/${id}`,
		});
	}
	return [...stores.values()];
}

/** Enrich one store with the fields a storefront/MCP manifest needs. */
function parseDetail(html: string, base: CrawledStore): CrawledStore {
	const out: CrawledStore = { ...base };

	const h2 = html.match(/<h2[^>]*class="text-uppercase"[^>]*>([^<]+)<\/h2>/i);
	if (h2?.[1] && decode(h2[1]).length > 1) out.name = decode(h2[1]);

	const desc = html.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"/i);
	if (desc?.[1]) out.description = decode(desc[1]).slice(0, 400);

	const phone = html.match(/(0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4})/);
	if (phone?.[1]) out.phone = phone[1].trim();

	const addr = html.match(/(?:주소|Address)\s*[:：]?\s*([^<>{}]{8,90})/i);
	if (addr?.[1]) out.address = decode(addr[1]);

	return out;
}

// ------------------------------------------------------------------ crawl ---
const categories = onlyCategory ? [onlyCategory] : CATEGORIES;
const all: CrawledStore[] = [];
const report: Record<string, number> = {};

for (const category of categories) {
	process.stdout.write(`[crawl] ${category} … `);
	const html = await get(`${BASE}/home/b/${category}`);
	if (!html) {
		console.log("unreachable");
		report[category] = 0;
		continue;
	}
	let stores = parseListing(category, html);
	console.log(`${stores.length} stores`);
	report[category] = stores.length;

	if (FETCH_DETAIL) {
		const enriched: CrawledStore[] = [];
		for (const s of stores) {
			await sleep(DELAY_MS);
			const detail = await get(s.url);
			enriched.push(detail ? parseDetail(detail, s) : s);
		}
		stores = enriched;
	}

	all.push(...stores);
	await sleep(DELAY_MS);
}

mkdirSync(OUT_DIR, { recursive: true });
const outPath = join(OUT_DIR, "stores.json");
writeFileSync(
	outPath,
	JSON.stringify(
		{
			source: "https://ekoreatown.net:49075",
			crawledAt: new Date().toISOString(),
			detailFetched: FETCH_DETAIL,
			counts: report,
			total: all.length,
			stores: all,
		},
		null,
		2,
	),
);

console.log(`\n[crawl] total ${all.length} stores -> ${outPath}`);
for (const [c, n] of Object.entries(report)) console.log(`  ${c.padEnd(16)} ${n}`);
