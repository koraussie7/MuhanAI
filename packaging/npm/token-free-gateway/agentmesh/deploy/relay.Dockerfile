# Multi-stage Dockerfile for the P2P relay/seed node
# Note: services/p2p-node is planned (see docs/INTEGRATED-CODE-PLAN.md M4).
# This Dockerfile is a placeholder that will be updated when the service ships.
FROM node:22-alpine AS base
ENV NODE_ENV=production
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
COPY packages/ ./packages/
COPY services/p2p-node/ ./services/p2p-node/ 2>/dev/null || true
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @agentmesh/api...

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
WORKDIR /app/services/p2p-node
RUN pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4001
ENV HOST=0.0.0.0
COPY --from=builder /app/services/p2p-node/dist ./services/p2p-node/dist
COPY --from=deps /app/packages /app/packages
EXPOSE 4001 4001/udp
CMD ["node", "services/p2p-node/dist/index.js", "--seed"]
