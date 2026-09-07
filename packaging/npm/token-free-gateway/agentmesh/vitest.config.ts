import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: [
			"packages/**/*.test.ts",
			"services/**/*.test.ts",
			"apps/web/src/**/*.test.{ts,tsx}",
		],
		environment: "node",
		passWithNoTests: true,
	},
});
