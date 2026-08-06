# Active Skills And Agent Guidance

Last audited: 2026-08-05

## Active Repo Guidance

- `docs/INDEX.md`: main documentation gateway for large tasks.
- `docs/AGENTS.md`: compatibility entrypoint for runtimes that auto-detect
  `AGENTS.md`.
- `docs/KNOWNS.md`: repo-level operating guidance. It still references Knowns
  tooling and `docs/project_index.html`; verify availability before relying on
  those flows.

## Current Agent Startup For Large Tasks

1. Read `docs/INDEX.md`.
2. Read `docs/AGENTS.md`.
3. Read `docs/KNOWNS.md` sections relevant to the task.
4. Read task-specific files from `docs/context-pack/`.
5. Use CodeGraph first when `.codegraph/` exists and the task needs code
   understanding.
6. Respect dirty worktree state and avoid commits/pushes unless explicitly
   requested.

## Skill-Like Documentation Areas

| Path | Status | Notes |
| --- | --- | --- |
| `docs/SKILLS.md` | NEEDS_REVIEW | Very large; not a startup document. |
| `docs/SKILLS_GUIDE.vi.md` | NEEDS_REVIEW | Historical/localized guide. |
| `docs/AGENT_FLOW.md` | NEEDS_REVIEW | Large agent-flow doc; verify before use. |
| `.agents/skills/` | NEEDS_REVIEW | Local skills; inspect only when task asks for them. |
| `.agent/` | ARCHIVE_CANDIDATE | Large agent framework/reference forest, not product source. |

