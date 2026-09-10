/**
 * BrowserAdapter backed by an E2B Desktop Sandbox.
 *
 * Phase 1 ships the dispatch shape — every AIHawk browser_* capability is
 * routed through this class so callers can swap a `BrowserAdapter` for an
 * `E2bBrowserAdapter` without changing the rest of the agent.
 */

import { type BrowserAdapter } from './mcp-router.js';

const E2B_API_KEY_ENV = 'E2B_API_KEY';
const E2B_TEMPLATE_ENV = 'E2B_DESKTOP_TEMPLATE';
const E2B_MODULE_NAME = 'e2b';

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
 * vision model to find elements on a screenshot.
 */
export interface VisionClient {
  locate(opts: {
    imageBase64: string;
    prompt: string;
  }): Promise<{ x: number; y: number } | null>;
}

export interface E2bBrowserAdapterOptions {
  apiKey?: string;
  template?: string;
  sandboxId?: string;
  sandbox?: E2bSandboxLike;
  vision?: VisionClient;
  viewport?: { width: number; height: number };
}

/**
 * Click a UI element by selector. Uses vision model to locate the element
 * on the screenshot, then clicks at the returned coordinates.
 */
async function runSelectorClick(
  adapter: E2bBrowserAdapter,
  sandbox: E2bSandboxLike,
  vision: VisionClient | undefined,
  selector: string,
): Promise<{ x: number; y: number; fromVision: boolean }> {
  if (!vision) {
    throw new Error('E2bBrowserAdapter: browser_click requires a vision provider');
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
 * callers (and downstream vision models) can reason about layout.
 */
async function runSnapshot(
  adapter: E2bBrowserAdapter,
  sandbox: E2bSandboxLike,
): Promise<{ screenshot: unknown; viewport: { width: number; height: number }; format: 'png' }> {
  const shot = await sandbox.screenshot();
  return {
    screenshot: shot,
    viewport: adapter.getViewport(),
    format: 'png',
  };
}

function toBase64String(shot: unknown): string {
  if (typeof shot === 'string') return shot;
  if (shot instanceof Uint8Array) {
    let bin = '';
    for (let i = 0; i < shot.byteLength; i += 1) {
      bin += String.fromCharCode(shot[i] ?? 0);
    }
    if (typeof btoa === 'function') return btoa(bin);
    return Buffer.from(shot).toString('base64');
  }
  if (shot && typeof shot === 'object' && 'base64' in (shot as Record<string, unknown>)) {
    const b64 = (shot as { base64: unknown }).base64;
    if (typeof b64 === 'string') return b64;
  }
  throw new Error(
    'E2bBrowserAdapter: sandbox.screenshot() returned unrecognized shape; cannot encode for vision model.',
  );
}

function stringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`E2bBrowserAdapter: expected non-empty string at args.${key}`);
  }
  return value;
}

function numberArg(args: Record<string, unknown>, key: string): number {
  const value = args[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
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
      `E2bBrowserAdapter: failed to dynamic-import '${E2B_MODULE_NAME}'. Run 'pnpm --filter @agentmesh/compute-market add e2b' to enable.`,
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
