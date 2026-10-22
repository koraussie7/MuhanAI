
## §26 — PR #15: token-bank + tasks full Minima integration (2026-10-20)

**Status:** Open at https://github.com/koraussie7/MuhanAI/pull/15
**Branch:** `feat/token-bank-minima` → `main` on koraussie7/muhanai (note: repo moved to koraussie7/MuhanAI)
**Commit:** `ad259f7` — "feat(token-bank, tasks): ship full Minima integration to packaging tree"

### Files (6 changed, +1004 / -100)
- `packaging/.../components/TokenBankPage.tsx` (new, 501 lines)
- `packaging/.../components/TasksPage.tsx` (new, 416 lines)
- `packaging/.../store/escrowStore.ts` (new, 69 lines)
- `packaging/.../types/escrow.ts` (new, 15 lines)
- `packaging/.../components/DashPages.tsx` — inline TokenBankPage stub → re-export (line 387)
- `packaging/.../components/SpecPages.tsx` — inline TasksPage stub → re-export (line 273)

### Why PR not direct push
- Repo (`koraussie7/muhanai`) is the **live production tree**; direct push to main is too risky without CI/preview.
- No CI runs on this repo (no `.github/workflows/` files verified), so merging is a manual step.
- No `node_modules` in the packaging tree → no local build/test possible.

### Next agent's next step
```bash
gh pr view 15 --repo koraussie7/muhanai                # check CI / comments
gh pr merge 15 --repo koraussie7/muhanai --squash      # if everything looks clean
# OR push a follow-up to the same branch:
cd /Users/brianyeon/CodeGPT/integration-finalize
git push origin feat/token-bank-minima  # any new commit triggers PR update
```

### Live deploy after merge
Once merged, the operator's CI (or manual) must build the packaging tree and deploy to the live origin (185.55.240.110). Until then, `muhanai.com/token-bank` and `muhanai.com/tasks` will continue to render the old 5-line stubs.

