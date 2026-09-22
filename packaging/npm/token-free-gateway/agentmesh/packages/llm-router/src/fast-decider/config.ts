/**
 * Configuration for the Laya Fast Decider fast-path.
 * Reads LAYA_ENDPOINT from environment; defaults to local sidecar.
 */

export const LAYA_CONFIG = {
	endpoint: process.env.LAYA_ENDPOINT ?? "http://localhost:8123",
	healthPath: "/health",
	decidePath: "/decide",
	llmEscalationThreshold: Number.parseFloat(process.env.LAYA_ESCALATION_THRESHOLD ?? "0.85"),
};
