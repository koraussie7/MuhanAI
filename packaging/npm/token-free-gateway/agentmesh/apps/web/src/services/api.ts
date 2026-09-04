// Single API base for the web app. Same-origin by default; override with
// VITE_API_BASE (e.g. the feed API origin in production).
const API = import.meta.env.VITE_API_BASE ?? "";

/** JSON fetch helper: resolves null on any failure (feeds tolerate absence). */
export function load<T>(path: string): Promise<T | null> {
  return fetch(`${API}${path}`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
}
