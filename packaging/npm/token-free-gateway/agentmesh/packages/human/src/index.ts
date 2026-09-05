/**
 * @agentmesh/human — Human-in-the-Loop Coordinator (Agent 2)
 *
 * Human participation layer for the Agent Mesh:
 * - HumanCoordinator: register, submit, review, reputation, disputes
 * - HumanReviewer interface implementation
 * - Capability-based task routing
 */
export {
  HumanCoordinator,
  createHumanCoordinator,
  DEFAULT_REPUTATION_CONFIG,
  type HumanProfile,
  type PendingReview,
} from "./types.js";

export type {
  HumanSubmission,
  HumanCapability,
  HumanReviewer,
  ReviewRequest,
  ReviewResult,
  ReputationScore,
  Dispute,
} from "@agentmesh/core";