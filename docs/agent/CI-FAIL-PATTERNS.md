# CI Failure Patterns — known list & fixes

> Append when you hit a new failure. The team's immune system.
> Format: `## <symptom>` → `<command>` → `<cause>` → `<fix>`.

_Last updated: 2026-09-08_

---

## 1. pnpm peer dependency mismatch

- **symptom**: `ERR_PNPM_PEER_DEP_ISSUES  Unmet peer dependency @types/node@^20`
- **observed in**: PR adding `vitest` to a new package
- **cause**: new package's `devDependencies` pulled in a different `@types/node` version than root.
- **fix**:
  1. Pin to the version root uses: `"@types/node": "^20.11.0"`
  2. Or `pnpm.overrides` in root `package.json` if necessary.
- **prevention**: copy `devDependencies` block from `packages/hivebear/package.json`.

## 2. Prisma migration drift

- **symptom**: `PrismaClientInitializationError: Table 'X' doesn't exist` in `services/api` tests.
- **cause**: schema.prisma updated but `prisma migrate deploy` not run in CI step.
- **fix**: ensure `.github/workflows/ci.yml` `test` job runs `pnpm --filter @muhanai/db prisma migrate deploy` before `pnpm test`.
- **prevention**: when modifying `schema.prisma`, attach `prisma/migrations/<timestamp>_<name>/migration.sql` to the same PR.

## 3. Biome `assist/source/organizeImports` failure

- **symptom**: biome step in CI fails with "Expected import statements to be in alphabetical order"
- **cause**: agent added a new import without running `pnpm biome check --write <file>` before commit.
- **fix**: run `pnpm biome check --write .` locally, re-commit.
- **prevention**: husky pre-commit hook (target Phase 2) will run biome --write on staged files automatically.

## 4. tsconfig path resolution

- **symptom**: `error TS2307: Cannot find module '@muhanai/...'`
- **cause**: new package's `tsconfig.json` adds paths but root `tsconfig.base.json` does not include them.
- **fix**: update both. Add `"@muhanai/<new-pkg>": ["./packages/<new-pkg>/src"]` in `tsconfig.base.json` paths block.
- **prevention**: when creating a new package, copy a sibling's `tsconfig.json` AND verify `tsconfig.base.json` has its path mapping.

## 5. Worktree pnpm store mismatch

- **symptom**: in a fresh worktree, `pnpm install` runs ~5 min, each subsequent `pnpm -r test` downloads again.
- **cause**: worktree gets its own `node_modules`; pnpm doesn't reuse global cache.
- **fix**: set shared store: `pnpm config set store-dir ~/.local/share/pnpm/store` (run once per machine).
- **prevention**: onboarding step #3 in `AGENT-ONBOARDING.md` mentions this.

## 6. ESLint — wait, Biome. False positive: `lint/style/noNonNullAssertion`

- **symptom**: warning count goes from 200 to 263, blocking strict-CI agents.
- **cause**: agent writes `app!.inject(...)` to bypass null checks.
- **fix**: replace with `if (!app) return;` or `app?.inject(...)`.
- **policy**: warnings don't block merge, but won't-fix exceptions should be commented `// biome-ignore lint/style/noNonNullAssertion: <reason>`.

## 7. Whitespace + LF / CRLF drift

- **symptom**: `git apply` fails after `git format-patch`.
- **cause**: cross-platform agents (macOS vs Windows CI runner) commit different EOL.
- **fix**:
  - Add `.gitattributes` enforcing LF: `* text=auto eol=lf`
  - Run `git config core.autocrlf false` (already on CI).
- **prevention**: husky pre-commit will run `git config core.eol lf` enforcement.

## 8. Typecheck on `apps/web` — `Cannot find name 'i18nKeys'`

- **symptom**: `pnpm --filter @muhanai/web typecheck` fails.
- **cause**: new i18n key added to `apps/web/src/i18n.ts` but missing in one of 9 locale dictionaries.
- **fix**: search `apps/web/src/i18n.ts` for the English key (first entry) and replicate to all 9 locales.
- **prevention**: code-review checklist (add to OWNED-PATHS) or generate via `pnpm i18n:add-key -- <key>` (Phase 2).

---

## how to add an entry

When you hit a new failure:
1. Reproduce on `main` (or a fresh branch).
2. Capture the failing command + first 5 lines of error.
3. Append a section above using the same `## N. <short title>` template.
4. Open a PR titled `docs(ci-patterns): add entry #N for <short title>` — auto-merge candidate.

---

## see also

- `IN-PROGRESS.md` — who's fighting what
- `OWNED-PATHS.md` — file ownership matrix
- `/AGENT-ONBOARDING.md` — onboarding
