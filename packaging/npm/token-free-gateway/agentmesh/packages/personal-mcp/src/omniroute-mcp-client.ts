/**
 * OmniRoute stdio MCP client for MuhanAI Personal MCP.
 *
 * Wraps a curated subset of OmniRoute's 30+ MCP tools over stdio JSON-RPC.
 * Exposed tools (the ones MuhanAI agents actually use day-to-day):
 *
 *   - omniroute_completion   — chat completion through OmniRoute routing (or `auto`)
 *   - omniroute_list_models  — browse the 356-provider / 1,312+ model catalog
 *   - omniroute_check_quota  — remaining free-tier quota per provider
 *   - omniroute_web_search   — multi-provider web search with automatic failover
 *   - omniroute_web_fetch    — URL extraction (markdown/html/screenshot)
 *   - omniroute_get_health   — server health, circuit breakers, rate limits
 *
 * Spawns `omniroute-mcp-server` as a subprocess and speaks the MCP stdio
 * transport (newline-delimited JSON-RPC). Falls back gracefully when the
 * binary is missing — agents should never crash because of an optional tool.
 *
 * Hound's pattern (see hound-mcp-client.ts) is reused verbatim; only the
 * tool names, argument shapes, and result parsers differ.
 */

import { spawn as defaultChildSpawn } from "node:child_process";
import type { Readable, Writable } from "node:stream";

export type OmniRouteChildProcess = ReturnType<typeof defaultChildSpawn>;

export interface OmniRouteMcpClientOptions {
	/** Command to invoke. Defaults to `omniroute-mcp-server` (the npm bin). */
	command?: string;
	/** Args passed before MCP framing (e.g. `--config /etc/omniroute.json`). */
	args?: string[];
	/** Per-request timeout in ms. Defaults to 30 s. */
	timeoutMs?: number;
	/** Extra env vars (e.g. OMNIROUTE_API_KEY). Merged over process.env. */
	env?: Record<string, string>;
	/** Dependency injection seam for tests. */
	spawnFn?: (command: string, args: string[]) => OmniRouteChildProcess;
}

export interface OmniRouteChatMessage {
	role: "system" | "user" | "assistant" | "tool";
	content: string;
}

export interface OmniRouteCompletionArgs {
	/** Model name (e.g. `claude-opus-4`) or `auto` for combo-driven routing. */
	model: string;
	/** Conversation messages. At least one `user` message required. */
	messages: OmniRouteChatMessage[];
	/** Optional combo id from `omniroute_list_combos`. */
	combo?: string;
	/** Optional max dollar budget for this single request. */
	budget?: number;
	/** Optional role hint for routing (e.g. `coding`, `summarize`). */
	role?: string;
}

export interface OmniRouteCompletionResult {
	content: string;
	model: string;
	tokens: { prompt: number; completion: number };
	routing: {
		provider: string;
		combo: string | null;
		fallbacksTriggered: number;
		cost: number;
		latencyMs: number;
		routingExplanation: string;
	};
}

export interface OmniRouteModelEntry {
	id: string;
	provider?: string;
	name?: string;
	capability?: string;
	contextWindow?: number;
	supportsTools?: boolean;
	supportsVision?: boolean;
	supportsJsonMode?: boolean;
	inputCostPer1k?: number;
	outputCostPer1k?: number;
}

export interface OmniRouteModelCatalog {
	models: OmniRouteModelEntry[];
	providers?: string[];
	capabilities?: string[];
}

export interface OmniRouteQuotaEntry {
	provider: string;
	connectionId?: string;
	used?: number;
	limit?: number;
	remaining?: number;
	resetAt?: string;
}

export interface OmniRouteQuotaResult {
	provider?: string;
	connectionId?: string;
	quotas: OmniRouteQuotaEntry[];
}

export interface OmniRouteSearchResult {
	title: string;
	url: string;
	snippet: string;
	source?: string;
	position?: number;
	publishedAt?: string;
}

export interface OmniRouteWebSearchResult {
	results: OmniRouteSearchResult[];
	provider?: string;
	query: string;
}

export interface OmniRouteWebFetchResult {
	url: string;
	finalUrl?: string;
	content?: string;
	markdown?: string;
	html?: string;
	links?: Array<{ text: string; url: string }>;
	screenshot?: { mimeType: string; bytes: Uint8Array };
	metadata?: Record<string, unknown>;
}

