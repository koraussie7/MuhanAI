/**
 * LystBot MCP tool adapter.
 *
 * LystBot (https://github.com/TourAround/LystBot) is an AI-agent list and
 * reminder app that exposes a REST API, an MCP server, and a CLI. It has no
 * model and no inference runtime, so it is registered here as an ordinary MCP
 * tool rather than as an XLang peer.
 *
 * This adapter is transport-agnostic on purpose: the caller supplies a `call`
 * function that performs the actual HTTP or MCP request. That keeps the tool
 * definitions unit-testable without network access and lets the same
 * definitions back either the LystBot REST API or its MCP server.
 */

export type LystBotToolName =
	| "lystbot_list_create"
	| "lystbot_list_add_item"
	| "lystbot_list_get"
	| "lystbot_reminder_create"
	| "lystbot_search";

export type LystBotCall = (
	tool: LystBotToolName,
	input: Record<string, unknown>,
) => Promise<unknown>;

export interface LystBotToolDefinition {
	name: LystBotToolName;
	description: string;
	inputSchema: Record<string, unknown>;
}

export interface LystBotToolRegistration {
	tools: LystBotToolDefinition[];
	handlers: Map<LystBotToolName, (input: Record<string, unknown>) => Promise<unknown>>;
}

const ITEM_SCHEMA: Record<string, unknown> = {
	type: "object",
	properties: {
		name: { type: "string", description: "Item name" },
		quantity: { type: "number", description: "Optional quantity" },
		note: { type: "string", description: "Optional note" },
	},
	required: ["name"],
};

const TOOL_DEFINITIONS: LystBotToolDefinition[] = [
	{
		name: "lystbot_list_create",
		description: "Create a new LystBot list (shopping, todo, or custom).",
		inputSchema: {
			type: "object",
			properties: {
				name: { type: "string" },
				listType: { type: "string", enum: ["shopping", "todo", "custom"] },
			},
			required: ["name"],
		},
	},
	{
		name: "lystbot_list_add_item",
		description: "Add an item to an existing LystBot list.",
		inputSchema: {
			type: "object",
			properties: {
				listId: { type: "string" },
				item: ITEM_SCHEMA,
			},
			required: ["listId", "item"],
		},
	},
	{
		name: "lystbot_list_get",
		description: "Read a LystBot list together with its items.",
		inputSchema: {
			type: "object",
			properties: { listId: { type: "string" } },
			required: ["listId"],
		},
	},
	{
		name: "lystbot_reminder_create",
		description: "Create a LystBot reminder, optionally bound to a list item.",
		inputSchema: {
			type: "object",
			properties: {
				title: { type: "string" },
				dueAt: { type: "string", description: "ISO 8601 timestamp" },
				listId: { type: "string" },
			},
			required: ["title"],
		},
	},
	{
		name: "lystbot_search",
		description: "Search LystBot lists and reminders by text.",
		inputSchema: {
			type: "object",
			properties: { query: { type: "string" } },
			required: ["query"],
		},
	},
];

/**
 * Build the LystBot tool set plus an executor for each tool.
 *
 * `call` is the only transport dependency. When it is omitted the tools are
 * still returned (useful for manifest publication) but executing one throws
 * instead of silently succeeding.
 */
export function buildLystBotTools(call?: LystBotCall): LystBotToolRegistration {
	const tools = TOOL_DEFINITIONS.map((tool) => ({ ...tool }));
	const handlers = new Map<LystBotToolName, (input: Record<string, unknown>) => Promise<unknown>>();

	for (const tool of tools) {
		handlers.set(tool.name, async (input: Record<string, unknown>) => {
			if (!call) throw new Error("lystbot: transport call function is not configured");
			return call(tool.name, input);
		});
	}

	return { tools, handlers };
}

/** Wire a REST-backed `call` function for a LystBot deployment. */
export function createLystBotRestCall(options: {
	baseUrl: string;
	token?: string;
	fetcher?: typeof fetch;
	timeoutMs?: number;
}): LystBotCall {
	const base = options.baseUrl.replace(/\/$/, "");
	const fetcher = options.fetcher ?? fetch;
	const timeoutMs = options.timeoutMs ?? 10_000;

	return async (tool, input) => {
		const isSearch = tool === "lystbot_search";
		const isRead = tool === "lystbot_list_get";
		const method = isSearch || isRead ? "GET" : "POST";

		const path = isRead
			? `lists/${encodeURIComponent(String(input.listId ?? ""))}`
			: isSearch
				? "search"
				: tool.replace(/^lystbot_/, "");

		const url = new URL(`${base}/${path}`);
		if (isSearch) url.searchParams.set("q", String(input.query ?? ""));

		const headers: Record<string, string> = { Accept: "application/json" };
		if (options.token) headers.Authorization = `Bearer ${options.token}`;
		if (method === "POST") headers["Content-Type"] = "application/json";

		const response = await fetcher(url.toString(), {
			method,
			headers,
			...(method === "POST" ? { body: JSON.stringify(input) } : {}),
			signal: AbortSignal.timeout(timeoutMs),
		});

		if (!response.ok) {
			throw new Error(`lystbot: ${tool} failed with HTTP ${response.status}`);
		}
		return response.json();
	};
}
