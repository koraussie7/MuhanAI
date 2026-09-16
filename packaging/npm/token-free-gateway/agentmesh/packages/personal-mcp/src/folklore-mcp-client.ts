/**
 * Folklore (P2P agent memory) stdio MCP client for MuhanAI Personal MCP.
 *
 * Wraps Folklore's knowledge graph tools over stdio JSON-RPC:
 *   - search          — semantic search over the local graph
 *   - ask             — search + context assembly for LLM context
 *   - recall          — exact-nonce recall (past LLM output reuse)
 *   - federated_search — search across connected peers
 *   - get_node        — retrieve a single graph node by ID
 *   - deep_search     — multi-hop reasoning search
 *   - graph_stats     — graph size / health metrics
 *   - sources_list    — list ingested source feeds
 *
 * Spawns the folklore MCP server as a subprocess and speaks the MCP stdio
 * transport (newline-delimited JSON-RPC). Falls back gracefully when the
 * package is missing — agents should never crash because of an optional tool.
 *
 * On Windows the published `bin/folklore.js` has an ESM import bug; this
 * client uses `scripts/folklore-mcp-launcher.mjs` to bypass it.  On Linux/macOS
 * the launcher is a no-op passthrough, so a single command works everywhere.
 */

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import type { Readable, Writable } from "node:stream";
import { spawn as defaultChildSpawn } from "node:child_process";

export type FolkloreChildProcess = ReturnType<typeof defaultChildSpawn>;

export interface FolkloreMcpClientOptions {
	/**
	 * Command to invoke. Defaults to `node <agentmesh>/scripts/folklore-mcp-launcher.mjs`.
	 * Override with FOLKLORE_COMMAND env.
	 */
	command?: string;
	/** Args before the MCP framing. Defaults to `["mcp", "start"]`. */
	args?: string[];
	/** Per-request timeout in ms. Defaults to 30 s. */
	timeoutMs?: number;
	/** Extra env vars. Merged over process.env. */
	env?: Record<string, string>;
	/** Dependency injection seam for tests. */
	spawnFn?: (command: string, args: string[]) => FolkloreChildProcess;
}

// ---------------------------------------------------------------------------
// Result types (subset; raw text blocks parsed by callers)
// ---------------------------------------------------------------------------

export interface FolkloreSearchResult {
	id: string;
	content: string;
	score?: number;
	type?: string;
	source_uri?: string;
}

export interface FolkloreAskResult {
	context: string;
	satisfaction?: number | null;
	hits?: Array<{ id: string; score: number; content?: string }>;
}

export interface FolkloreRecallResult {
	hits: Array<{ id: string; content: string; score: number }>;
	reused: boolean;
}

export interface FolkloreGraphNode {
	id: string;
	content: string;
	type?: string;
	source_uri?: string;
}

