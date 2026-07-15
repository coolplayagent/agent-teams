# -*- coding: utf-8 -*-
from __future__ import annotations

import struct
import zlib
from pathlib import Path

from pydantic import JsonValue

from relay_teams.computer.models import (
    ComputerActionDescriptor,
    ComputerActionResult,
    ComputerActionRisk,
    ComputerActionTarget,
    ComputerActionType,
    ComputerObservation,
    ComputerPermissionScope,
    ComputerRuntimeKind,
    ComputerWindow,
    ExecutionSurface,
)


class ScriptedComputerRuntime:
    def __init__(self, *, screenshot_path: Path | None = None) -> None:
        self._screenshot_path = screenshot_path
        self._windows: list[ComputerWindow] = [
            ComputerWindow(
                window_id="window-agent-teams",
                app_name="Agent Teams",
                title="Agent Teams Demo",
                focused=True,
            ),
            ComputerWindow(
                window_id="window-browser",
                app_name="Browser",
                title="Chrome DevTools",
                focused=False,
            ),
        ]

    async def capture_screen(self) -> ComputerActionResult:
        return self._result(
            action=ComputerActionType.CAPTURE_SCREEN,
            scope=ComputerPermissionScope.OBSERVE,
            risk=ComputerActionRisk.SAFE,
            message="Captured the current desktop screenshot.",
            include_data=True,
        )

    async def list_windows(self) -> ComputerActionResult:
        return self._result(
            action=ComputerActionType.LIST_WINDOWS,
            scope=ComputerPermissionScope.OBSERVE,
            risk=ComputerActionRisk.SAFE,
            message="Listed visible windows in the scripted desktop runtime.",
            include_data=True,
        )

    async def focus_window(self, *, window_title: str) -> ComputerActionResult:
        target_title = self._focus_window(window_title)
        return self._result(
            action=ComputerActionType.FOCUS_WINDOW,
            scope=ComputerPermissionScope.WINDOW_MANAGEMENT,
            risk=ComputerActionRisk.GUARDED,
            target=ComputerActionTarget(window_title=target_title),
            message=f"Focused window: {target_title}.",
            include_data=True,
        )

    async def click_at(self, *, x: int, y: int) -> ComputerActionResult:
        return self._result(
            action=ComputerActionType.CLICK,
            scope=ComputerPermissionScope.POINTER,
            risk=ComputerActionRisk.GUARDED,
            target=ComputerActionTarget(x=x, y=y),
            message=f"Clicked at ({x}, {y}) in the scripted runtime.",
        )

    async def double_click_at(self, *, x: int, y: int) -> ComputerActionResult:
        return self._result(
            action=ComputerActionType.DOUBLE_CLICK,
            scope=ComputerPermissionScope.POINTER,
            risk=ComputerActionRisk.GUARDED,
            target=ComputerActionTarget(x=x, y=y),
            message=f"Double-clicked at ({x}, {y}) in the scripted runtime.",
        )

    async def drag_between(
        self,
        *,
        start_x: int,
        start_y: int,
        end_x: int,
        end_y: int,
    ) -> ComputerActionResult:
        return self._result(
            action=ComputerActionType.DRAG,
            scope=ComputerPermissionScope.DESTRUCTIVE,
            risk=ComputerActionRisk.DESTRUCTIVE,
            target=ComputerActionTarget(
                x=start_x,
                y=start_y,
                end_x=end_x,
                end_y=end_y,
            ),
            message=(
                "Dragged between scripted desktop coordinates "
                f"({start_x}, {start_y}) -> ({end_x}, {end_y})."
            ),
        )

    async def type_text(self, *, text: str) -> ComputerActionResult:
        return self._result(
            action=ComputerActionType.TYPE_TEXT,
            scope=ComputerPermissionScope.INPUT_TEXT,
            risk=ComputerActionRisk.GUARDED,
            target=ComputerActionTarget(text=text),
            message=f"Typed text in the scripted runtime: {text}",
        )

    async def scroll_view(self, *, amount: int) -> ComputerActionResult:
        return self._result(
            action=ComputerActionType.SCROLL,
            scope=ComputerPermissionScope.POINTER,
            risk=ComputerActionRisk.GUARDED,
            target=ComputerActionTarget(amount=amount),
            message=f"Scrolled by {amount} in the scripted runtime.",
        )

    async def hotkey(self, *, shortcut: str) -> ComputerActionResult:
        return self._result(
            action=ComputerActionType.HOTKEY,
            scope=ComputerPermissionScope.KEYBOARD_SHORTCUT,
            risk=ComputerActionRisk.GUARDED,
            target=ComputerActionTarget(shortcut=shortcut),
            message=f"Sent shortcut in the scripted runtime: {shortcut}",
        )

    async def launch_app(self, *, app_name: str) -> ComputerActionResult:
        self._windows = [
            window.model_copy(update={"focused": False}) for window in self._windows
        ]
        self._windows.append(
            ComputerWindow(
                window_id=f"window-{app_name.casefold().replace(' ', '-')}",
                app_name=app_name,
                title=f"{app_name} Window",
                focused=True,
            )
        )
        return self._result(
            action=ComputerActionType.LAUNCH_APP,
            scope=ComputerPermissionScope.APP_LAUNCH,
            risk=ComputerActionRisk.DESTRUCTIVE,
            target=ComputerActionTarget(app_name=app_name),
            message=f"Launched scripted app: {app_name}.",
            include_data=True,
        )

    async def wait_for_window(self, *, window_title: str) -> ComputerActionResult:
        return self._result(
            action=ComputerActionType.WAIT_FOR_WINDOW,
            scope=ComputerPermissionScope.OBSERVE,
            risk=ComputerActionRisk.SAFE,
            target=ComputerActionTarget(window_title=window_title),
            message=f"Observed window in scripted runtime: {window_title}.",
            include_data=True,
        )

    def _result(
        self,
        *,
        action: ComputerActionType,
        scope: ComputerPermissionScope,
        risk: ComputerActionRisk,
        message: str,
        target: ComputerActionTarget | None = None,
        include_data: bool = False,
    ) -> ComputerActionResult:
        descriptor = ComputerActionDescriptor(
            action=action,
            runtime_kind=ComputerRuntimeKind.BUILTIN_TOOL,
            execution_surface=ExecutionSurface.DESKTOP,
            permission_scope=scope,
            risk_level=risk,
            source="tool",
            target=target or ComputerActionTarget(),
        )
        data: dict[str, JsonValue] = {}
        if include_data:
            data["window_count"] = len(self._windows)
        return ComputerActionResult(
            action=descriptor,
            message=message,
            observation=self._observation(),
            data=data,
        )

    def _observation(self) -> ComputerObservation:
        screenshot_bytes = _SCRIPTED_SCREENSHOT_BYTES
        if self._screenshot_path is not None and self._screenshot_path.exists():
            screenshot_bytes = self._screenshot_path.read_bytes()
        focused_window = next(
            (window.title for window in self._windows if window.focused),
            "",
        )
        return ComputerObservation(
            text="Scripted computer runtime snapshot.",
            windows=tuple(self._windows),
            focused_window=focused_window,
            screenshot_bytes=screenshot_bytes,
            screenshot_mime_type="image/png",
            screenshot_name="scripted-desktop.png",
        )

    def _focus_window(self, window_title: str) -> str:
        normalized = window_title.strip()
        if not normalized:
            raise ValueError("window_title is required")
        matched_title = ""
        updated: list[ComputerWindow] = []
        for window in self._windows:
            is_match = normalized.casefold() in window.title.casefold()
            if is_match:
                matched_title = window.title
            updated.append(window.model_copy(update={"focused": is_match}))
        if not matched_title:
            raise ValueError(f"Window not found: {window_title}")
        self._windows = updated
        return matched_title


def _png_chunk(kind: bytes, data: bytes) -> bytes:
    checksum = zlib.crc32(kind + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", checksum)


def _build_scripted_screenshot_bytes() -> bytes:
    width = 320
    height = 180
    row = b"\x00" + bytes((230, 235, 238, 255)) * width
    raw = row * height
    return (
        b"\x89PNG\r\n\x1a\n"
        + _png_chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + _png_chunk(b"IDAT", zlib.compress(raw, level=9))
        + _png_chunk(b"IEND", b"")
    )


_SCRIPTED_SCREENSHOT_BYTES = _build_scripted_screenshot_bytes()
