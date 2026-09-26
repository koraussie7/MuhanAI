/**
 * MoltMesh A2A daemon client.
 *
 * Typed wrapper over `a2a.v1.A2ANode` plus projections into AgentMesh view
 * models. Node-only — see `grpc.ts` for the transport rationale.
 *
 * @example
 * ```ts
 * const client = new MoltmeshClient();
 * const health = await client.health();
 * const agents = await client.listAgentDescriptors();
 * client.close();
 * ```
 */

import type { AgentDescriptor } from "@agentmesh/core";
import {
	collectStream,
	createStub,
	defaultAddress,
	type GrpcStub,
	serverStream,
	unary,
} from "./grpc.ts";
import { type AgentCardToDescriptorOptions, agentCardToDescriptor } from "./mapper.ts";
import { type TaskToWorkItemOptions, taskToWorkItem, type WorkItemView } from "./task-mapper.ts";
import type {
	AgentCard,
	AgentIdentity,
	CapabilityQuery,
	HealthResponse,
	InboxQuery,
	MoltmeshMessage,
	MoltmeshTask,
	NodeIdentity,
	SendResult,
	TaskLease,
} from "./types.ts";

/** Default per-RPC deadline; short so a dead daemon fails fast, not hangs. */
const DEFAULT_DEADLINE_MS = 5_000;

export interface MoltmeshClientOptions {
	/** `unix:///path/to/a2a.sock` or `host:port`. Defaults to env, else the socket. */
	address?: string;
	/** Overrides the vendored `proto/a2a.proto`. */
	protoPath?: string;
	/** Per-RPC deadline in ms. */
	deadlineMs?: number;
}

/** Input for `sendMessage`; the daemon fills id/fromDid/sentAt/signature. */
export interface SendMessageInput {
	toDid: string;
	/** UTF-8 text payload; sets `kind: MESSAGE_KIND_TEXT` when set. */
	text?: string;
	/** Raw payload; takes precedence over `text`. */
	payload?: Uint8Array;
	/** Overrides the derived kind. */
	kind?: string;
	threadId?: string;
	taskId?: string;
}

export class MoltmeshClient {
	readonly address: string;
	private readonly stub: GrpcStub;
	private readonly deadlineMs: number;
	private closed = false;

	constructor(options: MoltmeshClientOptions = {}) {
		this.address = options.address ?? defaultAddress();
		this.deadlineMs = options.deadlineMs ?? DEFAULT_DEADLINE_MS;
		this.stub = createStub(this.address, options.protoPath);
	}

	private call<Res>(method: string, request: unknown): Promise<Res> {
		if (this.closed) {
			return Promise.reject(new Error("MoltmeshClient is closed"));
		}
		return unary<Res>(this.stub, method, request, this.deadlineMs);
	}

