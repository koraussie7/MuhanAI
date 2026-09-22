/**
 * Shopping Truth Agent bridge routes.
 *
 * Bridges the Python `shopping-agent-marketplace` agent (MIT, github.com/
 * sujalmanpara/shopping-agent-marketplace) into MuhanAI as an HTTP API:
 *
 *   POST /api/shopping/analyze   — run a full product analysis (async job)
 *   GET  /api/shopping/analyze/:id — fetch job status/result
 *
 * The agent itself is NOT vendored here. It runs as a separate Python process
 * (see SHOPPING_AGENT_URL below) that this route calls over HTTP. The agent
 * side wrapper is a thin FastAPI/uvicorn exposing the repo's
 * `agent.executor.execute()` as `POST /analyze` with an SSE event stream.
 *
 * Contracts (mir the agent's event schema):
 *   { event: "status",  data: { message, percent? } }
 *   { event: "result",  data: { verdict, product, price, trustScore, ... } }
 *
 * Jobs are held in memory on purpose — an analysis is cheap and the caller
 * polls by id. Restart loses in-flight jobs, which is acceptable for the
 * current single-process deployment.
 */

import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { clientError } from "./error-shapes.js";

/** Base URL of the Python agent wrapper. Unset → the bridge runs degraded. */
function agentUrl(): string {
	return process.env.SHOPPING_AGENT_URL ?? "";
}

/** Analysis timeout — the agent's own pipeline takes 5–15 s; leave headroom. */
const AGENT_TIMEOUT_MS = Number(process.env.SHOPPING_AGENT_TIMEOUT_MS ?? 60_000);

type JobStatus = "queued" | "running" | "completed" | "failed";

interface ShoppingJob {
	id: string;
	url: string;
	status: JobStatus;
	/** SSE events streamed back by the agent (status + result). */
	events: Array<{ event: string; data: unknown; at: string }>;
	result: Record<string, unknown> | null;
	error: string | null;
	createdAt: string;
}

/** Analyzed products, keyed by job id. Newest first when listed. */
const jobs = new Map<string, ShoppingJob>();

/** Cap memory: keep the most recent 200 jobs. */
const JOB_LIMIT = 200;

/** Exposed for tests so each case starts from a known registry state. */
export function resetShoppingJobs(): void {
	jobs.clear();
}

const AMAZON_URL_PATTERN =
	/^https?:\/\/(?:www\.)?amazon\.(?:com|co\.uk|de|in|co\.jp|ca|com\.au|it|es|fr)\/(?:.*\/)?(?:dp|gp\/product)\/[A-Z0-9]{10}/i;

export function isValidAmazonUrl(url: string): boolean {
	return AMAZON_URL_PATTERN.test(url.trim());
}

async function callAgent(job: ShoppingJob): Promise<void> {
	job.status = "running";
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), AGENT_TIMEOUT_MS);
		try {
			const res = await fetch(`${agentUrl().replace(/\/+$/, "")}/analyze`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ url: job.url }),
				signal: controller.signal,
			});
			if (!res.ok || !res.body) {
				throw new Error(`agent responded ${res.status}`);
			}
			// The wrapper streams newline-delimited JSON events (one per line).
			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";
				for (const line of lines) {
					const trimmed = line.trim();
					if (!trimmed) continue;
					try {
						const event = JSON.parse(trimmed) as { event: string; data: unknown };
						job.events.push({ ...event, at: new Date().toISOString() });
						if (event.event === "result" && event.data && typeof event.data === "object") {
							job.result = event.data as Record<string, unknown>;
						}
					} catch {
						/* ignore malformed lines */
					}
				}
			}
	} finally {
			clearTimeout(timer);
	}
		job.status = job.result ? "completed" : "failed";
		if (job.status === "failed") job.error = "agent stream ended without a result event";
	} catch (e) {
		job.status = "failed";
		job.error = e instanceof Error ? e.message : "agent call failed";
	}
}

export async function shoppingRoutes(app: FastifyInstance) {
	app.post("/api/shopping/analyze", async (request, reply) => {
		if (!agentUrl()) {
			return clientError(
				reply,
				503,
				"shopping agent not configured — set SHOPPING_AGENT_URL",
				request.id,
			);
	}
		const body = (request.body ?? {}) as { url?: unknown };
		const url = typeof body.url === "string" ? body.url.trim() : "";
		if (!url) {
			return clientError(reply, 400, "url: required", request.id);
	}
		if (!isValidAmazonUrl(url)) {
			return clientError(reply, 400, "url: must be an Amazon product URL (dp or gp/product)", request.id);
	}

		const job: ShoppingJob = {
			id: `sa-${randomUUID().slice(0, 8)}`,
			url,
			status: "queued",
			events: [],
			result: null,
			error: null,
			createdAt: new Date().toISOString(),
	};
		jobs.set(job.id, job);
		if (jobs.size > JOB_LIMIT) {
			const oldest = jobs.keys().next().value;
			if (oldest) jobs.delete(oldest);
	}

	// Fire-and-forget: the caller polls GET /api/shopping/analyze/:id.
		void callAgent(job);
		return reply.code(202).send({ id: job.id, status: job.status });
	});

	app.get("/api/shopping/analyze/:id", async (request, reply) => {
		const { id } = request.params as { id: string };
		const job = jobs.get(id);
		if (!job) {
			return clientError(reply, 404, "not found", request.id);
	}
		return {
			id: job.id,
			url: job.url,
			status: job.status,
			error: job.error,
			result: job.result,
	};
	});
}
