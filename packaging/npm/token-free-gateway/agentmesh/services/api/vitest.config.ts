import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["src/**/*.test.ts"],
		environment: "node",
		passWithNoTests: true,
		// gun.js writes its file store to './radata' on every SemanticVotingClient
		// construction; running tests in parallel causes EEXIST races across worker
		// processes. Serialize to keep file-system side effects deterministic.
		fileParallelism: false,
		pool: "forks",
		poolOptions: {
			forks: { singleFork: true },
		},
	},
});
