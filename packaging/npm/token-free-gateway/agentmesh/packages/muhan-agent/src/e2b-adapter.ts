/**
 * BrowserAdapter backed by an E2B Desktop Sandbox.
 *
 * Phase 1 ships the dispatch shape — every AIHawk browser_* capability is
 * routed through this class so callers can swap a `BrowserAdapter` for an
 * `E2bBrowserAdapter` without changing the rest of the agent. The actual
 * desktop↔browser API mapping is intentionally minimal: only the
 * capabilities that have a clean 1:1 e2b Desktop method (screenshot, click,
 * click-at-coords, press-key, write-text, open-url) are wired. The rest
 * throw an explicit "Phase 2 required" error so the gap is visible and
 * testable instead of being silently misrouted.
 *
 * Why dynamic-imported e2b:
 *   - `e2b` is not a workspace dep. Adding it would inflate every
 *     muhan-agent consumer with WS / tree-sitter / etc.
 *   - muhan-agent owners who don't set E2B_API_KEY must not pay the
 *     load cost on daemon startup. The first call pays it.
 *   - Tests inject a preloaded sandbox via the `sandbox` option and
 *     never touch the e2b module — keeps `pnpm test` hermetic.
 *
 * Why a class wrapper instead of a function:
 *   - Lazy resolution is path-dependent (apiKey + sandboxId state).
 *   - Existing sibling adapters (hivebear OllamaProxy, noema NoemaClient)
 *     use the same `class + private readonly + env-var` style, so reviewers
 *     can pattern-match quickly.
 */
import { type BrowserAdapter, browserCapabilityMap } from "./mcp-router.js";

const E2B_API_KEY_ENV = "E2B_API_KEY";
const E2B_TEMPLATE_ENV = "E2B_DESKTOP_TEMPLATE";

const E2B_MODULE_NAME = "e2b";

/** Loose shape of the e2b Desktop Sandbox surface we touch. */
export interface E2bSandboxLike {
	screenshot(): Promise<unknown>;
	click(x: number, y: number): Promise<unknown>;
	press(key: string): Promise<unknown>;
	write(text: string): Promise<unknown>;
	open(url: string): Promise<unknown>;
	close?(): Promise<unknown>;
}

export interface E2bBrowserAdapterOptions {
	/** E2B API key. Falls back to E2B_API_KEY env var. Required unless sandbox is provided. */
	apiKey?: string;
	/** E2B Desktop template id. Defaults to `E2B_DESKTOP_TEMPLATE` env var, then `"desktop"`. */
	template?: string;
	/** Resume an existing sandbox instead of creating a new one. */
	sandboxId?: string;
	/** Inject a preloaded sandbox. Skips dynamic e2b import entirely — used by tests. */
	sandbox?: E2bSandboxLike;
}

export class E2bBrowserAdapter implements BrowserAdapter {
	private readonly apiKey: string | undefined;
	private readonly template: string;
	private readonly sandboxId: string | undefined;
	private readonly injectedSandbox: E2bSandboxLike | undefined;
	private resolvedSandbox: E2bSandboxLike | undefined;

	constructor(options: E2bBrowserAdapterOptions = {}) {
		const envKey = process.env[E2B_API_KEY_ENV];
		const envTemplate = process.env[E2B_TEMPLATE_ENV];
		this.apiKey = options.apiKey ?? envKey;
		this.template = options.template ?? envTemplate ?? "desktop";
		this.sandboxId = options.sandboxId;
		this.injectedSandbox = options.sandbox;
	}

	async callBrowserTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
		if (!isSupportedTool(toolName)) {
			throw new Error(`E2bBrowserAdapter: unknown AIHawk tool "${toolName}"`);
		}
		const sandbox = await this.resolveSandbox();
		try {
			return await dispatch(sandbox, toolName, args);
		} catch (err) {
			const reason = err instanceof Error ? err.message : String(err);
			throw new Error(`E2bBrowserAdapter: ${toolName} failed: ${reason}`);
		}
	}

	async close(): Promise<void> {
		const sandbox = this.resolvedSandbox ?? this.injectedSandbox;
		if (sandbox?.close) {
			await sandbox.close();
		}
	}

	private async resolveSandbox(): Promise<E2bSandboxLike> {
		if (this.injectedSandbox) {
			return this.injectedSandbox;
		}
		if (this.resolvedSandbox) {
			return this.resolvedSandbox;
		}
		if (!this.apiKey) {
			throw new Error(
				`E2bBrowserAdapter: missing ${E2B_API_KEY_ENV}; cannot connect to E2B Desktop Sandbox`,
			);
		}
		const sandbox = await loadSandbox(this.apiKey, this.template, this.sandboxId);
		this.resolvedSandbox = sandbox;
		return sandbox;
	}
}

function isSupportedTool(toolName: string): boolean {
	const map = browserCapabilityMap();
	return Object.hasOwn(map, toolName);
}

function dispatch(
	sandbox: E2bSandboxLike,
	toolName: string,
	args: Record<string, unknown>,
): Promise<unknown> {
	switch (toolName) {
		case "browser_navigate": {
			const url = stringArg(args, "url");
			return sandbox.open(url);
		}
		case "browser_click_at": {
			const x = numberArg(args, "x");
			const y = numberArg(args, "y");
			return sandbox.click(x, y);
		}
		case "browser_press_key": {
			const key = stringArg(args, "key");
			return sandbox.press(key);
		}
		case "browser_type": {
			const text = stringArg(args, "text");
			return sandbox.write(text);
		}
		case "browser_take_screenshot": {
			return sandbox.screenshot();
		}
		case "browser_click":
			throw new Error(
				"E2bBrowserAdapter: browser_click requires selector→coordinate mapping; Phase 2 (vision grounding).",
			);
		case "browser_select_option":
			throw new Error("E2bBrowserAdapter: browser_select_option has no e2b Desktop equivalent.");
		case "browser_snapshot":
			throw new Error(
				"E2bBrowserAdapter: browser_snapshot requires accessibility-tree extraction; Phase 2.",
			);
		case "browser_evaluate":
			throw new Error(
				"E2bBrowserAdapter: browser_evaluate requires an embedded JS runtime; Phase 2.",
			);
		default:
			throw new Error(`E2bBrowserAdapter: tool "${toolName}" reached default branch`);
	}
}

function stringArg(args: Record<string, unknown>, key: string): string {
	const value = args[key];
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`E2bBrowserAdapter: expected non-empty string at args.${key}`);
	}
	return value;
}

function numberArg(args: Record<string, unknown>, key: string): number {
	const value = args[key];
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new Error(`E2bBrowserAdapter: expected finite number at args.${key}`);
	}
	return value;
}

async function loadSandbox(
	apiKey: string,
	template: string,
	sandboxId: string | undefined,
): Promise<E2bSandboxLike> {
	let mod: {
		Sandbox?: {
			create?: (opts: { apiKey: string; template?: string; id?: string }) => Promise<unknown>;
		};
	};
	try {
		mod = (await import(/* @vite-ignore */ E2B_MODULE_NAME)) as typeof mod;
	} catch {
		throw new Error(
			`E2bBrowserAdapter: failed to dynamic-import '${E2B_MODULE_NAME}'. Run 'pnpm --filter @agentmesh/muhan-agent add e2b' to enable.`,
		);
	}
	const create = mod.Sandbox?.create;
	if (!create) {
		throw new Error(`E2bBrowserAdapter: e2b module missing Sandbox.create export`);
	}
	const created = (await create({
		apiKey,
		template,
		...(sandboxId ? { id: sandboxId } : {}),
	})) as E2bSandboxLike;
	return created;
}
