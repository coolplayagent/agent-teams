# -*- coding: utf-8 -*-
from __future__ import annotations

from starlette.applications import Starlette

from relay_teams.interfaces.server import app as server_app_module

setattr(
    server_app_module,
    "_RUNTIME_BUNDLE_MODULE",
    "integration_tests.support.server_runtime_bundle",
)

app: Starlette = server_app_module.app
