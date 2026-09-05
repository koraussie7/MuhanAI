import { CategoryContext, RiskLevel } from "../../shared/types";

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
  options?: Partial<Omit<CategoryContext, "domain">>
): CategoryContext {
  return {
    domain,
    subdomain: options?.subdomain,
    jurisdiction: options?.jurisdiction,
    task: options?.task,
    riskLevel: options?.riskLevel ?? "medium",
  };
}
