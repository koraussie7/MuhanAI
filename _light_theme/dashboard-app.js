/**
 * js/dashboard-app.js
 *
 * Worker dashboard controller. Owns:
 *  - Leaflet map + price markers (was inline in screens-04-dashboard.html)
 *  - Activity feed (subscribes to state-store events)
 *  - Mode switcher UI (toggles between worker / requester modes)
 *  - Drawer open/close (delegated to request-drawer.js)
 *
 * This module is loaded by screens-04-dashboard.html with type="module".
 * It expects the following DOM IDs to exist:
 *   #real-map            — Leaflet container
 *   #activity-feed       — Activity feed container (children: .activity-item)
 *   #mode-switcher       — Segmented control with two buttons (data-mode attrs)
 *   #request-drawer      — Drawer root (managed by request-drawer.js)
 */
import { store } from "./state-store.js";

// ===== Theme (light/dark) — bound BEFORE map init so first paint is correct =====
const THEME_KEY = "golive_theme";
function resolveInitialTheme() {
  const saved = (() => { try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; } })();
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* ignore */ }
  // Update the toggle button label/icon if present.
  const btn = document.getElementById("theme-toggle");
  if (btn) {
    btn.setAttribute("aria-pressed", theme === "light" ? "true" : "false");
    btn.dataset.theme = theme;
    const label = btn.querySelector("[data-i18n=\"theme_toggle\"]");
    if (label) {
      const t = (window.__i18n__?.t?.bind(window.__i18n__) || (k) => k)("theme_toggle");
      label.textContent = theme === "light" ? t || "🌞 라이트" : t || "🌙 다크";
    }
  }
  // Force Leaflet to refetch tiles at the new URL.
  if (typeof map !== "undefined") {
    for (const layer of [primaryTile, ...osmFallbacks]) {
      try { layer.redraw(); } catch (e) { /* ignore */ }
    }
    setTimeout(() => map.invalidateSize(), 60);
  }
}
// Resolve + apply BEFORE Leaflet paints to avoid a dark→light flash.
applyTheme(resolveInitialTheme());

// ===== Leaflet Map (inDriver-style minimal) =====
// CartoDB Voyager (light) / OSM-DE (dark) — free, no API key, near-identical to
// inDriver's tone in dark mode. The tile URL is driven by `--map-tile-url`
// in tokens.css so the theme flip is one CSS variable swap.
const map = L.map("real-map", {
  zoomControl: false,
  attributionControl: false, // we render a tiny credit in CSS instead
}).setView([37.505, 127.035], 14);

function currentTileUrl() {
  return getComputedStyle(document.documentElement).getPropertyValue("--map-tile-url").trim().replace(/^"|"$/g, "");
}
function currentFallbackUrl() {
  return getComputedStyle(document.documentElement).getPropertyValue("--map-tile-fallback").trim().replace(/^"|"$/g, "");
}
L.control.zoom({ position: "bottomright" }).addTo(map);
// OpenStreetMap tiles via the German community mirror (tile.openstreetmap.de).
// Why this one and not the canonical tile.openstreetmap.org?
//  - The .org host was returning ERR_NAME_NOT_RESOLVED for some client DNS
//    resolvers in production (verified via curl probes from the origin and
//    from a sandbox: 110 server 200, sandbox 000).
//  - tile.openstreetmap.de is operated by the FOSSGIS e.V. community, is
//    API-key-free, has no watermark, and serves the same OSM data.
//  - All four OSM subdomains (a/b/c.tile.openstreetmap.org) are registered
//    as fallback layers so if one host fails DNS we automatically try the
//    next. Leaflet uses only the first as the primary renderer, but the
//    fallback layers are tried sequentially on tile:error.
const primaryTile = L.tileLayer(
  currentTileUrl() || "https://tile.openstreetmap.de/{z}/{x}/{y}.png",
  {
    maxZoom: 19,
    attribution: "",
    crossOrigin: true,
  }
).addTo(map);

