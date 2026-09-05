/**
 * @agentmesh/human — Human-in-the-Loop Coordinator (Agent 2)
 *
 * Facilitates human participation in the Agent Mesh:
 * - Human capability registration & discovery
 * - Task submission & result collection
 * - Reputation & scoring system
 * - Dispute resolution & quality gates
 * - Hybrid human-AI workflow orchestration
 */
import type {
  HumanSubmission,
  HumanCapability,
  HumanReviewer,
  ReviewRequest,
  ReviewResult,
  ReputationScore,
  Dispute,
} from "@agentmesh/core";

/** Default reputation parameters. */
export const DEFAULT_REPUTATION_CONFIG = {
  initialScore: 500,
  maxScore: 1000,
  minScore: 0,
  teachWeight: 1.5,
  verifyWeight: 1.2,
  answerWeight: 1.0,
  localKnowledgeWeight: 1.1,
  expertWeight: 2.0,
  penaltyFactor: 0.5,
  decayFactor: 0.999, // per day
};

/** In-memory human registry entry. */
export interface HumanProfile {
  actorId: string;
  capabilities: HumanCapability[];
  reputation: ReputationScore;
  isAvailable: boolean;
  maxConcurrent: number;
  currentLoad: number;
  specialties: string[];
  language: string[];
  credentials?: Record<string, string>;
}

/** In-memory review request. */
export interface PendingReview {
  id: string;
  request: ReviewRequest;
  reviewerId: string | null;
  submittedAt: number;
  expiresAt: number;
}

/** Human coordinator implementation. */
export class HumanCoordinator implements HumanReviewer {
  private readonly profiles = new Map<string, HumanProfile>();
  private readonly reviews = new Map<string, PendingReview>();
  private readonly history: ReviewResult[] = [];
  private readonly disputes: Dispute[] = [];
  private readonly config: typeof DEFAULT_REPUTATION_CONFIG;
  private readonly submissionQueue: HumanSubmission[] = [];

  constructor(config: Partial<typeof DEFAULT_REPUTATION_CONFIG> = {}) {
    this.config = { ...DEFAULT_REPUTATION_CONFIG, ...config };
  }

  // ── HumanReviewer interface ────────────────────────────────────

  async register(
    actorId: string,
    capabilities: HumanCapability[],
    specialties: string[] = [],
    language: string[] = ["en" as string],
  ): Promise<void> {
    this.profiles.set(actorId, {
      actorId,
      capabilities,
      reputation: {
        actorId,
        overall: this.config.initialScore,
        quality: 0,
        reliability: 0,
        contributions: 0,
        updatedAt: Date.now(),
        score: this.config.initialScore,
        teach: 0,
        verify: 0,
        answer: 0,
        local_knowledge: 0,
        expert: 0,
        totalReviews: 0,
        averageRating: 0,
        lastUpdated: Date.now(),
      },
      isAvailable: true,
      maxConcurrent: 3,
      currentLoad: 0,
      specialties,
      language,
    });
  }

  async updateAvailability(actorId: string, available: boolean): Promise<void> {
    const profile = this.profiles.get(actorId);
    if (!profile) throw new Error(`Human not registered: ${actorId}`);
    profile.isAvailable = available;
  }

  async submitReview(
    actorId: string,
    requestId: string,
    result: Pick<ReviewResult, "rating" | "comment" | "approved">,
  ): Promise<void> {
    const review = this.reviews.get(requestId);
    if (!review) throw new Error(`Review request not found: ${requestId}`);
    if (review.reviewerId !== actorId)
      throw new Error(`Not assigned to review request: ${requestId}`);

    const finalResult: ReviewResult = {
      requestId,
      reviewerId: actorId,
      rating: result.rating,
      comment: result.comment,
      approved: result.approved,
      reviewedAt: Date.now(),
    };

    this.history.push(finalResult);
    this.reviews.delete(requestId);

    // Update reviewer reputation
    await this.updateReviewerReputation(actorId, finalResult);
  }

  async getReputation(actorId: string): Promise<ReputationScore> {
    const profile = this.profiles.get(actorId);
    if (!profile) {
      // Return default score for unregistered humans
      return {
        actorId,
        overall: this.config.initialScore,
        quality: 0,
        reliability: 0,
        contributions: 0,
        updatedAt: Date.now(),
        score: this.config.initialScore,
        teach: 0,
        verify: 0,
        answer: 0,
        local_knowledge: 0,
        expert: 0,
        totalReviews: 0,
        averageRating: 0,
        lastUpdated: Date.now(),
      };
    }
    return profile.reputation;
  }

  async submitDispute(
    actorId: string,
    reviewId: string,
    reason: string,
  ): Promise<string> {
    const disputeId = crypto.randomUUID();
    this.disputes.push({
      id: disputeId,
      reviewId,
      actorId,
      reason,
      status: "open",
      createdAt: Date.now(),
    });
    return disputeId;
  }

  // ── HumanCoordinator specific ────────────────────────────────

  /**
   * Submit a task for human review/completion.
   * Returns a submission ID that can be used to track progress.
   */
  async submitTask(submission: HumanSubmission): Promise<string> {
    const submissionId = crypto.randomUUID();
    const task = { ...submission, id: submissionId, submittedAt: Date.now() };
    this.submissionQueue.push(task);
    return submissionId;
  }