export interface OmniRouteHealthResult {
	uptime: string;
	version: string;
	memoryUsage?: { heapUsed: number; heapTotal: number };
	circuitBreakers?: unknown[];
	rateLimits?: unknown[];
	cacheStats?: { hits: number; misses: number; hitRate: number };
	degraded?: Array<{ source: string; error: string }>;
}

/** Loose shape of a MCP tools/call response — content blocks are flattened. */
interface McpCallResult {
	content?: Array<{ type: string; text?: string; data?: string }>;
	isError?: boolean;
	[key: string]: unknown;
}

interface JsonRpcResponse<T = unknown> {
	jsonrpc: "2.0";
	id: number | string | null;
	result?: T;
	error?: { code: number; message: string; data?: unknown };
}

export class OmniRouteUnavailableError extends Error {
	override readonly cause?: unknown;
	constructor(message: string, cause?: unknown) {
		super(message);
		this.name = "OmniRouteUnavailableError";
		this.cause = cause;
	}
}

export class OmniRouteCallError extends Error {
	override readonly name = "OmniRouteCallError";
	readonly toolName: string;
	readonly upstreamError?: unknown;
	constructor(message: string, toolName: string, upstreamError?: unknown) {
		super(message);
		this.toolName = toolName;
		this.upstreamError = upstreamError;
	}
}

export class OmniRouteMcpClient {
	private readonly command: string;
	private readonly args: string[];
	private readonly timeoutMs: number;
	private readonly env: Record<string, string>;
	private readonly spawnFn: (command: string, args: string[]) => OmniRouteChildProcess;

	/** Lazily spawned subprocess. null until the first call. */
	private proc: OmniRouteChildProcess | null = null;
	/** Pending responses keyed by request id (counter). */
	private readonly pending = new Map<
		number,
		{
			resolve: (value: unknown) => void;
			reject: (err: unknown) => void;
			timer: ReturnType<typeof setTimeout>;
		}
	>();
	private nextId = 1;
	private initialized = false;
	/** Buffered partial lines from stdout. */
	private stdoutBuf = "";
	/** Buffered partial lines from stderr (logged but not surfaced). */
	private stderrBuf = "";

	constructor(opts: OmniRouteMcpClientOptions = {}) {
		this.command = opts.command ?? defaultCommandFromEnv();
		this.args = opts.args ?? defaultArgsFromEnv();
		this.timeoutMs = opts.timeoutMs ?? 30_000;
		this.env = {
			...defaultEnvFromProcess(),
			...opts.env,
		};
		this.spawnFn = opts.spawnFn ?? ((cmd, args) => defaultChildSpawn(cmd, args));
	}

	get isAvailable(): boolean {
		return this.command.length > 0 && (this.proc !== null || this.canSpawn());
	}

	private canSpawn(): boolean {
		// Cheap pre-flight — we let spawn() itself fail at first call so we get
		// a meaningful ENOENT. isAvailable is best-effort.
		return this.command.length > 0;
	}

	async completion(args: OmniRouteCompletionArgs): Promise<OmniRouteCompletionResult> {
		const raw = await this.callTool("omniroute_route_request", {
			model: args.model,
			messages: args.messages,
			combo: args.combo,
			budget: args.budget,
			role: args.role,
		});
		return parseCompletion(raw);
	}

	async listModels(
		opts: { provider?: string; capability?: string } = {},
	): Promise<OmniRouteModelCatalog> {
		const args: Record<string, unknown> = {};
		if (opts.provider) args.provider = opts.provider;
		if (opts.capability) args.capability = opts.capability;
		const raw = await this.callTool("omniroute_list_models_catalog", args);
		return parseModelCatalog(raw);
	}

	async checkQuota(
		opts: { provider?: string; connectionId?: string } = {},
	): Promise<OmniRouteQuotaResult> {
		const args: Record<string, unknown> = {};
		if (opts.provider) args.provider = opts.provider;
		if (opts.connectionId) args.connectionId = opts.connectionId;
		const raw = await this.callTool("omniroute_check_quota", args);
		return parseQuota(raw);
	}

	async webSearch(
		query: string,
		opts: { maxResults?: number; provider?: string; searchType?: "web" | "news" } = {},
	): Promise<OmniRouteWebSearchResult> {
		const args: Record<string, unknown> = {
			query,
			max_results: opts.maxResults ?? 5,
		};
		if (opts.provider) args.provider = opts.provider;
		if (opts.searchType) args.search_type = opts.searchType;
		const raw = await this.callTool("omniroute_web_search", args);
		return parseWebSearch(raw, query);
	}

