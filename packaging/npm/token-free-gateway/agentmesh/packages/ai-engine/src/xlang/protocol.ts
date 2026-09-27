import type { Message } from "../types";

export type XLangRequestMethod = "health" | "capabilities" | "chat" | "execute";

export interface XLangCapability {
	name: string;
	kind: "model" | "tool" | "device" | "workflow";
	version?: string;
	supportsStreaming?: boolean;
}

export interface XLangPeerInfo {
	peerId: string;
	endpoint: string;
	runtime: "xlang";
	version?: string;
	capabilities: XLangCapability[];
	models?: string[];
	supportsStreaming: boolean;
}

export interface XLangRequestParams {
	model?: string;
	messages?: Message[];
	prompt?: string;
	workflow?: unknown;
	tools?: unknown[];
	stream?: boolean;
	maxTokens?: number;
	temperature?: number;
}

export interface XLangPeerRequest {
	id: string;
	method: XLangRequestMethod;
	params?: XLangRequestParams;
}

export interface XLangPeerResponse {
	id: string;
	ok: boolean;
	result?: {
		text?: string;
		output?: unknown;
		capabilities?: XLangCapability[];
		peer?: Partial<XLangPeerInfo>;
	};
	error?: {
		code: string;
		message: string;
		data?: unknown;
	};
}

export interface XLangStreamEvent {
	type: "text" | "done" | "error";
	text?: string;
	error?: { code?: string; message: string };
}

export function isXLangPeerResponse(value: unknown): value is XLangPeerResponse {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Record<string, unknown>;
	return typeof candidate.id === "string" && typeof candidate.ok === "boolean";
}

export function isXLangStreamEvent(value: unknown): value is XLangStreamEvent {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Record<string, unknown>;
	return candidate.type === "text" || candidate.type === "done" || candidate.type === "error";
}