// Theme-aware fallback URLs (CartoDB Voyager for light, OSM subdomains for dark).
function buildFallbacks() {
  const primary = currentTileUrl();
  const fallback = currentFallbackUrl();
  // Light mode: a/b/c subdomains of the same CartoDB host.
  if (primary.includes("cartocdn.com")) {
    return ["a", "b", "c"].map((s) =>
      L.tileLayer(`https://${s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png`, {
        maxZoom: 19,
        crossOrigin: true,
      })
    );
  }
  // Dark mode: OSM subdomains.
  return ["a", "b", "c"].map((s) =>
    L.tileLayer(fallback || `https://${s}.tile.openstreetmap.org/{z}/{x}/{y}.png`, {
      maxZoom: 19,
      crossOrigin: true,
    })
  );
}
const osmFallbacks = buildFallbacks();

// If a primary tile errors (DNS, 5xx, etc.), try the fallbacks in order
// until one returns 200. This survives partial DNS failures without an
// API key.
primaryTile.on("tileerror", (e) => {
  const coords = e.coords;
  for (const layer of osmFallbacks) {
    const url = layer.getTileUrl(coords);
    // Probe the URL once; if it loads, Leaflet will retry through that
    // layer on the next redraw. We don't hot-swap the live layer (would
    // flicker); instead, on next zoom/pan, the working layer's tiles are
    // already cached.
    fetch(url, { mode: "cors" }).then((r) => {
      if (r.ok) {
        // no-op; Leaflet's internal retry will pick it up via cached URL
      }
    }).catch(() => {});
  }
});

// "You are here" pulse: dot + accuracy circle (inDriver-style).
// Centered on the initial view for the demo; replace with navigator.geolocation
// when the user grants permission.
let userPulse = null;
function placeUserPulse(latlng) {
  if (userPulse) {
    userPulse.circle.setLatLng(latlng);
    userPulse.dot.setLatLng(latlng);
    return;
  }
  const dot = L.circleMarker(latlng, {
    radius: 6,
    weight: 2,
    color: "#14ebc0",
    fillColor: "#14ebc0",
    fillOpacity: 1,
    interactive: false,
  }).addTo(map);
  const circle = L.circle(latlng, {
    radius: 60,
    stroke: false,
    fillColor: "#14ebc0",
    fillOpacity: 0.12,
    interactive: false,
  }).addTo(map);
  userPulse = { dot, circle };
}

// Initial dashboard tasks (mirrors what was hardcoded in the legacy file).
const SEED_TASKS = [
  { id: 1, title: "논현동 원룸 입주 청소", price: "₩85,000", location: "서울 강남구 논현동", lat: 37.5088, lng: 127.0398 },
  { id: 2, title: "이케아 3단 서랍장 조립", price: "₩50,000", location: "서울 서초구 반포동", lat: 37.5028, lng: 127.0125 },
  { id: 3, title: "소형 1톤 트럭 용달", price: "₩90,000", location: "역삼동 → 잠실동", lat: 37.5006, lng: 127.0364 },
  { id: 4, title: "삼성동 오피스 조명 교체", price: "₩65,000", location: "서울 강남구 삼성동", lat: 37.5185, lng: 127.0515 },
];

const markers = {};
function addMarker(task) {
  if (markers[task.title]) return markers[task.title];
  const icon = L.divIcon({
    className: "custom-div-icon minimal-pin",
    html: `
      <div class="price-chip">${task.price}</div>
      <div class="pin-stem"></div>
    `,
    iconSize: [76, 38],
    iconAnchor: [38, 36],
  });
  const marker = L.marker([task.lat, task.lng], { icon, riseOnHover: true }).addTo(map);
  marker.bindPopup(`
    <div class="popup-card">
      <h4>${task.title}</h4>
      <p>📍 ${task.location}</p>
      <div class="price">${task.price}</div>
      <a href="https://golive.wiki/screens-06-task-detail.html">상세보기 & 제안하기 →</a>
    </div>
  `);
  markers[task.title] = marker;
  return marker;
}

// Seed the map with the four existing tasks and place a "you are here" pulse
// at the map's initial center.
SEED_TASKS.forEach(addMarker);
placeUserPulse(map.getCenter());
store.set({ dashboardTasks: SEED_TASKS });

// Public function: smoothly pan to a task and open its popup.
window.focusTask = function (lat, lng, title) {
  map.flyTo([lat, lng], 15, { duration: 1.2 });
  if (markers[title]) setTimeout(() => markers[title].openPopup(), 1200);
};

