# -*- coding: utf-8 -*-
from __future__ import annotations

import runpy
from pathlib import Path
from typing import cast


def test_root_package_keeps_import_boundary_lightweight() -> None:
    namespace = runpy.run_path(
        str(Path("src") / "relay_teams" / "__init__.py"),
        init_globals={"__name__": "relay_teams"},
    )

    assert "AsyncAgentTeamsClient" not in cast(list[str], namespace["__all__"])
    assert "__getattr__" not in namespace


def test_root_package_stub_matches_lightweight_runtime_exports() -> None:
    stub_source = (Path("src") / "relay_teams" / "__init__.pyi").read_text(
        encoding="utf-8"
    )

    assert "AsyncAgentTeamsClient" not in stub_source
    assert "__all__" in stub_source


def test_root_package_no_longer_exports_legacy_agent_teams_app() -> None:
    namespace = runpy.run_path(
        str(Path("src") / "relay_teams" / "__init__.py"),
        init_globals={"__name__": "relay_teams"},
    )

    assert "AgentTeamsApp" not in cast(list[str], namespace["__all__"])
