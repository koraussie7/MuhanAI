/**
 * js/search-typeahead.js
 *
 * golive.wiki own design — header search bar typeahead.
 * Debounced fuzzy search over Supabase `tasks` table, with a graceful
 * fallback to the in-memory SEED_TASKS list when the API is offline
 * (so the UI still feels alive on first paint or during outages).
 *
 * No third-party libraries — pure fetch + DOM diffing.
 */

import { getTasks } from "./api.js";
import { store } from "./state-store.js";

const DEBOUNCE_MS = 220;
const MIN_CHARS = 1;
const MAX_RESULTS = 8;

// Local seed used as fallback when the Supabase roundtrip fails.
function seedTasks() {
  return [
    { id: "s1", title: "강남구 짐 옮기기",        location: "서울 강남구 역삼동",  price: "₩85,000",  category: "moving",      lat: 37.501,  lng: 127.039 },
    { id: "s2", title: "원룸 청소 (3시간)",       location: "서울 마포구 연남동",  price: "₩60,000",  category: "cleaning",    lat: 37.566,  lng: 126.924 },
    { id: "s3", title: "에어컨 설치 (벽걸이 1대)", location: "경기 성남시 분당구",  price: "₩120,000", category: "install",     lat: 37.382,  lng: 127.119 },
    { id: "s4", title: "강아지 산책 (30분)",      location: "서울 송파구 잠실동",  price: "₩25,000",  category: "pets",        lat: 37.513,  lng: 127.086 },
    { id: "s5", title: "택배 상차 / 하차 도움",    location: "서울 영등포구",      price: "₩45,000",  category: "delivery",    lat: 37.526,  lng: 126.896 },
    { id: "s6", title: "가구 조립 (이케아 책상)",  location: "서울 강서구 화곡동",  price: "₩55,000",  category: "assembly",    lat: 37.541,  lng: 126.851 },
    { id: "s7", title: "수영장 청소",             location: "경기 용인시 수지구",  price: "₩180,000", category: "cleaning",    lat: 37.321,  lng: 127.078 },
    { id: "s8", title: "벽지 부분 시트지 시공",   location: "서울 종로구",        price: "₩90,000",  category: "handyman",    lat: 37.573,  lng: 126.979 },
  ];
}

// --- Tiny fuzzy scorer — case-insensitive, accent-insensitive,
//     weighted: title(3) > location(2) > category(1).
function norm(s) {
  return (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function score(task, q) {
  const nq = norm(q);
  if (!nq) return 0;
  let s = 0;
  const title    = norm(task.title);
  const location = norm(task.location);
  const category = norm(task.category);
  if (title.includes(nq))    s += 3 + (title.startsWith(nq) ? 2 : 0);
  if (location.includes(nq)) s += 2 + (location.startsWith(nq) ? 1 : 0);
  if (category.includes(nq)) s += 1;
  return s;
}

// --- Debounce + query pipeline.
let _cache = null;       // last fetched tasks from Supabase
let _cacheTs = 0;
const CACHE_TTL_MS = 30_000;

async function fetchAll() {
  if (_cache && Date.now() - _cacheTs < CACHE_TTL_MS) return _cache;
  try {
    const data = await getTasks();
    _cache = Array.isArray(data) && data.length ? data : seedTasks();
  } catch (_e) {
    _cache = seedTasks(); // graceful offline fallback
  }
  _cacheTs = Date.now();
  return _cache;
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// --- DOM wiring.
function el(sel, root = document) { return root.querySelector(sel); }

function ensureDropdown() {
  let dd = el(".search-dropdown");
  if (dd) return dd;
  dd = document.createElement("div");
  dd.className = "search-dropdown";
  dd.setAttribute("role", "listbox");
  el(".search-bar").appendChild(dd);
  return dd;
}

function render(rows, q) {
  const dd = ensureDropdown();
  dd.innerHTML = "";
  if (!q || q.length < MIN_CHARS) {
    dd.hidden = true;
    return;
  }
  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "search-empty";
    empty.textContent = "결과 없음";
    dd.appendChild(empty);
    dd.hidden = false;
    return;
  }
  for (const r of rows) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "search-item";
    item.setAttribute("role", "option");
    item.innerHTML = `
      <div class="search-item-title">${escapeHtml(r.title || "(no title)")}</div>
      <div class="search-item-meta">
        <span class="search-item-loc">📍 ${escapeHtml(r.location || "")}</span>
        <span class="search-item-price">${escapeHtml(r.price || "")}</span>
      </div>
    `;
    item.addEventListener("click", () => {
      // Click → focus the map + close dropdown.
      if (typeof window.focusTask === "function" && r.lat && r.lng) {
        window.focusTask(Number(r.lat), Number(r.lng), r.title);
      }
      dd.hidden = true;
    });
    dd.appendChild(item);
  }
  dd.hidden = false;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({"&":"&","<":"<",">":">","\"":""","'":"'"}[c]));
}

export async function initSearchTypeahead() {
  const input = el(".search-bar input");
  if (!input) return;
  await fetchAll(); // warm the cache so first keystroke is instant

  const onQuery = debounce(async (q) => {
    const all = await fetchAll();
    const scored = all
      .map((t) => ({ ...t, _s: score(t, q) }))
      .filter((t) => t._s > 0)
      .sort((a, b) => b._s - a._s)
      .slice(0, MAX_RESULTS);
    render(scored, q);
  }, DEBOUNCE_MS);

  input.addEventListener("input", (e) => onQuery(e.target.value.trim()));
  input.addEventListener("focus", (e) => {
    if (e.target.value.trim()) onQuery(e.target.value.trim());
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") ensureDropdown().hidden = true;
  });

  // Click-outside to close.
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-bar")) ensureDropdown().hidden = true;
  });
}

// Hook into store so other modules can clear the dropdown (e.g. when
// the user switches modes).
store.subscribe("mode:change", () => {
  const dd = el(".search-dropdown");
  if (dd) dd.hidden = true;
});
