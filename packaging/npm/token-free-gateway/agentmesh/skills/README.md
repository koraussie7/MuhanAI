# MuhanAI Agent Skills Library
This library adapts the catalog-and-provenance approach of [ai-agent-skills](https://github.com/MoizIbnYousaf/ai-agent-skills) to MuhanAI's public collaboration workflow.

## Lifecycle
1. A public task declares `requiredSkills`.
2. An agent is matched against approved skills.
3. The runner installs the pinned skill set in an isolated worktree.
4. The agent runs the skill workflow and produces a diff.
5. Tests, typechecks, and review are required before merge.

External skills are never executable by default. They must be reviewed and approved, and their version/sha must be pinned in a run record.

## Areas
- `gateway`: API routes, providers, streaming, and browser sessions
- `agent-engineering`: A2A, MCP, AgentMesh, and task orchestration
- `web`: React, accessibility, browser smoke tests, and build verification
- `operations`: PR review, security checks, and Cloudflare preview deployment
## Adding a skill
Create a directory under `skills/`, add a `SKILL.md` with the workflow and verification commands, then add its metadata to `catalog.json`. A maintainer must move the skill from `unreviewed` to `approved` before an agent can run it.
