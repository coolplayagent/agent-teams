# -*- coding: utf-8 -*-
from __future__ import annotations

from collections.abc import Callable, Mapping
from pathlib import Path

from relay_teams.env.clawhub_config_models import ClawHubConfig
from relay_teams.skills.clawhub_cli_support import (
    run_clawhub_install,
    run_clawhub_search,
)
from relay_teams.skills.clawhub_models import ClawHubSkillSummary
from relay_teams.skills.skill_market_models import (
    ClawHubSkillMarketInstalledSkill,
    ClawHubSkillMarketInstallDiagnostics,
    ClawHubSkillMarketInstallRequest,
    ClawHubSkillMarketInstallResponse,
    ClawHubSkillMarketSearchItem,
    ClawHubSkillMarketSearchResponse,
    ClawHubSkillMarketUninstallResponse,
)
from relay_teams.skills.skill_models import SkillSource
from relay_teams.validation import normalize_persisted_text


class ClawHubSkillMarketService:
    def __init__(
        self,
        *,
        config_dir: Path,
        get_clawhub_config: Callable[[], ClawHubConfig],
        list_clawhub_skills: Callable[[], tuple[ClawHubSkillSummary, ...]],
        delete_clawhub_skill: Callable[[str], None],
        reload_skills_config: Callable[[], None],
    ) -> None:
        self._config_dir = config_dir
        self._get_clawhub_config = get_clawhub_config
        self._list_clawhub_skills = list_clawhub_skills
        self._delete_clawhub_skill = delete_clawhub_skill
        self._reload_skills_config = reload_skills_config

    def search_clawhub_skills(
        self,
        *,
        query: str,
        limit: int,
    ) -> ClawHubSkillMarketSearchResponse:
        normalized_query = " ".join(part for part in query.split() if part.strip())
        config = self._get_clawhub_config()
        payload = run_clawhub_search(
            query=normalized_query,
            limit=limit,
            token=config.token,
            config_dir=self._config_dir,
        )
        installed_refs = self._installed_skill_refs()
        return _build_search_response(payload, installed_refs)

    def install_clawhub_skill(
        self,
        request: ClawHubSkillMarketInstallRequest,
    ) -> ClawHubSkillMarketInstallResponse:
        config = self._get_clawhub_config()
        payload = run_clawhub_install(
            slug=request.slug,
            version=request.version,
            force=request.force,
            token=config.token,
            config_dir=self._config_dir,
        )
        response = _build_install_response(payload)
        if not response.ok:
            return response

        try:
            self._reload_skills_config()
        except (RuntimeError, ValueError) as exc:
            return response.model_copy(
                update={
                    "ok": True,
                    "diagnostics": response.diagnostics.model_copy(
                        update={"skills_reloaded": False}
                    ),
                    "error_code": "skills_reload_failed",
                    "error_message": str(exc),
                }
            )

        return response.model_copy(
            update={
                "diagnostics": response.diagnostics.model_copy(
                    update={"skills_reloaded": True}
                )
            }
        )

    def uninstall_clawhub_skill(
        self,
        *,
        slug: str,
    ) -> ClawHubSkillMarketUninstallResponse:
        normalized_slug = normalize_persisted_text(slug)
        if normalized_slug is None:
            raise ValueError("ClawHub skill slug is required.")

        try:
            self._delete_clawhub_skill(normalized_slug)
        except KeyError as exc:
            return ClawHubSkillMarketUninstallResponse(
                ok=False,
                slug=normalized_slug,
                error_code="skill_not_installed",
                error_message=str(exc),
            )
        except (OSError, RuntimeError, ValueError) as exc:
            return ClawHubSkillMarketUninstallResponse(
                ok=False,
                slug=normalized_slug,
                error_code="uninstall_failed",
                error_message=str(exc),
            )

        try:
            self._reload_skills_config()
        except (RuntimeError, ValueError) as exc:
            return ClawHubSkillMarketUninstallResponse(
                ok=True,
                slug=normalized_slug,
                skills_reloaded=False,
                error_code="skills_reload_failed",
                error_message=str(exc),
            )

        return ClawHubSkillMarketUninstallResponse(
            ok=True,
            slug=normalized_slug,
            skills_reloaded=True,
        )

    def _installed_skill_refs(self) -> frozenset[str]:
        refs: set[str] = set()
        for skill in self._list_clawhub_skills():
            for value in (skill.skill_id, skill.runtime_name, skill.ref):
                normalized = normalize_persisted_text(value)
                if normalized is not None:
                    refs.add(normalized.casefold())
        return frozenset(refs)


