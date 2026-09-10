/**
 * Playwright Browser Adapter
 * 
 * AIHawk-compatible browser automation using Playwright.
 * Supports Chromium, Firefox, and WebKit.
 * 
 * Phase 1 ships the dispatch shape with stub implementations.
 * Phase 2 wires real Playwright calls.
 */

import type { BrowserAdapter } from './browser-adapter.js';

export interface PlaywrightAdapterOptions {
  /** Browser engine: chromium, firefox, webkit. Default: chromium */
  browser?: 'chromium' | 'firefox' | 'webkit';
  /** Proxy URL (e.g., socks5://proxy.example.com:1080) */
  proxy?: string;
  /** Viewport size. Default: 1280x720 */
  viewport?: { width: number; height: number };
  /** User agent override */
  userAgent?: string;
  /** Headless mode. Default: true */
  headless?: boolean;
}

/**
 * Playwright-backed browser adapter.
 * Mirrors the AIHawk/MS Playwright MCP tool surface.
 */
export class PlaywrightBrowserAdapter implements BrowserAdapter {
  private readonly options: Required<PlaywrightAdapterOptions>;

  constructor(options: PlaywrightAdapterOptions = {}) {
    this.options = {
      browser: options.browser ?? 'chromium',
      proxy: options.proxy ?? '',
      viewport: options.viewport ?? { width: 1280, height: 720 },
      userAgent: options.userAgent ?? '',
      headless: options.headless ?? true,
    };
  }

  async callBrowserTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    switch (toolName) {
      case 'browser_navigate':
        return this.navigate(stringArg(args, 'url'));
      case 'browser_click':
        return this.click(stringArg(args, 'selector'));
      case 'browser_type':
        return this.type(stringArg(args, 'selector'), stringArg(args, 'text'));
      case 'browser_press_key':
        return this.pressKey(stringArg(args, 'key'));
      case 'browser_select_option':
        return this.selectOption(stringArg(args, 'selector'), stringArg(args, 'value'));
      case 'browser_click_at':
        return this.clickAt(numberArg(args, 'x'), numberArg(args, 'y'));
      case 'browser_snapshot':
        return this.snapshot();
      case 'browser_take_screenshot':
        return this.screenshot();
      case 'browser_evaluate':
        return this.evaluate(stringArg(args, 'expression'));
      default:
        throw new Error(`PlaywrightBrowserAdapter: unknown tool "${toolName}"`);
    }
  }

  // Phase 2: Implement with real Playwright calls
  private async navigate(url: string): Promise<unknown> {
    // Phase 2: page.goto(url)
    return { ok: true, url, phase: 'stub' };
  }

  private async click(selector: string): Promise<unknown> {
    // Phase 2: page.click(selector)
    return { ok: true, selector, phase: 'stub' };
  }

  private async type(selector: string, text: string): Promise<unknown> {
    // Phase 2: page.fill(selector, text)
    return { ok: true, selector, text, phase: 'stub' };
  }

  private async pressKey(key: string): Promise<unknown> {
    // Phase 2: page.keyboard.press(key)
    return { ok: true, key, phase: 'stub' };
  }

  private async selectOption(selector: string, value: string): Promise<unknown> {
    // Phase 2: page.selectOption(selector, value)
    return { ok: true, selector, value, phase: 'stub' };
  }

  private async clickAt(x: number, y: number): Promise<unknown> {
    // Phase 2: page.mouse.click(x, y)
    return { ok: true, x, y, phase: 'stub' };
  }

  private async snapshot(): Promise<unknown> {
    // Phase 2: page.locator('*').all() + accessibility tree
    return {
      ok: true,
      viewport: this.options.viewport,
      elements: [],
      phase: 'stub',
    };
  }

  private async screenshot(): Promise<unknown> {
    // Phase 2: page.screenshot()
    return {
      ok: true,
      viewport: this.options.viewport,
      format: 'png',
      data: '',
      phase: 'stub',
    };
  }

  private async evaluate(expression: string): Promise<unknown> {
    // Phase 2: page.evaluate(expression)
    // Note: Read-only evaluate only; mutation rejected upstream
    return { ok: true, expression, result: null, phase: 'stub' };
  }
}

function stringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`PlaywrightBrowserAdapter: expected non-empty string at args.${key}`);
  }
  return value;
}

function numberArg(args: Record<string, unknown>, key: string): number {
  const value = args[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`PlaywrightBrowserAdapter: expected finite number at args.${key}`);
  }
  return value;
}
