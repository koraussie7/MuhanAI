import type { Message } from "../types";
import {
	isXLangPeerResponse,
	isXLangStreamEvent,
	type XLangCapability,
	type XLangPeerInfo,
	type XLangPeerRequest,
	type XLangPeerResponse,
} from "./protocol";

export interface XLangClientOptions {
	endpoint: string;
	timeoutMs?: number;
	transport?: "http";
	fetcher?: typeof fetch;
}

export interface XLangChatOptions {
	model?: string;
	stream?: boolean;
	signal?: AbortSignal;
	onToken?: (token: string) => void;
}

const DEFAULT_TIMEOUT_MS = 10_000;

function abortError(): Error {
	return new DOMException("The XLang request was aborted", "AbortError");
}

function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): {
	signal: AbortSignal;
	cleanup: () => void;
} {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	const onAbort = () => controller.abort();
	signal?.addEventListener("abort", onAbort, { once: true });
	return {
		signal: controller.signal,
		cleanup: () => {
			clearTimeout(timer);
			signal?.removeEventListener("abort", onAbort);
		},
	};
}

export class XLangClient {
	private readonly endpoint: string;
	private readonly timeoutMs: number;
	private readonly fetcher: typeof fetch;

	constructor(options: XLangClientOptions) {
		if (!options.endpoint) throw new Error("XLang endpoint is required");
		this.endpoint = options.endpoint.replace(/\/$/, "");
		this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		this.fetcher = options.fetcher ?? fetch;
	}

	async health(signal?: AbortSignal): Promise<boolean> {
		try {
			const response = await this.request("health", undefined, signal);
			return response.ok;
		} catch {
			return false;
		}
	}

	async capabilities(signal?: AbortSignal): Promise<XLangPeerInfo> {
		const response = await this.request("capabilities", undefined, signal);
		const peer = response.result?.peer;
		const capabilities = response.result?.capabilities;
		if (!response.ok || !peer || !Array.isArray(capabilities)) {
			throw new Error(response.error?.message ?? "XLang capabilities response is invalid");
		}
		return {
			peerId: typeof peer.peerId === "string" ? peer.peerId : this.endpoint,
			endpoint: this.endpoint,
			runtime: "xlang",
			...(typeof peer.version === "string" ? { version: peer.version } : {}),
			capabilities: capabilities as XLangCapability[],
			...(Array.isArray(peer.models) ? { models: peer.models.filter((model): model is string => typeof model === "string") } : {}),
			supportsStreaming: peer.supportsStreaming === true,
		};
	}

	async chat(prompt: string, options: XLangChatOptions = {}): Promise<string> {
		const response = await this.request(
			"chat",
			{ prompt, model: options.model, stream: options.stream ?? false },
			options.signal,
		);
		if (!response.ok) throw new Error(response.error?.message ?? "XLang chat failed");
		const text = response.result?.text;
		if (typeof text !== "string") throw new Error("XLang chat response did not contain text");
		if (options.onToken) options.onToken(text);
		return text;
	}

	async execute(workflow: unknown, signal?: AbortSignal): Promise<unknown> {
		const response = await this.request("execute", { workflow }, signal);
		if (!response.ok) throw new Error(response.error?.message ?? "XLang workflow failed");
		return response.result?.output;
	}

	private async request(
		method: XLangPeerRequest["method"],
		params?: XLangPeerRequest["params"],
		signal?: AbortSignal,
	): Promise<XLangPeerResponse> {
		if (signal?.aborted) throw abortError();
		const timeout = withTimeout(signal, this.timeoutMs);
		try {
			const response = await this.fetcher(`${this.endpoint}/rpc`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					id: crypto.randomUUID(),
					method,
					...(params ? { params } : {}),
				} satisfies XLangPeerRequest),
				signal: timeout.signal,
			});
			if (!response.ok) throw new Error(`XLang peer returned HTTP ${response.status}`);
			const data: unknown = await response.json();
			if (!isXLangPeerResponse(data)) throw new Error("Invalid XLang response");
			return data;
		} catch (error) {
			if (signal?.aborted || timeout.signal.aborted) {
				throw signal?.aborted ? abortError() : new Error("XLang request timed out");
			}
			throw error;
		} finally {
			timeout.cleanup();
		}
	}
}

export type { Message };
