import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
		resolve: {
	alias: {
		"@agentmesh/ghost-adapter": resolve("packages/ghost-adapter/src/index.ts"),
		"@agentmesh/mcp": resolve("packages/mcp/src/index.ts"),
		"@agentmesh/llm-router": resolve("packages/llm-router/src/index.ts"),
		"@agentmesh/category-engine": resolve("packages/category-engine/src/index.ts"),
	},
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
