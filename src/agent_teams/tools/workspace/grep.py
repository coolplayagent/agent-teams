from __future__ import annotations

from pydantic_ai import Agent

from agent_teams.tools.runtime import ToolContext, ToolDeps
from agent_teams.tools.tool_helpers import execute_tool
from agent_teams.tools.file_utils import resolve_workspace_path
from agent_teams.tools import ripgrep


def register(agent: Agent[ToolDeps, str]) -> None:
    @agent.tool
    async def grep(
        ctx: ToolContext,
        pattern: str,
        path: str = ".",
        case_sensitive: bool = False,
        include: str | None = None,
    ) -> dict[str, object]:
        async def _action() -> str:
            root = resolve_workspace_path(ctx.deps.workspace_root, path)

            result = await ripgrep.grep_search(
                cwd=root,
                pattern=pattern,
                glob=include,
                case_sensitive=case_sensitive,
            )

            return result.format()

        return await execute_tool(
            ctx,
            tool_name="grep",
            args_summary={
                "pattern": pattern,
                "path": path,
                "case_sensitive": case_sensitive,
                "include": include,
            },
            action=_action,
        )
