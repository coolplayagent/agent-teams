# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

import pytest


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def test_fast_cli_import_boundary_excludes_heavy_modules() -> None:
    blocked_modules = [
        "relay_teams.interfaces.cli.app_full",
        "relay_teams.env.proxy_env",
        "relay_teams.env.runtime_env",
        "relay_teams.interfaces.server.runtime_identity",
        "pydantic_ai",
        "lark_oapi",
    ]
    probe = (
        "import json, sys\n"
        "import relay_teams.interfaces.cli.app\n"
        f"blocked = {blocked_modules!r}\n"
        "print(json.dumps({name: name in sys.modules for name in blocked}))\n"
    )

    completed = subprocess.run(
        [sys.executable, "-c", probe],
        check=False,
        capture_output=True,
        cwd=_repo_root(),
        text=True,
        timeout=5.0,
    )

    assert completed.returncode == 0, completed.stderr
    loaded = json.loads(completed.stdout)
    assert loaded == {name: False for name in blocked_modules}


@pytest.mark.parametrize(
    ("label", "args", "expected_returncodes"),
    [
        ("root help", ["--help"], {0}),
        ("known local json", ["env", "list", "--format", "json"], {0}),
        ("unknown command", ["__invalid_fast_root__"], {2}),
    ],
)
def test_fast_cli_cold_subprocess_smoke(
    label: str,
    args: list[str],
    expected_returncodes: set[int],
    tmp_path: Path,
) -> None:
    env = {**dict(os.environ), "RELAY_TEAMS_CONFIG_DIR": str(tmp_path / "config")}
    start = time.perf_counter()

    completed = subprocess.run(
        [sys.executable, "-m", "relay_teams.interfaces.cli.app", *args],
        check=False,
        capture_output=True,
        cwd=_repo_root(),
        env=env,
        text=True,
        timeout=5.0,
    )

    elapsed = time.perf_counter() - start
    assert completed.returncode in expected_returncodes, (
        f"{label} exited {completed.returncode}: {completed.stderr}"
    )
    assert elapsed < 2.0, f"{label} took {elapsed:.3f}s"
