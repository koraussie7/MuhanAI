function createId(): string {
	return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
		const random = Math.floor(Math.random() * 16);
		const value = character === "x" ? random : (random & 0x3) | 0x8;
		return value.toString(16);
	});
}

export interface AgentSpan {
	name: string;
	agentId?: string;
	model?: string;
	input?: unknown;
	output?: unknown;
	error?: string;
	startTime: number;
	endTime?: number;
	attributes?: Record<string, string | number | boolean | undefined>;
	spanId: string;
	parentSpanId?: string;
	sessionId: string;
	rootSpanId: string;
}

export interface AgentTracerOptions {
	sessionId?: string;
	exporter?: (spans: AgentSpan[]) => Promise<void>;
	onSpanEnd?: (span: AgentSpan) => void;
}

export class AgentTracer {
	private spans: AgentSpan[] = [];
	private activeSpans = new Map<string, AgentSpan>();
	private readonly sessionId: string;
	private readonly rootSpanId: string;
	private readonly exporter?: (spans: AgentSpan[]) => Promise<void>;
	private readonly onSpanEnd?: (span: AgentSpan) => void;

	constructor(options: AgentTracerOptions = {}) {
		this.sessionId = options.sessionId ?? createId();
		this.rootSpanId = createId();
		this.exporter = options.exporter;
		this.onSpanEnd = options.onSpanEnd;
	}

	startSpan(name: string, attributes?: AgentSpan["attributes"], parentSpanId?: string): string {
		const spanId = createId();
		const span: AgentSpan = {
			name,
			startTime: Date.now(),
			attributes: { ...attributes, sessionId: this.sessionId, rootSpanId: this.rootSpanId },
			spanId,
			parentSpanId: parentSpanId ?? this.rootSpanId,
			sessionId: this.sessionId,
			rootSpanId: this.rootSpanId,
		};
		this.activeSpans.set(spanId, span);
		this.spans.push(span);
		return spanId;
	}

	endSpan(
		spanId: string,
		data: Partial<
			Pick<AgentSpan, "output" | "error" | "agentId" | "model" | "input" | "attributes">
		> &
			Record<string, unknown> = {},
	): void {
		const span = this.activeSpans.get(spanId);
		if (!span) return;

		Object.assign(span, data, { endTime: Date.now() });
		this.activeSpans.delete(spanId);

		this.onSpanEnd?.(span);
	}

	async flush(): Promise<void> {
		if (this.exporter) {
			await this.exporter(this.spans);
		}
	}

	getSpans(): AgentSpan[] {
		return [...this.spans];
	}

	getSessionId(): string {
		return this.sessionId;
	}

	getRootSpanId(): string {
		return this.rootSpanId;
	}
}

export function createTracer(options?: AgentTracerOptions): AgentTracer {
	return new AgentTracer(options);
}

export function spanName(prefix: string, suffix: string): string {
	return `${prefix}:${suffix}`;
}
