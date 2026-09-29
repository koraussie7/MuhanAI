/**
 * OpenTelemetry instrumentation for MuhanAI API Server
 *
 * Initializes tracing with auto-instrumentation for:
 * - Fastify (HTTP server)
 * - Node.js core modules
 * - Prisma (database)
 * - Redis
 * - Custom spans for agent operations
 *
 * Uses dynamic imports to gracefully handle missing dependencies.
 */

import {
	type Context,
	context as otelContext,
	propagation,
	type Span,
	type Tracer,
	trace,
} from "@opentelemetry/api";
import type { FastifyReply, FastifyRequest } from "fastify";

interface TracedRequest extends FastifyRequest {
	traceSpan?: Span;
}

// Global SDK instance
let sdk: { shutdown(): Promise<void>; start(): void } | null = null;
let tracer: Tracer | null = null;
let telemetryEnabled = false;

export interface TelemetryConfig {
	serviceName: string;
	endpoint?: string;
	headers?: Record<string, string>;
	enabled?: boolean;
}

let initPromise: Promise<Tracer | null> | null = null;

export function initTelemetry(config: TelemetryConfig): Promise<Tracer | null> {
	if (config.enabled === false) {
		console.log("[Telemetry] Disabled via config");
		return Promise.resolve(null);
	}

	const endpoint = config.endpoint ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
	if (!endpoint) {
		console.log("[Telemetry] OTEL_EXPORTER_OTLP_ENDPOINT not set, skipping initialization");
		return Promise.resolve(null);
	}

	if (initPromise) return initPromise;

	initPromise = initializeOtel(config, endpoint);
	return initPromise;
}

async function initializeOtel(config: TelemetryConfig, endpoint: string): Promise<Tracer | null> {
	try {
		// Dynamic imports to avoid hard dependency
		const { NodeSDK } = await import("@opentelemetry/sdk-node");
		const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-http");
		const { getNodeAutoInstrumentations } = await import(
			"@opentelemetry/auto-instrumentations-node"
		);
		const { Resource } = await import("@opentelemetry/resources");
		const { SemanticResourceAttributes } = await import("@opentelemetry/semantic-conventions");

		const exporter = new OTLPTraceExporter({
			url: endpoint,
			headers:
				config.headers ??
				(process.env.OTEL_EXPORTER_OTLP_HEADERS
					? JSON.parse(process.env.OTEL_EXPORTER_OTLP_HEADERS)
					: undefined),
		});

		sdk = new NodeSDK({
			traceExporter: exporter,
			instrumentations: [
				getNodeAutoInstrumentations({
					// Disable noisy instrumentations
					"@opentelemetry/instrumentation-fs": { enabled: false },
					"@opentelemetry/instrumentation-dns": { enabled: false },
					// Enable important ones
					"@opentelemetry/instrumentation-fastify": { enabled: true },
					"@opentelemetry/instrumentation-http": { enabled: true },
					"@opentelemetry/instrumentation-express": { enabled: true },
					"@opentelemetry/instrumentation-pg": { enabled: true },
					"@opentelemetry/instrumentation-redis-4": { enabled: true },
					"@opentelemetry/instrumentation-ioredis": { enabled: true },
				}),
			],
			resource: new Resource({
				[SemanticResourceAttributes.SERVICE_NAME]: config.serviceName,
				[SemanticResourceAttributes.SERVICE_VERSION]: process.env.npm_package_version ?? "0.1.0",
				[SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV ?? "development",
			}),
		});

		sdk.start();
		tracer = trace.getTracer(config.serviceName);
		telemetryEnabled = true;

		// Graceful shutdown
		process.on("SIGTERM", shutdownTelemetry);
		process.on("SIGINT", shutdownTelemetry);

		console.log(`[Telemetry] Initialized for ${config.serviceName}, exporting to ${endpoint}`);
		return tracer;
	} catch (error) {
		console.warn(
			"[Telemetry] Failed to initialize OpenTelemetry (dependencies may be missing):",
			error instanceof Error ? error.message : String(error),
		);
		console.log(
			"[Telemetry] Continuing without distributed tracing. Install @opentelemetry packages to enable.",
		);
		return null;
	}
}

export function getTracer(): Tracer | null {
	return tracer;
}

export function isTelemetryEnabled(): boolean {
	return telemetryEnabled;
}

export async function shutdownTelemetry(): Promise<void> {
	if (sdk) {
		try {
			await sdk.shutdown();
			console.log("[Telemetry] Shutdown complete");
		} catch (error) {
			console.error("[Telemetry] Error during shutdown:", error);
		}
	}
}

/**
 * Create a custom span for agent operations
 */
export function createAgentSpan(
	name: string,
	attributes: Record<string, string | number | boolean> = {},
): Span | null {
	if (!tracer) return null;

	return tracer.startSpan(name, {
		attributes: {
			"muhanai.agent": true,
			...attributes,
		},
	});
}

/**
 * Run a function within a trace context
 */
export function runWithTrace<T>(
	spanName: string,
	fn: (span: Span | null) => Promise<T>,
	attributes?: Record<string, string | number | boolean>,
): Promise<T> {
	if (!tracer) {
		return fn(null);
	}

	return tracer.startActiveSpan(spanName, { attributes }, async (span: Span) => {
		try {
			const result = await fn(span);
			span.setStatus({ code: 1 });
			return result;
		} catch (error) {
			span.setStatus({
				code: 2,
				message: error instanceof Error ? error.message : String(error),
			});
			span.recordException(error instanceof Error ? error : new Error(String(error)));
			throw error;
		} finally {
			span.end();
		}
	});
}

/**
 * Extract trace context from headers (for distributed tracing)
 */
export function extractTraceContext(
	headers: Record<string, string | string[] | undefined>,
): Context {
	const carrier: Record<string, string> = {};
	for (const [key, value] of Object.entries(headers)) {
		if (typeof value === "string") {
			carrier[key.toLowerCase()] = value;
		} else if (Array.isArray(value) && value.length > 0) {
			const firstValue = value[0];
			if (firstValue !== undefined) carrier[key.toLowerCase()] = firstValue;
		}
	}
	return propagation.extract(otelContext.active(), carrier);
}

/**
 * Inject trace context into headers (for outgoing requests)
 */
export function injectTraceContext(headers: Record<string, string>): void {
	propagation.inject(otelContext.active(), headers);
}

/**
 * Middleware to add trace context to Fastify request/reply
 */
export function traceMiddleware() {
	return async (request: TracedRequest, reply: FastifyReply) => {
		if (!tracer) return;

		// Extract incoming trace context
		const ctx = extractTraceContext(request.headers);

		// Create span for this request
		const span = tracer.startSpan(`${request.method} ${request.url}`, {}, ctx);

		// Add request attributes
		span.setAttribute("http.method", request.method);
		span.setAttribute("http.url", request.url);
		span.setAttribute("http.scheme", request.protocol);
		span.setAttribute("http.host", String(request.headers.host ?? "unknown"));
		span.setAttribute("http.user_agent", String(request.headers["user-agent"] ?? ""));

		// Store span on request for later use
		request.traceSpan = span;

		// End span when response is sent
		reply.raw.on("finish", () => {
			span.setAttribute("http.status_code", reply.statusCode);
			span.end();
		});
	};
}

/**
 * Add trace headers to outgoing requests (fetch, axios, etc.)
 */
export function addTraceHeaders(headers: Record<string, string>): Record<string, string> {
	const newHeaders = { ...headers };
	injectTraceContext(newHeaders);
	return newHeaders;
}
