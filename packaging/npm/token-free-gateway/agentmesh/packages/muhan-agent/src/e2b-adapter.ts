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

/**
 * Vision provider for selector-based browser_click and browser_snapshot.
 * The e2b Desktop sandbox has no accessibility tree or DOM, so we ask a
 * vision model to find elements on a screenshot. Mirrors the role
 * `open-computer-use` plays for e2b: vision-grounded UI control.
 */
export interface VisionClient {
	/** Return JSON text from a vision model given base64 PNG + prompt. */
	locate(opts: {
		imageBase64: string;
		prompt: string;
	}): Promise<{ x: number; y: number } | null>;
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
	/**
	 * Vision provider used for selector→coordinate mapping (browser_click)
	 * and element enumeration (browser_snapshot). If omitted, those tools
	 * throw a clear "vision required" error.
	 */
	vision?: VisionClient;
	/**
	 * Default viewport size used when computing screenshot-relative click
	 * coordinates from the vision model. The e2b Desktop sandbox
	 * streams at 1280x720 by default.
	 */
	viewport?: { width: number; height: number };
}

export class E2bBrowserAdapter implements BrowserAdapter {
	private readonly apiKey: string | undefined;
	private readonly template: string;
	private readonly sandboxId: string | undefined;
	private readonly injectedSandbox: E2bSandboxLike | undefined;
	private readonly vision: VisionClient | undefined;
	private readonly viewport: { width: number; height: number };
	private resolvedSandbox: E2bSandboxLike | undefined;

	constructor(options: E2bBrowserAdapterOptions = {}) {
		const envKey = process.env[E2B_API_KEY_ENV];
		const envTemplate = process.env[E2B_TEMPLATE_ENV];
		this.apiKey = options.apiKey ?? envKey;
		this.template = options.template ?? envTemplate ?? "desktop";
		this.sandboxId = options.sandboxId;
		this.injectedSandbox = options.sandbox;
		this.vision = options.vision;
		this.viewport = options.viewport ?? { width: 1280, height: 720 };
	}

	async callBrowserTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
		if (!isSupportedTool(toolName)) {
			throw new Error(`E2bBrowserAdapter: unknown AIHawk tool "${toolName}"`);
		}
		const sandbox = await this.resolveSandbox();
		try {
			return await dispatch(this, sandbox, toolName, args);
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

	/** Internal accessor for vision-grounded tools. Exported via instance only. */
	getVision(): VisionClient | undefined {
		return this.vision;
	}

	getViewport(): { width: number; height: number } {
		return this.viewport;
	}

	/**
	 * Resolve and return the underlying sandbox. Public so the
	 * computer-use router can hand it to `runComputerUseLoop` directly
	 * (the loop calls screenshot/click/press without going through
	 * the dispatch switch). Lazy-initialized on first call.
	 */
	async getSandbox(): Promise<E2bSandboxLike> {
		return this.resolveSandbox();
	}
}

function isSupportedTool(toolName: string): boolean {
	const map = browserCapabilityMap();
	return Object.hasOwn(map, toolName);
}

function dispatch(
	adapter: E2bBrowserAdapter,
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
			return runSelectorClick(adapter, sandbox, args);
		case "browser_select_option":
			throw new Error("E2bBrowserAdapter: browser_select_option has no e2b Desktop equivalent.");
		case "browser_snapshot":
			return runSnapshot(adapter, sandbox);
		case "browser_evaluate":
			throw new Error(
				"E2bBrowserAdapter: browser_evaluate has no equivalent in e2b Desktop (no embedded JS runtime). Use browser_type + browser_press_key for synthetic input.",
			);
		default:
			throw new Error(`E2bBrowserAdapter: tool "${toolName}" reached default branch`);
	}
}

/**
 * Vision-grounded selector click. Take a screenshot, ask the vision
 * model to locate the element matching `selector`, click at the
 * returned coordinates. Mirrors the role `open-computer-use` plays
 * for e2b: the AI looks at the screen and grounds a UI description
 * in pixel coordinates.
 */
async function runSelectorClick(
	adapter: E2bBrowserAdapter,
	sandbox: E2bSandboxLike,
	args: Record<string, unknown>,
): Promise<{ x: number; y: number; fromVision: boolean }> {
	const selector = stringArg(args, "selector");
	const vision = adapter.getVision();
	if (!vision) {
		throw new Error(
			"E2bBrowserAdapter: browser_click requires a VisionClient (selector→coordinate grounding). " +
				"Provide one via `vision` option, or use browser_click_at with explicit coordinates.",
		);
	}
	const shot = await sandbox.screenshot();
	const imageBase64 = toBase64String(shot);
	const prompt =
		`Look at this screenshot (${adapter.getViewport().width}x${adapter.getViewport().height}). ` +
		`Find the UI element matching this description: "${selector}". ` +
		`Reply with JSON only: {"x": <int>, "y": <int>} where (x, y) is the center of that element in pixel coordinates. ` +
		`If the element is not visible, reply with {"x": -1, "y": -1}.`;
	const located = await vision.locate({ imageBase64, prompt });
	if (!located || located.x < 0 || located.y < 0) {
		throw new Error(`E2bBrowserAdapter: vision could not locate "${selector}"`);
	}
	await sandbox.click(located.x, located.y);
	return { x: located.x, y: located.y, fromVision: true };
}

/**
 * Snapshot returns the current screenshot plus the viewport size so
 * callers (and downstream vision models) can reason about layout. The
 * e2b Desktop sandbox has no accessibility tree, so we cannot produce
 * a structured element list without paying for another vision call —
 * that's exposed as `browser_snapshot_with_elements` when the caller
 * needs it.
 */
async function runSnapshot(
	adapter: E2bBrowserAdapter,
	sandbox: E2bSandboxLike,
): Promise<{ screenshot: unknown; viewport: { width: number; height: number }; format: "png" }> {
	const shot = await sandbox.screenshot();
	return {
		screenshot: shot,
		viewport: adapter.getViewport(),
		format: "png",
	};
}

function toBase64String(shot: unknown): string {
	if (typeof shot === "string") return shot;
	if (shot instanceof Uint8Array) {
		let bin = "";
		for (let i = 0; i < shot.byteLength; i += 1) {
			bin += String.fromCharCode(shot[i] ?? 0);
		}
		// btoa exists in Node 18+ and modern browsers
		if (typeof btoa === "function") return btoa(bin);
		return Buffer.from(shot).toString("base64");
	}
	if (shot && typeof shot === "object" && "base64" in (shot as Record<string, unknown>)) {
		const b64 = (shot as { base64: unknown }).base64;
		if (typeof b64 === "string") return b64;
	}
	throw new Error(
		"E2bBrowserAdapter: sandbox.screenshot() returned unrecognized shape; cannot encode for vision model.",
	);
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
