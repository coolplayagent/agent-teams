# -*- coding: utf-8 -*-
from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime, timezone
from io import BytesIO
import json
import os
from pathlib import Path
import re
import ssl
import subprocess
from time import perf_counter
from typing import cast
from urllib.parse import quote, urlencode
from urllib.request import (
    HTTPSHandler,
    OpenerDirector,
    ProxyHandler,
    Request,
    build_opener,
)
from zipfile import BadZipFile, ZipFile, ZipInfo

from relay_teams.env.clawhub_cli import (
    install_clawhub_via_npm,
    resolve_existing_clawhub_path,
)
from relay_teams.env.clawhub_command_errors import (
    combine_clawhub_failure_messages,
    explain_clawhub_failure,
    should_retry_clawhub_without_endpoint_overrides,
    summarize_clawhub_command_failure,
)
from relay_teams.env.clawhub_env import (
    build_clawhub_subprocess_env,
    normalize_clawhub_token,
    resolve_clawhub_registry_from_env,
    resolve_clawhub_site_from_env,
    resolve_clawhub_token_from_env,
    strip_clawhub_endpoint_overrides,
)
from relay_teams.env.proxy_env import (
    proxy_applies_to_url,
    resolve_proxy_env_config,
    resolve_ssl_verify,
)
from relay_teams.paths import get_app_config_dir
from relay_teams.skills.clawhub_skill_service import ClawHubSkillService

_DEFAULT_SEARCH_TIMEOUT_SECONDS = 20.0
_DEFAULT_INSTALL_TIMEOUT_SECONDS = 180.0
_DEFAULT_BINARY_INSTALL_TIMEOUT_SECONDS = 180.0
_DEFAULT_CLAWHUB_REGISTRY = "https://clawhub.ai"
_MAX_BROWSE_LIMIT = 200
_MAX_MARKET_DETAIL_MANIFEST_BYTES = 1024 * 1024
_PATH_LIST_SEPARATOR = ";" if os.name == "nt" else ":"
_INSTALLABLE_SKILL_SLUG_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
_SEARCH_LINE_RE = re.compile(
    r"^(?P<slug>\S+)(?:\s+(?P<version>v?\d\S*))?\s{2,}"
    r"(?P<title>.+?)\s+\((?P<score>-?\d+(?:\.\d+)?)\)\s*$"
)
_BROWSE_SORTS = {
    "popular": "installsCurrent",
    "installs": "installsCurrent",
    "current": "installsCurrent",
    "installscurrent": "installsCurrent",
    "installs-current": "installsCurrent",
    "installsalltime": "installsAllTime",
    "installs-all-time": "installsAllTime",
    "downloads": "downloads",
    "download": "downloads",
    "stars": "stars",
    "rating": "stars",
    "newest": "createdAt",
    "updated": "updated",
    "trending": "trending",
}


def run_clawhub_api_search(
    *,
    query: str,
    limit: int,
    token: str | None = None,
    config_dir: Path | None = None,
    timeout_seconds: float = _DEFAULT_SEARCH_TIMEOUT_SECONDS,
) -> dict[str, object]:
    normalized_query = " ".join(part for part in query.split() if part.strip())
    if not normalized_query:
        return run_clawhub_browse(
            limit=limit,
            token=token,
            config_dir=config_dir,
            timeout_seconds=timeout_seconds,
        )
    try:
        payload = _get_clawhub_json(
            path="/api/v1/search",
            params={
                "q": normalized_query,
                "limit": str(limit),
                "nonSuspiciousOnly": "true",
            },
            token=token,
            config_dir=config_dir,
            timeout_seconds=timeout_seconds,
        )
    except ValueError as exc:
        return {
            "ok": False,
            "query": normalized_query,
            "items": [],
            "error_message": str(exc),
        }

    raw_items = payload.get("results")
    if not isinstance(raw_items, list):
        return {
            "ok": False,
            "query": normalized_query,
            "items": [],
            "error_message": "ClawHub search returned an unexpected output format.",
        }
    return {
        "ok": True,
        "query": normalized_query,
        "items": _parse_api_search_items(raw_items),
    }