  /**
   * Get available tasks matching a human's capabilities.
   */
  async getAvailableTasks(
    actorId: string,
    limit: number = 10,
  ): Promise<HumanSubmission[]> {
    const profile = this.profiles.get(actorId);
    if (!profile || !profile.isAvailable) return [];

    // Filter submissions by capability match
    const matching = this.submissionQueue.filter((sub) =>
      profile.capabilities.includes(sub.capability),
    );

    // Sort by submission time (FIFO)
    return matching.slice(0, limit);
  }

  /**
   * Claim a task for work (removes from queue).
   */
  async claimTask(
    actorId: string,
    submissionId: string,
  ): Promise<HumanSubmission | null> {
    const profile = this.profiles.get(actorId);
    if (!profile || !profile.isAvailable) return null;

    if (profile.currentLoad >= profile.maxConcurrent) return null;

    const index = this.submissionQueue.findIndex(
      (t) => t.id === submissionId,
    );
    if (index === -1) return null;

    const [task] = this.submissionQueue.splice(index, 1);
    if (!task) return null;
    profile.currentLoad += 1;
    return task as HumanSubmission;
  }

  /**
   * Submit completed work and request review.
   */
  async submitWork(
    actorId: string,
    submissionId: string,
    result: string,
  ): Promise<string> {
    // Find the original submission (would be stored separately in production)
    const requestId = crypto.randomUUID();
    const reviewRequest: ReviewRequest = {
      id: requestId,
      submissionId,
      actorId,
      capability: "answer" as HumanCapability, // Would be looked up from submission
      content: result,
      requestedAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
    };

    // Find available reviewers with matching capability
    const reviewers = await this.findReviewers(
      "answer" as HumanCapability, // capability from submission
      1,
    );

    if (reviewers.length > 0) {
      const reviewer = reviewers[0] as HumanProfile;
      this.reviews.set(requestId, {
        id: requestId,
        request: reviewRequest,
        reviewerId: reviewer.actorId,
        submittedAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      });
    }

    return requestId;
  }

  // ── Internal helpers ────────────────────────────────────────

  private async findReviewers(
    capability: HumanCapability,
    limit: number,
  ): Promise<HumanProfile[]> {
    const candidates = Array.from(this.profiles.values()).filter(
      (p) =>
        p.isAvailable &&
        p.capabilities.includes(capability) &&
        p.currentLoad < p.maxConcurrent,
    );

    // Sort by reputation score (highest first)
    return candidates
      .sort((a, b) => b.reputation.score - a.reputation.score)
      .slice(0, limit);
  }

  private async updateReviewerReputation(
    reviewerId: string,
    result: ReviewResult,
  ): Promise<void> {
    const profile = this.profiles.get(reviewerId);
    if (!profile) return;

    // Update counts based on capability of the reviewed submission
    // In production, we'd look up the submission's capability
    const capability = "answer"; // placeholder
    const weight =
      {
        teach: this.config.teachWeight,
        verify: this.config.verifyWeight,
        answer: this.config.answerWeight,
        local_knowledge: this.config.localKnowledgeWeight,
        expert: this.config.expertWeight,
      }[capability] || 1.0;

    // Update specific metric
    const current = (profile.reputation[capability as keyof ReputationScore] as unknown as number) || 0;
    (profile.reputation as unknown as Record<string, number>)[capability] =
      current + (result.rating * weight);

    // Update totals
    profile.reputation.totalReviews += 1;
    const total =
      profile.reputation.answer +
      profile.reputation.verify +
      profile.reputation.teach +
      profile.reputation.local_knowledge +
      profile.reputation.expert;
    profile.reputation.averageRating =
      total > 0
        ? (profile.reputation.averageRating * (profile.reputation.totalReviews - 1) +
            result.rating) /
          profile.reputation.totalReviews
        : result.rating;

    // Update total score (bounded)
    let newScore =
      profile.reputation.score +
      (result.rating - 3) * 2 * weight; // Center around 3 (neutral)
    newScore = Math.max(
      this.config.minScore,
      Math.min(this.config.maxScore, newScore),
    );
    profile.reputation.score = newScore;
    profile.reputation.lastUpdated = Date.now();

    // Apply time decay (simplified - would be periodic in production)
    (Object.keys(profile.reputation) as Array<keyof ReputationScore>).forEach((key) => {
      if (
        key !== "actorId" &&
        key !== "lastUpdated" &&
        key !== "totalReviews" &&
        key !== "averageRating"
      ) {
        const val = profile.reputation[key];
        if (typeof val === "number") {
          (profile.reputation as unknown as Record<string, number>)[key as string] =
            val * this.config.decayFactor;
        }
      }
    });

    this.profiles.set(reviewerId, profile);
  }
}

/** Factory for creating a HumanCoordinator with custom config. */
export function createHumanCoordinator(
  config: Partial<typeof DEFAULT_REPUTATION_CONFIG> = {},
): HumanCoordinator {
  return new HumanCoordinator(config);
}