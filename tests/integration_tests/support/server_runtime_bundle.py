# -*- coding: utf-8 -*-
from __future__ import annotations

from pathlib import Path

from relay_teams.interfaces.server.runtime_bundle import (
    build_hydration_bundle as build_production_hydration_bundle,
)
from relay_teams.interfaces.server.runtime_contracts import HydrationBundle

from integration_tests.support.scripted_computer_runtime import (
    ScriptedComputerRuntime,
)


def build_hydration_bundle(*, config_dir: Path, version: str) -> HydrationBundle:
    return build_production_hydration_bundle(
        config_dir=config_dir,
        version=version,
        computer_runtime=ScriptedComputerRuntime(),
    )
