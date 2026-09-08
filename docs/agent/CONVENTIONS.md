# Agent Coding Conventions — MuhanAI

> Read before writing code on MuhanAI. Not all decisions, just the ones that recur.

---

## 1. Branch / commit / PR

| rule | why |
|---|---|
| Conventional Commits: `feat|fix|chore|docs|refactor|perf|test|ci|security(scope): subject` | enables semantic-release and changelog generation |
| subject: imperative, ≤ 72 chars | git log readability |
| body: wrap 72 col | plaintext + terminal |
| one concern per commit | bisect-friendly |
| `Co-Authored-By:` trailer for any AI assistance | honest attribution |
| no `--no-verify` | bypasses husky + biome; allowed only for explicit `git commit --no-verify -m "<reason>"` |

## 2. Imports & formatting

Handled by biome (`biome check --write .`). Don't fight it; commit the rewrites.

```ts
// ✅ good — keyword import + named exports
import { readFile } from "node:fs/promises";

// ❌ bad — relative path jumping out of package
import { thing } from "../../../shared/thing";

// ✅ good — internal package via tsconfig path
import { thing } from "@muhanai/shared/thing";
```

## 3. TypeScript strictness

- `strict: true` is on in every package.
- Avoid `any`. If you write `any`, the next reviewer will ask why.
- Prefer `unknown` + a type guard.
- `as` casts: only when you've narrowed the type already; pair with a comment.
- Prefer discriminated unions over enum flags.
- Prefer `Promise<Result<T, E>>` for fallible ops where the failure has structure.

## 4. Test discipline (TDD where it earns its keep)

| layer | required | optional |
|---|---|---|
| business logic in `packages/*/src/*.ts` | yes (≥ 80% line coverage target) | — |
| UI in `apps/web/src/components/**` | smoke + 1 happy path | exhaustive edge cases |
| integration in `services/api/**` | per-route happy + error | — |
| infra / one-off scripts | smoke | — |

Test file colocated: `foo.ts` ↔ `foo.test.ts` (Vitest).  
`vitest.config.ts` for shared config (per-package).  
`describe`/`it` headers name the contract, not the impl.

## 5. Biome rules we care about

| rule | why | how to fix |
|---|---|---|
| `lint/a11y/useButtonType` | screen-reader correctness | add `type="button"` |
| `lint/style/noNonNullAssertion` | bypasses null checks | `if (!x) return;` |
| `lint/suspicious/noExplicitAny` | uncertainty leaks | `unknown` or domain type |
| `lint/suspicious/noArrayIndexKey` | React key stability | use stable id from data |
| `assist/source/organizeImports` | ordering | autofix only |
| `assist/source/useSortedKeys` (if added) | consistency | autofix only |

When `biome.json` adds a rule, all 344 files are re-checked. Expect ~50 warnings to drop on day one.

## 6. Error handling (graceful degradation)

- Network calls: `try { ... } catch (err) { logger.warn(...); return fallback; }` — never `throw` to caller without a path back to health.
- LLM calls: respect a "keyless fallback" layer when a real API key is missing. See `packages/llm-router/src/keyless-providers.ts` for the canonical pattern.
- DB calls: distinguish "row not found" from "connection lost". Don't wrap all errors in `Error("db failed")`.
- UI errors: render an inline error UI, do not crash the page.

## 7. Logging & observability

- No `console.log` left behind. Use `pino` if you'd otherwise log.
- Log records must include: `traceId`, `agentRole`, `route`.
- In tests: capture logs into a buffer; assert on patterns, not exact strings.

## 8. Workspace hygiene

- Don't edit `tsconfig.base.json` without coordination.
- Don't add a `devDependency` to root that isn't used in 2+ packages.
- Don't push a feature branch larger than 600 lines without a draft PR first.
- Don't leave unstaged debug files (`*.log`, `dist/`, `tmp/`) — `.gitignore` should catch them; if it doesn't, update it.

## 9. Documentation reflexes (Doc-Reflexes)

- Every new env var: a row in `docs/agent/CONVENTIONS.md` or package README.
- Every new public function exported: JSDoc, one line that says *what it returns under what conditions*.
- Every new ADR-worthy decision: open `docs/adr/00xx-<slug>.md` (use MADR template).
- Every new bug class: append to `docs/agent/CI-FAIL-PATTERNS.md`.

## 10. Review etiquette

- Review PRs within 24h of assignment.
- If you can't, say so and reassign.
- Comments prefer "I'd suggest X because Y" over "this is wrong".
- Approve PRs that resolve their stated goal, even if you'd have done it differently.

---

_Last updated: 2026-09-08_