def run_clawhub_browse(
    *,
    limit: int,
    cursor: str = "",
    sort: str = "popular",
    token: str | None = None,
    config_dir: Path | None = None,
    timeout_seconds: float = _DEFAULT_SEARCH_TIMEOUT_SECONDS,
) -> dict[str, object]:
    try:
        api_sort = _normalize_browse_sort(sort)
    except ValueError as exc:
        return {
            "ok": False,
            "query": "",
            "items": [],
            "sort": sort.strip() or "popular",
            "next_cursor": None,
            "error_message": str(exc),
        }
    params = {
        "limit": str(max(1, min(_MAX_BROWSE_LIMIT, limit))),
        "nonSuspiciousOnly": "true",
    }
    if api_sort != "updated":
        params["sort"] = api_sort
    normalized_cursor = cursor.strip()
    if normalized_cursor:
        params["cursor"] = normalized_cursor
    try:
        payload = _get_clawhub_json(
            path="/api/v1/skills",
            params=params,
            token=token,
            config_dir=config_dir,
            timeout_seconds=timeout_seconds,
        )
    except ValueError as exc:
        return {
            "ok": False,
            "query": "",
            "items": [],
            "sort": sort.strip() or "popular",
            "next_cursor": None,
            "error_message": str(exc),
        }

    raw_items = payload.get("items")
    if not isinstance(raw_items, list):
        return {
            "ok": False,
            "query": "",
            "items": [],
            "sort": sort.strip() or "popular",
            "next_cursor": None,
            "error_message": "ClawHub market listing returned an unexpected output format.",
        }
    return {
        "ok": True,
        "query": "",
        "items": _parse_api_browse_items(raw_items),
        "sort": sort.strip() or "popular",
        "next_cursor": _string_field(payload, "nextCursor"),
    }


def run_clawhub_skill_detail(
    *,
    slug: str,
    version: str | None = None,
    token: str | None = None,
    config_dir: Path | None = None,
    timeout_seconds: float = _DEFAULT_SEARCH_TIMEOUT_SECONDS,
) -> dict[str, object]:
    try:
        normalized_slug = _normalize_installable_slug(slug)
    except ValueError as exc:
        return {
            "ok": False,
            "slug": slug.strip() or "<invalid>",
            "title": "",
            "summary": "",
            "files": [],
            "error_message": str(exc),
        }

    normalized_version = _normalize_optional_text(version)
    try:
        detail_payload = _get_clawhub_json(
            path=f"/api/v1/skills/{quote(normalized_slug, safe='')}",
            params={},
            token=token,
            config_dir=config_dir,
            timeout_seconds=timeout_seconds,
        )
    except ValueError as exc:
        return {
            "ok": False,
            "slug": normalized_slug,
            "title": "",
            "summary": "",
            "files": [],
            "error_message": str(exc),
        }

    detail = _parse_api_detail_payload(detail_payload, fallback_slug=normalized_slug)
    resolved_version = normalized_version or _string_field(detail, "version")
    version_detail: dict[str, object] = {}
    if resolved_version is not None:
        version_detail = _load_clawhub_version_detail(
            slug=normalized_slug,
            version=resolved_version,
            token=token,
            config_dir=config_dir,
            timeout_seconds=timeout_seconds,
        )

    manifest_content: str | None = None
    manifest_error: str | None = None
    if resolved_version is not None:
        try:
            manifest_content = _get_clawhub_text(
                path=f"/api/v1/skills/{quote(normalized_slug, safe='')}/file",
                params={
                    "path": "SKILL.md",
                    "version": resolved_version,
                },
                token=token,
                config_dir=config_dir,
                timeout_seconds=timeout_seconds,
                max_bytes=_MAX_MARKET_DETAIL_MANIFEST_BYTES,
            )
        except ValueError as exc:
            manifest_error = str(exc)
    else:
        manifest_error = "ClawHub skill detail does not include a version."

    return {
        **detail,
        **version_detail,
        "ok": True,
        "slug": normalized_slug,
        "version": resolved_version,
        "manifest_content": manifest_content,
        "error_message": manifest_error,
    }


def run_clawhub_search(
    *,
    query: str,
    limit: int,
    token: str | None = None,
    config_dir: Path | None = None,
    timeout_seconds: float = _DEFAULT_SEARCH_TIMEOUT_SECONDS,
) -> dict[str, object]:
    normalized_query = " ".join(part for part in query.split() if part.strip())
    default_listing = not normalized_query
    command = (
        _build_explore_command(limit)
        if default_listing
        else _build_search_command(normalized_query, limit)
    )
    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=build_clawhub_subprocess_env(
                token,
                config_dir=config_dir,
                base_env=os.environ,
            ),
            timeout=timeout_seconds,
            check=False,
        )
    except OSError as exc:
        return {
            "ok": False,
            "query": normalized_query,
            "items": [],
            "error_message": str(exc) or "ClawHub CLI is not available on PATH.",
        }
    except subprocess.TimeoutExpired:
        return {
            "ok": False,
            "query": normalized_query,
            "items": [],
            "error_message": "ClawHub skill search timed out.",
        }

    if completed.returncode != 0:
        return {
            "ok": False,
            "query": normalized_query,
            "items": [],
            "error_message": _first_meaningful_line(
                completed.stderr,
                completed.stdout,
            )
            or "ClawHub skill search failed.",
        }

    try:
        items = (
            _parse_explore_output(completed.stdout)
            if default_listing
            else _parse_search_output(completed.stdout)
        )
    except ValueError as exc:
        return {
            "ok": False,
            "query": normalized_query,
            "items": [],
            "error_message": str(exc),
        }
    return {"ok": True, "query": normalized_query, "items": items}