// ===== Activity Feed =====
function appendActivity({ time, msg, price }) {
  const feed = document.getElementById("activity-feed");
  if (!feed) return;
  const item = document.createElement("div");
  item.className = "activity-item";
  item.innerHTML = `
    <div class="time">${time}</div>
    <div class="msg">${msg}</div>
    ${price ? `<div class="price">${price}</div>` : ""}
  `;
  feed.insertBefore(item, feed.firstChild);
}

store.subscribe("task:created", (task) => {
  appendActivity({
    time: "방금 전",
    msg: `새 의뢰 등록: "${task.title}"`,
    price: `희망 예산: ${task.myOffer?.toLocaleString("ko-KR") ? "₩" + task.myOffer.toLocaleString("ko-KR") : "—"}`,
  });
  const center = map.getCenter();
  const newTask = {
    id: task.id,
    title: task.title,
    price: "₩" + (task.myOffer || 50000).toLocaleString("ko-KR"),
    location: "방금 등록됨",
    lat: center.lat + (Math.random() - 0.5) * 0.01,
    lng: center.lng + (Math.random() - 0.5) * 0.01,
  };
  addMarker(newTask);
  const list = store.get().dashboardTasks;
  store.set({ dashboardTasks: [newTask, ...list] });
});

store.subscribe("offer:accepted", ({ offerId, offer }) => {
  const name = offer?.worker_name || `워커 ${offerId}`;
  const price = offer?.counter_offer
    ? `확정가: ₩${offer.counter_offer.toLocaleString("ko-KR")}`
    : "";
  appendActivity({ time: "방금 전", msg: `${name} 매칭 확정 (제안 수락)`, price });
});

store.subscribe("offer:declined", ({ offerId }) => {
  appendActivity({ time: "방금 전", msg: `제안 거절됨 (id: ${offerId})` });
});

store.subscribe("offer:countered", ({ offerId, amount }) => {
  appendActivity({ time: "방금 전", msg: `역제안 전송: ₩${amount.toLocaleString("ko-KR")}` });
});

// ===== Mode Switcher =====
function initModeSwitcher() {
  const switcher = document.getElementById("mode-switcher");
  if (!switcher) return;
  const buttons = switcher.querySelectorAll("[data-mode]");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      if (mode === "worker") store.set({ mode: "idle", userRole: "worker" });
      else store.set({ mode: "request-1", userRole: "requester" });
    });
  });
  store.subscribe("mode:change", ({ to }) => {
    buttons.forEach((btn) => {
      const isActive =
        (btn.dataset.mode === "worker" && (to === "idle" || to.startsWith("browse"))) ||
        (btn.dataset.mode === "requester" && to.startsWith("request-"));
      btn.classList.toggle("active", isActive);
    });
  });
}

// ===== Initial mode from URL (?mode=request) =====
// Phase 3: legacy deep links like ?mode=request (from screens-07-ride.html)
// should land with the request drawer already open.
(function applyUrlMode() {
  // Wait for DOMContentLoaded (and a microtask) so other modules
  // (request-drawer.js in particular) finish registering store
  // subscribers before we emit mode:change.
  function run() {
    try {
      const params = new URLSearchParams(window.location.search);
      const mode = params.get("mode");
      if (mode === "request" || (mode && mode.startsWith("request-"))) {
        const step = mode === "request" ? 1 : Number(mode.split("-").pop()) || 1;
        store.set({ mode: `request-${step}`, userRole: "requester" });
      }
    } catch (e) {
      console.warn("[dashboard-app] URL mode parse failed:", e);
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () =>
      setTimeout(run, 0)  // defer one tick so subscribers attach first
    );
  } else {
    setTimeout(run, 0);
  }
})();

// ===== Init =====
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => { initModeSwitcher(); });
} else {
  initModeSwitcher();
}

// ============================================================
// Map layers — golive.wiki own design (no third-party code).
// Each layer is a Leaflet layer group that can be toggled on/off
// via the four buttons in the top-right corner of the map.
// ============================================================

import { store as dashboardStore } from "./state-store.js";
import { getDemand, getRiskZones, getSignals, getValuation } from "./api.js";

const layerGroups = {
  demand:    null,
  risk:      null,
  signals:   null,
  valuation: null,
};

// Tokens — keep in sync with styles/tokens.css.
const COLORS = {
  demand:    "#ff5a5a", // 🔥 red-coral
  risk:      "#f0b400", // ⚠️ amber
  signals:   "#7c5cff", // 📡 indigo pulse
  valuation: "#14ebc0", // 💎 mint (same as price chip)
};

