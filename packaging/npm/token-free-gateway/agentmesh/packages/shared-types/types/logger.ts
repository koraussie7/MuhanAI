/**
 * Shared logger for MuhanAI AgentMesh services.
 *
 * Defaults to pino-pretty when stdout is a TTY and `LOG_PRETTY=true`
 * (typical in dev); falls back to structured NDJSON in production.
 *
 * Consumers can override by setting `LOG_LEVEL`.
 */

import pino, { type LoggerOptions, type Logger as PinoLogger } from "pino";

export type Logger = PinoLogger;

export interface SharedLoggerOptions {
	level?: LoggerOptions["level"];
	service?: string;
	pretty?: boolean;
}

const FALLBACK_LEVEL: LoggerOptions["level"] =
	(typeof process !== "undefined" && process.env?.LOG_LEVEL) || "info";

function resolveOptions(opts: SharedLoggerOptions = {}): LoggerOptions {
	const level = opts.level ?? FALLBACK_LEVEL;
	const base: LoggerOptions = {
		level,
		base: {
			service: opts.service ?? "agentmesh",
			pid: typeof process !== "undefined" ? process.pid : undefined,
			env: typeof process !== "undefined" ? process.env?.NODE_ENV : undefined,
		},
	};

	const usePretty =
		opts.pretty ??
		(typeof process !== "undefined" &&
			process.env?.LOG_PRETTY === "true" &&
			Boolean(process.stdout?.isTTY));

	if (usePretty) {
		return {
			...base,
			transport: {
				target: "pino-pretty",
				options: {
					colorize: true,
					translateTime: "SYS:HH:MM:ss.l",
					ignore: "pid,hostname",
				},
			},
		};
	}
	return base;
}

let activeLogger: Logger | null = null;

export function getLogger(opts: SharedLoggerOptions = {}): Logger {
	if (activeLogger) return activeLogger;
	activeLogger = pino(resolveOptions(opts));
	return activeLogger;
}

export type { LoggerOptions };
