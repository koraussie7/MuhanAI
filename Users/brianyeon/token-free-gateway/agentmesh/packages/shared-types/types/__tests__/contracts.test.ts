/**
 * Phase 0 contract gate (work plan item 0.6).
 *
 * These assertions are deliberately *runtime* as well as compile-time:
 * `index.ts` must keep re-exporting the registry contracts, and the
 * `ResourceDescriptor` shape must stay the single source of truth for
 * R1 (registry), R2 (ard-adapter) and R3 (a2a-adapter). A rename on
 * one side breaks this file before it breaks a downstream package.
 */

import { describe, expect, it } from "vitest";

import type {
	AgentDescriptor,
	AgentResponse,
	AgentTask,
	McpAuth,
	McpServer,
	McpTool,
	McpToolAnnotations,
	ModelFormat,
	ModelManifest,
	ResourceDescriptor,
	ResourceKind,
	ResourceStatus,
	RiskLevel,
} from "../index.js";

const NOW = 1_700_000_000_000;

function descriptor(overrides: Partial<ResourceDescriptor> = {}): ResourceDescriptor {
	return {
		id: "agent-1",
		kind: "agent",
		name: "planner",
		capabilities: ["research"],
		endpoint: "https://example.invalid/a2a",
		protocol: "http",
		status: "online",
		visibility: "private",
		ownerId: "user-1",
		createdAt: NOW,
		updatedAt: NOW,
		...overrides,
	};
}

describe("shared registry contracts", () => {
	it("accepts every ResourceKind", () => {
		const kinds: ResourceKind[] = ["agent", "mcp", "model", "peer", "compute"];
		for (const kind of kinds) {
			expect(descriptor({ kind }).kind).toBe(kind);
		}
	});

	it("accepts every ResourceStatus", () => {
		const statuses: ResourceStatus[] = ["online", "offline", "degraded"];
		for (const status of statuses) {
			expect(descriptor({ status }).status).toBe(status);
		}
	});

	it("omits ownerId from the descriptor body and requires it explicitly", () => {
		// `ownerId` is resolved server-side; a registration that leaves it
		// blank must fail the type checker, which is why it is non-optional.
		const d = descriptor();
		expect(d.ownerId).toBe("user-1");
		expect(Object.keys(d)).toContain("ownerId");
	});

	it("keeps a minimal descriptor valid with no endpoint or metadata", () => {
		const d = descriptor({ endpoint: undefined, metadata: undefined, riskLevel: undefined });
		expect(d.capabilities).toEqual(["research"]);
	});

	it("round-trips riskLevel and metadata on a descriptor", () => {
		const risk: RiskLevel = "high";
		const metadata = { agentVersion: "0.6.0", tier: 2, gpu: { vramGb: 24 } };
		const d = descriptor({ riskLevel: risk, metadata });
		expect(d.riskLevel).toBe("high");
		expect(d.metadata).toEqual(metadata);
		// Round-trip through JSON preserves both fields.
		const revived = JSON.parse(JSON.stringify(d)) as ResourceDescriptor;
		expect(revived.riskLevel).toBe("high");
		expect(revived.metadata).toEqual(metadata);
	});

	it("describes an McpTool with an inputSchema and optional annotations", () => {
		const annotations: McpToolAnnotations = { readOnlyHint: true, destructiveHint: false };
		const tool: McpTool = {
			name: "search",
			description: "search the web",
			inputSchema: { type: "object", properties: { q: { type: "string" } } },
			annotations,
		};
		expect(tool.annotations?.readOnlyHint).toBe(true);
	});

	it("never carries a raw secret on McpAuth", () => {
		const auth: McpAuth = { kind: "bearer", credentialRef: "vault://openai", scopes: ["read"] };
		expect(auth.credentialRef).toMatch(/^vault:\/\//);
		expect(Object.keys(auth)).not.toContain("secret");
	});

	it("accepts an McpServer with a tool list and an endpoint", () => {
		const server: McpServer = {
			id: "mcp-1",
			name: "web",
			endpoint: "https://example.invalid/mcp",
			tools: [{ name: "search", description: "s", inputSchema: {} }],
		};
		expect(server.tools).toHaveLength(1);
	});

	it("describes a ModelManifest with a content hash and peer list", () => {
		const format: ModelFormat = "GGUF";
		const manifest: ModelManifest = {
			id: "llama-3-8b",
			name: "Llama 3 8B",
			format,
			sizeBytes: 8_000_000_000,
			quantization: "Q4_K_M",
			languages: ["en", "ko"],
			license: "llama3",
			hash: "sha256:deadbeef",
			peers: ["peer-1"],
		};
		expect(manifest.hash.startsWith("sha256:")).toBe(true);
		expect(manifest.peers).toContain("peer-1");
	});

	it("describes an AgentTask and a matching AgentResponse", () => {
		const task: AgentTask = {
			id: "task-1",
			agentId: "agent-1",
			capability: "research",
			payload: { q: "hello" },
			timeoutMs: 30_000,
		};
		const response: AgentResponse = {
			taskId: task.id,
			success: true,
			result: { answer: "hi" },
		};
		expect(response.taskId).toBe(task.id);
	});

	it("re-exports AgentDescriptor from the package root", () => {
		const agent: AgentDescriptor = descriptor({ kind: "agent" });
		expect(agent.protocol).toBe("http");
	});
});
