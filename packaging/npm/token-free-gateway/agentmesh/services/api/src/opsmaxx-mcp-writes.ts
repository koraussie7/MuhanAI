/**
 * OpsMaxx MCP **write / high-risk** tool surface (track T3-B).
 *
 * `POST /api/opsmaxx-mcp/writes` speaks JSON-RPC 2.0 and exposes the
 * seven write-side tools. It is the T3-B sibling of T3-A's read-only
 * surface at `/api/opsmaxx-mcp/rpc`. The `/writes` suffix is
 * deliberate: it lets
 * `apps/web/src/components/find/CosmicPromptBar.tsx` distinguish read
 * and write surfaces in its approval prompt.
 *
 * Every tool except `opsmaxx_approval_request` is gated by the
 * human-in-the-loop contract from `docs/agentmesh/T3-OPSMAXX-MCP-AGENT-B.md`:
 *
 *   1. compute `(capability, argsHash)`
 *   2. `bridge.security.isApprovedByUser` — exact pair only, never a
 *      prefix or semantic match (approval-cache poisoning defence)
 *   3. otherwise `bridge.security.requestApproval` with the
 *      model-supplied `summary` (never auto-generated here)
 *   4. human denies → custom JSON-RPC code below, audit `verdict: "denied"`
 *   5. forward to the bridge, audit `verdict: "ok" | "error"`
 *   6. return the result to the model — raw `BridgeError` messages from
 *      the Electron side never cross back (only ids the caller itself
 *      supplied are echoed, so a bad `sessionId` is actionable)
 *
 * `high-risk-needs-double-approval` tools additionally require
 * `typedConfirm` to equal the target name on **every** call, even one
 * that already carries an approval — that is what "double" means:
 *
 *   - `opsmaxx_vault_set` → type the vault `service` name (e.g. "openai")
 *   - `opsmaxx_db_write`  → type the `connectionId`
 *
 * Custom JSON-RPC error codes:
 *
 *   4001 RESULT_DENIED                   — human denied the approval card
 *   4002 RESULT_DOUBLE_CONFIRM_MISMATCH  — typedConfirm ≠ target name
 *   4003 RESULT_INVALID_ARGS             — malformed args / unknown sessionId
 *   4004 RESULT_CAPABILITY_UNAVAILABLE   — bridge call ships in T1 Phase 2
 *
 * Audit: exactly one `bridge_call` line per attempt via
 * `./audit/bridge-call-log.ts` (`argsHash` only — never raw args).
 */

import {
	type ApprovalCard,
	BridgeError,
	createOpsMaxxBridge,
	type OpsMaxxBridge,
	type Result,
	RISK,
	type RiskClass,
} from "@agentmesh/opsmaxx-bridge";
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { type BridgeCallVerdict, hashArgs, recordBridgeCall } from "./audit/bridge-call-log.js";

/** Custom JSON-RPC error codes (see the file header). */
export const RESULT_DENIED = 4001;
export const RESULT_DOUBLE_CONFIRM_MISMATCH = 4002;
export const RESULT_INVALID_ARGS = 4003;
export const RESULT_CAPABILITY_UNAVAILABLE = 4004;
/** Standard JSON-RPC internal error — used when the bridge itself fails. */
const BRIDGE_INTERNAL_ERROR = -32603;
const METHOD_NOT_FOUND = -32601;

export interface WriteToolDefinition {
	name: string;
	description: string;
	inputSchema: {
		type: "object";
		properties: Record<string, { type: string; description: string }>;
		required?: string[];
	};
}
/**
 * The 7 write tools this track ships. T3-A's read tools must never be
 * added here — the split is what lets two reviewers reason about the
 * two surfaces independently (see T3 split rationale in
 * docs/agentmesh/AGENT-ASSIGNMENT-PLAN.md).
 */
