import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type A2UIActionEvent,
	type A2UIActionRequest,
	dispatchA2UIAction,
	subscribeToA2UIEvents,
} from "./action-dispatcher.js";

describe("action-dispatcher", () => {
	const originalFetch = globalThis.fetch;
	const originalEventSource = globalThis.EventSource;

	afterEach(() => {
		globalThis.fetch = originalFetch;
		globalThis.EventSource = originalEventSource;
		vi.restoreAllMocks();
	});

	describe("dispatchA2UIAction", () => {
		it("posts action request and returns accepted event", async () => {
			const mockEvent: A2UIActionEvent = {
				type: "action.accepted",
				surfaceId: "shop1-menu",
				data: { name: "request_reservation", status: "queued" },
				timestamp: 123456789,
			};

			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				status: 202,
				json: async () => mockEvent,
			} as Response);

			const request: A2UIActionRequest = {
				surfaceId: "shop1-menu",
				name: "request_reservation",
				arguments: { party_size: 2 },
			};

			const result = await dispatchA2UIAction(request);

			expect(globalThis.fetch).toHaveBeenCalledWith("/api/a2ui/actions", {
				method: "POST",
				headers: { "content-type": "application/json", accept: "application/json" },
				body: JSON.stringify(request),
			});
			expect(result).toEqual(mockEvent);
		});

		it("throws an error when response is not ok", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 403,
				json: async () => ({ error: "action_not_allowed" }),
			} as Response);

			await expect(
				dispatchA2UIAction({ surfaceId: "shop1-menu", name: "forbidden_action" }),
			).rejects.toThrow("action_not_allowed");
		});

		it("throws generic error when response is not ok and body is empty", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
				json: async () => {
					throw new Error("fail");
				},
			} as unknown as Response);

			await expect(
				dispatchA2UIAction({ surfaceId: "shop1-menu", name: "request_reservation" }),
			).rejects.toThrow("Action failed (500)");
		});
	});

	describe("subscribeToA2UIEvents", () => {
		it("subscribes to events and registers listeners for all expected event types", () => {
			const listeners: Record<string, (event: MessageEvent<string>) => void> = {};
			const mockClose = vi.fn();

			class MockES {
				url: string;
				onmessage: ((event: MessageEvent<string>) => void) | null = null;
				constructor(url: string) {
					this.url = url;
				}
				addEventListener(type: string, handler: (event: MessageEvent<string>) => void) {
					listeners[type] = handler;
				}
				close() {
					mockClose();
				}
			}

			globalThis.EventSource = MockES as unknown as typeof EventSource;

			const receivedEvents: A2UIActionEvent[] = [];
			const unsubscribe = subscribeToA2UIEvents("shop1-menu", (event) => {
				receivedEvents.push(event);
			});

			expect(listeners["surface.ready"]).toBeDefined();
			expect(listeners["action.accepted"]).toBeDefined();
			expect(listeners["action.rejected"]).toBeDefined();

			// Simulate receiving an action.accepted event
			const acceptedEvent: A2UIActionEvent = {
				type: "action.accepted",
				surfaceId: "shop1-menu",
				data: { name: "request_reservation" },
				timestamp: 1000,
			};
			listeners["action.accepted"]?.({
				data: JSON.stringify(acceptedEvent),
			} as MessageEvent<string>);

			expect(receivedEvents).toHaveLength(1);
			expect(receivedEvents[0]).toEqual(acceptedEvent);

			// Calling unsubscribe closes the EventSource
			unsubscribe();
			expect(mockClose).toHaveBeenCalledTimes(1);
		});

		it("delivers surface.ready events to the onEvent callback", () => {
			const listeners: Record<string, (event: MessageEvent<string>) => void> = {};
			globalThis.EventSource = class {
				addEventListener(type: string, handler: (event: MessageEvent<string>) => void) {
					listeners[type] = handler;
				}
				close() {}
			} as unknown as typeof EventSource;

			const receivedEvents: A2UIActionEvent[] = [];
			const unsubscribe = subscribeToA2UIEvents("shop1-menu", (event) => {
				receivedEvents.push(event);
			});

			const readyEvent: A2UIActionEvent = {
				type: "surface.ready",
				surfaceId: "shop1-menu",
				data: { catalogId: "basic", root: "root" },
				timestamp: 999,
			};
			listeners["surface.ready"]?.({
				data: JSON.stringify(readyEvent),
			} as MessageEvent<string>);

			expect(receivedEvents).toHaveLength(1);
			expect(receivedEvents[0]).toEqual(readyEvent);

			unsubscribe();
		});
	});
});
