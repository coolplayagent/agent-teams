# -*- coding: utf-8 -*-
from __future__ import annotations

import runpy
import sys

import relay_teams
from relay_teams.interfaces.cli.approvals_cli import (
    build_approvals_app as real_build_approvals_app,
)
from relay_teams.interfaces.sdk.client import AsyncAgentTeamsClient
from relay_teams.roles.role_cli import build_roles_app as real_build_roles_app


def test_package_root_exports_real_async_client_class() -> None:
    assert relay_teams.__all__ == []
    assert "relay_teams.interfaces.sdk.client" in sys.modules
    assert isinstance(AsyncAgentTeamsClient(), AsyncAgentTeamsClient)


def test_cli_package_exports_real_builders() -> None:
    assert real_build_approvals_app.__name__ == "build_approvals_app"
    assert real_build_roles_app.__name__ == "build_roles_app"


def test_package_main_delegates_to_cli_main(monkeypatch) -> None:
    calls: list[str] = []

    monkeypatch.setattr(
        "relay_teams.interfaces.cli.app.main",
        lambda: calls.append("main"),
    )

    runpy.run_module("relay_teams.__main__", run_name="__main__")

    assert calls == ["main"]
