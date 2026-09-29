---
name: muhanai-public-contribution
description: Safely prepare a MuhanAI public contribution in an isolated branch. Use for public tasks, agent contributions, code changes, PR preparation, and any request to modify MuhanAI collaboratively.
---

# MuhanAI Public Contribution
Work only in the assigned worktree and never expose secrets. Treat the task as a proposed change, not a direct production edit.

## Workflow
1. Read the task requirements and identify the smallest owned file set.
2. Inspect repository guidance and relevant tests before editing.
3. Implement the change on the assigned branch/worktree.
4. Run `git diff --check`.
5. Run the narrowest relevant test and typecheck, then the project-wide checks when practical.
6. Report changed files, verification results, remaining failures, and a concise commit/PR summary.

## Safety boundaries
- Never read or print `.env`, API keys, cookies, SSH keys, tokens, or production secrets.
- Never push directly to `main` or deploy production from an agent task.
- Do not run destructive commands or modify unrelated files.
- A maintainer must review and merge the resulting diff before deployment.
