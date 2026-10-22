# Atlaz integration — licensing decision (2026-10-20)

## Decision
**No code from Atlaz is incorporated into golive.wiki.** Only industry-standard
UX patterns (toggleable map overlays, heatmap coloring, scoring visualization,
risk polygons, signal pulses) were observed and reimplemented from scratch
using golive.wiki's own design tokens and primitives.

## Why
Atlaz is licensed **Proprietary. All rights reserved.**
(See https://github.com/WilliamMajanja/atlaz)

| Allowed under Proprietary        | Forbidden under Proprietary                  |
|----------------------------------|----------------------------------------------|
| Reading public source on GitHub  | Copying files into golive.wiki               |
| Studying data-model structure    | Modifying and redistributing Atlaz code      |
| Discussing UX/architecture ideas | Forks that redistribute or build on the code |
| Implementing the same patterns   | Embedding Atlaz via iframe without permission|

## What was reused (legitimate)
UX patterns that are **industry-standard**, not Atlaz-specific IP:
- Toggleable map layers (Airtasker, Indrive, Google Maps, Mapbox all do this)
- Heatmap color gradients (red → yellow → green for intensity)
- Risk zone polygons (translucent amber polygons)
- Animated pulse markers (CSS `@keyframes`, common since 2018)
- Price fairness recolor (below/around/above market)

All five are reimplemented from scratch in:
- `js/state-store.js`     — `layers` state + `toggleLayer()`
- `js/dashboard-app.js`   — `buildDemandLayer / buildRiskLayer / buildSignalsLayer / buildValuationLayer`
- `screens-04-dashboard.html` — `.layer-toggles` + `.layer-btn` + `.signal-pulse`
- `styles/i18n.js`        — `layer_demand / layer_risk / layer_signals / layer_valuation`
                            × 7 languages (ko, en, vi, ja, zh, hi, es)

## If a real integration is desired in the future
Contact the Atlaz author first to negotiate:
1. A commercial license, or
2. Dual-licensing the relevant modules (e.g. MIT for `geo/`), or
3. A public API that golive.wiki can query without redistributing code.

No contact was made for this PR.
