import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["src/**/*.test.ts"],
		environment: "node",
		globals: false,
	},
	resolve: {
		alias: {
			"~shared": new URL("../shared/src/", import.meta.url).pathname,
		},
	},
});
