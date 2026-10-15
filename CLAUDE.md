# CLAUDE.md: U-Estate

All agent instructions live in `AGENTS.md`, imported below, so Claude Code and other agents follow the same rules.
If the import isn't expanded in your context, open `AGENTS.md` before doing anything else.

@AGENTS.md

Claude-specific notes:
- Before writing any Claude API code, load the `claude-api` skill. Use the TypeScript SDK patterns it documents: `messages.parse` + `zodOutputFormat`, and `client.beta.messages.toolRunner` + `betaZodTool`.
- For UI work, check the `modern-web-guidance` skill (forms, dialogs, accessibility). For E2E smoke tests, use the `webapp-testing` skill.
- Project subagents in `.claude/agents/` (db-engineer, supabase-porter, ui-engineer, security-reviewer, qa-tester): delegate to them for their areas.
- Project skills in `.claude/skills/`:
  - `frontend-design`: visual direction; the Figma tokens in UI_SPEC still win
  - `webapp-testing`: Playwright smoke tests
  - Each has a `SOURCE.txt`.
