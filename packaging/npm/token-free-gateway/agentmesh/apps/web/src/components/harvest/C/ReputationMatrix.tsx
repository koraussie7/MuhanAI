import React from "react";

/**
 * ReputationMatrix — PinkyBrain trust-circle / reputation-ring patterns.
 * Reputation matrix table with trust tiers + contribution breakdown.
 */
export interface ReputationActor {
  id: string;
  name: string;
  score: number;
  trust: number;
  answers: number;
  verifies: number;
  teaches: number;
  tier: "diamond" | "gold" | "silver" | "bronze";
}

const SAMPLE: ReputationActor[] = [
  { id: "r-1", name: "김민준", score: 982, trust: 0.96, answers: 312, verifies: 188, teaches: 41, tier: "diamond" },
  { id: "r-2", name: "Sarah Chen", score: 874, trust: 0.91, answers: 156, verifies: 220, teaches: 28, tier: "gold" },
  { id: "r-3", name: "Duc Nguyen", score: 720, trust: 0.84, answers: 244, verifies: 92, teaches: 15, tier: "gold" },
  { id: "r-4", name: "AI Research Agent", score: 688, trust: 0.78, answers: 528, verifies: 612, teaches: 0, tier: "silver" },
  { id: "r-5", name: "Alex Rivera", score: 540, trust: 0.72, answers: 98, verifies: 74, teaches: 12, tier: "silver" },
];

const TIER_LABEL: Record<ReputationActor["tier"], string> = {
  diamond: "다이아몬드",
  gold: "골드",
  silver: "실버",
  bronze: "브론즈",
};

function TrustBadge({ trust }: { trust: number }) {
  const cls = trust >= 0.85 ? "high" : trust >= 0.65 ? "mid" : "low";
  return <span className={`hc-trust-badge ${cls}`}>{Math.round(trust * 100)}%</span>;
}

export function ReputationMatrix({ actors = SAMPLE }: { actors?: ReputationActor[] }) {
  const sorted = [...actors].sort((a, b) => b.score - a.score);
  const top = sorted[0];
  return (
    <div className="hc-rep">
      {top && (
        <div className="hc-rep-hero">
          <div className="hc-rep-podium">
            <span className="hc-rep-crown">👑</span>
            <strong>{top.name}</strong>
            <span className="hc-rep-tier">{TIER_LABEL[top.tier]}</span>
            <span className="hc-rep-score">{top.score}</span>
          </div>
        </div>
      )}
      <table className="hc-rep-table">
        <thead>
          <tr>
            <th>순위</th>
            <th>참여자</th>
            <th>등급</th>
            <th>점수</th>
            <th>신뢰</th>
            <th>답/검/교</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((a, i) => (
            <tr key={a.id} className={`hc-rep-row ${a.tier}`}>
              <td className="hc-rep-rank">{i + 1}</td>
              <td className="hc-rep-name">{a.name}</td>
              <td><span className={`hc-tier-tag ${a.tier}`}>{TIER_LABEL[a.tier]}</span></td>
              <td className="hc-rep-score-cell">{a.score}</td>
              <td><TrustBadge trust={a.trust} /></td>
              <td className="hc-rep-breakdown">
                {a.answers} / {a.verifies} / {a.teaches}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
