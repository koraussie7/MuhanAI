// packages/knowledge-base/src/visuals/pythia-types.ts
// TypeScript mirror of deploy/pythia_connector/models.py
// Shared contract between Python backend (Part 1+2) and dashboard (Part 3)

export type EventSeverity = "info" | "warning" | "critical" | "fatal";
export type ForecastConfidence = "low" | "medium" | "high" | "certain";
export type ImpactTier = "low" | "medium" | "high" | "critical";

export interface PythiaEvent {
  eventId: string;
  sourceAgent: string;
  sourceRun?: string;
  timestamp: string;
  kind: string;
  severity: EventSeverity;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  cid?: string;
  schemaVersion: string;
  parentEventId?: string;
}

export interface PythiaForecast {
  forecastId: string;
  agentId: string;
  createdAt: string;
  resolvedAt?: string;
  hypothesis: string;
  outcome: string;
  confidence: ForecastConfidence;
  confidenceNumeric?: number;
  horizon?: string;
  windowStart?: string;
  windowEnd?: string;
  supportingEvents: string[];
  citations: string[];
  localcrabClaimId?: string;
}

export interface ImpactAnalysis {
  targetId: string;
  targetType: "event" | "forecast";
  tier: ImpactTier;
  score: number;
  affectedAgents: string[];
  affectedDomains: string[];
  rationale: string;
  mitigations: string[];
  generatedBy: string;
  generatedAt: string;
  colibriMetricsRef?: string;
}

import type { ColibriMetrics, ModelChunkMetrics, PeerMetrics } from "./colibri-metrics";

export interface PythiaMetricsPacket {
  colibri: ColibriMetrics;
  timestamp: string;
  peers: PeerMetrics[];
  chunks: ModelChunkMetrics[];
  version: string;
}

// Re-export ColibriMetrics types
export type { ColibriMetrics, PeerMetrics, ModelChunkMetrics } from "./colibri-metrics";