def run_clawhub_install(
    *,
    slug: str,
    version: str | None = None,
    force: bool = False,
    token: str | None = None,
    config_dir: Path | None = None,
    timeout_seconds: float = _DEFAULT_INSTALL_TIMEOUT_SECONDS,
) -> dict[str, object]:
    checked_at = datetime.now(timezone.utc)
    started = perf_counter()
    normalized_version = _normalize_optional_text(version)
    normalized_token = normalize_clawhub_token(token)
    token_configured = normalized_token is not None or (
        resolve_clawhub_token_from_env(os.environ) is not None
    )
    try:
        normalized_slug = _normalize_installable_slug(slug)
    except ValueError as exc:
        return _build_install_result(
            ok=False,
            slug=slug.strip() or "<invalid>",
            requested_version=normalized_version,
            checked_at=checked_at,
            started=started,
            binary_available=False,
            token_configured=token_configured,
            error_code="unsupported_slug",
            error_message=str(exc),
        )

    resolved_config_dir = (
        get_app_config_dir()
        if config_dir is None
        else config_dir.expanduser().resolve()
    )
    resolved_config_dir.mkdir(parents=True, exist_ok=True)
    clawhub_path = resolve_existing_clawhub_path()
    installation_attempted = False
    installed_during_install = False

    if clawhub_path is None:
        install_result = install_clawhub_via_npm(
            timeout_seconds=max(
                timeout_seconds,
                _DEFAULT_BINARY_INSTALL_TIMEOUT_SECONDS,
            ),
            base_env=build_clawhub_subprocess_env(
                None,
                config_dir=resolved_config_dir,
                base_env=os.environ,
            ),
        )
        installation_attempted = install_result.attempted
        if install_result.ok and install_result.clawhub_path is not None:
            clawhub_path = Path(install_result.clawhub_path)
            installed_during_install = True
        else:
            return _build_install_result(
                ok=False,
                slug=normalized_slug,
                requested_version=normalized_version,
                checked_at=checked_at,
                started=started,
                binary_available=False,
                token_configured=token_configured,
                installation_attempted=installation_attempted,
                installed_during_install=installed_during_install,
                workdir=resolved_config_dir,
                error_code=install_result.error_code or "clawhub_unavailable",
                error_message=install_result.error_message
                or "ClawHub CLI is not available on PATH.",
            )

    env = build_clawhub_subprocess_env(
        normalized_token,
        config_dir=resolved_config_dir,
        base_env=os.environ,
    )
    env["PATH"] = _prepend_to_path(env.get("PATH"), clawhub_path.parent)
    registry = resolve_clawhub_registry_from_env(env)
    endpoint_fallback_used = False
    command = [
        str(clawhub_path),
        "--workdir",
        str(resolved_config_dir),
        "--no-input",
        "install",
        normalized_slug,
    ]
    if normalized_version is not None:
        command.extend(["--version", normalized_version])
    if force:
        command.append("--force")
    deadline = started + timeout_seconds

    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=env,
            timeout=timeout_seconds,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        return _build_install_result(
            ok=False,
            slug=normalized_slug,
            requested_version=normalized_version,
            checked_at=checked_at,
            started=started,
            clawhub_path=clawhub_path,
            binary_available=True,
            token_configured=token_configured,
            installation_attempted=installation_attempted,
            installed_during_install=installed_during_install,
            registry=registry,
            endpoint_fallback_used=endpoint_fallback_used,
            workdir=resolved_config_dir,
            retryable=True,
            error_code="install_timeout",
            error_message=str(exc) or "ClawHub skill install timed out.",
        )

    if completed.returncode != 0:
        reason = (
            summarize_clawhub_command_failure(completed.stderr, completed.stdout)
            or "ClawHub skill install failed."
        )
        if should_retry_clawhub_without_endpoint_overrides(
            reason,
            endpoint_overrides_configured=registry is not None,
        ):
            endpoint_fallback_used = True
            fallback_env = dict(env)
            strip_clawhub_endpoint_overrides(fallback_env)
            remaining_timeout_seconds = max(deadline - perf_counter(), 0.001)
            try:
                fallback_completed = subprocess.run(
                    command,
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    env=fallback_env,
                    timeout=remaining_timeout_seconds,
                    check=False,
                )
            except subprocess.TimeoutExpired as exc:
                combined_reason = combine_clawhub_failure_messages(
                    reason,
                    str(exc) or "ClawHub skill install timed out.",
                )
                return _build_install_result(
                    ok=False,
                    slug=normalized_slug,
                    requested_version=normalized_version,
                    checked_at=checked_at,
                    started=started,
                    clawhub_path=clawhub_path,
                    binary_available=True,
                    token_configured=token_configured,
                    installation_attempted=installation_attempted,
                    installed_during_install=installed_during_install,
                    registry=registry,
                    endpoint_fallback_used=endpoint_fallback_used,
                    workdir=resolved_config_dir,
                    retryable=True,
                    error_code="install_timeout",
                    error_message=explain_clawhub_failure(
                        combined_reason,
                        endpoint_overrides_configured=registry is not None,
                        endpoint_fallback_used=endpoint_fallback_used,
                    ),
                )
            if fallback_completed.returncode == 0:
                completed = fallback_completed
            else:
                fallback_reason = (
                    summarize_clawhub_command_failure(
                        fallback_completed.stderr,
                        fallback_completed.stdout,
                    )
                    or "ClawHub skill install failed."
                )
                reason = combine_clawhub_failure_messages(reason, fallback_reason)
                return _build_install_result(
                    ok=False,
                    slug=normalized_slug,
                    requested_version=normalized_version,
                    checked_at=checked_at,
                    started=started,
                    clawhub_path=clawhub_path,
                    binary_available=True,
                    token_configured=token_configured,
                    installation_attempted=installation_attempted,
                    installed_during_install=installed_during_install,
                    registry=registry,
                    endpoint_fallback_used=endpoint_fallback_used,
                    workdir=resolved_config_dir,
                    error_code="install_failed",
                    error_message=explain_clawhub_failure(
                        reason,
                        endpoint_overrides_configured=registry is not None,
                        endpoint_fallback_used=endpoint_fallback_used,
                    ),
                )
        else:
            return _build_install_result(
                ok=False,
                slug=normalized_slug,
                requested_version=normalized_version,
                checked_at=checked_at,
                started=started,
                clawhub_path=clawhub_path,
                binary_available=True,
                token_configured=token_configured,
                installation_attempted=installation_attempted,
                installed_during_install=installed_during_install,
                registry=registry,
                endpoint_fallback_used=endpoint_fallback_used,
                workdir=resolved_config_dir,
                error_code="install_failed",
                error_message=explain_clawhub_failure(
                    reason,
                    endpoint_overrides_configured=registry is not None,
                    endpoint_fallback_used=endpoint_fallback_used,
                ),
            )

    installed_skill = _load_installed_skill_summary(
        config_dir=resolved_config_dir,
        skill_id=normalized_slug,
    )
    if installed_skill is None:
        return _build_install_result(
            ok=False,
            slug=normalized_slug,
            requested_version=normalized_version,
            checked_at=checked_at,
            started=started,
            clawhub_path=clawhub_path,
            binary_available=True,
            token_configured=token_configured,
            installation_attempted=installation_attempted,
            installed_during_install=installed_during_install,
            registry=registry,
            endpoint_fallback_used=endpoint_fallback_used,
            workdir=resolved_config_dir,
            error_code="runtime_skill_unavailable",
            error_message=(
                "ClawHub installed the package, but Agent Teams could not discover "
                f"the runtime skill under {resolved_config_dir / 'skills' / normalized_slug}."
            ),
        )

    return _build_install_result(
        ok=True,
        slug=normalized_slug,
        requested_version=normalized_version,
        installed_skill=installed_skill,
        checked_at=checked_at,
        started=started,
        clawhub_path=clawhub_path,
        binary_available=True,
        token_configured=token_configured,
        installation_attempted=installation_attempted,
        installed_during_install=installed_during_install,
        registry=registry,
        endpoint_fallback_used=endpoint_fallback_used,
        workdir=resolved_config_dir,
    )


