import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react()],
	// Prerender to static HTML. The page is a marketing landing page whose only
	// job is to be found and read; a client-only build would ship an empty root.
	ssgOptions: {
		script: "async",
		// "none" keeps the prerendered markup byte-exact; minifying the HTML would
		// only save bytes the gzip layer handles already.
		formatting: "none",
		dirStyle: "nested",
		// index.html is the original hand-written page, kept untouched as the
		// visual baseline for this migration — it has no #root and no module
		// script. app.html is the React shell, so SSG renders into that.
		entry: "src/main-ssg.tsx",
		// SSG reads its HTML template from here. index.html is the original
		// hand-written page, kept untouched as the visual baseline — it has no
		// #root and no module script. app.html is the React shell.
		htmlEntry: "app.html",
	},
	build: {
		outDir: "dist-ssg",
		rollupOptions: {
			// vite-react-ssg's default entry is src/main.ts; ours is .tsx and
			// named for what it does, so point at it explicitly.
			input: "src/main-ssg.tsx",
		},
	},
});