// --- 1. Demand heatmap — circle markers weighted by intensity.
function buildDemandLayer() {
  const g = L.layerGroup();
  const c = map.getCenter();
  const seeds = [
    { lat: c.lat + 0.012, lng: c.lng + 0.008,  i: 0.85 },
    { lat: c.lat + 0.004, lng: c.lng - 0.006, i: 0.55 },
    { lat: c.lat - 0.010, lng: c.lng + 0.011, i: 0.70 },
    { lat: c.lat - 0.005, lng: c.lng - 0.014, i: 0.40 },
    { lat: c.lat + 0.018, lng: c.lng - 0.020, i: 0.65 },
  ];
  for (const s of seeds) {
    L.circle([s.lat, s.lng], {
      radius: 80 + s.i * 140,
      stroke: false,
      fillColor: COLORS.demand,
      fillOpacity: 0.20 + s.i * 0.18,
      interactive: false,
    }).addTo(g);
  }
  getDemand().then((rows) => {
    if (!rows || !rows.length) return;
    g.clearLayers();
    for (const r of rows) {
      L.circle([r.lat, r.lng], {
        radius: 80 + (r.intensity || 0.5) * 140,
        stroke: false,
        fillColor: COLORS.demand,
        fillOpacity: 0.20 + (r.intensity || 0.5) * 0.18,
        interactive: false,
      }).addTo(g);
    }
  });
  return g;
}

// --- 2. Risk zones — semi-transparent amber polygons.
function buildRiskLayer() {
  const g = L.layerGroup();
  const c = map.getCenter();
  const zones = [
    { name: "🚧 도로 공사",
      coords: [[c.lat - 0.004, c.lng - 0.012],[c.lat - 0.004, c.lng - 0.002],[c.lat + 0.002, c.lng - 0.002],[c.lat + 0.002, c.lng - 0.012]] },
    { name: "🪧 집회",
      coords: [[c.lat + 0.008, c.lng + 0.005],[c.lat + 0.008, c.lng + 0.012],[c.lat + 0.013, c.lng + 0.012],[c.lat + 0.013, c.lng + 0.005]] },
  ];
  for (const z of zones) {
    L.polygon(z.coords, { color: COLORS.risk, weight: 1, fillColor: COLORS.risk, fillOpacity: 0.22 })
      .bindTooltip(z.name, { sticky: true, direction: "top" })
      .addTo(g);
  }
  getRiskZones().then((rows) => {
    if (!rows || !rows.length) return;
    g.clearLayers();
    for (const r of rows) {
      const latlngs = (r.coordinates || []).map(([lng, lat]) => [lat, lng]);
      if (latlngs.length < 3) continue;
      L.polygon(latlngs, { color: COLORS.risk, weight: 1, fillColor: COLORS.risk, fillOpacity: 0.22 })
        .bindTooltip(r.name + " (" + r.severity + ")", { sticky: true, direction: "top" })
        .addTo(g);
    }
  });
  return g;
}

// --- 3. Real-time signals — pulsing animated circles.
function buildSignalsLayer() {
  const g = L.layerGroup();
  const c = map.getCenter();
  const pulses = [
    { lat: c.lat + 0.006, lng: c.lng + 0.004 },
    { lat: c.lat - 0.007, lng: c.lng + 0.009 },
    { lat: c.lat + 0.011, lng: c.lng - 0.010 },
  ];
  for (const p of pulses) {
    const ring = L.circleMarker([p.lat, p.lng], { radius: 4, color: COLORS.signals, weight: 2, fillColor: COLORS.signals, fillOpacity: 0.9, interactive: false }).addTo(g);
    ring.getElement()?.classList.add("signal-pulse");
  }
  getSignals().then((rows) => {
    if (!rows || !rows.length) return;
    g.clearLayers();
    for (const s of rows) {
      const ring = L.circleMarker([s.lat, s.lng], { radius: 4, color: COLORS.signals, weight: 2, fillColor: COLORS.signals, fillOpacity: 0.9, interactive: false }).addTo(g);
      ring.getElement()?.classList.add("signal-pulse");
    }
  });
  return g;
}

