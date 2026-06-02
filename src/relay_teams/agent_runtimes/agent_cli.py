# -*- coding: utf-8 -*-
from __future__ import annotations

from collections.abc import Callable
from enum import Enum
import json
from urllib.parse import quote

import typer

type RequestJsonCallable = Callable[
    [str, str, str, dict[str, object] | None], dict[str, object] | list[object]
]
type AutoStartCallable = Callable[[str, bool, bool, bool], None]


class AgentOutputFormat(str, Enum):
    TABLE = "table"
    JSON = "json"


def build_agent_runtimes_app(
    *,
    request_json: RequestJsonCallable,
    auto_start_if_needed: AutoStartCallable,
    default_base_url: str,
) -> typer.Typer:
    agent_runtimes_app = typer.Typer(
        no_args_is_help=True,
        pretty_exceptions_enable=False,
    )
    registry_app = typer.Typer(
        no_args_is_help=True,
        pretty_exceptions_enable=False,
    )

    @agent_runtimes_app.command("list")
    def agent_runtimes_list(
        output_format: AgentOutputFormat = typer.Option(
            AgentOutputFormat.TABLE,
            "--format",
            help="Render as an ASCII table or JSON.",
            case_sensitive=False,
        ),
        base_url: str = typer.Option(default_base_url, "--base-url"),
        autostart: bool = typer.Option(True, "--autostart/--no-autostart"),
        daemon: bool = typer.Option(
            False,
            "--daemon",
            "-d",
            help="Run the server as a background process when autostarting.",
        ),
        force: bool = typer.Option(
            False,
            "--force",
            help="Force kill any existing server process before autostarting.",
        ),
    ) -> None:
        auto_start_if_needed(base_url, autostart, daemon, force)
        payload = request_json(
            base_url,
            "GET",
            "/api/system/configs/agent-runtimes",
            None,
        )
        items = _require_list_response(payload, "/api/system/configs/agent-runtimes")
        if output_format == AgentOutputFormat.JSON:
            typer.echo(json.dumps(items, ensure_ascii=False))
            return
        _render_agent_summary_table(items)

    @agent_runtimes_app.command("get")
    def agent_runtimes_get(
        agent_id: str = typer.Argument(..., help="Agent runtime id."),
        output_format: AgentOutputFormat = typer.Option(
            AgentOutputFormat.TABLE,
            "--format",
            help="Render as an ASCII table or JSON.",
            case_sensitive=False,
        ),
        base_url: str = typer.Option(default_base_url, "--base-url"),
        autostart: bool = typer.Option(True, "--autostart/--no-autostart"),
        daemon: bool = typer.Option(
            False,
            "--daemon",
            "-d",
            help="Run the server as a background process when autostarting.",
        ),
        force: bool = typer.Option(
            False,
            "--force",
            help="Force kill any existing server process before autostarting.",
        ),
    ) -> None:
        auto_start_if_needed(base_url, autostart, daemon, force)
        payload = request_json(
            base_url,
            "GET",
            _agent_runtime_path(agent_id),
            None,
        )
        data = _require_object_response(payload, _agent_runtime_path(agent_id))
        if output_format == AgentOutputFormat.JSON:
            typer.echo(json.dumps(data, ensure_ascii=False))
            return
        _render_agent_detail(data)

    @agent_runtimes_app.command("save")
    def agent_runtimes_save(
        agent_id: str = typer.Argument(..., help="Agent runtime id."),
        config_json: str = typer.Option(
            ...,
            "--config-json",
            help="Full agent runtime config JSON payload.",
        ),
        base_url: str = typer.Option(default_base_url, "--base-url"),
        autostart: bool = typer.Option(True, "--autostart/--no-autostart"),
        daemon: bool = typer.Option(
            False,
            "--daemon",
            "-d",
            help="Run the server as a background process when autostarting.",
        ),
        force: bool = typer.Option(
            False,
            "--force",
            help="Force kill any existing server process before autostarting.",
        ),
    ) -> None:
        auto_start_if_needed(base_url, autostart, daemon, force)
        payload = _parse_config_json(config_json)
        result = request_json(
            base_url,
            "PUT",
            _agent_runtime_path(agent_id),
            payload,
        )
        typer.echo(
            json.dumps(
                _require_object_response(result, "agent-runtimes save"),
                ensure_ascii=False,
            )
        )

    @agent_runtimes_app.command("delete")
    def agent_runtimes_delete(
        agent_id: str = typer.Argument(..., help="Agent runtime id."),
        base_url: str = typer.Option(default_base_url, "--base-url"),
        autostart: bool = typer.Option(True, "--autostart/--no-autostart"),
        daemon: bool = typer.Option(
            False,
            "--daemon",
            "-d",
            help="Run the server as a background process when autostarting.",
        ),
        force: bool = typer.Option(
            False,
            "--force",
            help="Force kill any existing server process before autostarting.",
        ),
    ) -> None:
        auto_start_if_needed(base_url, autostart, daemon, force)
        result = request_json(
            base_url,
            "DELETE",
            _agent_runtime_path(agent_id),
            None,
        )
        typer.echo(
            json.dumps(
                _require_object_response(result, "agent-runtimes delete"),
                ensure_ascii=False,
            )
        )

    @agent_runtimes_app.command("test")
    def agent_runtimes_test(
        agent_id: str = typer.Argument(..., help="Agent runtime id."),
        output_format: AgentOutputFormat = typer.Option(
            AgentOutputFormat.TABLE,
            "--format",
            help="Render as an ASCII table or JSON.",
            case_sensitive=False,
        ),
        base_url: str = typer.Option(default_base_url, "--base-url"),
        autostart: bool = typer.Option(True, "--autostart/--no-autostart"),
        daemon: bool = typer.Option(
            False,
            "--daemon",
            "-d",
            help="Run the server as a background process when autostarting.",
        ),
        force: bool = typer.Option(
            False,
            "--force",
            help="Force kill any existing server process before autostarting.",
        ),
    ) -> None:
        auto_start_if_needed(base_url, autostart, daemon, force)
        payload = request_json(
            base_url,
            "POST",
            _agent_runtime_path(agent_id, suffix=":test"),
            None,
        )
        data = _require_object_response(
            payload, _agent_runtime_path(agent_id, suffix=":test")
        )
        if output_format == AgentOutputFormat.JSON:
            typer.echo(json.dumps(data, ensure_ascii=False))
            return
        _render_test_result(agent_id, data)

    @registry_app.command("list")
    def agent_runtime_registry_list(
        refresh: bool = typer.Option(
            False,
            "--refresh",
            help="Refresh the official ACP registry before listing.",
        ),
        output_format: AgentOutputFormat = typer.Option(
            AgentOutputFormat.TABLE,
            "--format",
            help="Render as an ASCII table or JSON.",
            case_sensitive=False,
        ),
        base_url: str = typer.Option(default_base_url, "--base-url"),
        autostart: bool = typer.Option(True, "--autostart/--no-autostart"),
        daemon: bool = typer.Option(
            False,
            "--daemon",
            "-d",
            help="Run the server as a background process when autostarting.",
        ),
        force: bool = typer.Option(
            False,
            "--force",
            help="Force kill any existing server process before autostarting.",
        ),
    ) -> None:
        auto_start_if_needed(base_url, autostart, daemon, force)
        path = "/api/system/configs/agent-runtime-registry"
        if refresh:
            path = f"{path}?refresh=true"
        payload = request_json(base_url, "GET", path, None)
        data = _require_object_response(payload, path)
        if output_format == AgentOutputFormat.JSON:
            typer.echo(json.dumps(data, ensure_ascii=False))
            return
        _render_registry_catalog(data)

    @registry_app.command("refresh")
    def agent_runtime_registry_refresh(
        output_format: AgentOutputFormat = typer.Option(
            AgentOutputFormat.TABLE,
            "--format",
            help="Render as an ASCII table or JSON.",
            case_sensitive=False,
        ),
        base_url: str = typer.Option(default_base_url, "--base-url"),
        autostart: bool = typer.Option(True, "--autostart/--no-autostart"),
        daemon: bool = typer.Option(
            False,
            "--daemon",
            "-d",
            help="Run the server as a background process when autostarting.",
        ),
        force: bool = typer.Option(
            False,
            "--force",
            help="Force kill any existing server process before autostarting.",
        ),
    ) -> None:
        auto_start_if_needed(base_url, autostart, daemon, force)
        path = "/api/system/configs/agent-runtime-registry:refresh"
        payload = request_json(base_url, "POST", path, None)
        data = _require_object_response(payload, path)
        if output_format == AgentOutputFormat.JSON:
            typer.echo(json.dumps(data, ensure_ascii=False))
            return
        _render_registry_catalog(data)

    @registry_app.command("install")
    def agent_runtime_registry_install(
        registry_id: str = typer.Argument(..., help="ACP registry agent id."),
        agent_id: str = typer.Option(
            "",
            "--agent-id",
            help="Saved runtime id. Defaults to the registry id.",
        ),
        distribution: str = typer.Option(
            "",
            "--distribution",
            help=(
                "Distribution preference: auto, binary, npx, or uvx. "
                "Omitted updates preserve the saved preference."
            ),
        ),
        env_json: str | None = typer.Option(
            None,
            "--env-json",
            help="User environment bindings as a JSON object.",
        ),
        output_format: AgentOutputFormat = typer.Option(
            AgentOutputFormat.TABLE,
            "--format",
            help="Render as an ASCII table or JSON.",
            case_sensitive=False,
        ),
        base_url: str = typer.Option(default_base_url, "--base-url"),
        autostart: bool = typer.Option(True, "--autostart/--no-autostart"),
        daemon: bool = typer.Option(
            False,
            "--daemon",
            "-d",
            help="Run the server as a background process when autostarting.",
        ),
        force: bool = typer.Option(
            False,
            "--force",
            help="Force kill any existing server process before autostarting.",
        ),
    ) -> None:
        auto_start_if_needed(base_url, autostart, daemon, force)
        payload: dict[str, object] = {}
        normalized_distribution = distribution.strip()
        if normalized_distribution:
            payload["distribution"] = normalized_distribution
        if env_json is not None:
            payload["env"] = _parse_env_json(env_json)
        normalized_agent_id = agent_id.strip()
        if normalized_agent_id:
            payload["agent_id"] = normalized_agent_id
        path = _agent_runtime_registry_install_path(registry_id)
        result = request_json(base_url, "POST", path, payload)
        data = _require_object_response(result, path)
        if output_format == AgentOutputFormat.JSON:
            typer.echo(json.dumps(data, ensure_ascii=False))
            return
        _render_registry_install_result(data)

    agent_runtimes_app.add_typer(
        registry_app,
        name="registry",
        help="Inspect and install ACP registry runtimes.",
    )
    return agent_runtimes_app


