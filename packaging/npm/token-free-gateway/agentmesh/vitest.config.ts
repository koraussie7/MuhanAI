import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: [
			"packages/**/*.test.ts",
			"services/**/*.test.ts",
			"apps/web/src/**/*.test.{ts,tsx}",
			"tests/**/*.test.ts",
		],
		environment: "node",
		passWithNoTests: true,
		reporters: ["default", ["junit", { outputFile: "./junit.xml" }]],
		// Do not load .env files during tests to prevent env var leakage
		env: {},
		envFile: false,
	},
});
