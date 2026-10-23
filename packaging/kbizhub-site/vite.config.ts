import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react()],
	build: {
		outDir: "dist",
		// index.legacy.html is the pre-React page, kept as the visual baseline
		// for the migration. The React entry is app.html so the original file is
		// never overwritten while tracks are still landing.
		rollupOptions: {
			input: resolve(__dirname, "app.html"),
			output: {
				manualChunks: undefined,
			},
		},
	},
});
