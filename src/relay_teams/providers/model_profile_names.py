# -*- coding: utf-8 -*-
from __future__ import annotations

_DEFAULT_PROFILE_NAME = "default"
_EXPLICIT_DEFAULT_PROFILE_REFERENCE = "$relay-teams-literal-default-profile"


def explicit_model_profile_reference(profile_name: str) -> str:
    normalized = profile_name.strip()
    if normalized == _DEFAULT_PROFILE_NAME:
        return _EXPLICIT_DEFAULT_PROFILE_REFERENCE
    return normalized


def resolve_model_profile_reference(profile_name: str) -> tuple[str, bool]:
    normalized = profile_name.strip()
    if normalized == _EXPLICIT_DEFAULT_PROFILE_REFERENCE:
        return _DEFAULT_PROFILE_NAME, True
    return normalized, False
