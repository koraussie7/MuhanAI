/**
 * 1-Click Factory routes — spawns and lists business nodes.
 *
 * The web UI (apps/web/src/pages/resources/FactoryPage.tsx) drives this:
 *   GET  /api/factory/sites  — nodes already spawned in this process
 *   POST /api/factory/spawn  — render a storefront bundle + register the node
 *
 * The heavy lifting lives in `@agentmesh/mcp`'s `hugoMcpFactory`, which emits
 * the three surfaces of a business node (human HTML, MCP manifest, A2UI wire).
 * This module is the HTTP + registry shell around it.
 *
 * Storage is in-memory on purpose: a spawn is cheap and the durable copy is
 * the IPFS bundle. Persisting the registry (surviving a restart) is a separate
 * concern from "does the API exist".
 */

import { hugoMcpFactory, type StoreFactoryInput } from "@agentmesh/mcp";
import type { FastifyInstance } from "fastify";

/** A node this process has spawned. Mirrors `SpawnedSite` in the web app. */
export interface FactorySite {
	name: string;
	success: boolean;
	subdomain: string;
	cid: string;
	websiteUrl: string;
	mcpUrl: string;
	cosmicStarId: string;
	/** A2UI JSONL wire for the store menu surface (agent-renderable UI). */
	a2uiJsonl: string;
	createdAt: string;
}

interface SpawnBody {
	name?: string;
	subdomain?: string;
	category?: string;
	description?: string;
	phone?: string;
	address?: string;
	hours?: string;
}

/**
 * Default menu used when a spawn request carries no `items`.
 *
 * A storefront with an empty menu renders an empty DataTable, which is a worse
 * first impression than an obviously-placeholder one. Callers that have real
 * menu data pass `items` and none of this is used.
 */
const DEFAULT_ITEMS: StoreFactoryInput["items"] = [
	{ name: "대표 메뉴", price: 15000, description: "매장에서 직접 확인해 주세요" },
];

/** Subdomains become DNS labels — keep them to a safe, lowercase character set. */
const SUBDOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Reserved labels that must never be assignable to a tenant. */
const RESERVED_SUBDOMAINS = new Set(["www", "api", "mcp", "admin", "mail", "static", "cdn"]);

/** Spawned nodes, keyed by subdomain. Newest first when listed. */
const sites = new Map<string, FactorySite>();

/** Exposed for tests so each case starts from a known registry state. */
export function resetFactorySites(): void {
	sites.clear();
}

export async function factoryRoutes(app: FastifyInstance) {
	app.get("/api/factory/sites", async () => {
		const list = [...sites.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
		return { total: list.length, sites: list };
	});

	app.post<{ Body: SpawnBody }>("/api/factory/spawn", async (request, reply) => {
		const name = request.body?.name?.trim();
		const subdomain = request.body?.subdomain?.trim().toLowerCase();
		if (!name || !subdomain) {
			return reply.code(400).send({ error: "name and subdomain are required" });
		}
		if (!SUBDOMAIN_PATTERN.test(subdomain)) {
			return reply.code(400).send({
				error: "subdomain_invalid",
				message: "소문자·숫자·하이픈만 사용할 수 있습니다 (최대 63자).",
			});
		}
		if (RESERVED_SUBDOMAINS.has(subdomain)) {
			return reply.code(409).send({ error: "subdomain_reserved" });
		}
		if (sites.has(subdomain)) {
			return reply.code(409).send({ error: "subdomain_taken" });
		}

		try {
			const result = await hugoMcpFactory.spawn({
				name,
				subdomain,
				category: request.body?.category?.trim() || "일반",
				description: request.body?.description?.trim() || `${name} 공식 사이트`,
				...(request.body?.phone?.trim() ? { phone: request.body.phone.trim() } : {}),
				...(request.body?.address?.trim() ? { address: request.body.address.trim() } : {}),
				...(request.body?.hours?.trim() ? { hours: request.body.hours.trim() } : {}),
				items: DEFAULT_ITEMS,
			});

			const site: FactorySite = {
				name,
				success: result.success,
				subdomain: result.subdomain,
				cid: result.cid,
				websiteUrl: result.websiteUrl,
				mcpUrl: result.mcpUrl,
				cosmicStarId: result.cosmicStarId,
				a2uiJsonl: result.a2uiJsonl,
				createdAt: result.createdAt,
			};
			sites.set(subdomain, site);
			return reply.code(201).send(site);
		} catch (error) {
			return reply.code(500).send({
				error: "spawn_failed",
				message: error instanceof Error ? error.message : "Factory spawn failed",
			});
		}
	});

	// Pythia proxy for store-specific Python tasks via the Token-Free Gateway.
	// POST /api/factory/sites/:subdomain/pythia
	app.post<{ Params: { subdomain: string }; Body: SpawnBody & { prompt: string } }>(
		"/api/factory/sites/:subdomain/pythia",
		async (request, reply) => {
			const site = sites.get(request.params.subdomain);
			if (!site) {
				return reply.code(404).send({ error: "store_not_found" });
			}
			const prompt = request.body?.prompt?.trim();
			if (!prompt) {
				return reply.code(400).send({ error: "prompt is required" });
			}
			try {
				const { pythiaA2uiCall } = await import("./pythia-a2ui-service.js");
				const result = await pythiaA2uiCall({
					prompt: `[STORE:${site.subdomain}] ${prompt}`,
					file: "app.py",
					system: `You are coding for the store ${site.name}. Provide Python code solutions.`,
				});
				return {
					subdomain: site.subdomain,
					name: site.name,
					cid: site.cid,
					...result,
				};
			} catch (err) {
				return reply.code(502).send({ error: "pythia_call_failed", message: err instanceof Error ? err.message : String(err) });
			}
		}
	);
}
