/**
 * Ambient declarations of the @elizaos/core surface this adapter consumes.
 *
 * Declared ambient so the package compiles cleanly without elizaOS at
 * build time; consumed elizaOS projects get the real types via
 * peer-dependency resolution. The vitest alias in `vitest.config.ts`
 * redirects runtime resolution to `eliza-types.ts` so tests work in
 * isolation.
 */
declare module "@elizaos/core" {
	export type Content = { text: string; [k: string]: unknown };

	export type Memory = {
		id?: string;
		entityId: string;
		roomId: string;
		content: Content;
		createdAt?: number;
	};

	export type State = Record<string, unknown>;

	export type HandlerCallback = (
		response: Content,
		messages?: Memory[],
	) => Promise<Memory[] | undefined>;

	export interface IAgentRuntime {
		agentId: string;
		character: { name: string; [k: string]: unknown };
		getSetting(key: string): unknown;
		getService<T = unknown>(name: string): T | undefined;
		useCallback?(cb: HandlerCallback): void;
	}

	export interface ActionExample {
		user: string;
		content: Content;
	}

	export interface Action {
		name: string;
		description: string;
		examples: ActionExample[][];
		validate(runtime: IAgentRuntime, message: Memory, state?: State): Promise<boolean>;
		handler(
			runtime: IAgentRuntime,
			message: Memory,
			state?: State,
			options?: Record<string, unknown>,
			callback?: HandlerCallback,
		): Promise<boolean>;
	}

	export interface ProviderResult {
		text: string;
		values?: Record<string, unknown>;
		data?: Record<string, unknown>;
	}

	export interface Provider {
		name: string;
		description?: string;
		get(runtime: IAgentRuntime, message: Memory, state?: State): Promise<ProviderResult>;
	}

	export abstract class Service {
		static serviceType: string;
		abstract initialize(runtime: IAgentRuntime, config?: Record<string, unknown>): Promise<void>;
		stop?(): Promise<void>;
	}

	export interface Plugin {
		name: string;
		description: string;
		actions?: Action[];
		providers?: Provider[];
		services?: Array<new (r: IAgentRuntime, c?: Record<string, unknown>) => Service>;
	}
}