export const OPSMAXX_WRITE_TOOLS: WriteToolDefinition[] = [
	{
		name: "opsmaxx_ssh_exec",
		description:
			"Execute a command on a previously opened SSH session (needs approval; every call prompts the user).",
		inputSchema: {
			type: "object",
			properties: {
				sessionId: { type: "string", description: "Session id from opsmaxx_ssh_session_open." },
				cmd: { type: "string", description: "Shell command to execute." },
				summary: {
					type: "string",
					description: "Human-readable reason shown on the approval card. Write it yourself.",
				},
			},
			required: ["sessionId", "cmd", "summary"],
		},
	},
	{
		name: "opsmaxx_sftp_write",
		description: "Write a file over SFTP (needs approval; bridge call ships in T1 Phase 2).",
		inputSchema: {
			type: "object",
			properties: {
				connectionId: { type: "string", description: "SFTP connection id." },
				remotePath: { type: "string", description: "Absolute remote path to write." },
				content: { type: "string", description: "File content (text or base64)." },
				summary: {
					type: "string",
					description: "Human-readable reason shown on the approval card.",
				},
			},
			required: ["connectionId", "remotePath", "content", "summary"],
		},
	},
	{
		name: "opsmaxx_db_write",
		description:
			"Run a mutating SQL statement (double approval: card + typed connectionId confirm).",
		inputSchema: {
			type: "object",
			properties: {
				connectionId: {
					type: "string",
					description: "Database connection id — also the typedConfirm value.",
				},
				sql: { type: "string", description: "Mutating SQL (INSERT/UPDATE/DELETE/DDL)." },
				params: {
					type: "array",
					description: "Optional positional bind parameters for the SQL statement.",
				},
				typedConfirm: {
					type: "string",
					description: "Must exactly equal connectionId — the human types it to confirm.",
				},
				summary: {
					type: "string",
					description: "Human-readable reason shown on the approval card.",
				},
			},
			required: ["connectionId", "sql", "typedConfirm", "summary"],
		},
	},
	{
		name: "opsmaxx_tunnel_open",
		description: "Open a tunnel forward (needs approval; bridge call ships in T1 Phase 2).",
		inputSchema: {
			type: "object",
			properties: {
				connectionId: { type: "string", description: "Connection id to tunnel through." },
				tunnelType: {
					type: "string",
					description: "Tunnel kind: socks5 | wireguard | openvpn.",
				},
				localPort: { type: "number", description: "Optional local listen port." },
				summary: {
					type: "string",
					description: "Human-readable reason shown on the approval card.",
				},
			},
			required: ["connectionId", "tunnelType", "summary"],
		},
	},
	{
		name: "opsmaxx_vault_set",
		description:
			"Store or rotate a secret in the OpsMaxx vault (double approval: card + typed service name). The secret is mirrored to OpsMaxx only.",
		inputSchema: {
			type: "object",
			properties: {
				service: {
					type: "string",
					description: "Service name — also the typedConfirm value (e.g. openai).",
				},
				secret: { type: "string", description: "Secret value to store." },
				note: { type: "string", description: "Optional human note." },
				typedConfirm: {
					type: "string",
					description: "Must exactly equal service — the human types it to confirm.",
				},
				summary: {
					type: "string",
					description: "Human-readable reason shown on the approval card.",
				},
			},
			required: ["service", "secret", "typedConfirm", "summary"],
		},
	},
	{
		name: "opsmaxx_vault_remove",
		description: "Remove a secret from the OpsMaxx vault (needs approval; every call prompts).",
		inputSchema: {
			type: "object",
			properties: {
				service: { type: "string", description: "Service name to remove." },
				summary: {
					type: "string",
					description: "Human-readable reason shown on the approval card.",
				},
			},
			required: ["service", "summary"],
		},
	},
	{
		name: "opsmaxx_approval_request",
		description:
			"Ask the human to approve a specific (capability, args) pair up front. Returns { approved: boolean } and, on approval, unlocks exactly that pair in the gate.",
		inputSchema: {
			type: "object",
			properties: {
				capability: {
					type: "string",
					description: "Tool name to approve, e.g. opsmaxx_db_write.",
				},
				summary: { type: "string", description: "Human-readable reason for the approval card." },
				args: {
					type: "object",
					description:
						"The exact args the later call will use — any difference voids the approval.",
				},
				preview: {
					type: "object",
					description: "Optional caller-visible preview (never include secret values).",
				},
			},
			required: ["capability", "summary", "args"],
		},
	},
];
export const OPSMAXX_WRITE_TOOL_NAMES: string[] = OPSMAXX_WRITE_TOOLS.map((tool) => tool.name);

