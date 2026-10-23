/**
 * Entry for `vite-react-ssg`.
 *
 * ViteReactSSG returns a mount function — it does not mount by itself. Naming
 * the result `createRoot` and never calling it produced a page that prerendered
 * perfectly and then stayed inert: the markup was there, the bundle loaded, and
 * no click did anything because React had never attached.
 */

import { ViteReactSSG } from "vite-react-ssg";
import { routes } from "./routes";
import "./styles/global.css";

export const createRoot = ViteReactSSG({ routes });

// Mount on the client.
//
// createRoot's first argument is `client`, defaulting to false. With false it
// renders the SSR shape and never hydrates, so the page sat there fully
// prerendered with zero React attached — every click did nothing. Calling it
// with `true` builds the browser router and hydrates the markup.
if (typeof document !== "undefined") {
	void createRoot(true);
}
