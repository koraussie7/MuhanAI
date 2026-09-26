# Repository Guidelines

This is the **Token-Free Gateway** — a multi-provider OpenAI-compatible AI gateway powered by real browser web sessions. The project is a Bun + TypeScript CLI/server with Biome for formatting and linting, and strict-ish TypeScript settings.

If `AGENTS.md` and `CLAUDE.md` disagree, `CLAUDE.md` wins for tooling defaults and Bun API guidance.

## Project structure

Top-level layout:

- `index.ts` — CLI entrypoint. Parses `command` from argv and routes to
  `webauth`, `chrome start|stop`, `start|stop|restart|status`, or the
  default serve mode.
- `src/server.ts` — Fastify gateway server. Registers tool conversion/calling,
  serves `/v1/*` OpenAI-compatible endpoints, exposes SSE, and runs the local
  swarm on `tcp:4010`.
- `src/browser/` — Chrome CDP glue: CDP connection, session/tab management,
  and DOM input automation. This is what powers the "log in by actually
  opening Chrome" auth flow.
- `src/providers/` — one folder per provider with `auth.ts`, `client.ts`,
  and `stream.ts`. A shared `auth-store.ts` holds session cookies/tokens.
  Provider discovery lives in `src/providers/registry.ts`; shared types in
  `src/providers/types.ts` and `src/providers/shared/`.
- `src/openai/` — OpenAI-compat shaping for chat completions and SSE,
  used when the gateway itself is talked to as an OpenAI-style API.
- `src/tool-calling/` — tool/function calling conversion and parsing between
  the gateway and MCP-style tool schemas.
- `src/auth.ts`, `src/config.ts` — shared config, auth helpers, and
  provider-agnostic types.
- `src/cli/` — CLI subcommands: `chrome.ts`, `daemon.ts`, `webauth.ts`.
- `src/openai/sse.ts` — SSE handling for streaming completions.
- `test/` — Bun tests for auth-store, chat completions, Claude web client,
  and tool parsing/conversion.
- `start-chrome-debug.sh` — helper to launch Chrome in remote-debug mode
  for webauth flows.
- `scripts/` — `bump-version.ts` and `postinstall.ts`.
- `packaging/npm/token-free-gateway/agentmesh/` — a separate pnpm monorepo
  for the Muhanai agent mesh/dashboard/site/deploy layer. Do not edit the
  gateway core as if it were that monorepo.
- `docs/` — project docs (`VISION.md`, `TECHNICAL_UPDATE.md`, `SYNERGY-ANALYSIS.md`).

## Build, test, and development commands

From the repo root:

- `bun run dev` — run with hot reload (`bun --hot index.ts`).
- `bun run start` — run in foreground (`bun index.ts`).
- `bun run test` — run all tests (`bun test`).
- `bun test test/foo.test.ts` — run one test file.
- `bun run typecheck` — type-check (`bunx tsc --noEmit`).
- `bun run check` — biome check + auto-fix
  (`bunx @biomejs/biome check --write .`).
- `bun run lint` / `bun run lint:fix` — biome lint; `lint:fix` includes
  `--unsafe`.
- `bun run format` — biome format (`bunx @biomejs/biome format --write .`).
- `bun run build` — compile to a single binary
  (`bun build index.ts --compile --external chromium-bidi --external electron
  --outfile token-free-gateway`).
- `bun run webauth` — open the interactive provider authorization wizard
  (starts Chrome automatically).
- `bun run chrome start|stop` — start/stop Chrome in remote-debug mode.

## Coding style & naming conventions

- Use Bun everywhere. Do not reach for Node, npm, pnpm, vite, jest,
  vitest, express, ws, better-sqlite3, ioredis, pg, etc. The CLAUDE.md
  lists the preferred Bun APIs (`Bun.serve`, `bun:sqlite`, `Bun.redis`,
  `Bun.sql`, built-in `WebSocket`, `Bun.file`, `Bun.$`).
- TypeScript is strict-ish: `strict`, `noUncheckedIndexedAccess`,
  `noImplicitOverride`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`,
  `allowImportingTsExtensions`, and `moduleResolution: "bundler"`.
- Some strict flags are intentionally off in this repo:
  `noUnusedLocals`, `noUnusedParameters`,
  `noPropertyAccessFromIndexSignature`.
- Biome is the formatter and linter: tabs for indentation, 2-space indent
  width, line width 100, import organizing on.
- Biome style exceptions in this repo (per `biome.json`):
  `noExcessiveCognitiveComplexity`, `noNonNullAssertion`, and
  `noExplicitAny` are turned off.
- Prefer the existing provider folder shape: provider dirs contain
  `auth.ts`, `client.ts`, `stream.ts` and register themselves through the
  shared registry/types layer.
- Keep tool-calling conversion in `src/tool-calling/` and OpenAI shaping in
  `src/openai/`; do not mix them.
- For browser/CDP work, follow the shape in `src/browser/`: CDP helpers,
  DOM input helpers, and a session manager.

## Testing guidelines

- Run tests with `bun test`.
- Use Bun test's `test`/`expect` API.
- Tests live in `test/`.
- If you touch auth flows, browser CDP, provider streaming, or tool
  parsing/conversion, add or update tests in `test/` rather than leaving
  coverage in `src/` as inline-only checks.

## Commit and pull request guidelines

- There is no enforced commit message convention or PR template currently
  visible in the repo.
- Before committing, run `bun run check` (or at least `bun run typecheck`)
  so formatting/lint and types are clean.
- Keep the gateway core and the separate `agentmesh` monorepo clearly
  separated. If a change touches both, state it explicitly in the commit/PR
  description.