def _build_search_command(query: str, limit: int) -> list[str]:
    clawhub_path = resolve_existing_clawhub_path()
    executable = "clawhub" if clawhub_path is None else str(clawhub_path)
    return [executable, "search", query, "--limit", str(limit)]


def _build_explore_command(limit: int) -> list[str]:
    clawhub_path = resolve_existing_clawhub_path()
    executable = "clawhub" if clawhub_path is None else str(clawhub_path)
    return [executable, "explore", "--limit", str(limit), "--json"]


def _get_clawhub_json(
    *,
    path: str,
    params: Mapping[str, str],
    token: str | None,
    config_dir: Path | None,
    timeout_seconds: float,
) -> Mapping[str, object]:
    env = build_clawhub_subprocess_env(
        token,
        config_dir=config_dir,
        base_env=os.environ,
    )
    registry = _resolve_clawhub_api_registry(env)
    url = _clawhub_api_url(
        registry=registry,
        path=path,
        params=params,
    )
    headers = {
        "Accept": "application/json",
        "User-Agent": "relay-teams-clawhub-skill-market",
    }
    resolved_token = normalize_clawhub_token(token) or resolve_clawhub_token_from_env(
        env
    )
    if resolved_token is not None:
        headers["Authorization"] = f"Bearer {resolved_token}"
    request = Request(url, headers=headers)
    try:
        with _url_opener_from_env(env, url).open(
            request,
            timeout=timeout_seconds,
        ) as response:
            loaded = cast(object, json.loads(response.read().decode("utf-8")))
    except OSError as exc:
        raise ValueError(f"Failed to load ClawHub skill market: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid ClawHub skill market JSON: {exc}") from exc
    payload = _string_key_mapping(loaded)
    if payload is None:
        raise ValueError("ClawHub skill market response must be an object.")
    return payload


