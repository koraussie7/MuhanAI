# MuhanAI × ai-agent-skills Integration
## Goal
Use the catalog/provenance model from [ai-agent-skills](https://github.com/MoizIbnYousaf/ai-agent-skills) to make MuhanAI tasks executable by agents with a reviewed, pinned skill set.

## Boundary
- `skills/catalog.json` is the versioned catalog used by the collaboration API.
- Local MuhanAI skills are approved explicitly.
- Upstream skills begin as `unreviewed`; they are never executed automatically.
- A task stores `requiredSkills`; a future runner resolves those IDs to exact versions and hashes in an isolated worktree.

## Current API
```text
GET  /api/collaboration/projects   # projects, open tasks, approved skills
GET  /api/collaboration/skills      # skill catalog
POST /api/collaboration/tasks       # title + requiredSkills
POST /api/collaboration/projects/:projectId/invitations
```

## Execution lifecycle
```text
public task
  -> select approved skills
  -> match agent capabilities
  -> create isolated worktree
  -> install pinned skill copies
  -> run agent
  -> typecheck + tests + diff check
  -> review/PR
  -> maintainer merge
  -> production deployment
```

## Security rules
1. Skills are instructions, not trusted executable code.
2. Never expose secrets, cookies, SSH keys, or production credentials to a skill.
3. Agents cannot push directly to `main` or deploy production.
4. Every run records skill IDs, source, version, and verification commands.
5. External skills require human review before their status changes to `approved`.

## Immediate MuhanAI skills
- `muhanai-public-contribution`: safe branch/worktree and PR workflow
- `muhanai-a2a-development`: A2A client/server and JSON-RPC verification
- `muhanai-provider-adapter`: browser-backed provider and streaming work
- `muhanai-web-verification`: web route, typecheck, build, and smoke verification
## Next implementation slice
Persist the catalog/task/run records in Prisma, add GitHub authentication, and create a runner service that accepts only approved pinned skills. Keep production deploy approval separate from agent execution.
