import type { GossipsubLike } from "@agentmesh/bitterbot";
import type { XLangAgentManifest, XLangRegistry } from "./xlang-registry.js";
import { validateXLangManifest } from "./xlang-registry.js";

export const XLANG_CAPABILITY_TOPIC = "/agentmesh/xlang-capabilities/1.0.0";

export interface XLangBeaconTransport {
	publish(topic: string, data: Uint8Array): Promise<void>;
	subscribe(topic: string): void | Promise<void>;
	addEventListener(topic: string, handler: (event: Event) => void): void;
	removeEventListener(topic: string, handler: (event: Event) => void): void;
}

export interface XLangCapabilityEnvelope {
	version: 1;
	manifest: XLangAgentManifest;
	signature?: string;
}

export interface XLangBeaconOptions {
	sign?: (bytes: Uint8Array) => string;
	verify?: (bytes: Uint8Array, signature: string, manifest: XLangAgentManifest) => boolean;
	requireSignature?: boolean;
}

export function createXLangBeaconTransport(pubsub: GossipsubLike): XLangBeaconTransport {
	return {
		publish: (topic, data) => pubsub.publish(topic, data),
		subscribe: (topic) => pubsub.subscribe(topic),
		addEventListener: (topic, handler) => pubsub.addEventListener(topic, handler),
		removeEventListener: (topic, handler) => pubsub.removeEventListener(topic, handler),
	};
}

export class XLangBeacon {
	private readonly options: XLangBeaconOptions;
	private readonly handler = (event: Event) => {
		const message =
			(event as CustomEvent<{ topic?: string; data?: Uint8Array }>).detail ??
			(event as unknown as { topic?: string; data?: Uint8Array });
		if (message.topic !== XLANG_CAPABILITY_TOPIC || !message.data) return;
		try {
			const envelope = JSON.parse(
				new TextDecoder().decode(message.data),
			) as XLangCapabilityEnvelope;
			if (!envelope || envelope.version !== 1 || !envelope.manifest) return;
			const bytes = new TextEncoder().encode(JSON.stringify(envelope.manifest));
			if (this.options.requireSignature && !envelope.signature) return;
			if (
				envelope.signature &&
				this.options.verify &&
				!this.options.verify(bytes, envelope.signature, envelope.manifest)
			)
				return;
			this.registry.register(envelope.manifest);
		} catch {
			// Ignore malformed gossip payloads; registry validation handles valid JSON.
		}
	};
	private listening = false;

	constructor(
		private readonly transport: XLangBeaconTransport,
		private readonly registry: XLangRegistry,
		options: XLangBeaconOptions = {},
	) {
		this.options = options;
	}

	async announce(manifest: XLangAgentManifest): Promise<void> {
		const checked = validateXLangManifest(manifest);
		if (!checked.ok) throw new Error(checked.reason);
		const bytes = new TextEncoder().encode(JSON.stringify(checked.manifest));
		const envelope: XLangCapabilityEnvelope = {
			version: 1,
			manifest: checked.manifest,
			...(this.options.sign ? { signature: this.options.sign(bytes) } : {}),
		};
		if (this.options.requireSignature && !envelope.signature) {
			throw new Error("XLang capability signature is required");
		}
		await this.transport.publish(
			XLANG_CAPABILITY_TOPIC,
			new TextEncoder().encode(JSON.stringify(envelope)),
		);
	}

	async listen(): Promise<() => void> {
		if (this.listening) return () => undefined;
		this.listening = true;
		await this.transport.subscribe(XLANG_CAPABILITY_TOPIC);
		this.transport.addEventListener(XLANG_CAPABILITY_TOPIC, this.handler);
		return () => {
			if (!this.listening) return;
			this.listening = false;
			this.transport.removeEventListener(XLANG_CAPABILITY_TOPIC, this.handler);
		};
	}
}
