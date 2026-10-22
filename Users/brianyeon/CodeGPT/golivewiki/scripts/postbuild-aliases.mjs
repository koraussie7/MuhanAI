#!/usr/bin/env node
/**
 * postbuild-aliases.mjs — Generate short-URL alias HTML files for every
 * screens-NN-*.html in dist/. So /05-create-gig.html -> /screens-05-create-gig.html.
 *
 * This runs after vite build (and after postbuild.mjs has minified styles + injected hreflang).
 * Each alias is a minimal HTML with <meta http-equiv="refresh"> + JS fallback + canonical link.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
);
const DIST = path.join(ROOT, "dist");
const STATIC_PAGES = path.join(ROOT, "scripts", "static-pages");
const SITE_ORIGIN = "https://golive.wiki";

// ----------------------------------------------------------------------------
// Step 1: Copy static pages (preserved across builds) from scripts/static-pages
// into dist/. Examples: 301.html (session-expired), 404.html (not-found), etc.
// These are NOT generated — they live in source control and survive `npm run build`.
// ----------------------------------------------------------------------------
let copiedStatic = 0;
if (fs.existsSync(STATIC_PAGES)) {
  for (const f of fs.readdirSync(STATIC_PAGES)) {
    if (!f.endsWith(".html")) continue;
    const src = path.join(STATIC_PAGES, f);
    const dst = path.join(DIST, f);
    fs.copyFileSync(src, dst);
    copiedStatic++;
  }
}

const htmlFiles = fs
  .readdirSync(DIST)
  .filter((f) => /^screens-\d{2}-[A-Za-z0-9_-]+\.html$/.test(f));

let created = 0;
for (const file of htmlFiles) {
  const shortName = file.replace(/^screens-/, ""); // "05-create-gig.html"
  const aliasPath = path.join(DIST, shortName);
  if (fs.existsSync(aliasPath)) continue; // already there

  const targetUrl = `${SITE_ORIGIN}/${file}`;
  const aliasHtml = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${shortName} — golive.wiki</title>
<meta http-equiv="refresh" content="0; url=${targetUrl}"/>
<link rel="canonical" href="${targetUrl}"/>
<style>
  body { background:#0a0a0c; color:#fafafa; font-family:"Plus Jakarta Sans",system-ui,sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; }
  .redirect-note { text-align:center; }
  .redirect-note a { color:#14ebc0; }
</style>
</head>
<body>
<div class="redirect-note">
  <p>대시보드로 이동 중…</p>
  <p><a href="${targetUrl}">클릭하여 계속</a></p>
</div>
<script>setTimeout(function(){window.location.replace(${JSON.stringify(targetUrl)});}, 100);</script>
</body>
</html>
`;
  fs.writeFileSync(aliasPath, aliasHtml, "utf-8");
  created++;
}

console.log(
  `[postbuild-aliases] copied ${copiedStatic} static pages + created ${created} short-URL alias HTML files in dist/`,
);
