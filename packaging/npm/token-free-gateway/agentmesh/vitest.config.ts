import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
		resolve: {
			alias: [
				// Deep "@agentmesh/<pkg>/src/<file>.js" specifiers must be listed before
				// their bare package name, so they win during resolution.
				{
					find: /^@agentmesh\/agent-cast\/src\/(.*)\.js$/,
					replacement: resolve("packages/agent-cast/src/$1.ts"),
				},
				{
					find: /^@agentmesh\/llm-router\/src\/(.*)\.js$/,
					replacement: resolve("packages/llm-router/src/$1.ts"),
				},
				{ find: "@agentmesh/agent-cast", replacement: resolve("packages/agent-cast/src/index.ts") },
				{ find: "@agentmesh/ghost-adapter", replacement: resolve("packages/ghost-adapter/src/index.ts") },
				{ find: "@agentmesh/mcp", replacement: resolve("packages/mcp/src/index.ts") },
				{ find: "@agentmesh/llm-router", replacement: resolve("packages/llm-router/src/index.ts") },
				{
					find: "@agentmesh/category-engine",
					replacement: resolve("packages/category-engine/src/index.ts"),
				},
				{ find: "@agentmesh/core", replacement: resolve("packages/core/src/index.ts") },
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