	async webFetch(
		url: string,
		opts: {
			provider?: string;
			format?: "markdown" | "html" | "links" | "screenshot";
			includeMetadata?: boolean;
			depth?: number;
			waitForSelector?: string;
		} = {},
	): Promise<OmniRouteWebFetchResult> {
		const args: Record<string, unknown> = {
			url,
			format: opts.format ?? "markdown",
			include_metadata: opts.includeMetadata ?? false,
		};
		if (opts.provider) args.provider = opts.provider;
		if (typeof opts.depth === "number") args.depth = opts.depth;
		if (opts.waitForSelector) args.wait_for_selector = opts.waitForSelector;
		const raw = await this.callTool("omniroute_web_fetch", args);
		return parseWebFetch(raw, url);
	}

	async getHealth(): Promise<OmniRouteHealthResult> {
		const raw = await this.callTool("omniroute_get_health", {});
		return parseHealth(raw);
	}

	async close(): Promise<void> {
		if (!this.proc) return;
		const proc = this.proc;
		this.proc = null;
		this.initialized = false;
		this.stdoutBuf = "";
		this.stderrBuf = "";
		for (const [, pending] of this.pending) {
			clearTimeout(pending.timer);
			pending.reject(new OmniRouteUnavailableError("OmniRoute process closed"));
		}
		this.pending.clear();
		try {
			proc.kill();
		} catch {
			// ignore — best effort
		}
	}

	// -----------------------------------------------------------------------
	// JSON-RPC plumbing
	// -----------------------------------------------------------------------

	private async ensureProc(): Promise<OmniRouteChildProcess> {
		if (this.proc) return this.proc;
		let proc: OmniRouteChildProcess;
		try {
			proc = this.spawnFn(this.command, this.args);
		} catch (err) {
			throw new OmniRouteUnavailableError(
				`Failed to spawn omniroute (${this.command}): ${(err as Error).message}`,
				err,
			);
		}
		const stdout = proc.stdout as Readable | null;
		const stderr = proc.stderr as Readable | null;
		if (!stdout || !stderr) {
			throw new OmniRouteUnavailableError("omniroute subprocess has no stdio pipes");
		}

		stdout.setEncoding("utf8");
		stdout.on("data", (chunk: string) => this.handleStdout(chunk));
		stderr.setEncoding("utf8");
		stderr.on("data", (chunk: string) => this.handleStderr(chunk));
		proc.on("close", (code) => this.handleClose(code));

		this.proc = proc;
		return proc;
	}

	private handleStdout(chunk: string): void {
		this.stdoutBuf += chunk;
		let nl = this.stdoutBuf.indexOf("\n");
		while (nl >= 0) {
			const line = this.stdoutBuf.slice(0, nl).trim();
			this.stdoutBuf = this.stdoutBuf.slice(nl + 1);
			if (line) this.dispatchLine(line);
			nl = this.stdoutBuf.indexOf("\n");
		}
	}

	private handleStderr(chunk: string): void {
		this.stderrBuf += chunk;
		// Trim to last line so the buffer stays bounded if OmniRoute is chatty.
		const lastNl = this.stderrBuf.lastIndexOf("\n");
		if (lastNl >= 0) {
			const tail = this.stderrBuf.slice(Math.max(0, lastNl - 4 * 1024));
			// Keep last 4KB so test/debug logs can inspect it without unbounded memory.
			this.stderrBuf = tail;
		}
	}

	private handleClose(code: number | null): void {
		const reason = new OmniRouteUnavailableError(
			`omniroute subprocess exited (code=${code ?? "?"})`,
		);
		this.proc = null;
		this.initialized = false;
		for (const [, pending] of this.pending) {
			clearTimeout(pending.timer);
			pending.reject(reason);
		}
		this.pending.clear();
	}

	private dispatchLine(line: string): void {
		let parsed: JsonRpcResponse;
		try {
			parsed = JSON.parse(line) as JsonRpcResponse;
		} catch {
			// OmniRoute occasionally emits informational lines (e.g. progress).
			// Ignore non-JSON noise rather than failing the whole call.
			return;
		}
		const id = parsed.id;
		if (id === null || id === undefined) return; // notification
		const pending = this.pending.get(Number(id));
		if (!pending) return;
		this.pending.delete(Number(id));
		clearTimeout(pending.timer);
		if (parsed.error) {
			pending.reject(new Error(parsed.error.message));
		} else {
			pending.resolve(parsed.result);
		}
	}