// --- 4. Valuation guide — recolor existing price chips by fairness.
//    below avg → mint (good deal), avg → amber, above avg → red-coral.
function buildValuationLayer() {
  const g = L.layerGroup();
  const chips = document.querySelectorAll(".custom-div-icon.minimal-pin .price-chip");
  if (chips.length === 0) return g;
  const prices = [...chips].map((el) => Number(el.textContent.replace(/[^\d]/g, "")) || 0);
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length || 1;
  for (const el of chips) {
    const v = Number(el.textContent.replace(/[^\d]/g, "")) || 0;
    const ratio = v / avg;
    const color =
      ratio < 0.85 ? COLORS.valuation :
      ratio > 1.20 ? COLORS.demand    :
                      COLORS.risk;
    el.style.background = color;
    el.style.color = "#09090B";
  }
  getValuation().then((rows) => {
    if (!rows || !rows.length) return;
    const avgByCat = new Map();
    for (const r of rows) {
      const cur = avgByCat.get(r.category) || { sum: 0, n: 0 };
      cur.sum += Number(r.avg_price) || 0;
      cur.n += 1;
      avgByCat.set(r.category, cur);
    }
    const all = [...avgByCat.entries()].slice(0, 4);
    if (!all.length) return;
    const c = map.getCenter();
    const html = all.map(([cat, v]) => {
      const a = Math.round(v.sum / v.n);
      return `<div style="font-size:11px;line-height:1.6"><span style="opacity:.7">${escapeHtml(cat)}:</span> <b>₩${a.toLocaleString()}</b></div>`;
    }).join("");
    const popup = L.popup({ closeButton: false, autoClose: false, className: "valuation-wrap", offset: [0, -8] })
      .setLatLng([c.lat + 0.014, c.lng + 0.012])
      .setContent(`<div class="valuation-pop">📊 카테고리 평균가<br>${html}</div>`);
    popup.openOn(map);
    g.on("remove", () => map.closePopup(popup));
  });
  return g;
}

function escapeHtml(s) {
  var MAP = {};
  MAP[String.fromCharCode(38)] = "&";
  MAP[String.fromCharCode(60)] = "<";
  MAP[String.fromCharCode(62)] = ">";
  MAP[String.fromCharCode(34)] = String.fromCharCode(34);
  MAP[String.fromCharCode(39)] = "'";
  return (s || "").toString().replace(/[&<>"']/g, function (c) { return MAP[c] || c; });
}

// --- Wire all four to the store. Layers are built lazily (once) so
//     enabling/disabling is O(1).
function setupLayers() {
  for (const name of Object.keys(layerGroups)) {
    layerGroups[name] = null; // built on first enable
  }

  dashboardStore.subscribe("layer:toggle", ({ layer, on }) => {
    if (on) {
      if (!layerGroups[layer]) {
        const builder = {
          demand:    buildDemandLayer,
          risk:      buildRiskLayer,
          signals:   buildSignalsLayer,
          valuation: buildValuationLayer,
        }[layer];
        if (!builder) return;
        layerGroups[layer] = builder();
      }
      layerGroups[layer].addTo(map);
    } else if (layerGroups[layer]) {
      map.removeLayer(layerGroups[layer]);
    }
    // Update the toggle button's visual state in the DOM.
    const btn = document.querySelector(`[data-layer="${layer}"]`);
    if (btn) btn.classList.toggle("is-on", on);
  });

  // Wire button clicks to the store.
  for (const btn of document.querySelectorAll("[data-layer]")) {
    btn.addEventListener("click", () => {
      dashboardStore.toggleLayer(btn.dataset.layer);
    });
  }
}

// Schedule layer init after map exists (init is the IIFE that calls
// addMarker + placeUserPulse). We piggyback on a microtask so the map
// variable is bound.
queueMicrotask(() => {
  if (typeof map !== "undefined") setupLayers();
});

// ===== Theme toggle button wiring =====
function initThemeToggle() {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  applyTheme(document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
  btn.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    applyTheme(next);
  });
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initThemeToggle);
} else {
  initThemeToggle();
}

// React to OS-level theme changes only if user has not picked one yet.
try {
  const mq = window.matchMedia("(prefers-color-scheme: light)");
  mq.addEventListener("change", (e) => {
    if (localStorage.getItem(THEME_KEY)) return; // user override wins
    applyTheme(e.matches ? "light" : "dark");
  });
} catch (e) { /* older browsers */ }
