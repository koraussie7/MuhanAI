import React from "react";

/**
 * TrustRing — adapted from PinkyBrain trust-circle / reputation-ring pattern.
 * SVG circular gauge showing trust & reputation score.
 */
export function TrustRing({ score, trust, size = 132 }: { score: number; trust: number; size?: number }) {
  const clamped = Math.max(0, Math.min(1, score));
  const radius = size / 2 - 12;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * clamped;
  const stroke = clamped >= 0.75 ? "#7ee787" : clamped >= 0.45 ? "#e6ff87" : "#ff9d6b";
  return (
    <div className="hc-trust-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#292a25"
          strokeWidth={8}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="hc-trust-ring-center">
        <strong>{Math.round(clamped * 100)}</strong>
        <span>trust {Math.round(trust * 100)}%</span>
      </div>
    </div>
  );
}

/**
 * WebOfTrustBadge — trust relationship badge (PinkyBrain web-of-trust).
 */
export function WebOfTrustBadge({ peers, verified }: { peers: number; verified: number }) {
  return (
    <div className="hc-wot-badge">
      <span className="hc-wot-count">{verified}</span>
      <span className="hc-wot-label">검증 피어 / 전체 {peers}</span>
    </div>
  );
}