def _get_clawhub_text(
    *,
    path: str,
    params: Mapping[str, str],
    token: str | None,
    config_dir: Path | None,
    timeout_seconds: float,
    max_bytes: int,
) -> str:
    env = build_clawhub_subprocess_env(
        token,
        config_dir=config_dir,
        base_env=os.environ,
    )
    registry = _resolve_clawhub_api_registry(env)
    url = _clawhub_api_url(
        registry=registry,
        path=path,
        params=params,
    )
    headers = {
        "Accept": "text/markdown,text/plain,*/*",
        "User-Agent": "relay-teams-clawhub-skill-market",
    }
    resolved_token = normalize_clawhub_token(token) or resolve_clawhub_token_from_env(
        env
    )
    if resolved_token is not None:
        headers["Authorization"] = f"Bearer {resolved_token}"
    request = Request(url, headers=headers)
    try:
        with _url_opener_from_env(env, url).open(
            request,
            timeout=timeout_seconds,
        ) as response:
            payload = response.read(max_bytes + 1)
    except OSError as exc:
        raise ValueError(f"Failed to load ClawHub skill file: {exc}") from exc
    if len(payload) > max_bytes:
        raise ValueError("ClawHub skill file is too large to preview.")
    try:
        return payload.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError("ClawHub skill file is not valid UTF-8.") from exc


def _get_clawhub_bytes(
    *,
    path: str,
    params: Mapping[str, str],
    token: str | None,
    config_dir: Path | None,
    timeout_seconds: float,
    max_bytes: int,
) -> bytes:
    env = build_clawhub_subprocess_env(
        token,
        config_dir=config_dir,
        base_env=os.environ,
    )
    registry = _resolve_clawhub_api_registry(env)
    url = _clawhub_api_url(
        registry=registry,
        path=path,
        params=params,
    )
    headers = {
        "Accept": "application/zip,application/octet-stream",
        "User-Agent": "relay-teams-clawhub-skill-market",
    }
    resolved_token = normalize_clawhub_token(token) or resolve_clawhub_token_from_env(
        env
    )
    if resolved_token is not None:
        headers["Authorization"] = f"Bearer {resolved_token}"
    request = Request(url, headers=headers)
    try:
        with _url_opener_from_env(env, url).open(
            request,
            timeout=timeout_seconds,
        ) as response:
            payload = response.read(max_bytes + 1)
    except OSError as exc:
        raise ValueError(f"Failed to download ClawHub skill package: {exc}") from exc
    if len(payload) > max_bytes:
        raise ValueError("ClawHub skill package is too large to preview.")
    return payload


def _clawhub_api_url(
    *,
    registry: str,
    path: str,
    params: Mapping[str, str],
) -> str:
    base = registry.strip().rstrip("/") or _DEFAULT_CLAWHUB_REGISTRY
    normalized_path = path if path.startswith("/") else f"/{path}"
    query = urlencode(params)
    return f"{base}{normalized_path}?{query}" if query else f"{base}{normalized_path}"


def _url_opener_from_env(
    env: Mapping[str, str],
    target_url: str | None = None,
) -> OpenerDirector:
    handlers: list[ProxyHandler | HTTPSHandler] = [
        ProxyHandler(_urllib_proxy_map_from_env(env, target_url))
    ]
    ssl_context = _ssl_context_from_env(env)
    if ssl_context is not None:
        handlers.append(HTTPSHandler(context=ssl_context))
    return build_opener(*handlers)