	private async sendRequest<T>(
		method: string,
		params: Record<string, unknown> | undefined,
	): Promise<T> {
		const proc = await this.ensureProc();
		const id = this.nextId++;
		const msg = { jsonrpc: "2.0", id, method, params };

		const result = await new Promise<unknown>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`OmniRoute ${method} timed out after ${this.timeoutMs}ms`));
			}, this.timeoutMs);
			this.pending.set(id, { resolve, reject, timer });
			try {
				const stdin = proc.stdin as Writable | null;
				if (!stdin) {
					reject(new OmniRouteUnavailableError("omniroute subprocess has no stdin pipe"));
					return;
				}
				stdin.write(JSON.stringify(msg) + "\n");
			} catch (err) {
				clearTimeout(timer);
				this.pending.delete(id);
				reject(err);
			}
		});

		return result as T;
	}

	private async ensureInitialized(): Promise<void> {
		if (this.initialized) return;
		await this.sendRequest("initialize", {
			protocolVersion: "2024-11-05",
			capabilities: {},
			clientInfo: { name: "muhanai-personal-mcp", version: "0.1.0" },
		});
		// notifications/initialized has no id — fire-and-forget so we don't
		// wait on a response the server isn't required to send.
		await this.sendNotification("notifications/initialized", undefined);
		this.initialized = true;
	}

	private async sendNotification(
		method: string,
		params: Record<string, unknown> | undefined,
	): Promise<void> {
		const proc = await this.ensureProc();
		const msg = { jsonrpc: "2.0", method, params };
		const stdin = proc.stdin as Writable | null;
		if (!stdin) throw new OmniRouteUnavailableError("omniroute subprocess has no stdin pipe");
		stdin.write(JSON.stringify(msg) + "\n");
	}

	private async callTool(name: string, arguments_: Record<string, unknown>): Promise<unknown> {
		try {
			await this.ensureInitialized();
		} catch (err) {
			if (err instanceof OmniRouteUnavailableError) throw err;
			throw new OmniRouteUnavailableError(
				`Failed to initialize OmniRoute: ${(err as Error).message}`,
				err,
			);
		}
		try {
			return await this.sendRequest<McpCallResult>("tools/call", {
				name,
				arguments: arguments_,
			});
		} catch (err) {
			throw new OmniRouteCallError(
				`OmniRoute ${name} failed: ${(err as Error).message}`,
				name,
				err,
			);
		}
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultCommandFromEnv(): string {
	const fromEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
		?.env?.OMNIROUTE_COMMAND;
	return typeof fromEnv === "string" && fromEnv.length > 0 ? fromEnv : "omniroute-mcp-server";
}

function defaultArgsFromEnv(): string[] {
	const fromEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
		?.env?.OMNIROUTE_ARGS;
	if (!fromEnv) return [];
	return fromEnv.split(/\s+/).filter((s) => s.length > 0);
}

function defaultEnvFromProcess(): Record<string, string> {
	const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
	const src = proc?.env ?? {};
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(src)) {
		if (typeof v === "string") out[k] = v;
	}
	return out;
}

function readTextBlocks(result: McpCallResult | undefined): string {
	if (!result || !Array.isArray(result.content)) return "";
	const parts: string[] = [];
	for (const block of result.content) {
		if (block.type === "text" && typeof block.text === "string") {
			parts.push(block.text);
		}
	}
	return parts.join("\n");
}

function unwrapObject(raw: unknown): Record<string, unknown> {
	const text = readTextBlocks(raw as McpCallResult);
	if (!text) return {};
	try {
		const parsed = JSON.parse(text) as unknown;
		if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
		return {};
	} catch {
		return {};
	}
}

function stringOr(value: unknown, fallback: string | undefined): string | undefined {
	return typeof value === "string" ? value : fallback;
}

function numberOr(value: unknown, fallback: number | undefined): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function boolOr(value: unknown, fallback: boolean | undefined): boolean | undefined {
	return typeof value === "boolean" ? value : fallback;
}

