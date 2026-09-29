/**
 * Agent-facing wire contracts.
 *
 * These are the *registry/discovery* view of an agent. The execution-side
 * `AgentDefinition` lives in `packages/agent-core/src/types.ts` and is the
 * source of truth; this file is the serialisable projection of it.
 */
import type { ResourceKind, ResourceStatus } from "./resource.js";

export interface AgentDescriptor {
	id: string;
	name: string;
	capabilities: string[];
	models: string[];
	mcpTools: string[];
	endpoint: string;
	protocol: "mcp" | "http" | "ws" | "grpc";
	status: ResourceStatus;
	lastSeen: number;
}

export interface AgentTask {
	id: string;
	agentId: string;
	capability: string;
	payload: unknown;
	timeoutMs: number;
}

export interface AgentResponse {
	taskId: string;
	success: boolean;
	result?: unknown;
	error?: string;
}

export type { ResourceKind };
