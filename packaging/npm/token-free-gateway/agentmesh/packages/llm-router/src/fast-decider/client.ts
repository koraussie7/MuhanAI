/**
 * TS client wrapper for the Laya Fast Decider sidecar.
 * Exposes async functions for System 1 typed decisions (choice/score/noul).
 */

const LAYA_ENDPOINT = process.env.LAYA_ENDPOINT ?? "http://localhost:8123";

export interface DecisionEntry {
	label: string;
	probability: number;
}

export type Decision = Record<string, DecisionEntry[] | DecisionEntry>;

export interface IntentDecision {
	intent: string;
	confidence: number;
	needsLLM: boolean;
}

export interface FastDeciderConfig {
	endpoint: string;
	llmEscalationThreshold: number;
}

const DEFAULT_CONFIG: FastDeciderConfig = {
	endpoint: LAYA_ENDPOINT,
	llmEscalationThreshold: 0.85,
};

export class FastDecider {
	private config: FastDeciderConfig;

	constructor(config: Partial<FastDeciderConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	private async decide(question: object, state: { text: string }): Promise<Decision> {
		const res = await fetch(`${this.config.endpoint}/decide`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ question, state }),
		});

		if (!res.ok) {
			const body = await res.text();
			throw new Error(`laya decide failed: ${res.status} - ${body}`);
		}

		const data = (await res.json()) as { result: Decision };
		return data.result;
	}

	async decideIntent(
		text: string,
		intents: Record<string, string>,
		threshold = this.config.llmEscalationThreshold,
	): Promise<IntentDecision> {
		const decision = await this.decide(
			{ type: "choice", instructions: "Which intent does this text belong to?", criteria: intents },
			{ text },
		);

		const intentEntries = decision.intent;
		if (Array.isArray(intentEntries)) {
			const sorted = intentEntries.sort((a, b) => b.probability - a.probability);
			const top = sorted[0];
			if (!top) {
				return { intent: "unknown", confidence: 0, needsLLM: true };
			}
			return {
				intent: top.label,
				confidence: top.probability,
				needsLLM: top.probability < threshold,
			};
		}

		return { intent: "unknown", confidence: 0, needsLLM: true };
	}

	async scoreSpam(text: string): Promise<number> {
		const decision = await this.decide(
			{ type: "score", instructions: "Score the spam/abuse likelihood of this text from 0 to 1." },
			{ text },
		);

		const spamEntry = decision.spam;
		if (Array.isArray(spamEntry) && spamEntry.length > 0) {
			const first = spamEntry[0];
			return first?.probability ?? 0;
		}
		if (spamEntry && typeof spamEntry === "object" && "probability" in spamEntry) {
			return (spamEntry as DecisionEntry).probability;
		}

		return 0;
	}

	async chooseAgent(
		text: string,
		agents: Record<string, string>,
	): Promise<{ agent: string; confidence: number; needsLLM: boolean }> {
		const decision = await this.decide(
			{
				type: "choice",
				instructions: "Which agent is best suited for this request?",
				criteria: agents,
			},
			{ text },
		);

		const agentEntries = decision.agent;
		if (Array.isArray(agentEntries)) {
			const sorted = agentEntries.sort((a, b) => b.probability - a.probability);
			const top = sorted[0];
			if (!top) {
				return { agent: "default", confidence: 0, needsLLM: true };
			}
			return {
				agent: top.label,
				confidence: top.probability,
				needsLLM: top.probability < this.config.llmEscalationThreshold,
			};
		}

		return { agent: "default", confidence: 0, needsLLM: true };
	}

	async guardContent(text: string): Promise<{ safe: boolean; confidence: number; reason: string }> {
		const decision = await this.decide(
			{
				type: "noul",
				instructions: "Is this content safe, non-abusive, and appropriate?",
				threshold: 0.9,
			},
			{ text },
		);

		const contentEntry = decision.content;
		if (Array.isArray(contentEntry)) {
			const top = contentEntry[0];
			if (!top) {
				return { safe: true, confidence: 0.5, reason: "uncertain" };
			}
			// noul: "probability" close to 1 means "no issue" (safe)
			return {
				safe: top.probability >= 0.8,
				confidence: top.probability,
				reason: top.label,
			};
		}

		return { safe: true, confidence: 0.5, reason: "uncertain" };
	}

	async routeRequest(
		text: string,
		intents: Record<string, string>,
		agents: Record<string, string>,
	): Promise<{ intent: string; agent: string | null; needsLLM: boolean }> {
		const intentResult = await this.decideIntent(text, intents);

		if (intentResult.needsLLM) {
			return { intent: intentResult.intent, agent: null, needsLLM: true };
		}

		const agentResult = await this.chooseAgent(text, agents);
		if (agentResult.needsLLM) {
			return { intent: intentResult.intent, agent: null, needsLLM: true };
		}

		return { intent: intentResult.intent, agent: agentResult.agent, needsLLM: false };
	}
}

export const fastDecider = new FastDecider();
