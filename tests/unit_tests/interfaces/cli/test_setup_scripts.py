# -*- coding: utf-8 -*-
from __future__ import annotations

from pathlib import Path


def test_windows_setup_installs_project_entry_points() -> None:
    script = Path("setup.bat").read_text(encoding="utf-8")

    assert 'set "PYTHON_CMD=py -3"' in script
    assert 'if "%PYTHON_CMD%"=="" python --version >nul 2>&1' in script
    assert (
        'if %errorlevel% equ 0 if "%PYTHON_CMD%"=="" set "PYTHON_CMD=python"' in script
    )
    assert 'set "UV_CMD="' in script
    assert 'if "%UV_CMD%"=="" uv --version >nul 2>&1' in script
    assert 'if %errorlevel% equ 0 if "%UV_CMD%"=="" set "UV_CMD=uv"' in script
    assert "%PYTHON_CMD% -m pip install uv" in script
    assert "Usage: setup.bat [--no-evals]" in script
    assert 'set "INSTALL_EVALS=0"' in script
    assert "%UV_CMD% sync --all-extras --no-group evals --locked" in script
    assert 'set "UV_CACHE_DIR=.tmp\\uv-cache"' in script
    assert 'set "UV_LINK_MODE=copy"' in script
    assert "%UV_CMD% sync --all-extras --index-strategy unsafe-best-match" in script
    assert "%UV_CMD% pip install -e . --no-deps" in script
    assert "%UV_CMD% run --no-sync pre-commit install" in script
    assert 'if exist ".tmp\\uv-cache" rmdir /s /q ".tmp\\uv-cache"' in script
    assert 'if exist ".tmp" rmdir ".tmp"' in script
    assert "exit /b 0" in script


def test_posix_setup_installs_project_entry_points() -> None:
    script = Path("setup.sh").read_text(encoding="utf-8")

    assert 'PYTHON_BIN="python3"' in script
    assert 'UV_MODE=""' in script
    assert "elif command -v uv >/dev/null 2>&1; then" in script
    assert "run_uv() {" in script
    assert '"$PYTHON_BIN" -m pip install uv' in script
    assert "Usage: sh setup.sh [--no-evals]" in script
    assert "INSTALL_EVALS=0" in script
    assert "run_uv sync --all-extras --no-group evals --locked" in script
    assert 'export UV_CACHE_DIR=".tmp/uv-cache"' in script
    assert "export UV_LINK_MODE=copy" in script
    assert "run_uv sync --all-extras --index-strategy unsafe-best-match" in script
    assert "run_uv pip install -e . --no-deps" in script
    assert "run_uv run --no-sync pre-commit install" in script
    assert 'rm -rf ".tmp/uv-cache"' in script
    assert 'rmdir ".tmp" 2>/dev/null || true' in script
