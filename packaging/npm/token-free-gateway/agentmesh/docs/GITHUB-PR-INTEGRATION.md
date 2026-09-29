# GitHub PR Integration
The API exposes `POST /api/collaboration/tasks/:taskId/github-pr` to create a pull request for an existing public task.

## Configuration
Set these server-side environment variables:

```bash
GITHUB_TOKEN=      # never expose this to the browser
GITHUB_REPOSITORY=koraussie7/MuhanAI
GITHUB_BASE_BRANCH=main
```

The token must be stored as a deployment secret and have the minimum repository permissions needed to create branches and pull requests. Do not put it in Vite variables or `apps/web` code.

## Current limitation
The endpoint expects the task branch (`muhanai/task_<task-id>`) to already exist. The next runner step must create that branch in an isolated worktree, push it, run checks, and only then call the PR endpoint. A maintainer still approves and merges the PR.

## Safe lifecycle
```text
task created
  -> runner creates isolated branch
  -> runner applies approved pinned skills
  -> tests/typecheck/diff check
  -> branch push
  -> POST /github-pr
  -> maintainer review and merge
```
