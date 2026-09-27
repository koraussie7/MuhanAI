import type { FastifyInstance } from "fastify";
import { z } from "zod";

export const INSIGHT_CATEGORIES = ["news", "blog", "local"] as const;
export type InsightCategory = (typeof INSIGHT_CATEGORIES)[number];

const InsightQuerySchema = z.object({
	q: z.string().min(2).max(200),
	category: z.enum(INSIGHT_CATEGORIES).default("news"),
});

interface NaverItem {
	title: string;
	link: string;
	description: string;
	pubDate?: string;
	bloggername?: string;
	postdate?: string;
	address?: string;
	roadAddress?: string;
	category?: string;
}

interface NaverResponse {
	items?: NaverItem[];
	total?: number;
}

const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX_SIZE = 1000;
const cache = new Map<string, { expiresAt: number; data: VietnamInsightResponse }>();

function cacheSet(key: string, value: { expiresAt: number; data: VietnamInsightResponse }): void {
	if (cache.size >= CACHE_MAX_SIZE) {
		for (const [k, v] of cache) {
			if (v.expiresAt < Date.now()) {
				cache.delete(k);
			}
		}
	}
	if (cache.size >= CACHE_MAX_SIZE) {
		const oldestKey = cache.keys().next().value;
		if (oldestKey !== undefined) cache.delete(oldestKey);
	}
	cache.set(key, value);
}

export interface VietnamInsightItem {
	title: string;
	url: string;
	description: string;
	date: string | null;
	source: string;
	address?: string;
}

export interface VietnamInsightResponse {
	query: string;
	category: InsightCategory;
	items: VietnamInsightItem[];
	fetchedAt: string;
	configured: boolean;
	message?: string;
}

function stripHtml(value: string): string {
	return value
		.replace(/<[^>]*>/g, "")
		.replace(/&quot;/g, '"')
		.replace(/&amp;/g, "&")
		.trim();
}

function credentialsConfigured(): boolean {
	return Boolean(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);
}

function endpointFor(category: InsightCategory): string {
	if (category === "blog") return "blog";
	if (category === "local") return "local";
	return "news";
}

async function searchNaver(query: string, category: InsightCategory): Promise<NaverItem[]> {
	const endpoint = endpointFor(category);
	const url = new URL(`https://openapi.naver.com/v1/search/${endpoint}.json`);
	url.searchParams.set("query", query);
	url.searchParams.set("display", "8");
	if (category === "news") url.searchParams.set("sort", "date");
	const response = await fetch(url, {
		headers: {
			"X-Naver-Client-Id": process.env.NAVER_CLIENT_ID ?? "",
			"X-Naver-Client-Secret": process.env.NAVER_CLIENT_SECRET ?? "",
		},
		signal: AbortSignal.timeout(8_000),
	});
	if (!response.ok) throw new Error(`Naver search failed: ${response.status}`);
	const payload = (await response.json()) as NaverResponse;
	return payload.items ?? [];
}

function normalizeItems(items: NaverItem[], category: InsightCategory): VietnamInsightItem[] {
	return items.map((item) => ({
		title: stripHtml(item.title),
		url: item.link,
		description: stripHtml(item.description),
		date: item.pubDate ?? item.postdate ?? null,
		source: item.bloggername ?? (category === "local" ? "Naver 지역검색" : "Naver 검색"),
		...(item.address || item.roadAddress ? { address: item.roadAddress ?? item.address } : {}),
	}));
}

export async function vietnamRoutes(app: FastifyInstance): Promise<void> {
	app.get("/api/vietnam/insight", async (request, reply) => {
		const parse = InsightQuerySchema.safeParse(request.query);
		if (!parse.success) return reply.code(400).send({ error: "q must be at least 2 characters" });

		const { q, category } = parse.data;
		const cacheKey = `${category}:${q.toLowerCase()}`;
		const cached = cache.get(cacheKey);
		if (cached && cached.expiresAt > Date.now()) return cached.data;

		if (!credentialsConfigured()) {
			return {
				query: q,
				category,
				items: [],
				fetchedAt: new Date().toISOString(),
				configured: false,
				message: "Set NAVER_CLIENT_ID and NAVER_CLIENT_SECRET to enable live Vietnam insights.",
			};
		}

		try {
			const items = normalizeItems(await searchNaver(q, category), category);
			const result: VietnamInsightResponse = {
				query: q,
				category,
				items,
				fetchedAt: new Date().toISOString(),
				configured: true,
			};
			cacheSet(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data: result });
			return result;
		} catch (error) {
			request.log.warn({ err: error }, "Naver Vietnam insight search failed");
			return reply.code(502).send({ error: "Vietnam insight provider unavailable" });
		}
	});
}
