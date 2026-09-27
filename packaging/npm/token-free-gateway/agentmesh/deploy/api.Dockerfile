# Multi-stage Dockerfile for @agentmesh/api
# Builds the API service from the pnpm monorepo workspace.
FROM node:22-alpine AS base
ENV NODE_ENV=production
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
COPY packages/ ./packages/
COPY services/api/ ./services/api/
COPY prisma/ ./prisma/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @agentmesh/api...

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY --from=deps /app/services/api ./services/api
COPY --from=deps /app/prisma ./prisma
WORKDIR /app/services/api
RUN pnpm prisma generate
RUN pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0
COPY --from=builder /app/services/api/dist ./services/api/dist
COPY --from=builder /app/services/api/node_modules ./services/api/node_modules
COPY --from=deps /app/packages /app/packages
COPY prisma /app/prisma
WORKDIR /app/services/api
EXPOSE 3001
CMD ["node", "dist/server.js"]
