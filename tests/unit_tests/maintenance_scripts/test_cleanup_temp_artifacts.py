# -*- coding: utf-8 -*-
from __future__ import annotations

from pathlib import Path
import sys

import pytest

from scripts.cleanup_temp_artifacts import cleanup_temp_artifacts


def test_cleanup_temp_artifacts_removes_only_known_root_noise(
    tmp_path: Path,
) -> None:
    for directory_name in (".pytest-tmp", ".uv-cache", ".tmp-localappdata"):
        directory = tmp_path / directory_name
        directory.mkdir()
        (directory / "cache.txt").write_text("cache", encoding="utf-8")
    _write_real_file(tmp_path / "nul", "device noise")
    for preserved_name in (".tmp", "tmp", "output", "logs"):
        preserved = tmp_path / preserved_name
        preserved.mkdir()
        (preserved / "keep.txt").write_text("keep", encoding="utf-8")

    removed = cleanup_temp_artifacts(tmp_path)

    assert removed == (
        Path(".pytest-tmp"),
        Path(".uv-cache"),
        Path(".tmp-localappdata"),
        Path("nul"),
    )
    for removed_name in (".pytest-tmp", ".uv-cache", ".tmp-localappdata"):
        assert not (tmp_path / removed_name).exists()
    assert "nul" not in {path.name for path in tmp_path.iterdir()}
    for preserved_name in (".tmp", "tmp", "output", "logs"):
        assert (tmp_path / preserved_name / "keep.txt").read_text(
            encoding="utf-8"
        ) == "keep"


def test_cleanup_temp_artifacts_unlinks_symlink_without_removing_target(
    tmp_path: Path,
) -> None:
    target = tmp_path / "important_dir"
    target.mkdir()
    (target / "keep.txt").write_text("keep", encoding="utf-8")
    cache_link = tmp_path / ".uv-cache"
    _make_directory_symlink(cache_link, target)

    removed = cleanup_temp_artifacts(tmp_path)

    assert removed == (Path(".uv-cache"),)
    assert not cache_link.exists()
    assert (target / "keep.txt").read_text(encoding="utf-8") == "keep"


def _write_real_file(path: Path, content: str) -> None:
    if sys.platform == "win32" and path.name.lower() == "nul":
        Path(f"\\\\?\\{path.resolve()}").write_text(content, encoding="utf-8")
        return
    path.write_text(content, encoding="utf-8")


def _make_directory_symlink(link: Path, target: Path) -> None:
    try:
        link.symlink_to(target, target_is_directory=True)
    except OSError as exc:
        pytest.skip(f"directory symlinks are unavailable: {exc}")
