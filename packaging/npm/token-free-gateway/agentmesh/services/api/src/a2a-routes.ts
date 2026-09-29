/**
 * A2A (Agent-to-Agent) Server Routes — Fastify plugin.
 *
 * Implements the A2A protocol endpoints:
 * - GET  /.well-known/agent.json          — Agent Card (discovery)
 * - POST /a2a/rpc                         — JSON-RPC 2.0 endpoint
 * - POST /a2a/tasks/send                  — Create/execute task
 * - POST /a2a/tasks/sendSubscribe         — Create task + subscribe to updates
 * - POST /a2a/tasks/get                   — Get task status/result
 * - POST /a2a/tasks/cancel                — Cancel task
 * - POST /a2a/tasks/pushNotification/set  — Configure push notifications
 * - POST /a2a/tasks/pushNotification/get  — Get push notification config
 *
 * Uses shared types from @agentmesh/shared-types.
 */

import type {
	AgentCard,
	Task,
	TaskArtifact,
	TaskCancelParams,
	TaskMessage,
	TaskPushNotificationConfig,
	TaskQueryParams,
	TaskSendParams,
	TaskStatus,
} from "@agentmesh/agent";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

// In-memory task store (replace with KV/D1 in production)
const taskStore = new Map<string, Task>();
const pushConfigStore = new Map<string, TaskPushNotificationConfig>();

// Agent registry reference (set by server.ts)
let agentRegistry: { getAgentCard: () => AgentCard } | null = null;

