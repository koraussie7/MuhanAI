/**
 * LiveTicker — horizontally scrolling marquee for the Pythia dashboard.
 *
 * Pure presentational: takes already-fetched rows and animates them so the
 * board reads as "live" without polling per row.
 */

import type React from "react";

export interface TickerItem {
  id: string;
  label: string;
  value: string;
  tone?: "sky" | "amber" | "muted";
}

const TONE_COLOR: Record<NonNullable<TickerItem["tone"]>, string> = {
  sky: "#38bdf8",
  amber: "#fbbf24",
  muted: "#94a3b8",
};

const FALLBACK_ITEMS: TickerItem[] = [
  {
    id: "engine",
    label: "engine",
    value: "Pythia World Engine v2.4",
    tone: "sky",
  },
  {
    id: "gateway",
    label: "gateway",
    value: "Token-Free Gateway (0 MHT)",
    tone: "sky",
  },
  { id: "status", label: "status", value: "Mesh Active", tone: "amber" },
  {
    id: "cosmic",
    label: "cosmic-graph",
    value: "Graphiti Synced",
    tone: "sky",
  },
  {
    id: "prediction",
    label: "predictions",
    value: "Live Stream",
    tone: "muted",
  },
  {
    id: "telemetry",
    label: "telemetry",
    value: "ShadowBroker AIS/Quakes",
    tone: "sky",
  },
];

export const LiveTicker: React.FC<{ items: TickerItem[] }> = ({ items }) => {
  const activeItems = items.length > 0 ? items : FALLBACK_ITEMS;

  // Duplicate the run so the loop is seamless (translateX -50%).
  const doubled = [...activeItems, ...activeItems];

  return (
    <div className="pythia-ticker" role="marquee" aria-label="실시간 지표">
      <div className="pythia-ticker__track">
        {doubled.map((item, index) => (
          <span className="pythia-ticker__item" key={`${item.id}-${index}`}>
            <span
              className="pythia-ticker__dot"
              style={{ background: TONE_COLOR[item.tone ?? "sky"] }}
              aria-hidden="true"
            />
            <span className="pythia-ticker__label">{item.label}</span>
            <span className="pythia-ticker__value">{item.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

export default LiveTicker;
