export interface AgentRequest {
  id: string;
  question: string;
  context?: string;
  complexity?: "simple" | "moderate" | "complex";
  requiredCapabilities?: string[];
  metadata?: Record<string, unknown>;
}
