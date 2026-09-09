/**
 * Hound (master-fetch) stdio MCP client for MuhanAI Personal MCP.
 *
 * Wraps Hound's keyless web research tools over stdio JSON-RPC:
 *   - mcp_smart_fetch       — single URL fetch with anti-bot bypass + PDF/OCR
 *   - mcp_smart_crawl       — depth-1 follow links within a single host
 *   - mcp_smart_search      — quorum search across 10 keyless backends
 *   - mcp_screenshot        — render and capture a page (PNG bytes)
 *   - cache_clear / version — admin (not exposed to agents)
 *
 * Spawns `hound` as a subprocess and speaks the MCP stdio transport
 * (newline-delimited JSON-RPC). Falls back gracefully when the binary
 * is missing — agents should never crash because of an optional tool.
 */

import type { Readable, Writable } from "node:stream";
import { spawn as defaultChildSpawn } from "node:child_process";

export type HoundChildProcess = ReturnType<typeof defaultChildSpawn>;

export interface HoundMcpClientOptions {
	/** Command to invoke. Defaults to `hound` (assumes the CLI is on PATH). */
	command?: string;
	/** Args passed before MCP framing (e.g. `--cache-dir /tmp/hound`). */
	args?: string[];
	/** Per-request timeout in ms. Defaults to 30 s. */
	timeoutMs?: number;
	/** Extra env vars (e.g. HOUND_SEARCH_PROXY). Merged over process.env. */
	env?: Record<string, string>;
	/** Dependency injection seam for tests. */
	spawnFn?: (command: string, args: string[]) => HoundChildProcess;
}

export interface HoundSearchResult {
	title: string;
	url: string;
	snippet: string;
	engines?: string[];
	consensus?: number;
}

export interface HoundFetchResult {
	url: string;
	finalUrl?: string;
	title?: string;
	content?: string;
	markdown?: string;
	qualityScore?: number;
	contentOk?: boolean;
	pageType?: string;
	sourceType?: string;
	isOfficial?: boolean;
	isStale?: boolean;
	nextAction?: string;
	enginesConsensus?: number;
	fetchRelevance?: number;
}

export interface HoundCrawlPage {
	url: string;
	title?: string;
	content?: string;
	qualityScore?: number;
}

export interface HoundCrawlResult {
	pages: HoundCrawlPage[];
	totalBytes?: number;
}

export interface HoundVersionResult {
	version: string;
	uptimeSeconds?: number;
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

export class HoundUnavailableError extends Error {
	override readonly cause?: unknown;
	constructor(message: string, cause?: unknown) {
		super(message);
		this.name = "HoundUnavailableError";
		this.cause = cause;
	}
}

export class HoundCallError extends Error {
	override readonly name = "HoundCallError";
	readonly toolName: string;
	readonly upstreamError?: unknown;
	constructor(message: string, toolName: string, upstreamError?: unknown) {
		super(message);
		this.toolName = toolName;
		this.upstreamError = upstreamError;
	}
}

export class HoundMcpClient {
	private readonly command: string;
	private readonly args: string[];
	private readonly timeoutMs: number;
	private readonly env: Record<string, string>;
	private readonly spawnFn: (command: string, args: string[]) => HoundChildProcess;

	/** Lazily spawned subprocess. null until the first call. */
	private proc: HoundChildProcess | null = null;
	/** Pending responses keyed by request id (counter). */
	private readonly pending = new Map<
		number,
		{ resolve: (value: unknown) => void; reject: (err: unknown) => void; timer: ReturnType<typeof setTimeout> }
	>();
	private nextId = 1;
	private initialized = false;
	/** Buffered partial lines from stdout. */
	private stdoutBuf = "";
	/** Buffered partial lines from stderr (logged but not surfaced). */
	private stderrBuf = "";

