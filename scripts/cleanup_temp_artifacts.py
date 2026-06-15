# -*- coding: utf-8 -*-
from __future__ import annotations

import argparse
from collections.abc import Sequence
from pathlib import Path
import shutil


_ROOT_TEMP_ARTIFACTS: tuple[Path, ...] = (
    Path(".pytest-tmp"),
    Path(".uv-cache"),
    Path(".tmp-localappdata"),
    Path("nul"),
)


def cleanup_temp_artifacts(project_root: Path) -> tuple[Path, ...]:
    resolved_root = project_root.expanduser().resolve()
    removed: list[Path] = []
    for relative_path in _ROOT_TEMP_ARTIFACTS:
        _validate_root_artifact_path(relative_path)
        target = resolved_root / relative_path
        if not _is_listed_path(target):
            continue
        if target.is_symlink():
            _unlink_file(target)
        elif target.is_dir():
            shutil.rmtree(target)
        else:
            _unlink_file(target)
        removed.append(relative_path)
    return tuple(removed)


def _validate_root_artifact_path(relative_path: Path) -> None:
    if relative_path.is_absolute() or ".." in relative_path.parts:
        raise ValueError(f"Refusing to clean unsafe artifact path: {relative_path}")


def _is_listed_path(target: Path) -> bool:
    return any(candidate.name == target.name for candidate in target.parent.iterdir())


def _unlink_file(target: Path) -> None:
    try:
        target.unlink()
    except PermissionError:
        _windows_extended_path(target).unlink()


def _windows_extended_path(target: Path) -> Path:
    return Path(f"\\\\?\\{target}")


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Remove known root-level temporary artifacts."
    )
    parser.add_argument(
        "--project-root",
        type=Path,
        default=Path.cwd(),
        help="Project root to clean. Defaults to the current working directory.",
    )
    args = parser.parse_args(argv)

    removed = cleanup_temp_artifacts(project_root=args.project_root)
    for path in removed:
        print(f"removed {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