function parseCompletion(raw: unknown): OmniRouteCompletionResult {
	const obj = unwrapObject(raw);
	const response =
		obj.response && typeof obj.response === "object"
			? (obj.response as Record<string, unknown>)
			: {};
	const tokens =
		obj.tokens && typeof obj.tokens === "object" ? (obj.tokens as Record<string, unknown>) : {};
	const routing =
		obj.routing && typeof obj.routing === "object" ? (obj.routing as Record<string, unknown>) : {};
	return {
		content: stringOr(response.content, "") ?? "",
		model: stringOr(response.model, "") ?? "unknown",
		tokens: {
			prompt: numberOr(tokens.prompt ?? tokens.prompt_tokens, 0) ?? 0,
			completion: numberOr(tokens.completion ?? tokens.completion_tokens, 0) ?? 0,
		},
		routing: {
			provider: stringOr(routing.provider, "unknown") ?? "unknown",
			combo: typeof routing.combo === "string" ? routing.combo : null,
			fallbacksTriggered:
				numberOr(routing.fallbacksTriggered ?? routing.fallbacks_triggered, 0) ?? 0,
			cost: numberOr(routing.cost, 0) ?? 0,
			latencyMs: numberOr(routing.latencyMs ?? routing.latency_ms, 0) ?? 0,
			routingExplanation:
				stringOr(routing.routingExplanation ?? routing.routing_explanation, "Request routed") ??
				"Request routed",
		},
	};
}

function parseModelCatalog(raw: unknown): OmniRouteModelCatalog {
	const obj = unwrapObject(raw);
	const items = Array.isArray(obj.models) ? (obj.models as Array<Record<string, unknown>>) : [];
	const models: OmniRouteModelEntry[] = items
		.filter((m) => m && typeof m === "object")
		.map((m) => ({
			id: stringOr(m.id ?? m.model, "") ?? "",
			provider: stringOr(m.provider, undefined),
			name: stringOr(m.name ?? m.display_name ?? m.id, undefined),
			capability: stringOr(m.capability ?? m.type, undefined),
			contextWindow: numberOr(m.contextWindow ?? m.context_window ?? m.context, undefined),
			supportsTools: boolOr(m.supportsTools ?? m.supports_tools, undefined),
			supportsVision: boolOr(m.supportsVision ?? m.supports_vision, undefined),
			supportsJsonMode: boolOr(m.supportsJsonMode ?? m.supports_json_mode, undefined),
			inputCostPer1k: numberOr(m.inputCostPer1k ?? m.input_cost_per_1k, undefined),
			outputCostPer1k: numberOr(m.outputCostPer1k ?? m.output_cost_per_1k, undefined),
		}))
		.filter((m) => m.id.length > 0);
	const providers = Array.isArray(obj.providers)
		? (obj.providers as unknown[]).filter((p): p is string => typeof p === "string")
		: undefined;
	const capabilities = Array.isArray(obj.capabilities)
		? (obj.capabilities as unknown[]).filter((c): c is string => typeof c === "string")
		: undefined;
	return { models, providers, capabilities };
}

function parseQuota(raw: unknown): OmniRouteQuotaResult {
	const obj = unwrapObject(raw);
	const entries = Array.isArray(obj.quotas)
		? (obj.quotas as Array<Record<string, unknown>>)
		: Array.isArray(obj)
			? (obj as Array<Record<string, unknown>>)
			: [];
	const quotas: OmniRouteQuotaEntry[] = entries
		.filter((q) => q && typeof q === "object")
		.map((q) => ({
			provider: stringOr(q.provider, "") ?? "",
			connectionId: stringOr(q.connectionId ?? q.connection_id, undefined),
			used: numberOr(q.used ?? q.usage, undefined),
			limit: numberOr(q.limit ?? q.quota, undefined),
			remaining: numberOr(q.remaining ?? q.remaining_quota, undefined),
			resetAt: stringOr(q.resetAt ?? q.reset_at, undefined),
		}))
		.filter((q) => q.provider.length > 0);
	return {
		provider: stringOr(obj.provider, undefined),
		connectionId: stringOr(obj.connectionId ?? obj.connection_id, undefined),
		quotas,
	};
}

