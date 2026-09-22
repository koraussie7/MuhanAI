/**
 * Per-character RPC client registry.
 *
 * elizaOS hosts many characters; each one can carry its own
 * `settings.AGENTMESH_RPC_URL` etc. `getClient` looks up the active
 * runtime and either returns the cached client or builds one from the
 * current character settings. Tests can call `setClientForCharacter`
 * to inject a stub.
 */
import type { IAgentRuntime } from "@elizaos/core";
import { AgentMeshRpcError, createAgentMeshRpcClient } from "./rpc.js";
import type { AgentMeshRpcClient, AgentMeshRpcConfig } from "./types.js";

const SETTING_RPC_URL = "AGENTMESH_RPC_URL";
const SETTING_PEER_ID = "AGENTMESH_PEER_ID";
const SETTING_TOKEN = "AGENTMESH_TOKEN";

export interface ClientEntry {
	client: AgentMeshRpcClient;
	peerId: string;
}

const registry = new WeakMap<IAgentRuntime, ClientEntry>();

function readSetting(runtime: IAgentRuntime, key: string): string | undefined {
	const v = runtime.getSetting(key);
	if (typeof v === "string" && v.trim()) return v;
	return undefined;
}

export function resolveRpcConfig(runtime: IAgentRuntime): AgentMeshRpcConfig {
	const rpcUrl = readSetting(runtime, SETTING_RPC_URL);
	if (!rpcUrl) {
		throw new AgentMeshRpcError(
			"CONFIG_MISSING",
			`Character "${runtime.character.name}" is missing required ${SETTING_RPC_URL} setting`,
		);
	}
	return {
		rpcUrl,
		peerId: readSetting(runtime, SETTING_PEER_ID),
		token: readSetting(runtime, SETTING_TOKEN),
	};
}

export function getClient(runtime: IAgentRuntime): ClientEntry {
	const hit = registry.get(runtime);
	if (hit) return hit;
	const config = resolveRpcConfig(runtime);
	const client = createAgentMeshRpcClient(config);
	const entry: ClientEntry = {
		client,
		peerId: config.peerId ?? derivePeerId(runtime),
	};
	registry.set(runtime, entry);
	return entry;
}

export function setClientForCharacter(
	runtime: IAgentRuntime,
	override: { client: AgentMeshRpcClient; peerId: string },
): void {
	registry.set(runtime, override);
}

export function derivePeerId(runtime: IAgentRuntime): string {
	const name = runtime.character.name ?? "anon";
	const raw = `${runtime.agentId ?? ""}|${name}|${runtime.agentId ?? ""}`;
	let h = 0;
	for (let i = 0; i < raw.length; i++) h = (h * 31 + raw.charCodeAt(i)) | 0;
	const hex = Math.abs(h).toString(16).padStart(8, "0");
	return (hex + hex + hex + hex + hex + hex + hex + hex).slice(0, 64);
}
