"""Echo tool module for writing a short echo."""

from agent_teams.tools.echo.mount import mount
from agent_teams.tools.registry import ToolSpec

TOOL_SPEC = ToolSpec(name='echo', mount=mount)

__all__ = ['mount', 'TOOL_SPEC']