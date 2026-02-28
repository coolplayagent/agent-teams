from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from pydantic_ai import Agent

from agent_teams.tools.runtime import ToolDeps

ToolMount = Callable[[Agent[ToolDeps, str]], None]


@dataclass(frozen=True)
class ToolSpec:
    name: str
    mount: ToolMount


class ToolRegistry:
    def __init__(self, specs: tuple[ToolSpec, ...]) -> None:
        self._specs = {spec.name: spec for spec in specs}

    def require(self, names: tuple[str, ...]) -> tuple[ToolSpec, ...]:
        missing = [name for name in names if name not in self._specs]
        if missing:
            raise ValueError(f'Unknown tools: {missing}')
        return tuple(self._specs[name] for name in names)

    def validate_known(self, names: tuple[str, ...]) -> None:
        self.require(names)

    def list_names(self) -> tuple[str, ...]:
        return tuple(sorted(self._specs.keys()))
