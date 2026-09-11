"use client";

import { useState, useEffect, useCallback } from "react";
import { Desktop } from "@/components/Desktop";
import { Taskbar } from "@/components/Taskbar";
import { ChatWidget } from "@agentmesh/ai-ui";
import { AIEngineFactory } from "@agentmesh/ai-engine/factory";
import type { EngineConfig } from "@agentmesh/ai-engine/types";

export default function Home() {
	const [isLoading, setIsLoading] = useState(true);
		const [engineStatus, setEngineStatus] = useState<"initializing" | "ready" | "loading" | "error">("initializing");

	const initEngine = useCallback(async () => {
		try {
			setEngineStatus("initializing");
			
			// Check WebGPU support
			const hasWebGPU = "gpu" in navigator;
			
			const config: EngineConfig = {
				type: "sipp",
				backend: hasWebGPU ? "webgpu" : "wasm",
				model: "llama-3-8b-q4",
				maxTokens: 2048,
				temperature: 0.7,
			};

			const engine = AIEngineFactory.create(config);
			
			engine.on("status", (status) => {
				if (status.ready) {
					setEngineStatus("ready");
				} else if (status.loading) {
					setEngineStatus("loading");
						} else if (status.error) {
					setEngineStatus("error");
				}
			});

			await engine.init();
			setIsLoading(false);
				} catch (error) {
			console.error("Engine init failed:", error);
			setEngineStatus("error");
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		initEngine();
	}, [initEngine]);

	if (isLoading) {
		return (
			<div className="loading-screen">
				<div className="loading-content">
					<h1>MuhanAI Desktop</h1>
					<div className="status">{engineStatus}</div>
					<div className="spinner" />
				</div>
			</div>
		);
	}

		return (
		<div className="desktop-container">
			<Desktop>
				<ChatWidget />
			</Desktop>
			<Taskbar engineStatus={engineStatus} />
		</div>
	);
}