export type WriteToolOutcome =
	| { status: "ok"; value: unknown }
	| { status: "error"; code: number; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(args: Record<string, unknown>, key: string): string {
	const value = args[key];
	return typeof value === "string" ? value : "";
}

/** Structural (presence) check — never prompt a human for a malformed call. */
const REQUIRED_ARGS: Record<string, string[]> = {
	opsmaxx_ssh_exec: ["sessionId", "cmd"],
	opsmaxx_sftp_write: ["connectionId", "remotePath", "content"],
	opsmaxx_db_write: ["connectionId", "sql"],
	opsmaxx_tunnel_open: ["connectionId", "tunnelType"],
	opsmaxx_vault_set: ["service", "secret"],
	opsmaxx_vault_remove: ["service"],
	opsmaxx_approval_request: ["capability", "summary", "args"],
};

function missingArgs(toolName: string, args: Record<string, unknown>): string[] {
	return (REQUIRED_ARGS[toolName] ?? []).filter((key) => {
		const value = args[key];
		return value === undefined || value === null;
	});
}

/**
 * The value the human must type for a `high-risk-needs-double-approval`
 * tool. Returns `null` when the tool has no defined confirmation target,
 * which fails closed (4003) rather than letting an unmapped high-risk
 * tool through.
 */
function typedConfirmTarget(toolName: string, args: Record<string, unknown>): string | null {
	if (toolName === "opsmaxx_vault_set") return str(args, "service") || null;
	if (toolName === "opsmaxx_db_write") return str(args, "connectionId") || null;
	return null;
}

/**
 * Approval-card preview: what the human sees. Secrets must never appear
 * here — `vault.set`'s `secret` and `sftp_write`'s body are redacted.
 */
function buildPreview(toolName: string, args: Record<string, unknown>): Record<string, unknown> {
	switch (toolName) {
		case "opsmaxx_ssh_exec":
			return { sessionId: str(args, "sessionId"), cmd: str(args, "cmd") };
		case "opsmaxx_db_write":
			return {
				connectionId: str(args, "connectionId"),
				sql: str(args, "sql"),
				paramCount: Array.isArray(args.params) ? args.params.length : 0,
			};
		case "opsmaxx_vault_set":
			// `secret` deliberately omitted — the card must not leak it.
			return { service: str(args, "service"), note: str(args, "note"), hasSecret: true };
		case "opsmaxx_vault_remove":
			return { service: str(args, "service") };
		case "opsmaxx_sftp_write":
			return {
				connectionId: str(args, "connectionId"),
				remotePath: str(args, "remotePath"),
				contentBytes: str(args, "content").length,
			};
		case "opsmaxx_tunnel_open":
			return {
				connectionId: str(args, "connectionId"),
				tunnelType: str(args, "tunnelType"),
				localPort: typeof args.localPort === "number" ? args.localPort : null,
			};
		default:
			return {};
	}
}
export interface WriteToolHandler {
	readonly bridge: OpsMaxxBridge;
	handle(toolName: string | undefined, args: Record<string, unknown>): Promise<WriteToolOutcome>;
}

/**
 * Build the write-tool handler around a bridge. The returned
 * `localApprovals` overlay only ever holds the exact
 * `(capability, argsHash)` pairs a human approved — it is the
 * handler-side cache that makes `opsmaxx_approval_request` durable
 * across bridge-side cache resets.
 */
export function createWriteToolHandler(bridge: OpsMaxxBridge): WriteToolHandler {
	const localApprovals = new Set<string>();

	const failBridge = (toolName: string): WriteToolOutcome => ({
		status: "error",
		code: BRIDGE_INTERNAL_ERROR,
		message: `${toolName} failed at the bridge.`,
	});

	const handle = async (
		toolName: string | undefined,
		args: Record<string, unknown>,
	): Promise<WriteToolOutcome> => {
		// Unknown / read-side tools are rejected before the call even
		// forms, so they never reach the audit log (they are T3-A's).
		if (!toolName || !OPSMAXX_WRITE_TOOL_NAMES.includes(toolName)) {
			return {
				status: "error",
				code: METHOD_NOT_FOUND,
				message: `Tool '${toolName ?? ""}' not found on the OpsMaxx write surface.`,
			};
		}

		// Missing RISK entries fail closed as double-approval instead of
		// failing open — a registry typo must never widen the surface.
		const risk: RiskClass = RISK[toolName] ?? "high-risk-needs-double-approval";
		const argsHash = hashArgs(args);
		const startedAt = Date.now();
		const emit = (verdict: BridgeCallVerdict, errorCode?: number | string): void => {
			recordBridgeCall({
				ts: new Date().toISOString(),
				capability: toolName,
				argsHash,
				risk,
				verdict,
				durationMs: Date.now() - startedAt,
				...(errorCode !== undefined ? { errorCode } : {}),
			});
		};

		// 0. Structural check — never prompt a human for a malformed call.
		const missing = missingArgs(toolName, args);
		if (missing.length > 0) {
			emit("denied", RESULT_INVALID_ARGS);
			return {
				status: "error",
				code: RESULT_INVALID_ARGS,
				message: `RESULT_INVALID_ARGS: missing required argument(s): ${missing.join(", ")}.`,
			};
		}

		// 1. Double approval: the typed confirmation is required on every
		// call, even one that already carries an approval.
		if (risk === "high-risk-needs-double-approval") {
			const expected = typedConfirmTarget(toolName, args);
			if (!expected) {
				emit("denied", RESULT_INVALID_ARGS);
				return {
					status: "error",
					code: RESULT_INVALID_ARGS,
					message: `RESULT_INVALID_ARGS: ${toolName} has no typed confirmation target; failing closed.`,
				};
			}
			if (str(args, "typedConfirm") !== expected) {
				emit("denied", RESULT_DOUBLE_CONFIRM_MISMATCH);
				return {
					status: "error",
					code: RESULT_DOUBLE_CONFIRM_MISMATCH,
					message:
						`RESULT_DOUBLE_CONFIRM_MISMATCH: typedConfirm must exactly equal ` +
						`'${expected}' for ${toolName}. The human has to type it.`,
				};
			}
		}

		// 2. `opsmaxx_approval_request` issues the card itself, so it must
		// not be gated (its RISK class is `safe`). On approval it unlocks
		// exactly `(capability, argsHash(targetArgs))` in the local cache.
		if (toolName === "opsmaxx_approval_request") {
			const capability = str(args, "capability");
			const summary = str(args, "summary");
			if (!capability || !summary) {
				emit("denied", RESULT_INVALID_ARGS);
				return {
					status: "error",
					code: RESULT_INVALID_ARGS,
					message: "RESULT_INVALID_ARGS: `capability` and `summary` must be non-empty strings.",
				};
			}
			const targetArgs = isRecord(args.args) ? args.args : {};
			const preview = isRecord(args.preview) ? args.preview : {};
			const card: ApprovalCard = {
				capability,
				risk: RISK[capability] ?? "needs-approval",
				summary,
				args: targetArgs,
				preview,
			};
			const asked = await bridge.security.requestApproval(card);
			if (!asked.ok) {
				emit("error", asked.error.code);
				return failBridge(toolName);
			}
			if (asked.value) {
				localApprovals.add(`${capability}::${hashArgs(targetArgs)}`);
				emit("ok");
				return { status: "ok", value: { approved: true } };
			}
			// The human said no — the *call* succeeded, but the verdict
			// records the refusal so the audit trail shows who denied what.
			emit("denied");
			return { status: "ok", value: { approved: false } };
		}
		// 3. Approval gate for `needs-approval` / `high-risk` tools.
		//    Exact `(capability, argsHash)` pair only — approving one call
		//    must never unlock a different one (cache poisoning defence).
		if (risk !== "safe") {
			const approvalKey = `${toolName}::${argsHash}`;
			if (!localApprovals.has(approvalKey)) {
				const cached = await bridge.security.isApprovedByUser(toolName, args);
				if (!cached.ok) {
					emit("error", cached.error.code);
					return failBridge(toolName);
				}
				if (cached.value) {
					localApprovals.add(approvalKey);
				} else {
					// The model must write the summary itself; auto-generating
					// it would make every prompt look user-approved.
					const summary = str(args, "summary");
					if (!summary) {
						emit("denied", RESULT_INVALID_ARGS);
						return {
							status: "error",
							code: RESULT_INVALID_ARGS,
							message:
								"RESULT_INVALID_ARGS: a non-empty `summary` is required " +
								"to request human approval.",
						};
					}
					const card: ApprovalCard = {
						capability: toolName,
						risk,
						summary,
						args,
						preview: buildPreview(toolName, args),
					};
					const asked = await bridge.security.requestApproval(card);
					if (!asked.ok) {
						emit("error", asked.error.code);
						return failBridge(toolName);
					}
					if (!asked.value) {
						emit("denied", RESULT_DENIED);
						return {
							status: "error",
							code: RESULT_DENIED,
							message: `RESULT_DENIED: the user denied ${toolName}.`,
						};
					}
					localApprovals.add(approvalKey);
				}
			}
		}

		// 4. Capabilities whose bridge call ships in T1 Phase 2. The gate
		//    above still ran (every write tool routes through it), but the
		//    forward cannot execute yet.
		if (toolName === "opsmaxx_sftp_write" || toolName === "opsmaxx_tunnel_open") {
			emit("error", RESULT_CAPABILITY_UNAVAILABLE);
			return {
				status: "error",
				code: RESULT_CAPABILITY_UNAVAILABLE,
				message: `RESULT_CAPABILITY_UNAVAILABLE: ${toolName} ships with the T1 Phase 2 bridge call.`,
			};
		}

		// 5. Forward to the bridge.
		const result = await dispatch(bridge, toolName, args);
		if (result.ok) {
			emit("ok");
			return { status: "ok", value: result.value };
		}
		// `invalid_args` messages only echo ids the caller supplied
		// ("unknown session: X"), so surfacing them keeps the call
		// actionable without leaking Electron internals. Everything else
		// is masked: a raw BridgeError must never reach the model.
		if (result.error.code === "invalid_args") {
			emit("denied", RESULT_INVALID_ARGS);
			return {
				status: "error",
				code: RESULT_INVALID_ARGS,
				message: `RESULT_INVALID_ARGS: ${result.error.message}`,
			};
		}
		emit("error", result.error.code);
		return failBridge(toolName);
	};

	return { bridge, handle };
}

/** Forward a validated, approved call to the right bridge method. */
async function dispatch(
	bridge: OpsMaxxBridge,
	toolName: string,
	args: Record<string, unknown>,
): Promise<Result<unknown, BridgeError>> {
	switch (toolName) {
		case "opsmaxx_ssh_exec":
			return bridge.ssh.exec(str(args, "sessionId"), str(args, "cmd"));
		case "opsmaxx_db_write": {
			const params = Array.isArray(args.params) ? args.params : undefined;
			return bridge.databases.write(str(args, "connectionId"), str(args, "sql"), params);
		}
		case "opsmaxx_vault_set": {
			const note = str(args, "note");
			return bridge.vault.set(str(args, "service"), str(args, "secret"), note || undefined);
		}
		case "opsmaxx_vault_remove":
			return bridge.vault.remove(str(args, "service"));
		default:
			// Unreachable: Phase 2 tools return earlier. Defensive only.
			return {
				ok: false,
				error: new BridgeError("not_connected", `${toolName} has no bridge call yet`),
			};
	}
}
const jsonRpcResponse = (id: unknown, result: unknown) => ({
	jsonrpc: "2.0",
	id,
	result,
});

const jsonRpcError = (id: unknown, code: number, message: string) => ({
	jsonrpc: "2.0",
	id,
	error: { code, message },
});

export type OpsmaxxWritesOptions = {
	/** Bridge to gate against. Defaults to the factory bridge (memory in dev). */
	bridge?: OpsMaxxBridge;
};

/**
 * Fastify plugin: `POST /api/opsmaxx-mcp/writes`.
 *
 * Registered by `mcp-routes.ts` (the shared config block documents both
 * surfaces; T3-B owns the merge). Tests inject their own mock bridge
 * through the `bridge` option.
 */
export const opsmaxxWritesRoutes: FastifyPluginAsync<OpsmaxxWritesOptions> = async (
	app: FastifyInstance,
	opts,
) => {
	const bridge = opts.bridge ?? (await createOpsMaxxBridge());
	const handler = createWriteToolHandler(bridge);

	app.post("/api/opsmaxx-mcp/writes", async (req, reply) => {
		const rpc = (req.body ?? {}) as {
			jsonrpc?: string;
			id?: unknown;
			method?: string;
			params?: { name?: string; arguments?: Record<string, unknown> };
		};
		const id = rpc.id ?? 1;

		if (rpc.method === "tools/list") {
			return jsonRpcResponse(id, { tools: OPSMAXX_WRITE_TOOLS });
		}

		if (rpc.method === "tools/call") {
			const params = rpc.params ?? {};
			const outcome = await handler.handle(params.name, params.arguments ?? {});

			// JSON-RPC says -32601 for unknown methods/tools; mirror the
			// 404 convention of /api/mcp/rpc so MCP clients agree.
			if (outcome.status === "error" && outcome.code === METHOD_NOT_FOUND) {
				reply.code(404);
				return jsonRpcError(id, METHOD_NOT_FOUND, outcome.message);
			}
			if (outcome.status === "error") {
				// Custom codes (4001..4004) stay in the body with HTTP 200:
				// the transport succeeded; the *call* was refused.
				return jsonRpcError(id, outcome.code, outcome.message);
			}
			return jsonRpcResponse(id, {
				content: [
					{
						type: "text",
						text: typeof outcome.value === "string" ? outcome.value : JSON.stringify(outcome.value),
					},
				],
			});
		}

		reply.code(400);
		return jsonRpcError(id, METHOD_NOT_FOUND, `Method '${rpc.method ?? ""}' not supported.`);
	});
};
