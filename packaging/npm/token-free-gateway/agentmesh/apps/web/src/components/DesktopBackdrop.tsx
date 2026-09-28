/**
 * DesktopBackdrop — the wallpaper behind the `/desktop` shell.
 *
 * Three modes, all rendered as a full-bleed layer under the window
 * manager so icons, windows, and the taskbar stay on top:
 *
 *   - `globe`     — Pythia World Engine sphere (reuses `WorldGlobe`)
 *   - `knowledge` — ontology knowledge graph (reuses `KnowledgeGraphCanvas`)
 *   - `plain`     — the original gradient wallpaper
 *
 * Both visual modes reuse the existing components rather than
 * re-implementing them, so the desktop can never drift from the
 * dedicated `/pythia` and `/knowledge` pages. The only difference is a
 * `variant` flag threaded down: `background` renders chrome-free and
 * fills the viewport, `panel` keeps the framed card the standalone
 * pages use.
 *
 * Data comes from the same client the pages use (`fetchWorldBrief`).
 * A failed fetch degrades to the component's own offline demo markers
 * instead of leaving a blank wallpaper — a desktop background must
 * never render as an empty void.
 */

import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { KnowledgeGraphCanvas } from "./harvest/B2/KnowledgeGraphCanvas.js";
import { WorldGlobe } from "./WorldGlobe.js";
import { fetchWorldBrief } from "../lib/world-client.js";
import type { WorldEvent } from "../lib/world-types.js";

export type BackdropMode = "globe" | "knowledge" | "plain";

export interface DesktopBackdropProps {
  readonly mode: BackdropMode;
  /**
   * Dim the visual so foreground windows keep contrast. Kept below
   * 0.5 so the wallpaper never washes out the desktop icons.
   */
  readonly dimmed?: boolean;
}

const MODE_LABEL: Record<BackdropMode, string> = {
  globe: "Pythia 지구본",
  knowledge: "Ontology 지식그래프",
  plain: "기본 배경",
};

export function DesktopBackdrop({
  mode,
  dimmed = false,
}: DesktopBackdropProps) {
  const [events, setEvents] = useState<WorldEvent[]>([]);
  const [online, setOnline] = useState(false);

  // Fetch once per mount. The globe tolerates a stale feed far better
  // than it tolerates a render loop, so there is no polling here —
  // `/pythia` stays the place for live refresh.
  useEffect(() => {
    if (mode !== "globe") return;
    let cancelled = false;
    void (async () => {
      try {
        const brief = await fetchWorldBrief();
        if (cancelled) return;
        setEvents(brief.events);
        setOnline(brief.source === "pythia");
      } catch {
        // Offline is a normal state for a wallpaper; `WorldGlobe`
        // draws its demo markers when `events` stays empty.
        if (!cancelled) setOnline(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const filter = useMemo(
    () => (mode === "plain" ? undefined : "saturate(0.85) brightness(0.72)"),
    [mode],
  );

  if (mode === "plain") {
    return (
      <div
        className="desktop-backdrop desktop-backdrop-plain"
        aria-hidden="true"
        data-backdrop="plain"
      />
    );
  }

  return (
    <div
      className={`desktop-backdrop desktop-backdrop-${mode}${dimmed ? " is-dimmed" : ""}`}
      aria-hidden="true"
      data-backdrop={mode}
      data-backdrop-label={MODE_LABEL[mode]}
    >
      <div className="desktop-backdrop-visual" style={{ filter }}>
        {mode === "globe" ? (
          <WorldGlobe
            events={events}
            isOnline={online}
            demoFallback
            variant="background"
          />
        ) : (
          <KnowledgeGraphCanvas variant="background" />
        )}
      </div>
      {/* Soft vignette so window titles stay legible over bright
			    points without hiding the visual itself. */}
      <div className="desktop-backdrop-vignette" />
      <div className="desktop-backdrop-badge">
        <Sparkles size={12} />
        <span>{MODE_LABEL[mode]}</span>
      </div>
    </div>
  );
}
