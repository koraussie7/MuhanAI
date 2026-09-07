export type SemanticTag =
	| "research"
	| "analyze"
	| "verify"
	| "code"
	| "skin_cancer"
	| "medical"
	| "finance"
	| "legal"
	| "general";
export type VoteWeight = Record<SemanticTag, number>;
export declare class SemanticVotingClient {
	private gun;
	private topicVotes;
	constructor(relayUrl?: string);
	classify(text: string): {
		primary: SemanticTag;
		weights: VoteWeight;
	};
	vote(topicId: string, text: string): Promise<SemanticTag>;
	getTopTopics(limit?: number): Array<{
		topicId: string;
		score: number;
		tag: SemanticTag;
	}>;
}
export declare const VOTE_TO_ROUTE: Record<
	SemanticTag,
	"ai" | "human" | "knowledge" | "web" | "mixed"
>;
//# sourceMappingURL=index.d.ts.map