export interface FolkloreGraphStats {
	nodes: number;
	edges?: number;
	byType?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

export class FolkloreUnavailableError extends Error {
	override readonly cause?: unknown;
	constructor(message: string, cause?: unknown) {
		super(message);
		this.name = "FolkloreUnavailableError";
		this.cause = cause;
	}
}

export class FolkloreCallError extends Error {
	override readonly name = "FolkloreCallError";
	readonly toolName: string;
	readonly upstreamError?: unknown;
	constructor(message: string, toolName: string, upstreamError?: unknown) {
		super(message);
		this.name = "FolkloreCallError";
		this.toolName = toolName;
		this.upstreamError = upstreamError;
	}
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class FolkloreMcpClient {
	private readonly command: string;
	private readonly args: string[];
	private readonly timeoutMs: number;
	private readonly env: Record<string, string>;
	private readonly spawnFn: (command: string, args: string[]) => FolkloreChildProcess;

	/** Lazily spawned subprocess. null until the first call. */
	private proc: FolkloreChildProcess | null = null;
	/** Pending responses keyed by request id. */
	private readonly pending = new Map<
		number,
		{ resolve: (value: unknown) => void; reject: (err: unknown) => void; timer: ReturnType<typeof setTimeout> }
	>();
	private nextId = 1;
	private initialized = false;
	private stdoutBuf = "";
	private stderrBuf = "";

	constructor(opts: FolkloreMcpClientOptions = {}) {
		const { command, args } = resolveCommandSpec(opts);
		this.command = command;
		this.args = args;
		this.timeoutMs = opts.timeoutMs ?? 30_000;
		this.env = { ...defaultEnv(), ...opts.env };
		this.spawnFn = opts.spawnFn ?? ((cmd, args) => defaultChildSpawn(cmd, args));
	}

	get isAvailable(): boolean {
		return this.command.length > 0 && (this.proc !== null || this.canSpawn());
	}

	private canSpawn(): boolean {
		return this.command.length > 0;
	}

	// -----------------------------------------------------------------------
	// High-level tools
	// -----------------------------------------------------------------------

	async search(query: string, opts: { k?: number } = {}): Promise<FolkloreSearchResult[]> {
		const raw = await this.callTool("search", { query, k: opts.k ?? 5 });
		return parseSearch(raw);
	}

	async ask(query: string, opts: { k?: number } = {}): Promise<FolkloreAskResult> {
		const raw = await this.callTool("ask", { query, k: opts.k ?? 5 });
		return parseAsk(raw);
	}

	async recall(query: string): Promise<FolkloreRecallResult> {
		const raw = await this.callTool("recall", { query });
		return parseRecall(raw);
	}

	async federatedSearch(query: string, opts: { k?: number } = {}): Promise<FolkloreSearchResult[]> {
		const raw = await this.callTool("federated_search", { query, k: opts.k ?? 5 });
		return parseSearch(raw);
	}

	async getNode(id: string): Promise<FolkloreGraphNode | null> {
		const raw = await this.callTool("get_node", { id });
		return parseGraphNode(raw);
	}

	async deepSearch(query: string, opts: { k?: number } = {}): Promise<FolkloreSearchResult[]> {
		const raw = await this.callTool("deep_search", { query, k: opts.k ?? 5 });
		return parseSearch(raw);
	}

	async graphStats(): Promise<FolkloreGraphStats> {
		const raw = await this.callTool("graph_stats", {});
		return parseGraphStats(raw);
	}

	async sourcesList(): Promise<Array<{ id: string; name?: string; type?: string }>> {
		const raw = await this.callTool("sources_list", {});
		return parseSourcesList(raw);
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
			pending.reject(new FolkloreUnavailableError("Folklore process closed"));
		}
		this.pending.clear();
		try {
			proc.kill();
		} catch {
			// ignore — best effort
		}
	}

	// -----------------------------------------------------------------------
	// JSON-RPC plumbing (identical to HoundMcpClient)
	// -----------------------------------------------------------------------

