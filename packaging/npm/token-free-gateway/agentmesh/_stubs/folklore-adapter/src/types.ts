// Folklore MCP tool surfaces — mapped from the real
// src/mcp/server.ts tool set (search / ask / federated_search / sources_list)
// plus the application/domain types they return.

/** A single knowledge-graph node returned by Folklore reads. */
export interface FolkloreNode {
	readonly id: string;
	readonly label: string;
	readonly file_type?: "code" | "document" | "paper" | "image" | "rationale";
	readonly source_file?: string;
	readonly source_uri?: string;
	readonly fetched_at?: string;
	readonly published_at?: string;
	readonly workspace?: string;
	readonly private?: boolean;
	readonly wing?: string;
	readonly summary?: string;
	readonly distance?: number;
}

/** Result shape for the `search` MCP tool. */
export interface FolkloreSearchResult {
	readonly query?: string;
	readonly nodes: readonly FolkloreNode[];
}

/** Result shape for the `ask` MCP tool. */
export interface FolkloreAskResult {
	readonly context: string;
	readonly query: string;
	readonly k: number;
}

/** One row in a `federated_search` result. */
export interface FolkloreFederatedMatch {
	readonly node_id: string;
	readonly distance: number;
	readonly label?: string;
	readonly source_uri?: string;
	readonly fetched_at?: string;
	readonly _source_peer: string | null;
	readonly _sig_valid?: boolean | undefined;
	readonly _also_from_peers?: readonly string[] | undefined;
}

/** Telemetry block attached to federated results. */
export interface FolkloreFederatedTelemetry {
	readonly took_total_ms: number;
	readonly took_local_ms: number;
	readonly took_fanout_ms: number;
	readonly took_merge_ms: number;
	readonly bytes_received_estimate: number;
	readonly peers_alive: number;
}

/** Result shape for the `federated_search` MCP tool. */
export interface FolkloreFederatedResult {
	readonly query: string;
	readonly peers_queried: number;
	readonly peers_responded: number;
	readonly peers_timed_out: number;
	readonly peers_errored: number;
	readonly matches: readonly FolkloreFederatedMatch[];
	readonly tunnels: readonly unknown[];
	readonly _telemetry: FolkloreFederatedTelemetry | null;
}

/** Result shape for the `sources_list` MCP tool. */
export interface FolkloreSourcesListResult {
	readonly sources: readonly unknown[];
}

/** Flattened view used by the Muhanai API / MCP proxy layer. */
export interface FolkloreToolCallResult {
	readonly tool: "search" | "ask" | "federated_search" | "sources_list";
	readonly ok: boolean;
	readonly body:
		| FolkloreSearchResult
		| FolkloreAskResult
		| FolkloreFederatedResult
		| FolkloreSourcesListResult
		| null;
	readonly error?: string;
}
