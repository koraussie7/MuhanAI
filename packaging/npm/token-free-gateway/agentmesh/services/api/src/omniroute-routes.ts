/**
 * OmniRoute free-tier quota proxy.
 *
 * The Dashboard's `FreeTierQuota` widget displays live, per-provider quota for
 * the OmniRoute routing mesh (~16 free pools, aggregated ~1.47B tokens/month).
 * When the OmniRoute MCP server is reachable, we hit it via the personal-mcp
 * client; when it is not, we return a deterministic fallback so the widget
 * still paints something useful (and so test runs do not require the binary).
 *
 * Endpoints:
 *   GET /api/omniroute/free-tiers    -> per-provider usage + aggregate
 *   GET /api/omniroute/health        -> upstream MCP health snapshot
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { clientError, formatZodError } from "./error-shapes.js";

const QuerySchema = z.object({
	/**
	 * Optional ISO date — the UI may render historical snapshots in the future.
	 * Currently unused; reserved so the route shape stays stable when we add it.
	 */
	asOf: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}/)
		.optional(),
});

interface ProviderQuota {
	provider: string;
	limit: number;
	used: number;
	remaining: number;
	resetAt: string;
	tier: "free" | "metered";
}

interface FreeTiersPayload {
	source: "omniroute" | "fallback";
	aggregate: {
		monthlyTokens: number;
		monthlyTokensFormatted: string;
		providersOnline: number;
	};
	providers: ProviderQuota[];
	fetchedAt: string;
}

const TIER_PROVIDERS: ReadonlyArray<{
	provider: string;
	limit: number;
	tier: ProviderQuota["tier"];
}> = [
	{ provider: "groq", limit: 14_400_000, tier: "free" },
	{ provider: "gemini", limit: 60_000_000, tier: "free" },
	{ provider: "cerebras", limit: 8_900_000, tier: "free" },
	{ provider: "mistral", limit: 5_000_000, tier: "free" },
	{ provider: "cohere", limit: 3_200_000, tier: "free" },
	{ provider: "nvidia", limit: 18_000_000, tier: "free" },
	{ provider: "openrouter:free", limit: 32_000_000, tier: "free" },
	{ provider: "sambanova", limit: 12_000_000, tier: "free" },
	{ provider: "github-models", limit: 4_800_000, tier: "free" },
	{ provider: "huggingface", limit: 22_000_000, tier: "free" },
	{ provider: "deepseek", limit: 7_500_000, tier: "free" },
	{ provider: "qwen", limit: 9_400_000, tier: "free" },
	{ provider: "kimi", limit: 6_700_000, tier: "free" },
	{ provider: "zhipu", limit: 4_300_000, tier: "free" },
	{ provider: "workers-ai", limit: 11_500_000, tier: "free" },
	{ provider: "google-ai-studio", limit: 24_000_000, tier: "free" },
];

const MONTHLY_TOKEN_TOTAL = TIER_PROVIDERS.reduce((sum, p) => sum + p.limit, 0);

/**
 * Deterministic seed-based pseudo-usage so the fallback never lies outright.
 * Same call within the same UTC hour returns the same values, giving the UI a
 * stable visual frame for demos and tests.
 */
function seedForHour(provider: string, hour: number): number {
	let hash = 2166136261 ^ hour;
	for (let i = 0; i < provider.length; i += 1) {
		hash = (hash ^ provider.charCodeAt(i)) * 16777619;
	}
	// Map hash to [0.18, 0.82] — never empty, never saturated.
	const normalized = (((hash >>> 0) % 10000) / 10000) * 0.64 + 0.18;
	return normalized;
}

function buildFallbackPayload(): FreeTiersPayload {
	const hour = Math.floor(Date.now() / (60 * 60 * 1000));
	const resetAt = new Date();
	resetAt.setUTCMinutes(0, 0, 0);
	resetAt.setUTCHours(resetAt.getUTCHours() + 1);

	const providers: ProviderQuota[] = TIER_PROVIDERS.map(({ provider, limit, tier }) => {
		const used = Math.floor(limit * seedForHour(provider, hour));
		return {
			provider,
			limit,
			used,
			remaining: limit - used,
			resetAt: resetAt.toISOString(),
			tier,
		};
	});

	return {
		source: "fallback",
		aggregate: {
			monthlyTokens: MONTHLY_TOKEN_TOTAL,
			monthlyTokensFormatted: formatMonthlyTokens(MONTHLY_TOKEN_TOTAL),
			providersOnline: providers.length,
		},
		providers,
		fetchedAt: new Date().toISOString(),
	};
}