	private async ensureProc(): Promise<FolkloreChildProcess> {
		if (this.proc) return this.proc;
		let proc: FolkloreChildProcess;
		try {
			proc = this.spawnFn(this.command, this.args);
		} catch (err) {
			throw new FolkloreUnavailableError(
				`Failed to spawn folklore (${this.command}): ${(err as Error).message}`,
				err,
			);
		}
		const stdout = proc.stdout as Readable | null;
		const stderr = proc.stderr as Readable | null;
		if (!stdout || !stderr) {
			throw new FolkloreUnavailableError("folklore subprocess has no stdio pipes");
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
		const lastNl = this.stderrBuf.lastIndexOf("\n");
		if (lastNl >= 0) {
			this.stderrBuf = this.stderrBuf.slice(Math.max(0, lastNl - 4 * 1024));
		}
	}

	private handleClose(code: number | null): void {
		const reason = new FolkloreUnavailableError(`folklore subprocess exited (code=${code ?? "?"})`);
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
			return;
		}
		const id = parsed.id;
		if (id === null || id === undefined) return;
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
				reject(new Error(`Folklore ${method} timed out after ${this.timeoutMs}ms`));
			}, this.timeoutMs);
			this.pending.set(id, { resolve, reject, timer });
			try {
				const stdin = proc.stdin as Writable | null;
				if (!stdin) {
					reject(new FolkloreUnavailableError("folklore subprocess has no stdin pipe"));
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
		await this.sendNotification("notifications/initialized", undefined);
		this.initialized = true;
	}

	private async sendNotification(method: string, params: Record<string, unknown> | undefined): Promise<void> {
		const proc = await this.ensureProc();
		const msg = { jsonrpc: "2.0", method, params };
		const stdin = proc.stdin as Writable | null;
		if (!stdin) throw new FolkloreUnavailableError("folklore subprocess has no stdin pipe");
		stdin.write(JSON.stringify(msg) + "\n");
	}

	private async callTool(name: string, arguments_: Record<string, unknown>): Promise<unknown> {
		try {
			await this.ensureInitialized();
		} catch (err) {
			if (err instanceof FolkloreUnavailableError) throw err;
			throw new FolkloreUnavailableError(`Failed to initialize Folklore: ${(err as Error).message}`, err);
		}
		try {
			return await this.sendRequest<McpCallResult>("tools/call", { name, arguments: arguments_ });
		} catch (err) {
			throw new FolkloreCallError(`Folklore ${name} failed: ${(err as Error).message}`, name, err);
		}
	}
}

// ---------------------------------------------------------------------------
// Result parsers
// ---------------------------------------------------------------------------

function readTextBlocks(result: McpCallResult | undefined): string {
	if (!result || !Array.isArray(result.content)) return "";
	const parts: string[] = [];
	for (const block of result.content) {
		if (block.type === "text" && typeof block.text === "string") parts.push(block.text);
	}
	return parts.join("\n");
}

function parseSearch(raw: unknown): FolkloreSearchResult[] {
	const text = readTextBlocks(raw as McpCallResult);
	if (!text) return [];
	try {
		const parsed = JSON.parse(text) as unknown;
		const items = Array.isArray(parsed)
			? parsed
			: ((parsed as { nodes?: unknown[] }).nodes ?? (parsed as { results?: unknown[] }).results ?? []);
		return (items as Array<Record<string, unknown>>)
			.filter((r) => r && typeof r === "object" && typeof r.id === "string")
			.map((r) => ({
				id: String(r.id),
				content: String(r.content ?? ""),
				...(typeof r.score === "number" ? { score: r.score } : {}),
				...(typeof r.type === "string" ? { type: r.type } : {}),
				...(typeof r.source_uri === "string" ? { source_uri: r.source_uri } : {}),
			}));
	} catch {
		return [];
	}
}

function parseAsk(raw: unknown): FolkloreAskResult {
	const text = readTextBlocks(raw as McpCallResult);
	if (!text) return { context: "" };
	try {
		const parsed = JSON.parse(text) as Record<string, unknown>;
		return {
			context: String(parsed.context ?? parsed.text ?? text),
			...(typeof parsed.satisfaction === "number" ? { satisfaction: parsed.satisfaction } : {}),
			...(Array.isArray(parsed.hits) ? { hits: parsed.hits as FolkloreAskResult["hits"] } : {}),
		};
	} catch {
		return { context: text };
	}
}

function parseRecall(raw: unknown): FolkloreRecallResult {
	const text = readTextBlocks(raw as McpCallResult);
	if (!text) return { hits: [], reused: false };
	try {
		const parsed = JSON.parse(text) as Record<string, unknown>;
		const hits = Array.isArray(parsed.hits) ? (parsed.hits as FolkloreRecallResult["hits"]) : [];
		return { hits, reused: Boolean(parsed.reused) };
	} catch {
		return { hits: [], reused: false };
	}
}

function parseGraphNode(raw: unknown): FolkloreGraphNode | null {
	const text = readTextBlocks(raw as McpCallResult);
	if (!text) return null;
	try {
		const parsed = JSON.parse(text) as Record<string, unknown>;
		if (typeof parsed.id !== "string") return null;
		return {
			id: parsed.id,
			content: String(parsed.content ?? ""),
			...(typeof parsed.type === "string" ? { type: parsed.type } : {}),
			...(typeof parsed.source_uri === "string" ? { source_uri: parsed.source_uri } : {}),
		};
	} catch {
		return null;
	}
}

function parseGraphStats(raw: unknown): FolkloreGraphStats {
	const text = readTextBlocks(raw as McpCallResult);
	if (!text) return { nodes: 0 };
	try {
		const parsed = JSON.parse(text) as Record<string, unknown>;
		return {
			nodes: typeof parsed.nodes === "number" ? parsed.nodes : 0,
			...(typeof parsed.edges === "number" ? { edges: parsed.edges } : {}),
			...(parsed.byType && typeof parsed.byType === "object"
				? { byType: parsed.byType as Record<string, number> }
				: {}),
		};
	} catch {
		return { nodes: 0 };
	}
}

function parseSourcesList(raw: unknown): Array<{ id: string; name?: string; type?: string }> {
	const text = readTextBlocks(raw as McpCallResult);
	if (!text) return [];
	try {
		const parsed = JSON.parse(text) as unknown;
		const items = Array.isArray(parsed) ? parsed : ((parsed as { sources?: unknown[] }).sources ?? []);
		return (items as Array<Record<string, unknown>>)
			.filter((s) => s && typeof s === "object" && typeof s.id === "string")
			.map((s) => ({
				id: String(s.id),
				...(typeof s.name === "string" ? { name: s.name } : {}),
				...(typeof s.type === "string" ? { type: s.type } : {}),
			}));
	} catch {
		return [];
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveCommandSpec(
	opts: FolkloreMcpClientOptions,
): { command: string; args: string[] } {
	const fromEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } })
		.process?.env?.FOLKLORE_COMMAND;
	if (typeof fromEnv === "string" && fromEnv.length > 0) {
		const parts = fromEnv.split(/\s+/).filter((s) => s.length > 0);
		return {
			command: parts[0] ?? "node",
			args: [...parts.slice(1), ...(opts.args ?? ["mcp", "start"])],
		};
	}
	if (typeof opts.command === "string" && opts.command.length > 0) {
		const parts = opts.command.split(/\s+/).filter((s) => s.length > 0);
		return {
			command: parts[0] ?? "node",
			args: [...parts.slice(1), ...(opts.args ?? ["mcp", "start"])],
		};
	}

