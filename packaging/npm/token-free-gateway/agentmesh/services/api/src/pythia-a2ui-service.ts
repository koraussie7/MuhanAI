/**
 * Pythia-to-A2UI bridge service.
 *
 * Wraps the Token-Free Gateway keyless-providers call into an A2UI agent
 * service. Pythia CLI uses this to get a renderable A2UI surface alongside
 * its LLM response, so the web UI can display code changes, bug highlights,
 * and best-practice recommendations as interactive components.
 *
 * Design: mirrors the Ghost Agent pattern in ghost-routes.ts — stateless,
 * env-gated, and composable into the cosmic agent topology.
 */

import {
	callKeylessProviders,
	type KeylessRequest,
} from "@agentmesh/llm-router/src/keyless-providers.js";
import { maybeCompressPrompt } from "./pythia-routes.js";

export interface PythiaA2uiResult {
	response: string;
	provider: string;
	model: string;
	latencyMs: number;
	cost: string;
	surface: {
		surfaceId: string;
		jsonl: string[];
	};
	compressed: boolean;
}

const PYTHIA_SYSTEM =
	"You are Pythia, an expert Python coding agent. You specialize in code repair, " +
	"refactoring, bug detection, and best practices. You work through the Token-Free " +
	"Gateway with zero API cost. Always provide working, tested Python code with explanations.";

export async function pythiaA2uiCall(
	request: KeylessRequest & { file: string },
): Promise<PythiaA2uiResult> {
	const { file, prompt, ...rest } = request;
	const fullPrompt = `[PYTHIA] File: ${file}\n\n${prompt}`;

	const { text: compressedText, compressed } = await maybeCompressPrompt(fullPrompt);

	const result = await callKeylessProviders({
		prompt: compressedText,
		system: PYTHIA_SYSTEM,
		...rest,
	});

	const surfaceId = `pythia-${file.replace(/[^a-z0-9]/gi, "-")}-${Date.now()}`;

	const jsonl: string[] = [];
	jsonl.push(
		JSON.stringify({
			version: "1.0",
			createSurface: { surfaceId, catalogId: "pythia-catalog" },
		}),
	);
	jsonl.push(
		JSON.stringify({
			version: "1.0",
			updateDataModel: {
				surfaceId,
				path: "/analysis",
				value: {
					file,
					provider: result.provider,
					model: result.model,
					compressed,
					response: result.text,
				},
			},
		}),
	);
	jsonl.push(
		JSON.stringify({
			version: "1.0",
			updateComponents: {
				surfaceId,
				components: [
					{
						id: "summary",
						component: "Callout",
						catalogId: "pythia-catalog",
						intent: "info",
						props: {
							title: "Pythia Analysis",
							children: compressed
								? `${result.text.slice(0, 100)}… (prompt compressed)`
								: result.text.slice(0, 100),
						},
					},
					{
						id: "metrics",
						component: "KeyValue",
						catalogId: "pythia-catalog",
						props: {
							items: [
								{ key: "provider", label: "Provider", value: result.provider },
								{ key: "model", label: "Model", value: result.model },
								{ key: "latency", label: "Latency", value: `${result.latencyMs}ms` },
								{ key: "cost", label: "Cost", value: "0 MHT (Token-Free)" },
							],
						},
					},
				],
			},
		}),
	);
	jsonl.push(
		JSON.stringify({
			version: "1.0",
			beginRendering: { surfaceId, root: "pythia-root" },
		}),
	);

	return {
		response: result.text,
		provider: result.provider,
		model: result.model,
		latencyMs: result.latencyMs,
		cost: "0 MHT (Token-Free)",
		surface: { surfaceId, jsonl },
		compressed,
	};
}
