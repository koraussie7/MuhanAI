/**
 * SSG entry — prerenders the landing page to static HTML at build time.
 *
 * The original kbizhub page was plain HTML, so every section was in the initial
 * response and fully indexable. A client-rendered React page would serve an
 * empty <div id="root">, which for a marketing landing page means losing the
 * thing the page exists for. This file restores the static output while the app
 * stays component-based.
 *
 * One route, no client-side router: the page navigates by anchor.
 */

import type { RouteRecord } from "vite-react-ssg";
import { App } from "./App";

export const routes: RouteRecord[] = [{ path: "/", element: <App /> }];

export default routes;

// JSX in a .ts file needs the tsx extension; see main.tsx for the client entry.
