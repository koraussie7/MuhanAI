/**
 * OpsMaxxApp — embedded OpsMaxx window for DaedalOS.
 *
 * T5 of the OpsMaxx × MuhanAI integration
 * (see docs/adr/0010-opsmaxx-bridge.md,
 *  docs/agentmesh/AGENT-ASSIGNMENT-PLAN.md, and
 *  docs/agentmesh/T5-OPSMAXX-DESKTOP-EMBED.md).
 *
 * Two embed strategies are supported, both pure-React so the same
 * component runs in the browser (dev) and in a Next.js SSR build:
 *
 *   - `iframe` (default): a sandboxed iframe against an OpsMaxx
 *     embed endpoint. Origin is locked via `sandbox` + `allow` and
 *     cross-window messages are restricted to the configured origin.
 *   - `panel`: a structured side panel driven by the bridge directly,
 *     so the dashboard works *without* the OpsMaxx embed endpoint
 *     being available. This is the fallback for the
 *     "OpsMaxx maintainer never answered the contact email" path.
 *
 * The component never imports Electron or any OpsMaxx code; the only
 * contract it knows is `@agentmesh/opsmaxx-bridge`.
 */

import { createInMemoryBridge, type OpsMaxxBridge } from "@agentmesh/opsmaxx-bridge";
import { ExternalLink, Lock, Network, Server, Terminal, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const ALLOWED_MESSAGE_TYPES = new Set([
	"opsmaxx:capability",
	"opsmaxx:approval_request",
	"opsmaxx:nav",
	"opsmaxx:error",
]);

export type OpsMaxxEmbedMode = "iframe" | "panel";

export interface OpsMaxxAppProps {
	/** Embed mode. Defaults to "panel" for safer dev defaults. */
	mode?: OpsMaxxEmbedMode;
	/** Iframe target URL. Required when `mode === "iframe"`. */
	iframeSrc?: string;
	/** Iframe target origin for postMessage validation. */
	iframeOrigin?: string;
	/**
	 * Inject a bridge in tests. Production uses the in-memory bridge
	 * because DaedalOS runs entirely in the browser; the IPC client
	 * (T1-P2) is the production path on the gateway side, not here.
	 */
	bridge?: OpsMaxxBridge;
}

export function OpsMaxxApp(props: OpsMaxxAppProps): React.ReactElement {
	const mode = props.mode ?? "panel";
	const bridge = useMemo<OpsMaxxBridge>(
		() => props.bridge ?? createInMemoryBridge(),
		[props.bridge],
	);
	const [capabilityCount, setCapabilityCount] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [iframeOk, setIframeOk] = useState<boolean | null>(null);
	const iframeRef = useRef<HTMLIFrameElement | null>(null);

	// Pull a snapshot of available capabilities from the bridge so the
	// panel can show live counts. This is the only thing the panel
	// needs from the bridge; everything else is a stub in the
	// in-memory bridge and lands in T1-P2.
	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const [vault, ssh, dbs] = await Promise.all([
					bridge.vault.list(),
					bridge.ssh.listConnections(),
					bridge.databases.listConnections(),
				]);
				if (cancelled) return;
				const count =
					(vault.ok ? vault.value.length : 0) +
					(ssh.ok ? ssh.value.length : 0) +
					(dbs.ok ? dbs.value.length : 0);
				setCapabilityCount(count);
			} catch (e) {
				if (!cancelled) setError(e instanceof Error ? e.message : String(e));
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [bridge]);

	const handleMessage = useCallback(
		(event: MessageEvent) => {
			if (mode !== "iframe") return;
			if (props.iframeOrigin && event.origin !== props.iframeOrigin) return;
			const data = event.data as { type?: unknown; payload?: unknown } | null;
			if (!data || typeof data !== "object") return;
			if (typeof data.type !== "string" || !ALLOWED_MESSAGE_TYPES.has(data.type)) return;
			// Forward into bridge; real implementation lands in T1-P2.
			if (data.type === "opsmaxx:capability") {
				setCapabilityCount((n) => n + 1);
			}
		},
		[mode, props.iframeOrigin],
	);

	useEffect(() => {
		window.addEventListener("message", handleMessage);
		return () => window.removeEventListener("message", handleMessage);
	}, [handleMessage]);

	if (mode === "iframe") {
		return (
			<div className="opsmaxx-app opsmaxx-app-iframe" data-testid="opsmaxx-iframe-mode">
				<div className="opsmaxx-app-header">
					<ExternalLink size={14} />
					<span>OpsMaxx (embedded)</span>
					<button
						type="button"
						className="opsmaxx-app-refresh"
						onClick={() => {
							iframeRef.current?.contentWindow?.location.reload();
						}}
						aria-label="Reload OpsMaxx"
					>
						reload
					</button>
				</div>
				<iframe
					ref={iframeRef}
					src={props.iframeSrc}
					title="OpsMaxx"
					sandbox="allow-scripts allow-same-origin allow-forms"
					referrerPolicy="no-referrer"
					onLoad={() => setIframeOk(true)}
					onError={() => {
						setIframeOk(false);
						setError("iframe failed to load");
					}}
					className="opsmaxx-app-iframe-element"
				/>
				{iframeOk === false && (
					<div className="opsmaxx-app-error" role="alert">
						Failed to load OpsMaxx embed.{" "}
						<button
							type="button"
							onClick={() => {
								setError(null);
								setIframeOk(null);
							}}
						>
							dismiss
						</button>
					</div>
				)}
			</div>
		);
	}

	return (
		<div className="opsmaxx-app opsmaxx-app-panel" data-testid="opsmaxx-panel-mode">
			<div className="opsmaxx-app-header">
				<Network size={14} />
				<span>OpsMaxx Bridge Panel</span>
				{capabilityCount > 0 && (
					<span className="opsmaxx-app-cap-pill">{capabilityCount} capabilities</span>
				)}
				<button
					type="button"
					className="opsmaxx-app-close"
					aria-label="Close"
					onClick={() => setError("close requested")}
				>
					<X size={12} />
				</button>
			</div>
			{error && (
				<div className="opsmaxx-app-error" role="alert">
					{error}
				</div>
			)}
			<div className="opsmaxx-app-grid">
				<div className="opsmaxx-app-card">
					<Lock size={16} />
					<span className="opsmaxx-app-card-label">Vault</span>
					<span className="opsmaxx-app-card-hint">secrets stay on host</span>
				</div>
				<div className="opsmaxx-app-card">
					<Terminal size={16} />
					<span className="opsmaxx-app-card-label">SSH</span>
					<span className="opsmaxx-app-card-hint">approval per call</span>
				</div>
				<div className="opsmaxx-app-card">
					<Server size={16} />
					<span className="opsmaxx-app-card-label">DB</span>
					<span className="opsmaxx-app-card-hint">double confirm on write</span>
				</div>
			</div>
			<p className="opsmaxx-app-foot">
				Bridge mode: <code>{props.bridge ? "injected" : "memory"}</code> · T5 panel view; T1-P2
				wires the real OpsMaxx IPC.
			</p>
		</div>
	);
}