def _build_search_response(
    payload: Mapping[str, object],
    installed_refs: frozenset[str],
) -> ClawHubSkillMarketSearchResponse:
    raw_items = payload.get("items")
    items: list[ClawHubSkillMarketSearchItem] = []
    if isinstance(raw_items, list | tuple):
        for raw_item in raw_items:
            item_payload = _string_key_mapping(raw_item)
            if item_payload is None:
                continue
            item = _build_search_item(item_payload, installed_refs)
            if item is not None:
                items.append(item)
    return ClawHubSkillMarketSearchResponse(
        ok=_bool_field(payload, "ok"),
        query=_string_field(payload, "query") or "",
        items=tuple(items),
        error_message=_string_field(payload, "error_message"),
    )


def _build_search_item(
    payload: Mapping[str, object],
    installed_refs: frozenset[str],
) -> ClawHubSkillMarketSearchItem | None:
    slug = _string_field(payload, "slug")
    title = _string_field(payload, "title") or ""
    if slug is None:
        return None
    installed = slug.casefold() in installed_refs or title.casefold() in installed_refs
    return ClawHubSkillMarketSearchItem(
        slug=slug,
        title=title,
        version=_string_field(payload, "version"),
        score=_float_field(payload, "score"),
        installed=installed,
    )


def _build_install_response(
    payload: Mapping[str, object],
) -> ClawHubSkillMarketInstallResponse:
    diagnostics_payload = _string_key_mapping(payload.get("diagnostics")) or {}
    installed_skill_payload = _string_key_mapping(payload.get("installed_skill"))
    installed_skill = (
        None
        if installed_skill_payload is None
        else _build_installed_skill(installed_skill_payload)
    )
    return ClawHubSkillMarketInstallResponse(
        ok=_bool_field(payload, "ok"),
        slug=_string_field(payload, "slug") or "",
        requested_version=_string_field(payload, "requested_version"),
        installed_skill=installed_skill,
        clawhub_path=_string_field(payload, "clawhub_path"),
        latency_ms=_int_field(payload, "latency_ms"),
        checked_at=_string_field(payload, "checked_at"),
        diagnostics=ClawHubSkillMarketInstallDiagnostics(
            binary_available=_bool_field(diagnostics_payload, "binary_available"),
            token_configured=_bool_field(diagnostics_payload, "token_configured"),
            installation_attempted=_bool_field(
                diagnostics_payload,
                "installation_attempted",
            ),
            installed_during_install=_bool_field(
                diagnostics_payload,
                "installed_during_install",
            ),
            registry=_string_field(diagnostics_payload, "registry"),
            endpoint_fallback_used=_bool_field(
                diagnostics_payload,
                "endpoint_fallback_used",
            ),
            workdir=_string_field(diagnostics_payload, "workdir"),
            skills_reloaded=_bool_field(diagnostics_payload, "skills_reloaded"),
        ),
        retryable=_bool_field(payload, "retryable"),
        error_code=_string_field(payload, "error_code"),
        error_message=_string_field(payload, "error_message"),
    )


def _build_installed_skill(
    payload: Mapping[str, object],
) -> ClawHubSkillMarketInstalledSkill | None:
    skill_id = _string_field(payload, "skill_id")
    directory = _string_field(payload, "directory")
    manifest_path = _string_field(payload, "manifest_path")
    if skill_id is None or directory is None or manifest_path is None:
        return None
    return ClawHubSkillMarketInstalledSkill(
        skill_id=skill_id,
        runtime_name=_string_field(payload, "runtime_name"),
        description=_string_field(payload, "description") or "",
        ref=_string_field(payload, "ref"),
        source=_skill_source_field(payload, "source"),
        directory=directory,
        manifest_path=manifest_path,
        valid=_bool_field(payload, "valid", default=True),
        error=_string_field(payload, "error"),
    )


def _string_key_mapping(value: object) -> Mapping[str, object] | None:
    if not isinstance(value, Mapping):
        return None
    return {key: raw_value for key, raw_value in value.items() if isinstance(key, str)}


def _string_field(payload: Mapping[str, object], key: str) -> str | None:
    value = payload.get(key)
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def _bool_field(
    payload: Mapping[str, object],
    key: str,
    *,
    default: bool = False,
) -> bool:
    value = payload.get(key)
    if isinstance(value, bool):
        return value
    return default


def _int_field(payload: Mapping[str, object], key: str) -> int:
    value = payload.get(key)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    return 0


def _float_field(payload: Mapping[str, object], key: str) -> float | None:
    value = payload.get(key)
    if isinstance(value, int | float):
        return float(value)
    return None


def _skill_source_field(payload: Mapping[str, object], key: str) -> SkillSource:
    value = _string_field(payload, key)
    if value is None:
        return SkillSource.USER_RELAY_TEAMS
    try:
        return SkillSource(value)
    except ValueError:
        return SkillSource.USER_RELAY_TEAMS
