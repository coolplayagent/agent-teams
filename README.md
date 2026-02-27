# agent-teams

Role-driven multi-agent orchestration framework built with strong typing and tool-only collaboration flow.

## Quick start

```bash
uv sync
cp .agent_teams/.env.example .agent_teams/.env
# edit .agent_teams/.env with OPENAI-compatible endpoint values
uv run agent-teams roles-validate
uv run agent-teams run-intent --intent "Draft a release note"
```
