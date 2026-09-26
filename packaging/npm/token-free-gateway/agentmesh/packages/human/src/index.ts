/**
 * @agentmesh/human — Human-in-the-Loop Coordinator (Agent 2)
 *
 * Human participation layer for the Agent Mesh:
 * - HumanCoordinator: register, submit, review, reputation, disputes
 * - HumanReviewer interface implementation
 * - Capability-based task routing
 */

export type {
	Dispute,
	HumanCapability,
	HumanReviewer,
	HumanSubmission,
	ReputationScore,
	ReviewRequest,
	ReviewResult,
} from "@agentmesh/core";
export {
	createHumanCoordinator,
	DEFAULT_REPUTATION_CONFIG,
	HumanCoordinator,
	type HumanProfile,
	type PendingReview,
} from "./types.js";
