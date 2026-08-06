# AGENTS

Compatibility entrypoint for runtimes that auto-detect `AGENTS.md`.

## Documentation Gateway

For any large task, read `docs/INDEX.md` first. It is the current repository
documentation gateway and points to the active context pack, source-aligned
architecture map, document status audit, and known doc/source drift.

<!-- KNOWNS GUIDELINES START -->

**CRITICAL: You MUST read and follow `docs/KNOWNS.md` before doing any work. It is the canonical source of truth for repo-level agent behavior in this project. For large tasks, read `docs/INDEX.md` before task-specific planning.**

## Canonical Guidance

- Knowns is the repository memory layer for humans and the AI-friendly working layer for agents.
- The source of truth for repo-level agent guidance is `docs/KNOWNS.md`.
- The source of truth for documentation routing is `docs/INDEX.md`.
- Read `docs/INDEX.md` before large tasks whenever the runtime supports reading repository files.
- Read `docs/KNOWNS.md` for repo-level agent behavior.
- If this file and `docs/KNOWNS.md` differ, follow `docs/KNOWNS.md`.

## Minimum Rules

- Use `docs/INDEX.md` as the main documentation gateway.
- Use Knowns as the canonical system for tasks, docs, templates, and workflow state when available.
- Never manually edit Knowns-managed task or doc markdown.
- Search first, then read only relevant docs and code.
- Use `knowns search` for discovery; use `knowns retrieve` when a workflow needs structured context with citations.
- For code context retrieval, prefer MCP tools over CLI: use `code_search` first, then `code_symbols`, then `code_deps`. Treat CLI `knowns code ...` as fallback for manual inspection or debugging.
- Plan before implementation unless the user explicitly overrides that workflow.
- Validate before considering work complete.
- Use memory tools: `list_memories` at session start, `add_memory` after tasks for reusable knowledge, `add_working_memory` for session cache.

## Quick Reference

```bash
knowns doc list --plain               # List docs
knowns task list --plain              # List tasks
knowns task <id> --plain              # View task
knowns doc "<path>" --plain --smart  # View doc
knowns search "query" --plain        # Search docs/tasks
knowns retrieve "query" --json      # Retrieve structured context pack
knowns guidelines --plain             # Full workflow reference
```

<!-- KNOWNS GUIDELINES END -->
