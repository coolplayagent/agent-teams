# -*- coding: utf-8 -*-
from __future__ import annotations

import platform
from pathlib import Path
from typing import Protocol

from relay_teams.computer.linux_runtime import LinuxDesktopRuntime
from relay_teams.computer.models import ComputerActionResult
from relay_teams.computer.windows_runtime import WindowsDesktopRuntime


class ComputerRuntime(Protocol):
    async def capture_screen(self) -> ComputerActionResult: ...

    async def list_windows(self) -> ComputerActionResult: ...

    async def focus_window(self, *, window_title: str) -> ComputerActionResult: ...

    async def click_at(self, *, x: int, y: int) -> ComputerActionResult: ...

    async def double_click_at(self, *, x: int, y: int) -> ComputerActionResult: ...

    async def drag_between(
        self,
        *,
        start_x: int,
        start_y: int,
        end_x: int,
        end_y: int,
    ) -> ComputerActionResult: ...

    async def type_text(self, *, text: str) -> ComputerActionResult: ...

    async def scroll_view(self, *, amount: int) -> ComputerActionResult: ...

    async def hotkey(self, *, shortcut: str) -> ComputerActionResult: ...

    async def launch_app(self, *, app_name: str) -> ComputerActionResult: ...

    async def wait_for_window(self, *, window_title: str) -> ComputerActionResult: ...


class DisabledComputerRuntime:
    def __init__(self, *, reason: str | None = None) -> None:
        base_message = "Computer runtime is not available on this host."
        if reason:
            self._message = f"{base_message} {reason}"
        else:
            self._message = base_message

    async def capture_screen(self) -> ComputerActionResult:
        raise RuntimeError(self._message)

    async def list_windows(self) -> ComputerActionResult:
        raise RuntimeError(self._message)

    async def focus_window(self, *, window_title: str) -> ComputerActionResult:
        _ = window_title
        raise RuntimeError(self._message)

    async def click_at(self, *, x: int, y: int) -> ComputerActionResult:
        _ = (x, y)
        raise RuntimeError(self._message)

    async def double_click_at(self, *, x: int, y: int) -> ComputerActionResult:
        _ = (x, y)
        raise RuntimeError(self._message)

    async def drag_between(
        self,
        *,
        start_x: int,
        start_y: int,
        end_x: int,
        end_y: int,
    ) -> ComputerActionResult:
        _ = (start_x, start_y, end_x, end_y)
        raise RuntimeError(self._message)

    async def type_text(self, *, text: str) -> ComputerActionResult:
        _ = text
        raise RuntimeError(self._message)

    async def scroll_view(self, *, amount: int) -> ComputerActionResult:
        _ = amount
        raise RuntimeError(self._message)

    async def hotkey(self, *, shortcut: str) -> ComputerActionResult:
        _ = shortcut
        raise RuntimeError(self._message)

    async def launch_app(self, *, app_name: str) -> ComputerActionResult:
        _ = app_name
        raise RuntimeError(self._message)

    async def wait_for_window(self, *, window_title: str) -> ComputerActionResult:
        _ = window_title
        raise RuntimeError(self._message)


def build_default_computer_runtime(*, project_root: Path) -> ComputerRuntime:
    system_name = _platform_system()
    if system_name == "linux":
        return LinuxDesktopRuntime(project_root=project_root)
    if system_name == "windows":
        return WindowsDesktopRuntime(project_root=project_root)
    if system_name == "darwin":
        return DisabledComputerRuntime(
            reason="macOS desktop control has not been implemented yet."
        )
    if system_name:
        return DisabledComputerRuntime(
            reason=f"Unsupported host platform: {platform.system()}."
        )
    return DisabledComputerRuntime(reason="Unable to detect the host platform.")


def _platform_system() -> str:
    return platform.system().strip().casefold()
