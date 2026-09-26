import { describe, expect, it } from "vitest";
import {
	GossipsubModelBeaconTransport,
	InMemoryModelBeaconTransport,
	fromGossipsubTopic,
	toGossipsubTopic,
} from "./gossipsub-transport.js";

describe("gossipsub topic encoding", () => {
	it("round-trips an ASCII manifest id", () => {
		const topic = toGossipsubTopic("qwen2.5-7b-instruct-q4_k_m");
		expect(topic).toMatch(/^\/agentmesh\/models\/1\.0\.0\//);
		expect(fromGossipsubTopic(topic)).toBe("qwen2.5-7b-instruct-q4_k_m");
	});

	it("encodes characters that would otherwise break the topic string", () => {
		const topic = toGossipsubTopic("model/with/slashes:and:colons");
		expect(fromGossipsubTopic(topic)).toBe("model/with/slashes:and:colons");
	});

	it("returns null for topics outside the agentmesh prefix", () => {
		expect(fromGossipsubTopic("/other/topic")).toBeNull();
	});
});

type Msg = { topic: string; data: Uint8Array };
type Handler = (evt: CustomEvent<Msg>) => void;

class FakePubsub {
	readonly subscribers = new Map<string, Set<Handler>>();
	readonly published: Array<{ topic: string; data: Uint8Array }> = [];
	errors: Error[] = [];

	async publish(topic: string, data: Uint8Array): Promise<void> {
		if (this.errors.length > 0) throw this.errors.pop();
		this.published.push({ topic, data });
		this.fire(topic, data);
	}

	subscribe(topic: string): void {
		if (!this.subscribers.has(topic)) this.subscribers.set(topic, new Set());
	}

	unsubscribe(topic: string): void {
		this.subscribers.delete(topic);
	}

	addEventListener(topic: string, handler: Handler): void {
		if (!this.subscribers.has(topic)) this.subscribers.set(topic, new Set());
		this.subscribers.get(topic)?.add(handler);
	}

	removeEventListener(topic: string, handler: Handler): void {
		this.subscribers.get(topic)?.delete(handler);
	}

	fire(topic: string, data: Uint8Array): void {
		const evt = new CustomEvent<Msg>("gossipsub", { detail: { topic, data } });
		for (const handler of this.subscribers.get(topic) ?? []) handler(evt);
	}
}

describe("InMemoryModelBeaconTransport", () => {
	it("delivers publishes to subscribers of the same topic", async () => {
		const transport = new InMemoryModelBeaconTransport();
		const received: string[] = [];
		await transport.subscribe("model/qwen", (payload) => {
			received.push(payload);
		});
		await transport.publish("model/qwen", "hello");
		expect(received).toEqual(["hello"]);
		expect(transport.published).toHaveLength(1);
	});
});

describe("GossipsubModelBeaconTransport", () => {
	it("encodes the topic and forwards publishes to libp2p", async () => {
		const pubsub = new FakePubsub();
		const transport = new GossipsubModelBeaconTransport(pubsub);
		await transport.publish("model/qwen", "payload");
		expect(pubsub.published).toHaveLength(1);
		expect(pubsub.published[0]?.topic).toMatch(/^\/agentmesh\/models\/1\.0\.0\/model%2Fqwen$/);
	});

	it("delivers inbound messages to local subscribers", async () => {
		const pubsub = new FakePubsub();
		const transport = new GossipsubModelBeaconTransport(pubsub);
		const received: string[] = [];
		await transport.subscribe("model/qwen", (payload) => {
			received.push(payload);
		});
		// Simulate libp2p delivery on the encoded topic.
		const encoded = toGossipsubTopic("model/qwen");
		pubsub.fire(encoded, new TextEncoder().encode("hi"));
		expect(received).toEqual(["hi"]);
	});

	it("surfaces publish errors via the onError hook", async () => {
		const pubsub = new FakePubsub();
		const errors: unknown[] = [];
		const transport = new GossipsubModelBeaconTransport(pubsub, {
			onError: (err) => errors.push(err),
		});
		pubsub.errors.push(new Error("publish failed"));
		await transport.publish("model/qwen", "payload");
		expect(errors).toHaveLength(1);
	});

	it("unsubscribes once every local handler is removed", async () => {
		const pubsub = new FakePubsub();
		const transport = new GossipsubModelBeaconTransport(pubsub);
		const off1 = await transport.subscribe("model/qwen", () => { });
		const off2 = await transport.subscribe("model/qwen", () => { });
		const encoded = toGossipsubTopic("model/qwen");
		expect(pubsub.subscribers.has(encoded)).toBe(true);
		off1();
		// still one subscriber — should not unsubscribe yet
		expect(pubsub.subscribers.has(encoded)).toBe(true);
		off2();
		expect(pubsub.subscribers.has(encoded)).toBe(false);
	});
});
