# -*- coding: utf-8 -*-
from __future__ import annotations

import ipaddress
from urllib.parse import urlparse

import httpx

from relay_teams.env.proxy_env import ProxyEnvConfig, load_proxy_env_config
from relay_teams.net.constants import DEFAULT_HTTP_CONNECT_TIMEOUT_SECONDS
from relay_teams.net.clients import create_async_http_client

_LOCAL_SERVER_NAMES = frozenset({"localhost"})


def is_local_server_host(host: str) -> bool:
    normalized = host.strip("[]").lower()
    if normalized in _LOCAL_SERVER_NAMES:
        return True
    try:
        address = ipaddress.ip_address(normalized)
    except ValueError:
        return False
    return address.is_loopback or address.is_unspecified


def is_local_server_base_url(base_url: str) -> bool:
    parsed = urlparse(base_url)
    host = parsed.hostname
    return host is not None and is_local_server_host(host)


def create_cli_http_client(
    *,
    base_url: str,
    timeout_seconds: float,
    connect_timeout_seconds: float | None = None,
) -> httpx.AsyncClient:
    timeout = httpx.Timeout(
        timeout=timeout_seconds,
        connect=DEFAULT_HTTP_CONNECT_TIMEOUT_SECONDS
        if connect_timeout_seconds is None
        else connect_timeout_seconds,
    )
    if is_local_server_base_url(base_url):
        return create_async_http_client(
            proxy_config=ProxyEnvConfig(),
            timeout=timeout,
        )
    return create_async_http_client(
        proxy_config=load_proxy_env_config(),
        timeout=timeout,
    )
