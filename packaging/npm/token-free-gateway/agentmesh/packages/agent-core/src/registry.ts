import type { AgentDefinition } from "./types";

export class AgentRegistry {
	private agents = new Map<string, AgentDefinition>();

	register(def: AgentDefinition): void {
		this.agents.set(def.id, def);
	}

	get(id: string): AgentDefinition | undefined {
		return this.agents.get(id);
	}

	find(params: {
		domain?: string;
		subdomain?: string;
		jurisdiction?: string[];
	}): AgentDefinition[] {
		return Array.from(this.agents.values()).filter((a) => {
			if (params.domain && a.domain !== params.domain && a.domain !== "general") {
				return false;
			}
			if (params.subdomain && a.subdomain && a.subdomain !== params.subdomain) {
				return false;
			}
			if (params.jurisdiction?.length && a.jurisdictions?.length) {
				const overlap = params.jurisdiction.some((j) => a.jurisdictions?.includes(j));
				if (!overlap) return false;
			}
			return true;
		});
	}

	list(): AgentDefinition[] {
		return Array.from(this.agents.values());
	}
}

export const agentRegistry = new AgentRegistry();

// Seed some domain agents
const seedAgents: AgentDefinition[] = [
	{
		id: "agent.real-estate.rental",
		name: "Real Estate Rental Specialist",
		domain: "real-estate",
		subdomain: "rental",
		jurisdictions: ["VN", "KR"],
		description: "Handles rental contracts, deposits, landlord-tenant issues",
		systemPrompt:
			"You are an expert in real-estate rental law and practice, especially in Vietnam and Korea. Focus on deposit return, contract clauses, and practical advice.",
	},
	{
		id: "agent.tax.international",
		name: "International Tax Specialist",
		domain: "tax",
		subdomain: "international-tax",
		jurisdictions: ["VN", "KR", "SG"],
		description: "Cross-border tax, double taxation, residency",
	},
	{
		id: "agent.tax.business",
		name: "Business Tax Specialist",
		domain: "tax",
		subdomain: "business-tax",
		jurisdictions: ["VN", "KR"],
	},
	{
		id: "agent.legal.contract",
		name: "Contract Law Specialist",
		domain: "legal",
		subdomain: "contract",
		jurisdictions: ["VN", "KR", "SG"],
	},
	{
		id: "agent.finance.general",
		name: "Finance Generalist",
		domain: "finance",
	},
	{
		id: "agent.general",
		name: "General Assistant",
		domain: "general",
		description: "Fallback general-purpose agent",
	},
];

for (const a of seedAgents) {
	agentRegistry.register(a);
}
