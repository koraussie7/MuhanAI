import { defineConfig } from "vitest/config";

export default defineConfig({
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
	},
});
