# -*- coding: utf-8 -*-
from __future__ import annotations

from enum import Enum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue


class AcpPermissionOptionKind(str, Enum):
    ALLOW_ONCE = "allow_once"
    ALLOW_ALWAYS = "allow_always"
    REJECT_ONCE = "reject_once"
    REJECT_ALWAYS = "reject_always"


class AcpPermissionOption(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    option_id: str = Field(alias="optionId", min_length=1)
    name: str = Field(min_length=1)
    kind: AcpPermissionOptionKind
    meta: dict[str, JsonValue] = Field(default_factory=dict, alias="_meta")


class AcpToolCallUpdate(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    tool_call_id: str = Field(alias="toolCallId", min_length=1)
    title: str = ""
    kind: str = ""
    status: str = ""
    content: tuple[JsonValue, ...] = ()
    raw_input: JsonValue | None = Field(default=None, alias="rawInput")
    raw_output: JsonValue | None = Field(default=None, alias="rawOutput")
    meta: dict[str, JsonValue] = Field(default_factory=dict, alias="_meta")


class AcpPermissionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    session_id: str = Field(alias="sessionId", min_length=1)
    tool_call: AcpToolCallUpdate = Field(alias="toolCall")
    options: tuple[AcpPermissionOption, ...]
    meta: dict[str, JsonValue] = Field(default_factory=dict, alias="_meta")


class AcpSelectedPermissionOutcome(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    outcome: Literal["selected"] = "selected"
    option_id: str = Field(alias="optionId", min_length=1)


class AcpCancelledPermissionOutcome(BaseModel):
    model_config = ConfigDict(extra="forbid")

    outcome: Literal["cancelled"] = "cancelled"


AcpPermissionOutcome = Annotated[
    AcpSelectedPermissionOutcome | AcpCancelledPermissionOutcome,
    Field(discriminator="outcome"),
]


class AcpRequestPermissionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    outcome: AcpPermissionOutcome


def acp_selected_permission_response(option_id: str) -> dict[str, JsonValue]:
    response = AcpRequestPermissionResponse(
        outcome=AcpSelectedPermissionOutcome(optionId=option_id)
    )
    return response.model_dump(mode="json", by_alias=True)


def acp_cancelled_permission_response() -> dict[str, JsonValue]:
    response = AcpRequestPermissionResponse(outcome=AcpCancelledPermissionOutcome())
    return response.model_dump(mode="json", by_alias=True)
