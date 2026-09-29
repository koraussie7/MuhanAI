# bot.muhanai.com — Agent Lists

## Scope

Phase 1 of the `bot.muhanai.com` list service: per-user mutable lists that a
human edits in the browser and an agent reads or writes through the MCP tool
surface. This is deliberately **not** a LystBot clone. The differentiator is
agent-writable lists with share codes, not a consumer shopping app.

## Data model

`prisma/schema.prisma` adds three models, with migration
`prisma/migrations/20260927000000_agent_lists/migration.sql`.

- `AgentList` — `shopping | todo | custom`, scoped to `userId`.
- `AgentListItem` — name, optional quantity/note, `done`, ordering `position`.
- `AgentListShare` — random base64url code, optional expiry, revocable.

Database-level checks mirror the route validation: `listType` enum and
non-negative `quantity`.

## Endpoints

All routes require an owner identity. Resolution order: the `sub` claim of the
HMAC-signed `Authorization: Bearer <token>` payload (validated by `auth.ts`),
then a pre-authenticated `user` object on the request. A request with neither is
rejected with 401 rather than served from an anonymous shared bucket. The legacy
`x-user-id` header is not an owner source.

| Method | Path                             | Purpose                                              |
| ------ | -------------------------------- | ---------------------------------------------------- |
| GET    | `/api/lists`                     | List the caller's lists. `?type=`, `?limit=` (1–200) |
| POST   | `/api/lists`                     | Create a list                                        |
| GET    | `/api/lists/:id`                 | Read one list with items                             |
| PATCH  | `/api/lists/:id`                 | Update name / listType / description                 |
| DELETE | `/api/lists/:id`                 | Delete a list (items cascade)                        |
| POST   | `/api/lists/:id/items`           | Add an item (max 500 per list)                       |
| PATCH  | `/api/lists/:id/items/:itemId`   | Rename, check off, change quantity/note              |
| DELETE | `/api/lists/:id/items/:itemId`   | Remove an item                                       |
| POST   | `/api/lists/:id/shares`          | Mint a share code. `expiresInHours` 1–2160           |
| GET    | `/api/lists/shared/:code`        | Read a shared list (read-only)                       |
| DELETE | `/api/lists/:id/shares/:shareId` | Revoke a share                                       |

Items come back ordered `done asc, position asc, createdAt asc`. Every list
response includes `itemCount` and `openCount`.

## Authorization model

Owner resolution is token-based, not header-based.

- The owner id is the `sub` claim of the HMAC-signed `Authorization: Bearer
<token>` payload, validated by `auth.ts` against `AUTH_SECRET` before the
  claim is trusted. A caller cannot claim another account by setting a header.
- A pre-authenticated `request.user` object is honoured so a future session
  middleware can own identity resolution instead of `resolveOwner`.
- The legacy `x-user-id` header is **not** an owner source. It was a local-dev
  seam that would have let any caller read another user's lists.
- When `DISABLE_AUTH=true` outside production, requests fall back to a fixed
  `local-dev-owner` id. That branch is unreachable in production, where the
  server refuses to start without `AUTH_SECRET`.
- Every list and item query is filtered by `userId`, so another account's id
  yields 404, not data.
- `GET /api/lists/shared/:code` is the only cross-user read path. It returns a
  read-only projection with no owner id and no share metadata.
- A share returns 404 when unknown, 400 on a malformed code, and 410 when
  revoked or expired.
- Errors go through `clientError`, so no stack traces or Prisma internals reach
  the client.

## Agent access

`packages/mcp/src/lystbot-tool.ts` already defines the tool surface
(`lystbot_list_create`, `lystbot_list_add_item`, `lystbot_list_get`,
`lystbot_reminder_create`, `lystbot_search`). Wiring those handlers to these
routes is the next step; the route shapes above were chosen to match.

## Verification

- `services/api/src/list-routes.test.ts` — 10 cases. The owner-resolution cases
  pin that a signed token resolves the owner, a forged token does not, and the
  `x-user-id` header is ignored even when auth is disabled. The rest cover
  request validation that runs before any Prisma query.
- `pnpm exec vitest run services/api/src/list-routes.test.ts` → 10 passed.
- `pnpm exec prisma generate --schema prisma/schema.prisma` succeeds.
- `tsc -p services/api/tsconfig.json --noEmit` reports no errors in
  `list-routes.ts` or `server.ts`.

## Before production

1. Run the migration: `pnpm exec prisma migrate deploy`.
2. Set `AUTH_SECRET` in production. Without it the server refuses to start, and
   list routes can never resolve an owner.
3. Issue tokens with `createToken({ id })` from an existing auth flow (for
   example `auth-routes.ts`) and send them as `Authorization: Bearer <token>`.
   There is no login UI for `bot.muhanai.com` yet.
4. The web UI for `bot.muhanai.com` is not built yet — this phase is API only.
5. Reminder support in the MCP tool set has no route yet.