def _urllib_proxy_map_from_env(
    env: Mapping[str, str],
    target_url: str | None = None,
) -> dict[str, str]:
    proxy_config = resolve_proxy_env_config(env)
    if target_url is not None and not proxy_applies_to_url(target_url, proxy_config):
        return {}
    proxies: dict[str, str] = {}
    http_proxy = proxy_config.http_proxy or proxy_config.all_proxy
    https_proxy = (
        proxy_config.https_proxy or proxy_config.http_proxy or proxy_config.all_proxy
    )
    all_proxy = proxy_config.all_proxy
    if http_proxy:
        proxies["http"] = http_proxy
    if https_proxy:
        proxies["https"] = https_proxy
    if all_proxy:
        proxies.setdefault("http", all_proxy)
        proxies.setdefault("https", all_proxy)
        proxies["all"] = all_proxy
    return proxies


def _resolve_clawhub_api_registry(env: Mapping[str, str]) -> str:
    return (
        resolve_clawhub_registry_from_env(env)
        or resolve_clawhub_site_from_env(env)
        or _DEFAULT_CLAWHUB_REGISTRY
    )


def _ssl_context_from_env(env: Mapping[str, str]) -> ssl.SSLContext | None:
    proxy_config = resolve_proxy_env_config(env)
    if resolve_ssl_verify(proxy_config=proxy_config):
        return None
    context = ssl.create_default_context()
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    return context


def _normalize_browse_sort(value: str) -> str:
    normalized = value.strip().lower() or "popular"
    api_sort = _BROWSE_SORTS.get(normalized)
    if api_sort is None:
        raise ValueError(
            "Unsupported ClawHub skill market sort. Use popular, downloads, "
            "stars, newest, installsAllTime, or trending."
        )
    return api_sort


def _load_clawhub_version_detail(
    *,
    slug: str,
    version: str,
    token: str | None,
    config_dir: Path | None,
    timeout_seconds: float,
) -> dict[str, object]:
    try:
        payload = _get_clawhub_json(
            path=(
                f"/api/v1/skills/{quote(slug, safe='')}/versions/"
                f"{quote(version, safe='')}"
            ),
            params={},
            token=token,
            config_dir=config_dir,
            timeout_seconds=timeout_seconds,
        )
    except ValueError:
        return {}
    version_payload = _string_key_mapping(payload.get("version"))
    if version_payload is None:
        return {}
    return {
        "changelog": _string_field(version_payload, "changelog"),
        "license": _string_field(version_payload, "license"),
        "files": _parse_api_files(version_payload.get("files")),
    }


def _parse_api_detail_payload(
    payload: Mapping[str, object],
    *,
    fallback_slug: str,
) -> dict[str, object]:
    skill_payload = _string_key_mapping(payload.get("skill")) or {}
    latest_version_payload = _string_key_mapping(payload.get("latestVersion"))
    tags_payload = _string_key_mapping(skill_payload.get("tags"))
    owner_payload = _string_key_mapping(payload.get("owner"))
    version = _nested_string_field(latest_version_payload, "version")
    if version is None:
        version = _nested_string_field(tags_payload, "latest")
    return {
        "slug": _string_field(skill_payload, "slug") or fallback_slug,
        "title": _string_field(skill_payload, "displayName") or fallback_slug,
        "summary": _string_field(skill_payload, "summary") or "",
        "version": version,
        "stats": _parse_api_stats(skill_payload.get("stats")),
        "owner_handle": _nested_string_field(owner_payload, "handle"),
        "owner_display_name": _nested_string_field(owner_payload, "displayName"),
        "owner_image": _nested_string_field(owner_payload, "image"),
        "created_at_ms": _int_or_none(skill_payload, "createdAt"),
        "updated_at_ms": _int_or_none(skill_payload, "updatedAt"),
    }


def _parse_api_files(raw_files: object) -> list[dict[str, object]]:
    if not isinstance(raw_files, list):
        return []
    files: list[dict[str, object]] = []
    for raw_file in raw_files:
        payload = _string_key_mapping(raw_file)
        if payload is None:
            continue
        path = _string_field(payload, "path")
        if path is None:
            continue
        files.append(
            {
                "path": path,
                "size": _int_or_none(payload, "size"),
                "sha256": _string_field(payload, "sha256"),
                "content_type": _string_field(payload, "contentType"),
            }
        )
    return files


def _extract_skill_manifest_from_archive(payload: bytes) -> str:
    try:
        with ZipFile(BytesIO(payload)) as archive:
            manifest_entry = _find_skill_manifest_entry(archive)
            if manifest_entry is None:
                raise ValueError("ClawHub skill package does not contain SKILL.md.")
            if manifest_entry.file_size > _MAX_MARKET_DETAIL_MANIFEST_BYTES:
                raise ValueError("ClawHub skill manifest is too large to preview.")
            with archive.open(manifest_entry) as stream:
                content = stream.read(_MAX_MARKET_DETAIL_MANIFEST_BYTES + 1)
    except BadZipFile as exc:
        raise ValueError("ClawHub skill package is not a valid zip archive.") from exc
    if len(content) > _MAX_MARKET_DETAIL_MANIFEST_BYTES:
        raise ValueError("ClawHub skill manifest is too large to preview.")
    try:
        return content.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError("ClawHub skill manifest is not valid UTF-8.") from exc


