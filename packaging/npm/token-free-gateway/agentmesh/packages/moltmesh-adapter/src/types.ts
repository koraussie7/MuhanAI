/**
 * MoltMesh A2A wire types (`a2a.v1`).
 *
 * Field names are camelCase because the gRPC stub is loaded with
 * `keepCase: false`, and int64/uint64 are `string` because the loader is
 * configured with `longs: String` (JSON-safe, faithful above 2^53).
 *
 * These types mirror `proto/a2a.proto` exactly. Do not hand-edit the proto;
 * see `proto/README.md` for the refresh procedure.
 */

/** Liveness/identity summary returned by `Health`. */
export interface HealthResponse {
	ok: boolean;
	version: string;
	did: string;
	peerCount: number;
	uptimeSecs: string;
}

/** `GetIdentity` / `GetAgentIdentity` response. `did` is `did:key:z6Mk...`. */
export interface AgentIdentity {
	did: string;
	publicKey: string;
	multiaddrs: string[];
	signingPublicKey: Uint8Array;
	encryptionPublicKey: Uint8Array;
}

/** `GetNodeIdentity` response — the daemon transport identity, not the agent. */
export interface NodeIdentity {
	nodeId: string;
	peerId: string;
	multiaddrs: string[];
}

/** Capability entry inside an `AgentCard`. `id` looks like `a2a:v1:cap:<name>`. */
export interface MoltmeshSkill {
	id: string;
	name: string;
	description: string;
	inputSchema: Uint8Array;
	outputSchema: Uint8Array;
	tags: string[];
}

/**
 * `AgentCard` — Ed25519-signed capability advertisement, verified by the
 * daemon on resolve. `signature` covers the canonical JSON of fields 1-8.
 */
export interface AgentCard {
	did: string;
	name: string;
	description: string;
	skills: MoltmeshSkill[];
	multiaddrs: string[];
	publicKey: string;
	publishedAt: string;
	expiresAt: string;
	signature: string;
	metadata: Record<string, string>;
	encryptionPublicKey: Uint8Array;
	nodePeerId: string;
	sequence: string;
}

/** Content-addressed artifact. `inline` is populated for payloads under 64KB. */
export interface Artifact {
	cid: string;
	mimeType: string;
	size: string;
	inline: Uint8Array;
	uri: string;
	name: string;
}

/** `TaskStatus` enum, decoded to names because the loader uses `enums: String`. */
export type TaskStatus =
	| "TASK_STATUS_UNSPECIFIED"
	| "TASK_STATUS_SUBMITTED"
	| "TASK_STATUS_WORKING"
	| "TASK_STATUS_COMPLETED"
	| "TASK_STATUS_FAILED"
	| "TASK_STATUS_CANCELLED";

/** Replicated work unit. `initiator`/`assignee` are DIDs. */
export interface MoltmeshTask {
	id: string;
	initiator: string;
	assignee: string;
	threadId: string;
	skill: string;
	status: TaskStatus;
	inputArtifacts: Artifact[];
	outputArtifacts: Artifact[];
	createdAt: string;
	updatedAt: string;
	error: string;
	metadata: Record<string, string>;
}

/** `TaskLease` — proof that this agent holds the task until `expiresAtUnixMs`. */
export interface TaskLease {
	taskId: string;
	leaseToken: string;
	expiresAtUnixMs: string;
	attempt: number;
}

/** Body of `CreateTaskRequest`. */
export interface TaskRequest {
	skill: string;
	threadId: string;
	inputArtifacts: Artifact[];
	metadata: Record<string, string>;
}

export interface CreateTaskRequest {
	toDid: string;
	task: TaskRequest;
	idempotencyKey: string;
	timeoutMs: string;
	maxAttempts: number;
}

export interface ClaimTaskRequest {
	taskId: string;
	leaseSeconds: number;
}

export interface RenewTaskLeaseRequest {
	taskId: string;
	leaseToken: string;
	leaseSeconds: number;
}

export interface CompleteTaskRequest {
	taskId: string;
	leaseToken: string;
	outputArtifacts: Artifact[];
	data: Uint8Array;
}

export interface FailTaskRequest {
	taskId: string;
	leaseToken: string;
	error: string;
}

export interface TaskIdRequest {
	id: string;
	afterSequence: string;
}

/** Capability search filter. `capability` may be `""` to list everything. */
export interface CapabilityQuery {
	capability: string;
	tags: string[];
	limit: number;
}

/** Direct agent-to-agent message. `payload` is application-owned bytes. */
export interface MoltmeshMessage {
	id: string;
	fromDid: string;
	toDid: string;
	threadId: string;
	taskId: string;
	kind: string;
	payload: Uint8Array;
	sentAt: string;
	signature: string;
}

/** `SendMessage` result. `queued` is true when the peer was offline. */
export interface SendResult {
	messageId: string;
	queued: boolean;
}

export interface InboxQuery {
	threadId: string;
	taskId: string;
	unreadOnly: boolean;
	limit: number;
	since: string;
}

export interface AckRequest {
	messageId: string;
}

export interface PublishResult {
	success: boolean;
	error: string;
}

export interface AgentIdentityRequest {
	did: string;
}

/** `AfterSequence` cursor for durable task-event replay. */
export interface SubscribeRequest {
	threadId: string;
	taskId: string;
}