	const launcher = findLauncher();
	if (launcher) {
		return { command: "node", args: [launcher, "mcp", "start"] };
	}
	return { command: "npx", args: ["--yes", "@usefolklore/folklore", "mcp", "start"] };
}

function findLauncher(): string | null {
	const fromEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } })
		.process?.env?.FOLKLORE_LAUNCHER_PATH;
	if (typeof fromEnv === "string" && fromEnv.length > 0 && existsSync(fromEnv)) return fromEnv;

	// Resolve relative to this file: <agentmesh>/packages/personal-mcp/src/../..
	// → <agentmesh>/scripts/folklore-mcp-launcher.mjs
	try {
		const here = dirname(fileURLToPath(import.meta.url));
		const candidate = resolve(here, "../../../scripts/folklore-mcp-launcher.mjs");
		if (existsSync(candidate)) return candidate;
	} catch {
		// ignore
	}

	try {
		const cwd = process.cwd();
		const candidate = join(cwd, "scripts", "folklore-mcp-launcher.mjs");
		if (existsSync(candidate)) return candidate;
	} catch {
		// ignore
	}

	return null;
}

function defaultEnv(): Record<string, string> {
	const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
	const src = proc?.env ?? {};
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(src)) {
		if (typeof v === "string") out[k] = v;
	}
	return out;
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let singleton: FolkloreMcpClient | null = null;

export function getFolkloreMcpClient(): FolkloreMcpClient {
	if (!singleton) singleton = new FolkloreMcpClient();
	return singleton;
}

/** Reset for tests. */
export function __resetFolkloreMcpClientForTests(): void {
	if (singleton) {
		void singleton.close();
	}
	singleton = null;
}