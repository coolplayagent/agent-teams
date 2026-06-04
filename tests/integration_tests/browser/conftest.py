from __future__ import annotations

import os
from collections.abc import Iterator
from pathlib import Path

import pytest

try:
    import pwd
except ImportError:
    pwd = None


@pytest.fixture(autouse=True)
def playwright_browser_cache(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    configured_root = os.environ.get("PLAYWRIGHT_BROWSERS_PATH")
    if configured_root and _has_playwright_chromium(Path(configured_root).expanduser()):
        yield
        return

    browser_root = _find_playwright_browser_root()
    if browser_root is not None:
        monkeypatch.setenv("PLAYWRIGHT_BROWSERS_PATH", str(browser_root))
    yield


def _find_playwright_browser_root() -> Path | None:
    candidates: list[Path] = []
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        candidates.append(Path(local_app_data).expanduser() / "ms-playwright")
    user_profile = os.environ.get("USERPROFILE")
    if user_profile:
        candidates.append(
            Path(user_profile).expanduser() / "AppData" / "Local" / "ms-playwright"
        )
    candidates.extend(
        (
            Path.home() / "Library" / "Caches" / "ms-playwright",
            Path.home() / ".cache" / "ms-playwright",
        )
    )
    if pwd is not None:
        try:
            user_home = Path(pwd.getpwuid(os.getuid()).pw_dir)
            candidates.extend(
                (
                    user_home / "Library" / "Caches" / "ms-playwright",
                    user_home / ".cache" / "ms-playwright",
                )
            )
        except (KeyError, OSError):
            # Best-effort lookup; platform cache candidates below can still work.
            pass
    for candidate in candidates:
        if _has_playwright_chromium(candidate):
            return candidate
    return None


def _has_playwright_chromium(path: Path) -> bool:
    if not path.exists():
        return False
    return any(path.glob("chromium_headless_shell-*")) or any(path.glob("chromium-*"))