def _find_skill_manifest_entry(archive: ZipFile) -> ZipInfo | None:
    for entry in archive.infolist():
        normalized_path = entry.filename.replace("\\", "/").strip("/")
        if normalized_path == "SKILL.md":
            return entry
    return None


def _parse_api_search_items(raw_items: list[object]) -> list[dict[str, object]]:
    items: list[dict[str, object]] = []
    for raw_item in raw_items:
        payload = _string_key_mapping(raw_item)
        if payload is None:
            continue
        item = _parse_api_search_item(payload)
        if item is not None:
            items.append(item)
    return items


def _parse_api_search_item(payload: Mapping[str, object]) -> dict[str, object] | None:
    slug = _string_field(payload, "slug")
    if slug is None:
        return None
    owner_payload = _string_key_mapping(payload.get("owner"))
    return {
        "slug": slug,
        "title": _string_field(payload, "displayName") or slug,
        "summary": _string_field(payload, "summary") or "",
        "version": _string_field(payload, "version"),
        "score": _float_field(payload, "score"),
        "stats": None,
        "owner_handle": _string_field(payload, "ownerHandle")
        or _nested_string_field(owner_payload, "handle"),
        "owner_display_name": _nested_string_field(owner_payload, "displayName"),
        "owner_image": _nested_string_field(owner_payload, "image"),
        "created_at_ms": None,
        "updated_at_ms": _int_or_none(payload, "updatedAt"),
    }


def _parse_api_browse_items(raw_items: list[object]) -> list[dict[str, object]]:
    items: list[dict[str, object]] = []
    for raw_item in raw_items:
        payload = _string_key_mapping(raw_item)
        if payload is None:
            continue
        item = _parse_api_browse_item(payload)
        if item is not None:
            items.append(item)
    return items


def _parse_api_browse_item(payload: Mapping[str, object]) -> dict[str, object] | None:
    slug = _string_field(payload, "slug")
    if slug is None:
        return None
    latest_version_payload = _string_key_mapping(payload.get("latestVersion"))
    tags_payload = _string_key_mapping(payload.get("tags"))
    version = _nested_string_field(latest_version_payload, "version")
    if version is None:
        version = _nested_string_field(tags_payload, "latest")
    return {
        "slug": slug,
        "title": _string_field(payload, "displayName") or slug,
        "summary": _string_field(payload, "summary") or "",
        "version": version,
        "score": None,
        "stats": _parse_api_stats(payload.get("stats")),
        "owner_handle": None,
        "owner_display_name": None,
        "owner_image": None,
        "created_at_ms": _int_or_none(payload, "createdAt"),
        "updated_at_ms": _int_or_none(payload, "updatedAt"),
    }


def _parse_api_stats(raw_stats: object) -> dict[str, object] | None:
    stats = _string_key_mapping(raw_stats)
    if stats is None:
        return None
    return {
        "comments": _int_or_none(stats, "comments"),
        "downloads": _int_or_none(stats, "downloads"),
        "installs_all_time": _int_or_none(stats, "installsAllTime"),
        "installs_current": _int_or_none(stats, "installsCurrent"),
        "stars": _int_or_none(stats, "stars"),
        "versions": _int_or_none(stats, "versions"),
    }


def _build_install_result(
    *,
    ok: bool,
    slug: str,
    requested_version: str | None,
    checked_at: datetime,
    started: float,
    binary_available: bool,
    token_configured: bool,
    clawhub_path: Path | None = None,
    installed_skill: dict[str, object] | None = None,
    installation_attempted: bool = False,
    installed_during_install: bool = False,
    registry: str | None = None,
    endpoint_fallback_used: bool = False,
    workdir: Path | None = None,
    retryable: bool = False,
    error_code: str | None = None,
    error_message: str | None = None,
) -> dict[str, object]:
    return {
        "ok": ok,
        "slug": slug,
        "requested_version": requested_version,
        "installed_skill": installed_skill,
        "clawhub_path": None if clawhub_path is None else str(clawhub_path),
        "latency_ms": max(0, int((perf_counter() - started) * 1000)),
        "checked_at": _serialize_datetime(checked_at),
        "diagnostics": {
            "binary_available": binary_available,
            "token_configured": token_configured,
            "installation_attempted": installation_attempted,
            "installed_during_install": installed_during_install,
            "registry": registry,
            "endpoint_fallback_used": endpoint_fallback_used,
            "workdir": None if workdir is None else str(workdir),
            "skills_reloaded": False,
        },
        "retryable": retryable,
        "error_code": error_code,
        "error_message": error_message,
    }


