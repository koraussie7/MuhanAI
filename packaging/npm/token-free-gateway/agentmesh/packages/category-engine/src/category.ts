import type { CategoryContext, RiskLevel } from "@agentmesh/shared-types";

export const DOMAIN_CATEGORIES = [
	"medical",
	"legal",
	"education",
	"finance",
	"tax",
	"real-estate",
	"business",
	"technology",
	"travel",
	"automotive",
	"science",
	"agriculture",
	"shopping",
] as const;

export type DomainCategory = (typeof DOMAIN_CATEGORIES)[number];

/**
 * Laya fast-path intent labels for category routing.
 * Maps each domain category to a human-readable description for the Laya Router.
 */
export const DOMAIN_INTENT_LABELS: Record<DomainCategory, string> = {
	medical: "medical, health, and wellness questions",
	legal: "legal, law, and regulatory questions",
	education: "education, learning, and academic questions",
	finance: "finance, banking, and investment questions",
	tax: "tax and taxation questions",
	"real-estate": "real estate and property questions",
	business: "business, startup, and corporate questions",
	technology: "technology, software, and IT questions",
	travel: "travel, visa, and itinerary questions",
	automotive: "automotive, car, and vehicle questions",
	science: "science and research questions",
	agriculture: "agriculture and farming questions",
	shopping: "shopping, product, and e-commerce questions",
};

export interface CategoryDefinition {
	id: string;
	domain: DomainCategory;
	subdomains: string[];
	description?: string;
	defaultRiskLevel?: RiskLevel;
}

export const DEFAULT_CATEGORIES: CategoryDefinition[] = [
	{
		id: "medical",
		domain: "medical",
		subdomains: ["general", "diagnostics", "pharmacy", "mental-health"],
		defaultRiskLevel: "high",
	},
	{
		id: "legal",
		domain: "legal",
		subdomains: ["contract", "criminal", "civil", "immigration", "ip"],
		defaultRiskLevel: "high",
	},
	{
		id: "tax",
		domain: "tax",
		subdomains: ["personal-tax", "business-tax", "international-tax", "vat"],
		defaultRiskLevel: "high",
	},
	{
		id: "finance",
		domain: "finance",
		subdomains: ["investment", "banking", "crypto", "insurance"],
		defaultRiskLevel: "medium",
	},
	{
		id: "real-estate",
		domain: "real-estate",
		subdomains: ["rental", "purchase", "commercial", "development"],
		defaultRiskLevel: "medium",
	},
	{
		id: "business",
		domain: "business",
		subdomains: ["startup", "corporate", "strategy", "operations"],
		defaultRiskLevel: "medium",
	},
	{
		id: "education",
		domain: "education",
		subdomains: ["k12", "higher-ed", "vocational", "language"],
		defaultRiskLevel: "low",
	},
	{
		id: "technology",
		domain: "technology",
		subdomains: ["software", "ai", "cybersecurity", "hardware"],
		defaultRiskLevel: "low",
	},
	{
		id: "travel",
		domain: "travel",
		subdomains: ["visa", "itinerary", "accommodation", "transport"],
		defaultRiskLevel: "low",
	},
];

export function createCategoryContext(
	domain: string,
	options?: Partial<Omit<CategoryContext, "domain">>,
): CategoryContext {
	return {
		domain,
		subdomain: options?.subdomain,
		jurisdiction: options?.jurisdiction,
		task: options?.task,
		riskLevel: options?.riskLevel ?? "medium",
	};
}
