import type { AgentSpan } from "@agentmesh/core";

const runtime = globalThis as typeof globalThis & {
	process?: { env?: Record<string, string | undefined> };
	console?: { log: (...args: unknown[]) => void };
};

const dynamicImport = (specifier: string): Promise<Record<string, unknown>> =>
	new Function("specifier", "return import(specifier)")(specifier) as Promise<
		Record<string, unknown>
	>;

type OTelExporter = {
	forceFlush(): Promise<void>;
};
type OTelSdk = {
	start(): void;
	shutdown(): Promise<void>;
};
type LangfuseTrace = {
	span(options: Record<string, unknown>): void;
	update(options: Record<string, unknown>): void;
};
type LangfuseClient = {
	trace(options: Record<string, unknown>): LangfuseTrace;
	flushAsync(): Promise<void>;
	shutdownAsync(): Promise<void>;
};

export interface TelemetryExporter {
	export(spans: AgentSpan[]): Promise<void>;
	shutdown?(): Promise<void>;
}

export interface OtelConfig {
	serviceName: string;
	endpoint?: string;
	headers?: Record<string, string>;
}

export interface LangfuseConfig {
	publicKey: string;
	secretKey: string;
	baseUrl?: string;
}

/**
 * Creates an OpenTelemetry HTTP exporter for AgentSpan data.
 * Compatible with OneUptime, Jaeger, Tempo, Grafana, etc.
 */
export async function createOtelExporter(config: OtelConfig): Promise<TelemetryExporter> {
	// Dynamic import to avoid bundling OTel in browser
	const { NodeSDK } = (await dynamicImport("@opentelemetry/sdk-node")) as {
		NodeSDK: new (options: Record<string, unknown>) => OTelSdk;
	};
	const { OTLPTraceExporter } = (await dynamicImport(
		"@opentelemetry/exporter-trace-otlp-http",
	)) as {
		OTLPTraceExporter: new (options: Record<string, unknown>) => OTelExporter;
	};
	const { Resource } = (await dynamicImport("@opentelemetry/resources")) as {
		Resource: new (attributes: Record<string, unknown>) => unknown;
	};
	const { SemanticResourceAttributes } = (await dynamicImport(
		"@opentelemetry/semantic-conventions",
	)) as {
		SemanticResourceAttributes: { SERVICE_NAME: string };
	};

	const exporter = new OTLPTraceExporter({
		url:
			config.endpoint ??
			runtime.process?.env?.OTEL_EXPORTER_OTLP_ENDPOINT ??
			"http://localhost:4318/v1/traces",
		headers: config.headers,
	});

	const sdk = new NodeSDK({
		traceExporter: exporter,
		resource: new Resource({
			[SemanticResourceAttributes.SERVICE_NAME]: config.serviceName,
		}),
	});

	sdk.start();

	return {
		async export(spans: AgentSpan[]) {
			// Convert AgentSpan to OTel spans and export
			// This is a simplified version - in production you'd use the full OTel API
			for (const span of spans) {
				// The actual OTel span creation would happen here
				// For now we rely on the auto-instrumentation
				runtime.console?.log(`[OTel] Exporting span: ${span.name}`, {
					spanId: span.spanId,
					sessionId: span.sessionId,
					duration: span.endTime ? span.endTime - span.startTime : undefined,
				});
			}
			await exporter.forceFlush();
		},
		async shutdown() {
			await sdk.shutdown();
		},
	};
}

/**
 * Creates a Langfuse exporter for AgentSpan data.
 * Requires @langfuse/client or langfuse package.
 */