def _agent_runtime_path(agent_id: str, *, suffix: str = "") -> str:
    encoded_agent_id = quote(agent_id, safe="")
    return f"/api/system/configs/agent-runtimes/{encoded_agent_id}{suffix}"


def _agent_runtime_registry_install_path(registry_id: str) -> str:
    encoded_registry_id = quote(registry_id, safe="")
    return f"/api/system/configs/agent-runtime-registry/{encoded_registry_id}:install"


def _parse_config_json(raw: str) -> dict[str, object]:
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise typer.BadParameter("--config-json must be valid JSON") from exc
    if not isinstance(parsed, dict):
        raise typer.BadParameter("--config-json must be a JSON object")
    return {str(key): value for key, value in parsed.items()}


def _parse_env_json(raw: str) -> dict[str, str]:
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise typer.BadParameter("--env-json must be valid JSON") from exc
    if not isinstance(parsed, dict):
        raise typer.BadParameter("--env-json must be a JSON object")
    return {str(key): str(value) for key, value in parsed.items()}


def _require_list_response(
    payload: dict[str, object] | list[object], path: str
) -> list[dict[str, object]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    raise RuntimeError(f"Expected JSON array from {path}")


def _require_object_response(
    payload: dict[str, object] | list[object], path: str
) -> dict[str, object]:
    if isinstance(payload, dict):
        return payload
    raise RuntimeError(f"Expected JSON object from {path}")


def _render_agent_summary_table(items: list[dict[str, object]]) -> None:
    if not items:
        typer.echo("No agent runtimes configured.")
        return
    id_width = max(
        len("Agent ID"), *(len(str(item.get("agent_id") or "")) for item in items)
    )
    name_width = max(len("Name"), *(len(str(item.get("name") or "")) for item in items))
    protocol_width = max(
        len("Protocol"),
        *(len(str(item.get("protocol") or "")) for item in items),
    )
    transport_width = max(
        len("Transport"),
        *(len(str(item.get("transport") or "")) for item in items),
    )
    border = (
        f"+-{'-' * id_width}-+-{'-' * name_width}-+-{'-' * protocol_width}-+-"
        f"{'-' * transport_width}-+"
    )
    typer.echo(border)
    typer.echo(
        f"| {'Agent ID'.ljust(id_width)} | {'Name'.ljust(name_width)} | "
        f"{'Protocol'.ljust(protocol_width)} | "
        f"{'Transport'.ljust(transport_width)} |"
    )
    typer.echo(border)
    for item in items:
        typer.echo(
            f"| {str(item.get('agent_id') or '').ljust(id_width)} | "
            f"{str(item.get('name') or '').ljust(name_width)} | "
            f"{str(item.get('protocol') or '').ljust(protocol_width)} | "
            f"{str(item.get('transport') or '').ljust(transport_width)} |"
        )
    typer.echo(border)


def _render_agent_detail(item: dict[str, object]) -> None:
    typer.echo(f"Agent ID: {item.get('agent_id', '')}")
    typer.echo(f"Name: {item.get('name', '')}")
    typer.echo(f"Description: {item.get('description', '')}")
    typer.echo(f"Protocol: {item.get('protocol', 'acp')}")
    transport = item.get("transport")
    if isinstance(transport, dict):
        typer.echo(f"Transport: {transport.get('transport', '')}")
        typer.echo(json.dumps(transport, ensure_ascii=False, indent=2))
        return
    typer.echo(f"Transport: {transport}")


def _render_test_result(agent_id: str, item: dict[str, object]) -> None:
    typer.echo(f"Agent Runtime: {agent_id}")
    typer.echo(f"OK: {item.get('ok', False)}")
    typer.echo(f"Protocol: {item.get('protocol', 'acp')}")
    message = str(item.get("message") or "").strip()
    if message:
        typer.echo(f"Message: {message}")
    if item.get("agent_name"):
        typer.echo(f"Agent Name: {item.get('agent_name')}")
    if item.get("agent_version"):
        typer.echo(f"Agent Version: {item.get('agent_version')}")
    if item.get("protocol_version") is not None:
        typer.echo(f"Protocol Version: {item.get('protocol_version')}")
    if item.get("protocol_version_text"):
        typer.echo(f"Protocol Version: {item.get('protocol_version_text')}")


def _render_registry_catalog(item: dict[str, object]) -> None:
    agents = item.get("agents")
    if not isinstance(agents, list) or not agents:
        typer.echo("No ACP registry agents available.")
        return
    version = str(item.get("registry_version") or "")
    if version:
        typer.echo(f"ACP Registry: {version}")
    error_message = str(item.get("error_message") or "").strip()
    if error_message:
        typer.echo(f"Cache warning: {error_message}")
    rows = [agent for agent in agents if isinstance(agent, dict)]
    id_width = max(
        len("Registry ID"),
        *(len(str(row.get("registry_id") or "")) for row in rows),
    )
    name_width = max(len("Name"), *(len(str(row.get("name") or "")) for row in rows))
    distribution_width = max(
        len("Distributions"),
        *(len(_join_registry_distributions(row.get("distributions"))) for row in rows),
    )
    status_width = len("Status")
    border = (
        f"+-{'-' * id_width}-+-{'-' * name_width}-+-"
        f"{'-' * distribution_width}-+-{'-' * status_width}-+"
    )
    typer.echo(border)
    typer.echo(
        f"| {'Registry ID'.ljust(id_width)} | {'Name'.ljust(name_width)} | "
        f"{'Distributions'.ljust(distribution_width)} | {'Status'.ljust(status_width)} |"
    )
    typer.echo(border)
    for row in rows:
        status = _registry_status(row)
        typer.echo(
            f"| {str(row.get('registry_id') or '').ljust(id_width)} | "
            f"{str(row.get('name') or '').ljust(name_width)} | "
            f"{_join_registry_distributions(row.get('distributions')).ljust(distribution_width)} | "
            f"{status.ljust(status_width)} |"
        )
    typer.echo(border)


def _render_registry_install_result(item: dict[str, object]) -> None:
    agent = item.get("agent")
    registry_agent = item.get("registry_agent")
    if isinstance(agent, dict):
        typer.echo(f"Agent Runtime: {agent.get('agent_id', '')}")
        typer.echo(f"Name: {agent.get('name', '')}")
        transport = agent.get("transport")
        if isinstance(transport, dict):
            typer.echo(f"Registry ID: {transport.get('registry_id', '')}")
            typer.echo(f"Distribution: {transport.get('distribution', 'auto')}")
    if isinstance(registry_agent, dict):
        typer.echo(f"Registry Agent: {registry_agent.get('name', '')}")
        selected = registry_agent.get("selected_distribution")
        if selected:
            typer.echo(f"Selected Distribution: {selected}")
    message = str(item.get("message") or "").strip()
    if message:
        typer.echo(f"Message: {message}")


def _join_registry_distributions(value: object) -> str:
    if not isinstance(value, list):
        return ""
    return ", ".join(str(item) for item in value)


def _registry_status(row: dict[str, object]) -> str:
    if row.get("update_available"):
        return "Update"
    if row.get("installed"):
        return "Installed"
    return "Available"
