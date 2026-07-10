# -*- coding: utf-8 -*-
from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class ClawHubConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str | None = None


class ClawHubConfigView(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token_configured: bool

    @classmethod
    def from_config(cls, config: ClawHubConfig) -> ClawHubConfigView:
        return cls(token_configured=config.token is not None)


class ClawHubConfigUpdate(ClawHubConfig):
    preserve_token: bool = False

    def to_config(self, *, preserved_token: str | None) -> ClawHubConfig:
        token = (
            preserved_token
            if self.preserve_token and self.token is None
            else self.token
        )
        return ClawHubConfig(token=token)
