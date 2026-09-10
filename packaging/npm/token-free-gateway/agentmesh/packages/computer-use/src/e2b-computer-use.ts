/**
 * Computer Use Orchestration
 * 
 * Drives a desktop sandbox with a vision model in a screenshot → action loop.
 */

import {
  type E2bSandboxLike,
  type VisionClient,
  E2bBrowserAdapter,
} from './e2b-adapter.js';

/** Action the loop may emit on any iteration. */
export type ComputerUseAction =
  | { type: 'click'; x: number; y: number }
  | { type: 'click_selector'; selector: string }
  | { type: 'type'; text: string }
  | { type: 'press'; key: string }
  | { type: 'navigate'; url: string }
  | { type: 'done'; reason: string };

export interface ComputerUseStep {
  index: number;
  action: ComputerUseAction;
  screenshotBefore: string;
  screenshotAfter?: string;
  durationMs: number;
  modelRaw: string;
}

export interface ComputerUseLoopOptions {
  goal: string;
  sandbox: E2bSandboxLike;
  vision: VisionClient & {
    planAction?(opts: {
      goal: string;
      imageBase64: string;
      history: ReadonlyArray<ComputerUseStep>;
    }): Promise<ComputerUseAction>;
  };
  maxSteps?: number;
  frameIntervalMs?: number;
  adapter?: E2bBrowserAdapter;
  viewport?: { width: number; height: number };
  onStep?: (step: ComputerUseStep) => void;
}

export interface ComputerUseLoopResult {
  steps: ComputerUseStep[];
  finalScreenshot?: string;
  finishedReason: 'done' | 'max-steps' | 'error';
  error?: string;
}

/**
 * Stream frames from an e2b Desktop sandbox.
 * Polls `sandbox.screenshot()` on an interval and pushes base64 strings.
 */
export class E2bStreamSession {
  private readonly sandbox: E2bSandboxLike;
  private readonly intervalMs: number;
  private readonly listeners = new Set<(frame: string) => void>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;

  constructor(opts: { sandbox: E2bSandboxLike; intervalMs?: number }) {
    this.sandbox = opts.sandbox;
    this.intervalMs = opts.intervalMs ?? DEFAULT_FRAME_INTERVAL_MS;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.tick();
    this.timer = setInterval(() => this.tick(), this.intervalMs);
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  subscribe(listener: (frame: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async tick(): Promise<void> {
    if (!this.running) return;
    try {
      const shot = await this.sandbox.screenshot();
      const b64 = toBase64(shot);
      for (const listener of this.listeners) {
        listener(b64);
      }
    } catch {
      // Skip failed frames
    }
  }
}

const DEFAULT_MAX_STEPS = 25;
const DEFAULT_FRAME_INTERVAL_MS = 250;

/**
 * Computer-use agent loop.
 * The model sees a screenshot and the user's goal, returns one action per step.
 */
export async function runComputerUseLoop(
  opts: ComputerUseLoopOptions,
): Promise<ComputerUseLoopResult> {
  const maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS;
  const viewport = opts.viewport ?? { width: 1280, height: 720 };
  const adapter =
    opts.adapter ?? new E2bBrowserAdapter({ sandbox: opts.sandbox, vision: opts.vision, viewport });
  const steps: ComputerUseStep[] = [];

  for (let i = 0; i < maxSteps; i += 1) {
    const before = toBase64(await opts.sandbox.screenshot());
    const stepStart = Date.now();

    if (!opts.vision.planAction) {
      return {
        steps,
        finishedReason: 'error',
        error: 'ComputerUseLoop: vision provider is missing planAction().',
      };
    }

    let action: ComputerUseAction;
    try {
      action = await opts.vision.planAction({
        goal: opts.goal,
        imageBase64: before,
        history: steps,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return { steps, finishedReason: 'error', error: `planAction failed: ${reason}` };
    }

    const step: ComputerUseStep = {
      index: i,
      action,
      screenshotBefore: before,
      durationMs: 0,
      modelRaw: '',
    };

    if (action.type === 'done') {
      step.durationMs = Date.now() - stepStart;
      steps.push(step);
      opts.onStep?.(step);
      return { steps, finishedReason: 'done', finalScreenshot: before };
    }

    try {
      await executeAction(adapter, opts.sandbox, action);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      step.durationMs = Date.now() - stepStart;
      steps.push(step);
      opts.onStep?.(step);
      return { steps, finishedReason: 'error', error: `step ${i} ${action.type} failed: ${reason}` };
    }

    step.screenshotAfter = toBase64(await opts.sandbox.screenshot());
    step.durationMs = Date.now() - stepStart;
    steps.push(step);
    opts.onStep?.(step);
  }

  const final = toBase64(await opts.sandbox.screenshot());
  return { steps, finalScreenshot: final, finishedReason: 'max-steps' };
}

async function executeAction(
  adapter: E2bBrowserAdapter,
  sandbox: E2bSandboxLike,
  action: ComputerUseAction,
): Promise<void> {
  switch (action.type) {
    case 'click':
      await sandbox.click(action.x, action.y);
      return;
    case 'click_selector':
      await adapter.callBrowserTool('browser_click', { selector: action.selector });
      return;
    case 'type':
      await sandbox.write(action.text);
      return;
    case 'press':
      await sandbox.press(action.key);
      return;
    case 'navigate':
      await sandbox.open(action.url);
      return;
    case 'done':
      return;
  }
}

function toBase64(shot: unknown): string {
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
  return '';
}
