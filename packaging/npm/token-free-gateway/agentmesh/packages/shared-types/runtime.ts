/**
 * Runtime abstraction for child-process spawning.
 *
 * Two of our packages (noema, hivebear) shell out to external CLIs. They
 * originally called `Bun.spawn(...)` directly, which means they can only
 * run under Bun. This module gives them a single seam that resolves to
 * the right backend:
 *
 *   - Bun runtime → `Bun.spawn` (zero-copy stdio via `Response(proc.stdout)`)
 *   - Node runtime → `node:child_process.spawn` (async stdout via Promises)
 *
 * Callers use the unified `SpawnResult` and don't care which backend ran.
 *
 * Detection is intentionally one-shot — we read `globalThis.Bun` once at
 * module load and freeze the choice. Switching backends mid-process is
 * not supported and would be a foot-gun anyway (different stream shapes).
 */

import type { Readable } from "node:stream";

export interface SpawnOptions {
	stdout?: "pipe" | "ignore";
	stderr?: "pipe" | "ignore";
	cwd?: string;
	env?: Record<string, string>;
}

export interface SpawnResult {
	/** Resolves with the captured stdout text. Empty string if stdout was ignored. */
	stdout: Promise<string>;
	/** Resolves with the captured stderr text. Empty string if stderr was ignored. */
	stderr: Promise<string>;
	/** Resolves with the exit code (0 on success). */
	exitCode: Promise<number>;
}

type SpawnFn = (args: string[], opts?: SpawnOptions) => Promise<SpawnResult>;

declare const Bun:
	| {
			spawn: (
				args: string[],
				opts: {
					stdout?: "pipe" | "ignore";
					stderr?: "pipe" | "ignore";
					cwd?: string;
					env?: Record<string, string>;
				},
			) => {
				stdout: ReadableStream<Uint8Array>;
				stderr: ReadableStream<Uint8Array>;
				exited: Promise<number>;
			};
	  }
	| undefined;

const isBun = typeof Bun !== "undefined";

function collectStream(stream: Readable | null): Promise<string> {
	if (!stream) return Promise.resolve("");
	return new Promise((resolve) => {
		const chunks: Buffer[] = [];
		stream.on("data", (chunk: Buffer) => chunks.push(chunk));
		stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
		stream.on("error", () => resolve(""));
	});
}

const bunSpawn: SpawnFn = async (args, opts = {}) => {
	// array-form args — prevents shell injection.
	if (!Bun) throw new Error("Bun runtime required for bunSpawn");
	const proc = Bun.spawn(args, {
		stdout: opts.stdout,
		stderr: opts.stderr,
		cwd: opts.cwd,
		env: opts.env,
	});
	return {
		stdout: new Response(proc.stdout).text(),
		stderr: new Response(proc.stderr).text(),
		exitCode: proc.exited,
	};
};

const nodeSpawn: SpawnFn = async (args, opts = {}) => {
	const cp = await import("node:child_process");
	const stdio: ["ignore", "pipe" | "ignore", "pipe" | "ignore"] = [
		"ignore",
		opts.stdout === "pipe" ? "pipe" : "ignore",
		opts.stderr === "pipe" ? "pipe" : "ignore",
	];
	return new Promise<SpawnResult>((resolve, reject) => {
		try {
			const [command, ...restArgs] = args;
			// array-form args — prevents shell injection (shell:false is the default).
			const proc = cp.spawn(command ?? "", restArgs, {
				stdio,
				cwd: opts.cwd,
				env: opts.env as NodeJS.ProcessEnv | undefined,
			}) as unknown as {
				stdout: Readable | null;
				stderr: Readable | null;
				on(event: "close", cb: (code: number | null) => void): unknown;
			};
			resolve({
				stdout: collectStream(proc.stdout),
				stderr: collectStream(proc.stderr),
				exitCode: new Promise<number>((res) => {
					proc.on("close", (code) => res(code ?? -1));
				}),
			});
		} catch (err) {
			reject(err);
		}
	});
};

export const spawn: SpawnFn = isBun ? bunSpawn : nodeSpawn;

/** Reports which runtime we're operating in. Exposed for diagnostics/tests. */
export const runtime: "bun" | "node" = isBun ? "bun" : "node";
