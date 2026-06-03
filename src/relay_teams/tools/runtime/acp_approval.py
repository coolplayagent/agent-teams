# -*- coding: utf-8 -*-
from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue, ValidationError

ACP_PERMISSION_METADATA_KEY = "acp_permission_request"
ACP_OPTIONS_METADATA_KEY = "acp_options"
ACP_SELECTED_OPTION_ID_METADATA_KEY = "acp_selected_option_id"
ACP_TOOL_CALL_ID_METADATA_KEY = "acp_tool_call_id"


class AcpApprovalOptionKind(str, Enum):
    ALLOW_ONCE = "allow_once"
    ALLOW_ALWAYS = "allow_always"
    REJECT_ONCE = "reject_once"
    REJECT_ALWAYS = "reject_always"


class AcpApprovalOptionMetadata(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    option_id: str = Field(alias="optionId", min_length=1)
    name: str = Field(min_length=1)
    kind: AcpApprovalOptionKind


type AcpApprovalActionClass = Literal["approve", "deny"]


def acp_options_from_metadata(
    metadata: dict[str, JsonValue],
) -> tuple[AcpApprovalOptionMetadata, ...]:
    raw_options = metadata.get(ACP_OPTIONS_METADATA_KEY)
    if not isinstance(raw_options, list):
        return ()
    options: list[AcpApprovalOptionMetadata] = []
    for raw_option in raw_options:
        if not isinstance(raw_option, dict):
            continue
        try:
            options.append(AcpApprovalOptionMetadata.model_validate(raw_option))
        except ValidationError:
            continue
    return tuple(options)


def acp_options_projection(
    metadata: dict[str, JsonValue],
) -> JsonValue:
    projected: list[JsonValue] = []
    for option in acp_options_from_metadata(metadata):
        projected.append(option.model_dump(mode="json", by_alias=True))
    return projected


def acp_approval_action_for_option_kind(
    kind: str,
) -> AcpApprovalActionClass:
    if kind in {
        AcpApprovalOptionKind.ALLOW_ONCE.value,
        AcpApprovalOptionKind.ALLOW_ALWAYS.value,
    }:
        return "approve"
    return "deny"


def selected_acp_option_id_for_action(
    *,
    metadata: dict[str, JsonValue],
    action: str,
    requested_option_id: str = "",
) -> str:
    options = acp_options_from_metadata(metadata)
    if not options:
        if requested_option_id:
            raise ValueError("option_id is only valid for ACP permission approvals")
        return ""
    normalized_option_id = requested_option_id.strip()
    if normalized_option_id:
        requested_action_class = _approval_action_class(action)
        for option in options:
            if option.option_id == normalized_option_id:
                option_action_class = acp_approval_action_for_option_kind(
                    option.kind.value
                )
                if option_action_class != requested_action_class:
                    raise ValueError(
                        "ACP permission option_id does not match action: "
                        f"{normalized_option_id}"
                    )
                return option.option_id
        raise ValueError(f"Unknown ACP permission option_id: {normalized_option_id}")
    if _approval_action_class(action) == "approve":
        selected = _first_option(
            options,
            preferred=(
                AcpApprovalOptionKind.ALLOW_ONCE,
                AcpApprovalOptionKind.ALLOW_ALWAYS,
            ),
        )
    else:
        selected = _first_option(
            options,
            preferred=(
                AcpApprovalOptionKind.REJECT_ONCE,
                AcpApprovalOptionKind.REJECT_ALWAYS,
            ),
        )
    if selected is None:
        raise ValueError(f"No ACP permission option matches action: {action}")
    return selected.option_id


def _approval_action_class(action: str) -> AcpApprovalActionClass:
    if action in {"approve", "approve_once", "approve_exact", "approve_prefix"}:
        return "approve"
    return "deny"


def _first_option(
    options: tuple[AcpApprovalOptionMetadata, ...],
    *,
    preferred: tuple[AcpApprovalOptionKind, ...],
) -> AcpApprovalOptionMetadata | None:
    for kind in preferred:
        for option in options:
            if option.kind == kind:
                return option
    return None
