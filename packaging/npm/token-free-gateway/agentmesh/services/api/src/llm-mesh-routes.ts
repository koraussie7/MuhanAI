/**
 * LLM Mesh & Gateway route.
 *
 * Single GET endpoint that returns the snapshot consumed by the TASK-C
 * `LlmMeshPage` component via `createHttpAdapter("/api/llm-mesh")`. The
 * response shape mirrors `LlmMeshSnapshot` from
 * `apps/web/src/components/harvest/C/LlmMeshPage.tsx` — keep them in sync
 * if you change one.
 *
 * Latency numbers are jittered each request so the UI's 30-second refresh
 * shows believable movement without a real provider ping. Replace with a
 * real provider-health probe when one is available.
 */

import type { FastifyInstance } from "fastify";

interface GatewayProvider {
	name: string;
	status: "healthy" | "degraded" | "offline";
	latencyMs: number;
	costTier: "free" | "low" | "paid";
}

interface LlmMeshRoute {
	provider: string;
	latencyMs: number;
	costTier: "free" | "low" | "paid";
	status: "optimal" | "acceptable" | "degraded";
}

interface LlmMeshVaultEntry {
	name: string;
	quota: number;
	used: number;
}

interface LlmMeshSnapshot {
	gateways: GatewayProvider[];
	routes: LlmMeshRoute[];
	vault: LlmMeshVaultEntry[];
}

const GATEWAYS: ReadonlyArray<Omit<GatewayProvider, "latencyMs">> = [
	{ name: "Gemini", status: "healthy", costTier: "low" },
	{ name: "Claude", status: "healthy", costTier: "paid" },
	{ name: "GPT", status: "healthy", costTier: "paid" },
	{ name: "Mistral", status: "degraded", costTier: "low" },
	{ name: "Groq", status: "healthy", costTier: "low" },
	{ name: "Cerebras", status: "healthy", costTier: "low" },
	{ name: "OpenRouter", status: "healthy", costTier: "paid" },
	{ name: "FreeLLMAPI", status: "healthy", costTier: "free" },
	{ name: "LocalAI", status: "healthy", costTier: "free" },
	{ name: "Ollama", status: "healthy", costTier: "free" },
	{ name: "WebLLM", status: "healthy", costTier: "free" },
];

const ROUTES: ReadonlyArray<Omit<LlmMeshRoute, "latencyMs" | "status">> = [
	{ provider: "WebLLM (Local)", costTier: "free" },
	{ provider: "P2P Mesh Node", costTier: "free" },
	{ provider: "FreeLLMAPI", costTier: "free" },
	{ provider: "Groq LPU", costTier: "low" },
	{ provider: "Anthropic Claude", costTier: "paid" },
];

const VAULT: ReadonlyArray<LlmMeshVaultEntry> = [
	{ name: "openai", quota: 1000, used: 412 },
	{ name: "anthropic", quota: 500, used: 188 },
	{ name: "gemini", quota: 1500, used: 720 },
	{ name: "groq", quota: 800, used: 96 },
];

function jitter(base: number, spread: number): number {
	return Math.max(1, Math.round(base + (Math.random() - 0.5) * 2 * spread));
}

function statusFor(provider: string): LlmMeshRoute["status"] {
	const gw = GATEWAYS.find((g) => provider.startsWith(g.name));
	if (!gw) return "acceptable";
	if (gw.status === "degraded") return "degraded";
	if (gw.status === "offline") return "degraded";
	return "optimal";
}

export async function llmMeshRoutes(app: FastifyInstance) {
	app.get("/api/llm-mesh", async (_request, _reply) => {
		const gateways: GatewayProvider[] = GATEWAYS.map((g) => ({
			...g,
			latencyMs: statusFor(g.name) === "degraded" ? jitter(420, 200) : jitter(180, 80),
		}));
		const routes: LlmMeshRoute[] = ROUTES.map((r) => {
			const latencyBase = r.provider.startsWith("WebLLM")
				? 18
				: r.provider.startsWith("P2P")
					? 34
					: r.provider.startsWith("FreeLLMAPI")
						? 192
						: r.provider.startsWith("Groq")
							? 148
							: 820;
			return {
				...r,
				latencyMs: jitter(latencyBase, latencyBase * 0.2),
				status: statusFor(r.provider),
			};
		});
		return { gateways, routes, vault: VAULT } satisfies LlmMeshSnapshot;
	});
}
