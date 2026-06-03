from __future__ import annotations

from typing import cast

import pytest
from pydantic import JsonValue

from relay_teams.tools.runtime.acp_approval import (
    acp_options_from_metadata,
    acp_options_projection,
    selected_acp_option_id_for_action,
)


def test_selected_acp_option_id_prefers_allow_once_for_approve() -> None:
    metadata = cast(
        dict[str, JsonValue],
        {
            "acp_options": [
                {
                    "optionId": "allow_always",
                    "name": "Allow always",
                    "kind": "allow_always",
                },
                {"optionId": "allow", "name": "Allow once", "kind": "allow_once"},
                {"optionId": "deny", "name": "Deny", "kind": "reject_once"},
            ]
        },
    )

    assert (
        selected_acp_option_id_for_action(metadata=metadata, action="approve")
        == "allow"
    )


def test_selected_acp_option_id_uses_requested_option_id() -> None:
    metadata = cast(
        dict[str, JsonValue],
        {
            "acp_options": [
                {"optionId": "allow", "name": "Allow once", "kind": "allow_once"},
                {
                    "optionId": "allow_always",
                    "name": "Allow always",
                    "kind": "allow_always",
                },
            ]
        },
    )

    assert (
        selected_acp_option_id_for_action(
            metadata=metadata,
            action="approve",
            requested_option_id="allow_always",
        )
        == "allow_always"
    )


def test_selected_acp_option_id_rejects_option_id_that_conflicts_with_action() -> None:
    metadata = cast(
        dict[str, JsonValue],
        {
            "acp_options": [
                {"optionId": "allow", "name": "Allow once", "kind": "allow_once"},
                {"optionId": "deny", "name": "Deny", "kind": "reject_once"},
            ]
        },
    )

    with pytest.raises(ValueError, match="does not match action"):
        selected_acp_option_id_for_action(
            metadata=metadata,
            action="approve",
            requested_option_id="deny",
        )


def test_selected_acp_option_id_rejects_unknown_requested_option_id() -> None:
    metadata = cast(
        dict[str, JsonValue],
        {
            "acp_options": [
                {"optionId": "allow", "name": "Allow once", "kind": "allow_once"},
            ]
        },
    )

    with pytest.raises(ValueError, match="Unknown ACP permission option_id"):
        selected_acp_option_id_for_action(
            metadata=metadata,
            action="approve",
            requested_option_id="missing",
        )


def test_acp_options_projection_skips_invalid_metadata_items() -> None:
    metadata = cast(
        dict[str, JsonValue],
        {
            "acp_options": [
                {"optionId": "allow", "name": "Allow once", "kind": "allow_once"},
                "ignored",
                {"optionId": "", "name": "Broken", "kind": "allow_once"},
                {"optionId": "deny", "name": "Deny", "kind": "reject_once"},
            ]
        },
    )

    assert [option.option_id for option in acp_options_from_metadata(metadata)] == [
        "allow",
        "deny",
    ]
    assert acp_options_projection(metadata) == [
        {"optionId": "allow", "name": "Allow once", "kind": "allow_once"},
        {"optionId": "deny", "name": "Deny", "kind": "reject_once"},
    ]


def test_selected_acp_option_id_rejects_option_id_without_acp_options() -> None:
    with pytest.raises(ValueError, match="only valid for ACP permission approvals"):
        selected_acp_option_id_for_action(
            metadata={},
            action="approve",
            requested_option_id="allow",
        )
    assert selected_acp_option_id_for_action(metadata={}, action="approve") == ""


def test_selected_acp_option_id_prefers_reject_once_for_deny() -> None:
    metadata = cast(
        dict[str, JsonValue],
        {
            "acp_options": [
                {
                    "optionId": "reject_always",
                    "name": "Reject always",
                    "kind": "reject_always",
                },
                {"optionId": "reject", "name": "Reject once", "kind": "reject_once"},
            ]
        },
    )

    assert (
        selected_acp_option_id_for_action(metadata=metadata, action="deny") == "reject"
    )


def test_selected_acp_option_id_rejects_action_without_matching_option() -> None:
    metadata = cast(
        dict[str, JsonValue],
        {
            "acp_options": [
                {"optionId": "allow", "name": "Allow once", "kind": "allow_once"},
            ]
        },
    )

    with pytest.raises(ValueError, match="No ACP permission option matches action"):
        selected_acp_option_id_for_action(metadata=metadata, action="deny")
