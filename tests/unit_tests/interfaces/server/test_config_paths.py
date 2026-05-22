# -*- coding: utf-8 -*-
from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

from relay_teams.interfaces.server import config_paths


def test_get_frontend_dist_dir_uses_env_override_first(
    monkeypatch,
    tmp_path: Path,
) -> None:
    env_frontend_dir = tmp_path / "repo-root" / "frontend" / "v2" / "dist"
    git_frontend_dist_dir = tmp_path / "repo-root" / "frontend" / "dist"
    env_frontend_dir.mkdir(parents=True)
    git_frontend_dist_dir.mkdir(parents=True)
    monkeypatch.setenv(
        config_paths.FRONTEND_DIST_DIR_ENV,
        str(env_frontend_dir),
    )
    monkeypatch.setattr(
        config_paths,
        "_git_frontend_dist_dir",
        lambda: git_frontend_dist_dir,
    )
    monkeypatch.setattr(
        config_paths,
        "_package_frontend_dist_dir",
        lambda: tmp_path / "package-root" / "frontend" / "dist",
    )
    monkeypatch.setattr(
        config_paths,
        "_cwd_frontend_dist_dir",
        lambda: tmp_path / "cwd-root" / "frontend" / "dist",
    )

    frontend_dist_dir = config_paths.get_frontend_dist_dir()

    assert frontend_dist_dir == env_frontend_dir.resolve()


def test_get_frontend_v2_source_dir_uses_git_root_when_available(
    monkeypatch,
    tmp_path: Path,
) -> None:
    frontend_v2_source_dir = tmp_path / "repo-root" / "frontend" / "v2" / "src"
    frontend_v2_source_dir.mkdir(parents=True)
    monkeypatch.setattr(
        config_paths,
        "_git_frontend_v2_source_dir",
        lambda: frontend_v2_source_dir,
    )
    monkeypatch.setattr(
        config_paths,
        "_package_frontend_v2_source_dir",
        lambda: tmp_path / "package-root" / "frontend" / "v2" / "src",
    )
    monkeypatch.setattr(
        config_paths,
        "_cwd_frontend_v2_source_dir",
        lambda: tmp_path / "cwd-root" / "frontend" / "v2" / "src",
    )

    resolved_dir = config_paths.get_frontend_v2_source_dir()

    assert resolved_dir == frontend_v2_source_dir


def test_get_frontend_dist_dir_uses_git_root_when_available(
    monkeypatch,
    tmp_path: Path,
) -> None:
    project_root = tmp_path / "repo-root"
    git_frontend_dist_dir = project_root / "frontend" / "dist"
    git_frontend_dist_dir.mkdir(parents=True)
    monkeypatch.setattr(
        config_paths,
        "_git_frontend_dist_dir",
        lambda: git_frontend_dist_dir,
    )
    monkeypatch.setattr(
        config_paths,
        "_package_frontend_dist_dir",
        lambda: tmp_path / "package-root" / "frontend" / "dist",
    )
    monkeypatch.setattr(
        config_paths,
        "_cwd_frontend_dist_dir",
        lambda: tmp_path / "cwd-root" / "frontend" / "dist",
    )

    frontend_dist_dir = config_paths.get_frontend_dist_dir()

    assert frontend_dist_dir == git_frontend_dist_dir


def test_get_frontend_dist_dir_falls_back_to_package_dir_when_git_root_is_missing(
    monkeypatch,
    tmp_path: Path,
) -> None:
    package_dist_dir = tmp_path / "package-root" / "frontend" / "dist"
    package_dist_dir.mkdir(parents=True)
    monkeypatch.setattr(
        config_paths,
        "_git_frontend_dist_dir",
        lambda: tmp_path / "git-root" / "frontend" / "dist",
    )
    monkeypatch.setattr(
        config_paths,
        "_package_frontend_dist_dir",
        lambda: package_dist_dir,
    )
    monkeypatch.setattr(
        config_paths,
        "_cwd_frontend_dist_dir",
        lambda: tmp_path / "cwd-root" / "frontend" / "dist",
    )

    frontend_dist_dir = config_paths.get_frontend_dist_dir()

    assert frontend_dist_dir == package_dist_dir


def test_get_frontend_dist_dir_falls_back_to_cwd_when_other_candidates_are_missing(
    monkeypatch,
    tmp_path: Path,
) -> None:
    cwd_frontend_dist_dir = tmp_path / "cwd-root" / "frontend" / "dist"
    cwd_frontend_dist_dir.mkdir(parents=True)
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(
        config_paths,
        "_git_frontend_dist_dir",
        lambda: tmp_path / "git-root" / "frontend" / "dist",
    )
    monkeypatch.setattr(
        config_paths,
        "_package_frontend_dist_dir",
        lambda: tmp_path / "package-root" / "frontend" / "dist",
    )
    monkeypatch.setattr(
        config_paths,
        "_cwd_frontend_dist_dir",
        lambda: cwd_frontend_dist_dir,
    )

    frontend_dist_dir = config_paths.get_frontend_dist_dir()

    assert frontend_dist_dir == cwd_frontend_dist_dir


def test_package_frontend_dist_dir_uses_frontend_package_origin(
    monkeypatch,
    tmp_path: Path,
) -> None:
    package_dir = tmp_path / "site-packages" / "relay_teams" / "frontend"
    package_dir.mkdir(parents=True)
    package_init = package_dir / "__init__.py"
    package_init.write_text(
        "# -*- coding: utf-8 -*-\nfrom __future__ import annotations\n",
        encoding="utf-8",
    )

    monkeypatch.setattr(
        config_paths.importlib.util,
        "find_spec",
        lambda package_name: (
            SimpleNamespace(origin=str(package_init))
            if package_name == "relay_teams.frontend"
            else None
        ),
    )

    assert config_paths._package_frontend_dist_dir() == package_dir / "dist"
