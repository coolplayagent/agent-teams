# -*- coding: utf-8 -*-
from __future__ import annotations

import json
from pathlib import Path
import shutil
import subprocess

from relay_teams.plugins.config_manager import PluginConfigManager
from relay_teams.plugins.plugin_models import PluginScope


def test_git_install_clones_source_into_installed_copy(tmp_path: Path) -> None:
    if shutil.which("git") is None:
        return
    app_config_dir = tmp_path / "app"
    git_root = tmp_path / "quality-git"
    _write_plugin_manifest(git_root, name="quality", version="1.0.0")
    _commit_all(git_root, message="initial")

    installed = PluginConfigManager(app_config_dir=app_config_dir).install_git_plugin(
        source=str(git_root),
        scope=PluginScope.USER,
    )

    assert installed.name == "quality"
    assert installed.source.kind.value == "git"
    assert installed.root_dir.exists()
    assert (installed.root_dir / "app" / "plugin.json").exists()


def test_git_install_checks_out_requested_commit_ref(tmp_path: Path) -> None:
    if shutil.which("git") is None:
        return
    app_config_dir = tmp_path / "app"
    git_root = tmp_path / "quality-git"
    _write_plugin_manifest(git_root, name="quality", version="1.0.0")
    _commit_all(git_root, message="v1")
    commit = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=git_root,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    _write_plugin_manifest(git_root, name="quality", version="2.0.0")
    _commit_all(git_root, message="v2")

    installed = PluginConfigManager(app_config_dir=app_config_dir).install_git_plugin(
        source=str(git_root),
        ref=commit,
        scope=PluginScope.USER,
    )

    assert installed.version == "1.0.0"
    assert installed.source.ref == commit
    assert (
        json.loads(
            (installed.root_dir / "app" / "plugin.json").read_text(encoding="utf-8")
        )["version"]
        == "1.0.0"
    )


def _commit_all(repo_root: Path, *, message: str) -> None:
    if not (repo_root / ".git").exists():
        subprocess.run(["git", "init"], cwd=repo_root, check=True, capture_output=True)
        subprocess.run(
            ["git", "config", "user.email", "tests@example.invalid"],
            cwd=repo_root,
            check=True,
            capture_output=True,
        )
        subprocess.run(
            ["git", "config", "user.name", "Tests"],
            cwd=repo_root,
            check=True,
            capture_output=True,
        )
    subprocess.run(["git", "add", "."], cwd=repo_root, check=True, capture_output=True)
    subprocess.run(
        ["git", "commit", "-m", message],
        cwd=repo_root,
        check=True,
        capture_output=True,
    )


def _write_plugin_manifest(plugin_root: Path, *, name: str, version: str) -> None:
    manifest_dir = plugin_root / "app"
    manifest_dir.mkdir(parents=True, exist_ok=True)
    (manifest_dir / "plugin.json").write_text(
        json.dumps({"name": name, "version": version}),
        encoding="utf-8",
    )
