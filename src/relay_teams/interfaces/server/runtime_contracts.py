# -*- coding: utf-8 -*-
from __future__ import annotations

from collections.abc import Callable
from typing import Protocol

from starlette.applications import Starlette


class RuntimeContainer(Protocol):
    async def start(self) -> None:
        pass

    async def stop(self) -> None:
        pass


HydratedHealthPayloadBuilder = Callable[[], dict[str, object]]


class HydrationBundle:
    def __init__(
        self,
        *,
        container: RuntimeContainer,
        api_app: Starlette,
        health_payload_builder: HydratedHealthPayloadBuilder | None = None,
    ) -> None:
        self.container = container
        self.api_app = api_app
        self.health_payload_builder = (
            (lambda: {}) if health_payload_builder is None else health_payload_builder
        )
