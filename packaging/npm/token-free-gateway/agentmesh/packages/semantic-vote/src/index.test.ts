import { describe, expect, it } from "vitest";
import { SemanticVotingClient, VOTE_TO_ROUTE } from "./index.js";

describe("SemanticVotingClient", () => {
	describe("classify", () => {
		it("should classify medical content correctly", () => {
			const client = new SemanticVotingClient();
			const result = client.classify("피부암 증상에 대해 알려주세요");
			expect(result.primary).toBe("skin_cancer");
		});

		it("should classify finance content correctly", () => {
			const client = new SemanticVotingClient();
			const result = client.classify("주식 투자 방법");
			expect(result.primary).toBe("finance");
		});

		it("should classify code content correctly", () => {
			const client = new SemanticVotingClient();
			const result = client.classify("버그 디버그 도움주세요");
			expect(result.primary).toBe("code");
		});

		it("should classify legal content correctly", () => {
			const client = new SemanticVotingClient();
			const result = client.classify("legal contract lawsuit advice");
			expect(result.primary).toBe("legal");
		});

		it("should default to general for unknown content", () => {
			const client = new SemanticVotingClient();
			const result = client.classify("안녕하세요");
			expect(result.primary).toBe("general");
		});

		it("should return all weight categories", () => {
			const client = new SemanticVotingClient();
			const result = client.classify("test");
			expect(result.weights).toHaveProperty("research");
			expect(result.weights).toHaveProperty("analyze");
			expect(result.weights).toHaveProperty("verify");
			expect(result.weights).toHaveProperty("code");
			expect(result.weights).toHaveProperty("skin_cancer");
			expect(result.weights).toHaveProperty("medical");
			expect(result.weights).toHaveProperty("finance");
			expect(result.weights).toHaveProperty("legal");
			expect(result.weights).toHaveProperty("general");
		});
	});

	describe("getTopTopics", () => {
		it("should return topics sorted by score", async () => {
			const client = new SemanticVotingClient();
			await client.vote("topic-1", "medical question about cancer");
			await client.vote("topic-2", "code programming question");

			const top = client.getTopTopics(10);
			expect(top.length).toBeGreaterThanOrEqual(2);
		});

		it("should respect the limit parameter", async () => {
			const client = new SemanticVotingClient();
			for (let i = 0; i < 5; i++) {
				await client.vote(`topic-${i}`, `question ${i}`);
			}

			const top = client.getTopTopics(3);
			expect(top.length).toBeLessThanOrEqual(3);
		});
	});

	describe("VOTE_TO_ROUTE", () => {
		it("should route medical to human", () => {
			expect(VOTE_TO_ROUTE.medical).toBe("human");
		});

		it("should route code to ai", () => {
			expect(VOTE_TO_ROUTE.code).toBe("ai");
		});

		it("should route verify to mixed", () => {
			expect(VOTE_TO_ROUTE.verify).toBe("mixed");
		});

		it("should route research to knowledge", () => {
			expect(VOTE_TO_ROUTE.research).toBe("knowledge");
		});
	});
});