	/** Release the channel. Safe to call more than once. */
	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.stub.close();
	}

	// ── Identity & liveness ───────────────────────────────────────────────

	/** Daemon health; also the cheapest liveness probe. */
	health(): Promise<HealthResponse> {
		return this.call<HealthResponse>("Health", {});
	}

	/** The agent identity this daemon serves (`did:key:...`). */
	getIdentity(): Promise<AgentIdentity> {
		return this.call<AgentIdentity>("GetIdentity", {});
	}

	/** The daemon's transport identity — distinct from the agent DID. */
	getNodeIdentity(): Promise<NodeIdentity> {
		return this.call<NodeIdentity>("GetNodeIdentity", {});
	}

	// ── Discovery ─────────────────────────────────────────────────────────

	/** Fetch a published, signature-verified card by DID. */
	getAgentCard(did: string): Promise<AgentCard> {
		return this.call<AgentCard>("GetAgentCard", { did });
	}

	/** Find peers by capability (`a2a:v1:cap:...`) and/or tags. */
	findAgents(query: Partial<CapabilityQuery> = {}): Promise<AgentCard[]> {
		const request: CapabilityQuery = {
			capability: query.capability ?? "",
			tags: query.tags ?? [],
			limit: query.limit ?? 50,
		};
		return collectStream<AgentCard>(this.stub, "FindAgents", request);
	}

	/**
	 * Remote peers as dashboard descriptors, so they sit alongside local
	 * adapters wherever `registry.descriptors()` is consumed.
	 */
	async listAgentDescriptors(
		options: AgentCardToDescriptorOptions & { capability?: string } = {},
	): Promise<AgentDescriptor[]> {
		const cards = await this.findAgents(
			options.capability === undefined ? {} : { capability: options.capability },
		);
		return cards.map((card) => agentCardToDescriptor(card, options));
	}

	// ── Task lifecycle ────────────────────────────────────────────────────

	/** Submit a task to a peer. The peer claims it with a lease to start work. */
	createTask(input: {
		toDid: string;
		skill: string;
		threadId?: string;
		metadata?: Record<string, string>;
		timeoutMs?: number;
		maxAttempts?: number;
		idempotencyKey?: string;
	}): Promise<MoltmeshTask> {
		return this.call<MoltmeshTask>("CreateTask", {
			toDid: input.toDid,
			idempotencyKey: input.idempotencyKey ?? "",
			timeoutMs: input.timeoutMs === undefined ? "0" : String(input.timeoutMs),
			maxAttempts: input.maxAttempts ?? 0,
			task: {
				skill: input.skill,
				threadId: input.threadId ?? "",
				inputArtifacts: [],
				metadata: input.metadata ?? {},
			},
		});
	}

	/** Read a task by id. */
	getTask(id: string): Promise<MoltmeshTask> {
		return this.call<MoltmeshTask>("GetTask", { id, afterSequence: "0" });
	}

	/** Read a task and project it onto the dashboard row shape. */
	async getTaskView(id: string, options: TaskToWorkItemOptions = {}): Promise<WorkItemView> {
		return taskToWorkItem(await this.getTask(id), options);
	}

	/** Cancel a task you own. */
	cancelTask(id: string): Promise<MoltmeshTask> {
		return this.call<MoltmeshTask>("CancelTask", { id, afterSequence: "0" });
	}

	/** Claim a task as a worker; returns the lease that must be renewed. */
	claimTask(taskId: string, leaseSeconds = 60): Promise<TaskLease> {
		return this.call<TaskLease>("ClaimTask", {
			taskId,
			leaseSeconds,
		} as const);
	}

	/** Extend a held lease. Call well before expiry, or the task is requeued. */
	renewTaskLease(lease: TaskLease, leaseSeconds: number): Promise<TaskLease> {
		return this.call<TaskLease>("RenewTaskLease", {
			taskId: lease.taskId,
			leaseToken: lease.leaseToken,
			leaseSeconds,
		});
	}

	/** Mark a task complete; the lease token authorises the write. */
	completeTask(
		lease: TaskLease,
		output: { data?: Uint8Array; artifactCid?: string } = {},
	): Promise<MoltmeshTask> {
		return this.call<MoltmeshTask>("CompleteTask", {
			taskId: lease.taskId,
			leaseToken: lease.leaseToken,
			outputArtifacts:
				output.artifactCid === undefined
					? []
					: [
							{
								cid: output.artifactCid,
								mimeType: "",
								size: "0",
								inline: new Uint8Array(),
								uri: "",
								name: "",
							},
						],
			data: output.data ?? new Uint8Array(),
		});
	}

	/** Mark a task failed; the lease token authorises the write. */
	failTask(lease: TaskLease, error: string): Promise<MoltmeshTask> {
		return this.call<MoltmeshTask>("FailTask", {
			taskId: lease.taskId,
			leaseToken: lease.leaseToken,
			error,
		});
	}

	/**
	 * Live worker subscription stream (never ends on its own — it is a push
	 * channel, not a snapshot). Use with an abort/timeout, not `collectStream`.
	 */
	subscribeTasks(options: { threadId?: string; taskId?: string } = {}) {
		return serverStream<MoltmeshTask>(this.stub, "SubscribeTasks", {
			threadId: options.threadId ?? "",
			taskId: options.taskId ?? "",
		});
	}

	// ── Messaging ─────────────────────────────────────────────────────────

	/**
	 * Send a message to a peer. Only the routing fields are sent — the daemon
	 * fills `id`, `fromDid`, `sentAt`, and the Ed25519 `signature`, mirroring the
	 * upstream SDK.
	 */
	sendMessage(input: SendMessageInput): Promise<SendResult> {
		const payload =
			input.payload ??
			(input.text === undefined ? new Uint8Array() : new TextEncoder().encode(input.text));
		return this.call<SendResult>("SendMessage", {
			toDid: input.toDid,
			threadId: input.threadId ?? "",
			taskId: input.taskId ?? "",
			kind:
				input.kind ??
				(input.payload === undefined ? "MESSAGE_KIND_TEXT" : "MESSAGE_KIND_UNSPECIFIED"),
			payload,
		});
	}

	/** Buffered inbound messages for this agent. */
	getInbox(query: Partial<InboxQuery> = {}): Promise<MoltmeshMessage[]> {
		const request: InboxQuery = {
			threadId: query.threadId ?? "",
			taskId: query.taskId ?? "",
			unreadOnly: query.unreadOnly ?? false,
			limit: query.limit ?? 50,
			since: query.since ?? "0",
		};
		return collectStream<MoltmeshMessage>(this.stub, "GetInbox", request);
	}

	/** Acknowledge a message so it is not redelivered. */
	async ackMessage(messageId: string): Promise<void> {
		await this.call<Record<string, never>>("AckMessage", { messageId });
	}
}
