import type { A2UIComponent, A2UIMessage } from "./a2ui-surface.js";

export interface A2UISurfaceState {
	surfaceId?: string;
	catalogId?: string;
	data: unknown;
	components: Record<string, A2UIComponent>;
	root?: string;
	status: "loading" | "ready" | "error";
}

export interface A2UIValidationResult {
	valid: boolean;
	errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateMessage(message: unknown, index: number): string[] {
	const errors: string[] = [];
	if (!isRecord(message)) return [`op ${index}: must be an object`];
	if (typeof message.version !== "string") errors.push(`op ${index}: version is required`);
	const keys = ["createSurface", "updateDataModel", "updateComponents", "beginRendering"];
	const operationKeys = keys.filter((key) => key in message);
	if (operationKeys.length !== 1) {
		errors.push(`op ${index}: exactly one operation is required`);
		return errors;
	}
	const operation = message[operationKeys[0] as string];
	if (!isRecord(operation) || typeof operation.surfaceId !== "string") {
		errors.push(`op ${index}: surfaceId is required`);
	}
	if ("createSurface" in message && (!isRecord(operation) || typeof operation.catalogId !== "string")) {
		errors.push(`op ${index}: createSurface.catalogId is required`);
	}
	if ("updateComponents" in message) {
		const components = isRecord(operation) ? operation.components : undefined;
		if (!Array.isArray(components)) errors.push(`op ${index}: components must be an array`);
		else {
			for (const [componentIndex, component] of components.entries()) {
				if (!isRecord(component) || typeof component.id !== "string") {
					errors.push(`op ${index}: component ${componentIndex} needs an id`);
				}
				if (!isRecord(component) || typeof component.component !== "string") {
					errors.push(`op ${index}: component ${componentIndex} needs a component name`);
				}
			}
		}
	}
	if ("beginRendering" in message && (!isRecord(operation) || typeof operation.root !== "string")) {
		errors.push(`op ${index}: beginRendering.root is required`);
	}
	return errors;
}

export function parseA2UIJsonl(jsonl: string): A2UIMessage[] {
	const messages: A2UIMessage[] = [];
	for (const [index, line] of jsonl.split(/\r?\n/).entries()) {
		if (!line.trim()) continue;
		let value: unknown;
		try {
			value = JSON.parse(line);
		} catch {
			throw new Error(`op ${index}: invalid JSON`);
		}
		const errors = validateMessage(value, index);
		if (errors.length) throw new Error(errors.join("; "));
		messages.push(value as A2UIMessage);
	}
	return messages;
}

export function validateA2UI(messages: readonly unknown[]): A2UIValidationResult {
	const errors = messages.flatMap((message, index) => validateMessage(message, index));
	return { valid: errors.length === 0, errors };
}

export function applyA2UI(messages: readonly A2UIMessage[]): A2UISurfaceState {
	const state: A2UISurfaceState = { data: {}, components: {}, status: "loading" };
	for (const message of messages) {
		if ("createSurface" in message) {
			state.surfaceId = message.createSurface.surfaceId;
			state.catalogId = message.createSurface.catalogId;
		} else if ("updateDataModel" in message) {
			state.data = message.updateDataModel.value;
		} else if ("updateComponents" in message) {
			for (const component of message.updateComponents.components) state.components[component.id] = component;
		} else if ("beginRendering" in message) {
			state.root = message.beginRendering.root;
			state.status = state.components[state.root] ? "ready" : "error";
		}
	}
	return state;
}

export function validateA2UITree(state: A2UISurfaceState): A2UIValidationResult {
	const errors: string[] = [];
	if (!state.surfaceId) errors.push("surfaceId is required");
	if (!state.root) errors.push("root is required");
	if (state.root && !state.components[state.root]) errors.push(`root component not found: ${state.root}`);
	const visit = (id: string, path: Set<string>) => {
		if (path.has(id)) {
			errors.push(`component cycle detected at: ${id}`);
			return;
		}
		const component = state.components[id];
		if (!component) return;
		const next = new Set(path).add(id);
		for (const child of Array.isArray(component.children) ? component.children : []) {
			if (typeof child !== "string") errors.push(`component ${id}: child id must be a string`);
			else if (!state.components[child]) errors.push(`component ${id}: missing child ${child}`);
			else visit(child, next);
		}
	};
	if (state.root) visit(state.root, new Set());
	return { valid: errors.length === 0, errors };
}