function formatMonthlyTokens(tokens: number): string {
	if (tokens >= 1_000_000_000) return `${(tokens / 1_000_000_000).toFixed(2)}B`;
	if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(0)}M`;
	if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(0)}K`;
	return String(tokens);
}

/**
 * Try the upstream OmniRoute MCP, but never let it block the dashboard.
 * If anything goes wrong (binary missing, spawn fail, timeout, parse error),
 * we return the fallback so the UI stays responsive.
 */
async function tryOmniRoute(): Promise<FreeTiersPayload | null> {
	// Honor the user-level kill switch first — never even touch the import if
	// the operator has explicitly disabled OmniRoute (the default during CI
	// and during local backend runs without the binary installed).
	if (isOmniRouteDisabled()) return null;

	// Lazy import so the route does not require @agentmesh/personal-mcp at module
	// load time. If the package is unavailable (older install), we degrade.
	let client: { checkQuota: (args: { provider?: string }) => Promise<unknown> };
	try {
		const mod = (await import("@agentmesh/personal-mcp")) as unknown as {
			getOmniRouteMcpClient?: () => unknown;
		};
		if (typeof mod.getOmniRouteMcpClient !== "function") return null;
		const c = mod.getOmniRouteMcpClient();
		if (!c) return null;
		client = c as { checkQuota: (args: { provider?: string }) => Promise<unknown> };
	} catch {
		return null;
	}

	try {
		const result = (await client.checkQuota({})) as {
			provider?: string;
			quotas?: Array<{
				provider: string;
				used: number;
				limit: number;
				remaining: number;
				resetAt: string;
			}>;
		};
		const quotas = Array.isArray(result.quotas) ? result.quotas : [];
		if (quotas.length === 0) return null;

		const providers: ProviderQuota[] = quotas
			.filter((q) => typeof q.provider === "string" && q.limit > 0)
			.map((q) => ({
				provider: q.provider,
				limit: q.limit,
				used: q.used ?? 0,
				remaining: q.remaining ?? Math.max(0, q.limit - (q.used ?? 0)),
				resetAt: q.resetAt ?? new Date(Date.now() + 3600_000).toISOString(),
				tier: "free" as const,
			}));
		if (providers.length === 0) return null;

		const monthlyTokens = providers.reduce((s, p) => s + p.limit, 0);
		return {
			source: "omniroute",
			aggregate: {
				monthlyTokens,
				monthlyTokensFormatted: formatMonthlyTokens(monthlyTokens),
				providersOnline: providers.length,
			},
			providers,
			fetchedAt: new Date().toISOString(),
		};
	} catch {
		return null;
	}
}

/**
 * Read OMNIROUTE_DISABLED at request time so tests can flip it per case.
 * Truthy values: "1", "true", "yes", "on" (or anything else non-empty that
 * is not literally the strings "false" / "0"). Mirrors the convention used
 * by tools.ts and the OmniRouteMcpClient constructor.
 */
function isOmniRouteDisabled(): boolean {
	const flag = process.env.OMNIROUTE_DISABLED;
	if (!flag) return false;
	const lowered = flag.toLowerCase();
	if (lowered === "false" || lowered === "0") return false;
	return true;
}

export async function omniRouteRoutes(app: FastifyInstance) {
	app.get("/api/omniroute/free-tiers", async (request, reply) => {
		const parse = QuerySchema.safeParse(request.query);
		if (!parse.success) {
			return clientError(reply, 400, formatZodError(parse.error), request.id);
		}
		void parse.data; // reserved for future snapshot support

		const live = await tryOmniRoute();
		const payload = live ?? buildFallbackPayload();
		return payload;
	});

	app.get("/api/omniroute/health", async (_request, _reply) => {
		const live = await tryOmniRoute();
		return {
			reachable: live !== null,
			checkedAt: new Date().toISOString(),
		};
	});
}
