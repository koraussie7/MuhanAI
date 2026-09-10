/**
 * Session Runner types for Computer Use Module
 * 
 * Defines the session request/response contract used by the daemon
 * to dispatch capability requests through MCP and browser adapters.
 */

export interface SessionRequest {
  capability: string;
  args?: Record<string, unknown>;
  correlationId?: string;
  sessionId?: string;
  userId?: string;
}

export interface SessionResponse {
  ok: boolean;
  correlationId?: string;
  result?: unknown;
  error?: string;
}

export type SessionHandler = (req: SessionRequest) => Promise<SessionResponse>;

export interface SessionRunner {
  register(capability: string, handler: SessionHandler): void;
  handle(req: SessionRequest): Promise<SessionResponse>;
  teardown(sessionId: string): void;
}

/**
 * Create a simple in-process session runner.
 * Production uses the daemon's libp2p-backed runner.
 */
export function createSessionRunner(): SessionRunner {
  const handlers = new Map<string, SessionHandler>();

  return {
    register(capability: string, handler: SessionHandler) {
      handlers.set(capability, handler);
    },

    async handle(req: SessionRequest): Promise<SessionResponse> {
      const handler = handlers.get(req.capability);
      if (!handler) {
        return {
          ok: false,
          correlationId: req.correlationId,
          error: `unknown capability: ${req.capability}`,
        };
      }
      return handler(req);
    },

    teardown(_sessionId: string) {
      // No-op for in-process runner
    },
  };
}