export async function createLangfuseExporter(config: LangfuseConfig): Promise<TelemetryExporter> {
	const { Langfuse } = (await dynamicImport("langfuse")) as {
		Langfuse: new (options: Record<string, unknown>) => LangfuseClient;
	};

	const langfuse = new Langfuse({
		publicKey: config.publicKey,
		secretKey: config.secretKey,
		baseUrl: config.baseUrl ?? runtime.process?.env?.LANGFUSE_HOST,
	});

	return {
		async export(spans: AgentSpan[]) {
			const trace = langfuse.trace({
				name: "muhanai-agent-session",
				sessionId: spans[0]?.sessionId,
				metadata: {
					rootSpanId: spans[0]?.rootSpanId,
				},
			});

			for (const span of spans) {
				trace.span({
					name: span.name,
					input: span.input,
					output: span.output,
					metadata: {
						...span.attributes,
						agentId: span.agentId,
						model: span.model,
						spanId: span.spanId,
						parentSpanId: span.parentSpanId,
						sessionId: span.sessionId,
						rootSpanId: span.rootSpanId,
					},
					level: span.error ? "ERROR" : "DEFAULT",
					startTime: new Date(span.startTime),
					endTime: span.endTime ? new Date(span.endTime) : undefined,
				});
			}

			await langfuse.flushAsync();
		},
		async shutdown() {
			await langfuse.shutdownAsync();
		},
	};
}

/**
 * Creates a console exporter for development/debugging.
 */
export function createConsoleExporter(): TelemetryExporter {
	return {
		async export(spans: AgentSpan[]) {
			runtime.console?.log("\n=== AgentMesh Trace ===");
			runtime.console?.log(`Session: ${spans[0]?.sessionId}`);
			runtime.console?.log(`Root: ${spans[0]?.rootSpanId}`);
			for (const span of spans) {
				const duration = span.endTime ? span.endTime - span.startTime : "ongoing";
				const status = span.error ? "❌ ERROR" : span.endTime ? "✅ OK" : "⏳ RUNNING";
				runtime.console?.log(`  ${status} ${span.name} (${duration}ms)`);
				if (span.error) runtime.console?.log(`    Error: ${span.error}`);
				if (span.agentId) runtime.console?.log(`    Agent: ${span.agentId}`);
				if (span.model) runtime.console?.log(`    Model: ${span.model}`);
			}
			runtime.console?.log("========================\n");
		},
	};
}

/**
 * Creates a multi-exporter that sends to multiple destinations.
 */
export function createMultiExporter(...exporters: TelemetryExporter[]): TelemetryExporter {
	return {
		async export(spans: AgentSpan[]) {
			await Promise.all(exporters.map((e) => e.export(spans)));
		},
		async shutdown() {
			await Promise.all(exporters.map((e) => e.shutdown?.()));
		},
	};
}

/**
 * Creates an exporter from environment variables.
 * Supports: OTEL_EXPORTER_OTLP_ENDPOINT, LANGFUSE_PUBLIC_KEY/LANGFUSE_SECRET_KEY
 */
export async function createExporterFromEnv(serviceName: string): Promise<TelemetryExporter> {
	const exporters: TelemetryExporter[] = [];

	// Always add console exporter in development
	if (runtime.process?.env?.NODE_ENV !== "production") {
		exporters.push(createConsoleExporter());
	}

	// OpenTelemetry
	if (
		runtime.process?.env?.OTEL_EXPORTER_OTLP_ENDPOINT ||
		runtime.process?.env?.ONEUPTIME_ENDPOINT
	) {
		exporters.push(
			await createOtelExporter({
				serviceName,
				endpoint:
					runtime.process?.env?.OTEL_EXPORTER_OTLP_ENDPOINT ??
					runtime.process?.env?.ONEUPTIME_ENDPOINT,
				headers: runtime.process?.env?.OTEL_EXPORTER_OTLP_HEADERS
					? JSON.parse(runtime.process?.env?.OTEL_EXPORTER_OTLP_HEADERS)
					: undefined,
			}),
		);
	}

	// Langfuse
	if (runtime.process?.env?.LANGFUSE_PUBLIC_KEY && runtime.process?.env?.LANGFUSE_SECRET_KEY) {
		exporters.push(
			await createLangfuseExporter({
				publicKey: runtime.process.env.LANGFUSE_PUBLIC_KEY,
				secretKey: runtime.process.env.LANGFUSE_SECRET_KEY,
				baseUrl: runtime.process?.env.LANGFUSE_HOST,
			}),
		);
	}

	if (exporters.length === 1) {
		const exporter = exporters[0];
		if (exporter) return exporter;
	}

	return createMultiExporter(...exporters);
}
