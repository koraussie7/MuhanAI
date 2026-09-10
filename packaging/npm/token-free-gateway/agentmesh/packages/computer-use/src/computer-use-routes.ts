/**
 * Computer Use HTTP Routes for MuhanAI
 * 
 * Fastify routes for /api/computer-use/run
 * Wraps the @agentmesh/compute-market router over Fastify.
 */

import {
  buildComputerUseRunHandler,
  COMPUTER_USE_RUN_CAPABILITY,
  E2bBrowserAdapter,
} from './index.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const RunSchema = z.object({
  goal: z.string().min(1).max(2048),
  provider: z.enum(['openai', 'google', 'groq', 'openrouter']),
  apiKey: z.string().min(1).max(512),
  planModel: z.string().max(128).optional(),
  locateModel: z.string().max(128).optional(),
  maxSteps: z.number().int().min(1).max(100).optional(),
  viewport: z
    .object({
      width: z.number().int().min(320).max(7680),
      height: z.number().int().min(240).max(4320),
    })
    .optional(),
});

let sharedAdapter: E2bBrowserAdapter | undefined;

async function getAdapter(): Promise<E2bBrowserAdapter> {
  if (!sharedAdapter) {
    sharedAdapter = new E2bBrowserAdapter({
      apiKey: process.env.E2B_API_KEY,
      template: process.env.E2B_DESKTOP_TEMPLATE ?? 'desktop',
      viewport: { width: 1280, height: 720 },
    });
  }
  return sharedAdapter;
}

export async function computerUseRoutes(app: FastifyInstance) {
  app.post('/api/computer-use/run', async (request, reply) => {
    const parse = RunSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({
        error: 'Validation failed',
        details: parse.error.issues,
        requestId: request.id,
      });
    }

    if (!process.env.E2B_API_KEY) {
      return reply.code(503).send({
        error: 'E2B_API_KEY is not configured on the server.',
        requestId: request.id,
      });
    }

    try {
      const adapter = await getAdapter();
      const handler = buildComputerUseRunHandler({ adapter });
      const res = await handler({
        capability: COMPUTER_USE_RUN_CAPABILITY,
        correlationId: request.id,
        args: parse.data,
      });
      if (!res.ok) {
        return reply.code(502).send({
          error: res.error ?? 'computer-use.run failed',
          requestId: request.id,
        });
      }
      return res.result;
    } catch (err) {
      request.log.error({ err }, 'computer-use.run handler crashed');
      const reason = err instanceof Error ? err.message : String(err);
      return reply.code(500).send({
        error: `computer-use.run crashed: ${reason}`,
        requestId: request.id,
      });
    }
  });

  // Status endpoint
  app.get('/api/computer-use/status', async (_request, reply) => {
    return {
      enabled: !!process.env.E2B_API_KEY,
      template: process.env.E2B_DESKTOP_TEMPLATE ?? 'desktop',
      viewport: { width: 1280, height: 720 },
    };
  });
}