function parseWebSearch(raw: unknown, query: string): OmniRouteWebSearchResult {
	const obj = unwrapObject(raw);
	const results = Array.isArray(obj.results) ? (obj.results as Array<Record<string, unknown>>) : [];
	const parsed: OmniRouteSearchResult[] = results
		.filter((r) => r && typeof r === "object")
		.map((r) => ({
			title: stringOr(r.title, "") ?? "",
			url: stringOr(r.url ?? r.link, "") ?? "",
			snippet: stringOr(r.snippet ?? r.content ?? r.description, "") ?? "",
			source: stringOr(r.source ?? r.provider, undefined),
			position: numberOr(r.position, undefined),
			publishedAt: stringOr(r.publishedAt ?? r.published_at ?? r.date, undefined),
		}))
		.filter((r) => r.url.length > 0);
	return {
		results: parsed,
		provider: stringOr(obj.provider, undefined),
		query,
	};
}

function parseWebFetch(raw: unknown, url: string): OmniRouteWebFetchResult {
	const obj = unwrapObject(raw);
	const blocks = Array.isArray((raw as McpCallResult)?.content)
		? ((raw as McpCallResult).content as Array<{ type: string; text?: string; data?: string }>)
		: [];
	let screenshot: { mimeType: string; bytes: Uint8Array } | undefined;
	for (const block of blocks) {
		if (block.type === "image" && typeof block.data === "string") {
			screenshot = {
				mimeType: "image/png",
				bytes: new Uint8Array(Buffer.from(block.data, "base64")),
			};
			break;
		}
	}
	const links = Array.isArray(obj.links)
		? (obj.links as Array<Record<string, unknown>>)
				.filter((l) => l && typeof l === "object" && typeof l.url === "string")
				.map((l) => ({
					text: stringOr(l.text, "") ?? "",
					url: stringOr(l.url, "") ?? "",
				}))
		: undefined;
	const metadata =
		obj.metadata && typeof obj.metadata === "object"
			? (obj.metadata as Record<string, unknown>)
			: undefined;
	return {
		url,
		finalUrl: stringOr(obj.finalUrl ?? obj.final_url, undefined),
		content: stringOr(obj.content, undefined),
		markdown: stringOr(obj.markdown, undefined),
		html: stringOr(obj.html, undefined),
		links,
		screenshot,
		metadata,
	};
}

function parseHealth(raw: unknown): OmniRouteHealthResult {
	const obj = unwrapObject(raw);
	const memory =
		obj.memoryUsage && typeof obj.memoryUsage === "object"
			? (obj.memoryUsage as Record<string, unknown>)
			: undefined;
	const cache =
		obj.cacheStats && typeof obj.cacheStats === "object"
			? (obj.cacheStats as Record<string, unknown>)
			: undefined;
	const degraded = Array.isArray(obj.degraded)
		? (obj.degraded as Array<Record<string, unknown>>)
				.filter((d) => d && typeof d === "object")
				.map((d) => ({
					source: stringOr(d.source, "") ?? "",
					error: stringOr(d.error, "") ?? "",
				}))
		: undefined;
	// OmniRoute returns uptime as a number (process.uptime() result), not a string.
	const uptime =
		typeof obj.uptime === "number"
			? String(obj.uptime)
			: (stringOr(obj.uptime, "unknown") ?? "unknown");
	return {
		uptime,
		version: stringOr(obj.version, "unknown") ?? "unknown",
		memoryUsage: memory
			? {
					heapUsed: numberOr(memory.heapUsed ?? memory.heap_used, 0) ?? 0,
					heapTotal: numberOr(memory.heapTotal ?? memory.heap_total, 0) ?? 0,
				}
			: undefined,
		circuitBreakers: Array.isArray(obj.circuitBreakers)
			? (obj.circuitBreakers as unknown[])
			: undefined,
		rateLimits: Array.isArray(obj.rateLimits) ? (obj.rateLimits as unknown[]) : undefined,
		cacheStats: cache
			? {
					hits: numberOr(cache.hits, 0) ?? 0,
					misses: numberOr(cache.misses, 0) ?? 0,
					hitRate: numberOr(cache.hitRate ?? cache.hit_rate, 0) ?? 0,
				}
			: undefined,
		degraded,
	};
}

let singleton: OmniRouteMcpClient | null = null;

/** Lazily-resolved singleton that respects OMNIROUTE_COMMAND / OMNIROUTE_ARGS. */
export function getOmniRouteMcpClient(): OmniRouteMcpClient {
	if (!singleton) singleton = new OmniRouteMcpClient();
	return singleton;
}

/** Reset for tests. */
export function __resetOmniRouteMcpClientForTests(): void {
	if (singleton) {
		void singleton.close();
	}
	singleton = null;
}