def _load_installed_skill_summary(
    *,
    config_dir: Path,
    skill_id: str,
) -> dict[str, object] | None:
    try:
        detail = ClawHubSkillService(config_dir=config_dir).get_skill(skill_id)
    except (KeyError, ValueError):
        return None
    payload = detail.model_dump(mode="json")
    return {
        "skill_id": payload["skill_id"],
        "runtime_name": payload["runtime_name"],
        "description": payload["description"],
        "ref": payload["ref"],
        "source": payload["source"],
        "directory": payload["directory"],
        "manifest_path": payload["manifest_path"],
        "valid": payload["valid"],
        "error": payload["error"],
    }


def _parse_search_output(raw_output: str) -> list[dict[str, object]]:
    items: list[dict[str, object]] = []
    saw_unparseable_result_line = False
    for raw_line in raw_output.splitlines():
        normalized_line = raw_line.strip()
        if not normalized_line or normalized_line.startswith("- Searching"):
            continue
        parsed = _parse_search_line(normalized_line)
        if parsed is None:
            saw_unparseable_result_line = True
            continue
        items.append(parsed)
    if items:
        return items
    if saw_unparseable_result_line:
        raise ValueError("ClawHub search returned an unexpected output format.")
    return []


def _parse_search_line(raw_line: str) -> dict[str, object] | None:
    match = _SEARCH_LINE_RE.match(raw_line)
    if match is None:
        return None
    score_text = match.group("score")
    score = float(score_text) if score_text else None
    version = match.group("version")
    return {
        "slug": match.group("slug"),
        "title": match.group("title"),
        "version": version,
        "score": score,
    }


def _parse_explore_output(raw_output: str) -> list[dict[str, object]]:
    payload = _parse_json_payload(raw_output)
    raw_items = payload.get("items")
    if not isinstance(raw_items, list):
        return []
    items: list[dict[str, object]] = []
    for raw_item in raw_items:
        item_payload = _string_key_mapping(raw_item)
        if item_payload is None:
            continue
        item = _parse_explore_item(item_payload)
        if item is not None:
            items.append(item)
    return items


def _parse_explore_item(payload: Mapping[str, object]) -> dict[str, object] | None:
    slug = _string_field(payload, "slug")
    if slug is None:
        return None
    latest_version_payload = _string_key_mapping(payload.get("latestVersion"))
    tags_payload = _string_key_mapping(payload.get("tags"))
    version = None
    if latest_version_payload is not None:
        version = _string_field(latest_version_payload, "version")
    if version is None and tags_payload is not None:
        version = _string_field(tags_payload, "latest")
    return {
        "slug": slug,
        "title": _string_field(payload, "displayName") or slug,
        "version": version,
        "score": None,
    }


def _parse_json_payload(raw_output: str) -> Mapping[str, object]:
    start_index = raw_output.find("{")
    if start_index < 0:
        raise ValueError("ClawHub explore returned an unexpected output format.")
    try:
        loaded = cast(object, json.loads(raw_output[start_index:]))
    except json.JSONDecodeError as exc:
        raise ValueError(
            "ClawHub explore returned an unexpected output format."
        ) from exc
    payload = _string_key_mapping(loaded)
    if payload is None:
        raise ValueError("ClawHub explore returned an unexpected output format.")
    return payload


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


def _nested_string_field(
    payload: Mapping[str, object] | None,
    key: str,
) -> str | None:
    if payload is None:
        return None
    return _string_field(payload, key)


def _int_or_none(payload: Mapping[str, object], key: str) -> int | None:
    value = payload.get(key)
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    return None


def _float_field(payload: Mapping[str, object], key: str) -> float | None:
    value = payload.get(key)
    if isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        return float(value)
    return None


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized_value = value.strip()
    return normalized_value or None


def _normalize_installable_slug(value: str) -> str:
    normalized_value = value.strip()
    if not normalized_value:
        raise ValueError("ClawHub skill slug cannot be blank.")
    if not _INSTALLABLE_SKILL_SLUG_PATTERN.fullmatch(normalized_value):
        raise ValueError(
            "Unsupported ClawHub skill slug. Use letters, digits, '.', '_', or '-'."
        )
    return normalized_value


def _serialize_datetime(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")


def _prepend_to_path(existing_path: str | None, directory: Path) -> str:
    path_parts = [str(directory)]
    if existing_path:
        path_parts.append(existing_path)
    return _PATH_LIST_SEPARATOR.join(path_parts)


def _first_meaningful_line(*chunks: str) -> str | None:
    for chunk in chunks:
        for line in chunk.splitlines():
            normalized_line = line.strip()
            if normalized_line:
                return normalized_line
    return None