	constructor(opts: HoundMcpClientOptions = {}) {
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

	async search(query: string, opts: { limit?: number; engines?: string[] } = {}): Promise<HoundSearchResult[]> {
		const args: Record<string, unknown> = { query, limit: opts.limit ?? 10 };
		if (opts.engines?.length) args.engines = opts.engines;
		const raw = await this.callTool("mcp_smart_search", args);
		return parseSearch(raw);
	}

	async fetch(
		url: string,
		opts: { focus?: string; maxChars?: number } = {},
	): Promise<HoundFetchResult> {
		const args: Record<string, unknown> = { url };
		if (opts.focus) args.focus = opts.focus;
		if (typeof opts.maxChars === "number") args.max_chars = opts.maxChars;
		const raw = await this.callTool("mcp_smart_fetch", args);
		return parseFetch(raw);
	}

	async crawl(url: string, opts: { depth?: number; maxPages?: number } = {}): Promise<HoundCrawlResult> {
		const args: Record<string, unknown> = { url };
		if (typeof opts.depth === "number") args.depth = opts.depth;
		if (typeof opts.maxPages === "number") args.max_pages = opts.maxPages;
		const raw = await this.callTool("mcp_smart_crawl", args);
		return parseCrawl(raw);
	}

	async screenshot(
		url: string,
		opts: { fullPage?: boolean; width?: number; height?: number } = {},
	): Promise<{ bytes: Uint8Array; mimeType: string }> {
		const args: Record<string, unknown> = { url };
		if (typeof opts.fullPage === "boolean") args.full_page = opts.fullPage;
		if (typeof opts.width === "number") args.width = opts.width;
		if (typeof opts.height === "number") args.height = opts.height;
		const raw = await this.callTool("mcp_screenshot", args);
		return parseScreenshot(raw);
	}

	async version(): Promise<HoundVersionResult> {
		const raw = await this.callTool("version", {});
		return parseVersion(raw);
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
			pending.reject(new HoundUnavailableError("Hound process closed"));
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

	private async ensureProc(): Promise<HoundChildProcess> {
		if (this.proc) return this.proc;
		let proc: HoundChildProcess;
		try {
			proc = this.spawnFn(this.command, this.args);
		} catch (err) {
			throw new HoundUnavailableError(
				`Failed to spawn hound (${this.command}): ${(err as Error).message}`,
				err,
			);
		}
		const stdout = proc.stdout as Readable | null;
		const stderr = proc.stderr as Readable | null;
		if (!stdout || !stderr) {
			throw new HoundUnavailableError("hound subprocess has no stdio pipes");
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
		// Trim to last line so the buffer stays bounded if Hound is chatty.
		const lastNl = this.stderrBuf.lastIndexOf("\n");
		if (lastNl >= 0) {
			const tail = this.stderrBuf.slice(Math.max(0, lastNl - 4 * 1024));
			// Keep last 4KB so test/debug logs can inspect it without unbounded memory.
			this.stderrBuf = tail;
		}
	}

	private handleClose(code: number | null): void {
		const reason = new HoundUnavailableError(`hound subprocess exited (code=${code ?? "?"})`);
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
			// Hound occasionally emits informational lines (e.g. progress).
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

	private async sendRequest<T>(method: string, params: Record<string, unknown> | undefined): Promise<T> {
		const proc = await this.ensureProc();
		const id = this.nextId++;
		const msg = { jsonrpc: "2.0", id, method, params };

		const result = await new Promise<unknown>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`Hound ${method} timed out after ${this.timeoutMs}ms`));
			}, this.timeoutMs);
			this.pending.set(id, { resolve, reject, timer });
			try {
				const stdin = proc.stdin as Writable | null;
				if (!stdin) {
					reject(new HoundUnavailableError("hound subprocess has no stdin pipe"));
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
		if (!stdin) throw new HoundUnavailableError("hound subprocess has no stdin pipe");
		stdin.write(JSON.stringify(msg) + "\n");
	}

	private async callTool(name: string, arguments_: Record<string, unknown>): Promise<unknown> {
		try {
			await this.ensureInitialized();
		} catch (err) {
			if (err instanceof HoundUnavailableError) throw err;
			throw new HoundUnavailableError(`Failed to initialize Hound: ${(err as Error).message}`, err);
		}
		try {
			return await this.sendRequest<McpCallResult>("tools/call", {
				name,
				arguments: arguments_,
			});
		} catch (err) {
			throw new HoundCallError(
				`Hound ${name} failed: ${(err as Error).message}`,
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
	const fromEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } })
		.process?.env?.HOUND_COMMAND;
	return typeof fromEnv === "string" && fromEnv.length > 0 ? fromEnv : "hound";
}

function defaultArgsFromEnv(): string[] {
	const fromEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } })
		.process?.env?.HOUND_ARGS;
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

function parseSearch(raw: unknown): HoundSearchResult[] {
	const text = readTextBlocks(raw as McpCallResult);
	if (!text) return [];
	try {
		const parsed = JSON.parse(text) as unknown;
		const items = Array.isArray(parsed)
			? (parsed as HoundSearchResult[])
			: ((parsed as { results?: HoundSearchResult[] }).results ?? []);
		return items
			.filter((r): r is HoundSearchResult => r && typeof r === "object" && typeof r.url === "string")
			.map((r) => ({
				title: typeof r.title === "string" ? r.title : "",
				url: r.url,
				snippet: typeof r.snippet === "string" ? r.snippet : "",
				engines: Array.isArray(r.engines) ? r.engines.filter((e) => typeof e === "string") : undefined,
				consensus: typeof r.consensus === "number" ? r.consensus : undefined,
			}));
	} catch {
		return [];
	}
}

function parseFetch(raw: unknown): HoundFetchResult {
	const obj = unwrapObject(raw);
	const url = stringOr(obj.url, "") ?? "";
	return {
		url,
		finalUrl: stringOr(obj.finalUrl ?? obj.final_url, undefined),
		title: stringOr(obj.title, undefined),
		content: stringOr(obj.text ?? obj.content, undefined),
		markdown: stringOr(obj.markdown, undefined),
		qualityScore: numberOr(obj.qualityScore ?? obj.quality_score, undefined),
		contentOk: boolOr(obj.content_ok ?? obj.contentOk, undefined),
		pageType: stringOr(obj.page_type ?? obj.pageType, undefined),
		sourceType: stringOr(obj.source_type ?? obj.sourceType, undefined),
		isOfficial: boolOr(obj.is_official ?? obj.isOfficial, undefined),
		isStale: boolOr(obj.is_stale ?? obj.isStale, undefined),
		nextAction: stringOr(obj.next_action ?? obj.nextAction, undefined),
		enginesConsensus: numberOr(obj.engines_consensus ?? obj.enginesConsensus, undefined),
		fetchRelevance: numberOr(obj.fetch_relevance ?? obj.fetchRelevance, undefined),
	};
}

function parseCrawl(raw: unknown): HoundCrawlResult {
	const obj = unwrapObject(raw);
	const pages = Array.isArray(obj.pages) ? (obj.pages as HoundCrawlPage[]) : [];
	return {
		pages: pages.filter((p) => p && typeof p === "object" && typeof p.url === "string"),
		totalBytes: numberOr(obj.total_bytes ?? obj.totalBytes, undefined),
	};
}

function parseScreenshot(raw: unknown): { bytes: Uint8Array; mimeType: string } {
	const result = raw as McpCallResult;
	const blocks = Array.isArray(result?.content) ? result.content : [];
	for (const block of blocks) {
		if (block.type === "image" && typeof block.data === "string") {
			const bytes = Buffer.from(block.data, "base64");
			return { bytes: new Uint8Array(bytes), mimeType: "image/png" };
		}
	}
	return { bytes: new Uint8Array(), mimeType: "application/octet-stream" };
}

function parseVersion(raw: unknown): HoundVersionResult {
	const text = readTextBlocks(raw as McpCallResult);
	try {
		const parsed = JSON.parse(text) as { version?: string; uptime?: number; uptime_seconds?: number };
		return {
			version: typeof parsed.version === "string" ? parsed.version : "unknown",
			uptimeSeconds: numberOr(parsed.uptime ?? parsed.uptime_seconds, undefined),
		};
	} catch {
		return { version: text.trim() || "unknown" };
	}
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

let singleton: HoundMcpClient | null = null;

/** Lazily-resolved singleton that respects HOUND_COMMAND / HOUND_ARGS. */
export function getHoundMcpClient(): HoundMcpClient {
	if (!singleton) singleton = new HoundMcpClient();
	return singleton;
}

/** Reset for tests. */
export function __resetHoundMcpClientForTests(): void {
	if (singleton) {
		void singleton.close();
	}
	singleton = null;
}
