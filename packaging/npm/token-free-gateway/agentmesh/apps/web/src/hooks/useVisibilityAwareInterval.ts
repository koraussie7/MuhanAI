/**
 * useVisibilityAwareInterval — page-visibility gated setInterval.
 *
 * Why:
 *   - The dashboard mounts several interval-driven visuals (50ms–4s cadence).
 *     When the tab is hidden these keep ticking, wasting CPU for zero visual
 *     output (see docs/agent/MEMORY-TESTING.md).
 *   - This is the non-canvas companion to the visibility handling
 *     `renderLoop.ts` already provides for CosmicCanvas.
 *
 * Callers may pass a fresh closure every render: the callback is held in a
 * ref so the underlying timer is never reset by identity churn.
 */
import { useEffect, useRef } from "react";

export function useVisibilityAwareInterval(callback: () => void, delayMs: number | null) {
	const callbackRef = useRef(callback);
	useEffect(() => {
		callbackRef.current = callback;
	}, [callback]);

	useEffect(() => {
		if (delayMs === null || typeof document === "undefined") return;

		let timer: ReturnType<typeof setInterval> | null = null;

		const start = () => {
			if (timer === null) {
				timer = setInterval(() => callbackRef.current(), delayMs);
			}
		};
		const stop = () => {
			if (timer !== null) {
				clearInterval(timer);
				timer = null;
			}
		};
		const onVisibility = () => {
			if (document.visibilityState === "hidden") stop();
			else start();
		};

		if (document.visibilityState !== "hidden") start();
		document.addEventListener("visibilitychange", onVisibility);

		return () => {
			stop();
			document.removeEventListener("visibilitychange", onVisibility);
		};
	}, [delayMs]);
}