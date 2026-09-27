import type { Message, ModelInfo } from "../types";

/**
 * OpenHydra JSON-RPC 2.0 over WebSocket protocol.
 *
 * OpenHydra is a P2P inference daemon that exposes a JSON-RPC surface.
 * Unlike Ollama's newline-delimited SSE, OpenHydra uses a single WebSocket
 * connection that multiplexes multiple requests via the `id` field.
 */

export type OpenHydraMethod = "chat" | "models" | "ping" | "pull" | "unload";

export interface OpenHydraRequest {
	jsonrpc: "2.0";
	id: string;
	method: OpenHydraMethod;
	params: {
		model: string;
		messages?: Message[];
		stream?: boolean;
		maxTokens?: number;
		temperature?: number;
		topP?: number;
		systemPrompt?: string;
	};
}

export interface OpenHydraChatResult {
	text?: string;
	token?: string;
	more?: boolean;
	done?: boolean;
}

export interface OpenHydraModelsResult {
	models: Array<{
		name: string;
		size?: number;
		fmt?: string;
		parameters?: string;
		quantization?: string;
		downloaded?: boolean;
	}>;
}

export interface OpenHydraResponse {
	jsonrpc: "2.0";
	id: string;
	result?: OpenHydraChatResult | OpenHydraModelsResult | { ok?: boolean };
	error?: { code: number; message: string; data?: unknown };
}

export type OpenHydraEndpoint = string;
export type OpenHydraBootstrap = string[];

export interface OpenHydraNode {
	peerId: string;
	endpoint: OpenHydraEndpoint;
	lastSeen: number;
}

export interface OpenHydraDiscoveryOptions {
	bootstrap: OpenHydraBootstrap;
	discoveryTimeoutMs?: number;
}

export interface OpenHydraEngineConfig {
	endpoints?: OpenHydraEndpoint[];
	bootstrap?: OpenHydraBootstrap;
	model?: string;
	maxTokens?: number;
	temperature?: number;
	topP?: number;
	systemPrompt?: string;
	discoveryTimeoutMs?: number;
}

export interface OpenHydraErrorInfo {
	code: number;
	message: string;
	data?: unknown;
}

export type OpenHydraModelInfo = ModelInfo;
