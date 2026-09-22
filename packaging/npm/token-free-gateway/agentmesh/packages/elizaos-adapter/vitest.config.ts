import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		alias: {
			"@elizaos/core": resolve(__dirname, "src/eliza-types.ts"),
		},
	},
});
