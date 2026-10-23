/**
 * Client entry for `vite-react-ssg`.
 *
 * The build prerenders every route to HTML; this file is what boots React on
 * top of that HTML in the browser. `ViteReactSSG` handles both sides from the
 * same route table in ./routes.tsx.
 */

import { ViteReactSSG } from "vite-react-ssg";
import { routes } from "./routes";
import "./styles/global.css";

export const createRoot = ViteReactSSG({ routes });
