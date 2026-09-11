import { useState, useEffect, useCallback, useRef } from "react";
import { AIEngineFactory } from "@agentmesh/ai-engine/factory";
import type { EngineConfig, EngineStatus, ModelInfo } from "@agentmesh/ai-engine/types";

export function useAIEngine(config: EngineConfig) {
	const engineRef = useRef<ReturnType<typeof AIEngineFactory.create> | null>(null);
	const [status, setStatus] = useState<EngineStatus>({
		ready: false,
		loading: false,
		modelLoaded: null,
		memoryUsage: 0,
		backend: "",
		error: null,
	});
	const [models, setModels] = useState<ModelInfo[]>([]);
	const [isGenerating, setIsGenerating] = useState(false);
	const [output, setOutput] = useState("");

	useEffect(() => {
		const engine = AIEngineFactory.create(config);
		engineRef.current = engine;

		engine.on("status", setStatus);
		engine.on("error", (error) => console.error("Engine error:", error));

		engine.init().then(() => {
			engine.getModels().then(setModels);
		});

		return () => {
			engine.dispose();
		};
	}, [config.type]);

	const loadModel = useCallback(async (modelId: string) => {
		if (!engineRef.current) return;
		await engineRef.current.loadModel(modelId);
	}, []);

	const chat = useCallback(async (message: string): Promise<string> => {
		if (!engineRef.current) throw new Error("Engine not initialized");
		return engineRef.current.chat(message);
	}, []);

	const stream = useCallback(async (message: string) => {
		if (!engineRef.current) throw new Error("Engine not initialized");

		setIsGenerating(true);
		setOutput("");

		return new Promise<string>((resolve, reject) => {
			try {
				engineRef.current!.stream(
					message,
					(token) => setOutput((prev) => prev + token),
					new AbortController().signal
				);
			} catch (error) {
				reject(error);
			} finally {
				setIsGenerating(false);
			}
		});
	}, []);

	const stop = useCallback(() => {
		setIsGenerating(false);
	}, []);

	return {
		status,
		models,
		isGenerating,
		output,
		loadModel,
		chat,
		stream,
		stop,
	};
}
