import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
resolve: {
	alias: [
		// Deep "@agentmesh/<pkg>/src/<file>.js" specifiers must be listed before
		// their bare package name, so they win during resolution. Keep this list
		// in sync with the "paths" map in tsconfig.base.json.
		{
			find: /^@agentmesh\/llm-router\/src\/(.*?)(?:\.js)?$/,
			replacement: resolve("packages/llm-router/src/$1.ts"),
		},
		{
			find: /^@agentmesh\/payment\/src\/(.*?)(?:\.js)?$/,
			replacement: resolve("packages/payment/src/$1.ts"),
		},
		{
			find: /^@agentmesh\/agent-cast\/src\/(.*?)(?:\.js)?$/,
			replacement: resolve("packages/agent-cast/src/$1.ts"),
		},
		// @agentmesh/ai-engine/factory is a real subpath, not an index re-export.
		{ find: "@agentmesh/ai-engine/factory", replacement: resolve("packages/ai-engine/src/factory.ts") },
		{ find: "@agentmesh/adapters", replacement: resolve("packages/adapters/src/index.ts") },
		{ find: "@agentmesh/agent", replacement: resolve("packages/agent/src/index.ts") },
		{ find: "@agentmesh/agent-cast", replacement: resolve("packages/agent-cast/src/index.ts") },
		{ find: "@agentmesh/agent-core", replacement: resolve("packages/agent-core/index.ts") },
		{ find: "@agentmesh/agent-daemon", replacement: resolve("packages/agent-daemon/src/index.ts") },
		{ find: "@agentmesh/agent-gateway", replacement: resolve("packages/agent-gateway/src/index.ts") },
		{ find: "@agentmesh/agent-router", replacement: resolve("packages/agent-router/src/index.ts") },
		{ find: "@agentmesh/ai-engine", replacement: resolve("packages/ai-engine/src/index.ts") },
		{ find: "@agentmesh/ai-ui", replacement: resolve("packages/ai-ui/src/index.ts") },
		{ find: "@agentmesh/bitterbot", replacement: resolve("packages/bitterbot/src/index.ts") },
		{
			find: "@agentmesh/category-engine",
			replacement: resolve("packages/category-engine/src/index.ts"),
		},
		{ find: "@agentmesh/compute-market", replacement: resolve("packages/compute-market/src/index.ts") },
		{ find: "@agentmesh/core", replacement: resolve("packages/core/src/index.ts") },
		{ find: "@agentmesh/cosmos-core", replacement: resolve("packages/cosmos-core/src/index.ts") },
		{ find: "@agentmesh/credit-system", replacement: resolve("packages/credit-system/src/index.ts") },
		{ find: "@agentmesh/database", replacement: resolve("packages/database/src/index.ts") },
		{ find: "@agentmesh/elizaos-adapter", replacement: resolve("packages/elizaos-adapter/src/index.ts") },
		{ find: "@agentmesh/federation", replacement: resolve("packages/federation/src/index.ts") },
		{ find: "@agentmesh/ghost-adapter", replacement: resolve("packages/ghost-adapter/src/index.ts") },
		{ find: "@agentmesh/hivebear", replacement: resolve("packages/hivebear/src/index.ts") },
		{ find: "@agentmesh/knowledge-base", replacement: resolve("packages/knowledge-base/src/index.ts") },
		{ find: "@agentmesh/llm-router", replacement: resolve("packages/llm-router/src/index.ts") },
		{ find: "@agentmesh/mcp", replacement: resolve("packages/mcp/src/index.ts") },
		{ find: "@agentmesh/noema", replacement: resolve("packages/noema/src/index.ts") },
		{ find: "@agentmesh/payment", replacement: resolve("packages/payment/src/index.ts") },
		{ find: "@agentmesh/peer-mesh", replacement: resolve("packages/peer-mesh/src/index.ts") },
		{ find: "@agentmesh/personal-mcp", replacement: resolve("packages/personal-mcp/src/index.ts") },
		{ find: "@agentmesh/semantic-vote", replacement: resolve("packages/semantic-vote/src/index.ts") },
		{ find: "@agentmesh/shared-types", replacement: resolve("packages/shared-types/types/index.ts") },
	],
},
	test: {
		include: [
			"packages/**/*.test.ts",
			"services/**/*.test.ts",
			"apps/web/src/**/*.test.{ts,tsx}",
			// Workspace-level operational tests (gated by env var; see file header).
			"tests/**/*.test.ts",
		],
		environment: "node",
		passWithNoTests: true,
		reporters: ["default", ["junit", { outputFile: "./junit.xml" }]],
	},
});