export function setAgentRegistry(registry: { getAgentCard: () => AgentCard }): void {
	agentRegistry = registry;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonRpcError(code: number, message: string, data?: unknown) {
	return { jsonrpc: "2.0" as const, error: { code, message, data } };
}

function jsonRpcResult(id: string | number, result: unknown) {
	return { jsonrpc: "2.0" as const, id, result };
}

function createTaskId(): string {
	return `task-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createTask(params: TaskSendParams): Task {
	const now = new Date().toISOString();
	const task: Task = {
		id: params.id,
		contextId: params.id,
		status: {
			state: "submitted",
			timestamp: now,
		},
		history: params.historyLength ? [] : undefined,
		metadata: {},
	};
	taskStore.set(task.id, task);
	return task;
}

function updateTaskStatus(
	taskId: string,
	state: TaskStatus["state"],
	message?: TaskMessage,
): Task | undefined {
	const task = taskStore.get(taskId);
	if (!task) return undefined;
	task.status = { state, message, timestamp: new Date().toISOString() };
	if (task.history && message) {
		task.history.push(message);
	}
	return task;
}

function addTaskArtifact(taskId: string, artifact: TaskArtifact): Task | undefined {
	const task = taskStore.get(taskId);
	if (!task) return undefined;
	task.artifacts = task.artifacts ?? [];
	task.artifacts.push(artifact);
	return task;
}

function createTaskMessage(role: "user" | "agent", text: string): TaskMessage {
	return {
		role,
		parts: [{ type: "text", text }],
	};
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function handleAgentCard(_req: FastifyRequest, reply: FastifyReply) {
	if (!agentRegistry) {
		return reply.code(503).send({
			error: "service_unavailable",
			message: "Agent registry not configured",
		});
	}
	const card = agentRegistry.getAgentCard();
	return reply.code(200).header("Content-Type", "application/json").send(card);
}

async function handleJsonRpc(req: FastifyRequest, reply: FastifyReply) {
	const body = req.body as {
		jsonrpc?: string;
		id?: string | number;
		method?: string;
		params?: unknown;
	};

	if (body?.jsonrpc !== "2.0" || !body.method) {
		return reply.code(400).send(jsonRpcError(-32600, "Invalid Request"));
	}

	const { id, method, params } = body;

	try {
		let result: unknown;

		switch (method) {
			case "agent/getCard": {
				if (!agentRegistry) throw new Error("Agent registry not configured");
				result = agentRegistry.getAgentCard();
				break;
			}

			case "tasks/send": {
				const sendParams = params as TaskSendParams;
				if (!sendParams?.id || !sendParams?.message) {
					throw new Error("Missing required params: id, message");
				}
				const task = createTask(sendParams);
				// Execute asynchronously
				executeTask(task.id, sendParams.message);
				result = task;
				break;
			}

			case "tasks/sendSubscribe": {
				const sendParams = params as TaskSendParams;
				if (!sendParams?.id || !sendParams?.message) {
					throw new Error("Missing required params: id, message");
				}
				const task = createTask(sendParams);
				executeTask(task.id, sendParams.message);
				result = task;
				break;
			}

			case "tasks/get": {
				const queryParams = params as TaskQueryParams;
				if (!queryParams?.id) {
					throw new Error("Missing required param: id");
				}
				const task = taskStore.get(queryParams.id);
				if (!task) {
					return reply
						.code(404)
						.send(jsonRpcError(-32601, "Task not found", { taskId: queryParams.id }));
				}
				// Optionally limit history
				if (queryParams.historyLength && task.history) {
					result = { ...task, history: task.history.slice(-queryParams.historyLength) };
				} else {
					result = task;
				}
				break;
			}

			case "tasks/cancel": {
				const cancelParams = params as TaskCancelParams;
				if (!cancelParams?.id) {
					throw new Error("Missing required param: id");
				}
				const task = updateTaskStatus(cancelParams.id, "canceled");
				if (!task) {
					return reply
						.code(404)
						.send(jsonRpcError(-32601, "Task not found", { taskId: cancelParams.id }));
				}
				result = task;
				break;
			}

			case "tasks/pushNotification/set": {
				const { taskId, config } = params as { taskId: string; config: TaskPushNotificationConfig };
				if (!taskId || !config?.url) {
					throw new Error("Missing required params: taskId, config.url");
				}
				pushConfigStore.set(taskId, config);
				result = { success: true };
				break;
			}

			case "tasks/pushNotification/get": {
				const { taskId } = params as { taskId: string };
				if (!taskId) {
					throw new Error("Missing required param: taskId");
				}
				result = pushConfigStore.get(taskId) ?? null;
				break;
			}

			default:
				return reply.code(404).send(jsonRpcError(-32601, `Method not found: ${method}`));
		}

		return reply.code(200).send(jsonRpcResult(id ?? "", result));
	} catch (error) {
		const message = error instanceof Error ? error.message : "Internal error";
		return reply.code(500).send(jsonRpcError(-32603, message));
	}
}

// ---------------------------------------------------------------------------
// Task execution (async, fire-and-forget)
// ---------------------------------------------------------------------------

async function executeTask(taskId: string, initialMessage: TaskMessage): Promise<void> {
	const task = taskStore.get(taskId);
	if (!task) return;

	// Simulate processing
	await new Promise((r) => setTimeout(r, 100));
	updateTaskStatus(taskId, "working");

	await new Promise((r) => setTimeout(r, 500));
	updateTaskStatus(taskId, "working", createTaskMessage("agent", "Processing your request..."));

	await new Promise((r) => setTimeout(r, 500));

	// For demo: echo the input with a prefix
	const inputText = initialMessage.parts.find((p) => p.type === "text")?.text ?? "";
	const resultText = `[A2A Agent] Processed: ${inputText}`;

	addTaskArtifact(taskId, {
		name: "result",
		description: "Task completion result",
		parts: [{ type: "text", text: resultText }],
	});

	updateTaskStatus(taskId, "completed", createTaskMessage("agent", resultText));

	// Send push notification if configured
	const pushConfig = pushConfigStore.get(taskId);
	if (pushConfig) {
		await sendPushNotification(pushConfig, taskId, "completed");
	}
}

async function sendPushNotification(
	config: TaskPushNotificationConfig,
	taskId: string,
	state: TaskStatus["state"],
): Promise<void> {
	try {
		await fetch(config.url, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
				...(config.authentication as Record<string, string> | undefined),
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				method: "tasks/statusUpdate",
				params: { taskId, state, timestamp: new Date().toISOString() },
			}),
		});
	} catch {
		// Ignore push notification failures
	}
}

// ---------------------------------------------------------------------------
// Fastify Plugin
// ---------------------------------------------------------------------------

export default async function a2aRoutes(fastify: FastifyInstance): Promise<void> {
	// Agent Card (well-known endpoint for discovery)
	fastify.get("/.well-known/agent.json", handleAgentCard);

	// JSON-RPC 2.0 endpoint
	fastify.post("/a2a/rpc", handleJsonRpc);

	// Convenience REST endpoints (delegate to JSON-RPC)
	fastify.post("/a2a/tasks/send", async (req: FastifyRequest, reply: FastifyReply) => {
		const params = req.body as TaskSendParams;
		return handleJsonRpc(
			{
				...req,
				body: { jsonrpc: "2.0", id: "rest", method: "tasks/send", params },
			} as FastifyRequest,
			reply,
		);
	});

	fastify.post("/a2a/tasks/sendSubscribe", async (req: FastifyRequest, reply: FastifyReply) => {
		const params = req.body as TaskSendParams;
		return handleJsonRpc(
			{
				...req,
				body: { jsonrpc: "2.0", id: "rest", method: "tasks/sendSubscribe", params },
			} as FastifyRequest,
			reply,
		);
	});

	fastify.post("/a2a/tasks/get", async (req: FastifyRequest, reply: FastifyReply) => {
		const params = req.body as TaskQueryParams;
		return handleJsonRpc(
			{
				...req,
				body: { jsonrpc: "2.0", id: "rest", method: "tasks/get", params },
			} as FastifyRequest,
			reply,
		);
	});

	fastify.post("/a2a/tasks/cancel", async (req: FastifyRequest, reply: FastifyReply) => {
		const params = req.body as TaskCancelParams;
		return handleJsonRpc(
			{
				...req,
				body: { jsonrpc: "2.0", id: "rest", method: "tasks/cancel", params },
			} as FastifyRequest,
			reply,
		);
	});

	fastify.post(
		"/a2a/tasks/pushNotification/set",
		async (req: FastifyRequest, reply: FastifyReply) => {
			const params = req.body as { taskId: string; config: TaskPushNotificationConfig };
			return handleJsonRpc(
				{
					...req,
					body: { jsonrpc: "2.0", id: "rest", method: "tasks/pushNotification/set", params },
				} as FastifyRequest,
				reply,
			);
		},
	);

	fastify.post(
		"/a2a/tasks/pushNotification/get",
		async (req: FastifyRequest, reply: FastifyReply) => {
			const params = req.body as { taskId: string };
			return handleJsonRpc(
				{
					...req,
					body: { jsonrpc: "2.0", id: "rest", method: "tasks/pushNotification/get", params },
				} as FastifyRequest,
				reply,
			);
		},
	);
}

// ---------------------------------------------------------------------------
// Test utilities
// ---------------------------------------------------------------------------

export function createTestAgentCard(overrides: Partial<AgentCard> = {}): AgentCard {
	return {
		name: "Test Agent",
		description: "A test agent for A2A protocol",
		url: "http://localhost:3000",
		version: "1.0.0",
		capabilities: {
			streaming: false,
			pushNotifications: false,
			stateTransitionHistory: false,
		},
		skills: [
			{
				id: "echo",
				name: "Echo",
				description: "Echoes back the input",
				tags: ["test"],
				inputModes: ["text"],
				outputModes: ["text"],
			},
		],
		defaultInputModes: ["text"],
		defaultOutputModes: ["text"],
		...overrides,
	};
}

export function createTestTask(overrides: Partial<Task> = {}): Task {
	return {
		id: createTaskId(),
		contextId: createTaskId(),
		status: {
			state: "submitted",
			timestamp: new Date().toISOString(),
		},
		history: [],
		metadata: {},
		...overrides,
	};
}

export function clearTestStores(): void {
	taskStore.clear();
	pushConfigStore.clear();
}
