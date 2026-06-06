from __future__ import annotations

import json
import os
from enum import Enum
from pathlib import Path

import httpx
from pydantic import BaseModel, ConfigDict, Field, JsonValue


class SessionMode(str, Enum):
    NORMAL = "normal"
    ORCHESTRATION = "orchestration"


class RelayTokenUsage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    input_tokens: int = 0
    cached_input_tokens: int = 0
    output_tokens: int = 0
    reasoning_output_tokens: int = 0
    total_tokens: int = 0
    requests: int = 0
    tool_calls: int = 0

    def merge_payload(self, payload: dict[str, JsonValue]) -> RelayTokenUsage:
        return RelayTokenUsage(
            input_tokens=self.input_tokens + _int_field(payload, "input_tokens"),
            cached_input_tokens=(
                self.cached_input_tokens + _int_field(payload, "cached_input_tokens")
            ),
            output_tokens=self.output_tokens + _int_field(payload, "output_tokens"),
            reasoning_output_tokens=(
                self.reasoning_output_tokens
                + _int_field(payload, "reasoning_output_tokens")
            ),
            total_tokens=self.total_tokens + _int_field(payload, "total_tokens"),
            requests=self.requests + _int_field(payload, "requests"),
            tool_calls=self.tool_calls + _int_field(payload, "tool_calls"),
        )


class RelayRunResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str
    run_id: str
    session_id: str
    terminal_event_type: str
    terminal_payload: dict[str, JsonValue] = Field(default_factory=dict)
    token_usage: RelayTokenUsage = Field(default_factory=RelayTokenUsage)
    event_count: int = 0


class RelayTeamsClientConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    base_url: str = "http://127.0.0.1:8000"
    timeout_seconds: float = 900.0
    session_mode: SessionMode = SessionMode.NORMAL
    normal_root_role_id: str | None = None
    orchestration_preset_id: str | None = None
    workspace_path: Path | None = None
    yolo: bool = True
    shell_safety_policy_enabled: bool | None = None
    host_header: str | None = None


class RelayTeamsHttpClient:
    def __init__(self, config: RelayTeamsClientConfig):
        self._config = config

    @classmethod
    def from_env(cls) -> RelayTeamsHttpClient:
        workspace = _optional_path(os.environ.get("RELAY_TEAMS_BENCH_WORKSPACE"))
        return cls(
            RelayTeamsClientConfig(
                base_url=os.environ.get(
                    "RELAY_TEAMS_BENCH_BASE_URL",
                    "http://127.0.0.1:8000",
                ),
                timeout_seconds=_float_env("RELAY_TEAMS_BENCH_TIMEOUT_SECONDS", 900.0),
                session_mode=SessionMode(
                    os.environ.get("RELAY_TEAMS_BENCH_SESSION_MODE", "normal")
                ),
                normal_root_role_id=_optional_text(
                    os.environ.get("RELAY_TEAMS_BENCH_ROLE_ID")
                ),
                orchestration_preset_id=_optional_text(
                    os.environ.get("RELAY_TEAMS_BENCH_ORCHESTRATION_ID")
                ),
                workspace_path=workspace,
                yolo=_bool_env("RELAY_TEAMS_BENCH_YOLO", True),
                shell_safety_policy_enabled=_optional_bool_env(
                    "RELAY_TEAMS_BENCH_SHELL_SAFETY_POLICY_ENABLED"
                ),
                host_header=_optional_text(
                    os.environ.get("RELAY_TEAMS_BENCH_HOST_HEADER")
                ),
            )
        )

    def run_prompt(
        self,
        prompt: str,
        *,
        session_id: str | None = None,
        timeout_seconds: float | None = None,
    ) -> RelayRunResult:
        resolved_timeout_seconds = (
            timeout_seconds
            if timeout_seconds is not None
            else self._config.timeout_seconds
        )
        bounded_timeout_seconds = max(resolved_timeout_seconds, 0.001)
        timeout = httpx.Timeout(
            bounded_timeout_seconds,
            connect=min(30.0, bounded_timeout_seconds),
        )
        headers = (
            {"Host": self._config.host_header}
            if self._config.host_header is not None
            else None
        )
        with httpx.Client(
            base_url=self._config.base_url.rstrip("/"),
            timeout=timeout,
            headers=headers,
        ) as client:
            resolved_session_id = session_id or self._create_session(client)
            if session_id is None:
                self._configure_session(client, resolved_session_id)
            run_id = self._create_run(client, resolved_session_id, prompt)
            result = self._stream_run(client, run_id, resolved_session_id)
        return result

    def _create_session(self, client: httpx.Client) -> str:
        payload: dict[str, object] = {}
        workspace_id = self._pick_workspace(client)
        if workspace_id is not None:
            payload["workspace_id"] = workspace_id
        response = client.post("/api/sessions", json=payload)
        response.raise_for_status()
        body = _json_object(response.json(), "/api/sessions")
        return _required_str(body, "session_id")

    def _pick_workspace(self, client: httpx.Client) -> str | None:
        if self._config.workspace_path is None:
            return None
        response = client.post(
            "/api/workspaces/pick",
            json={"root_path": self._config.workspace_path.as_posix()},
        )
        response.raise_for_status()
        body = _json_object(response.json(), "/api/workspaces/pick")
        nested_workspace = body.get("workspace")
        if isinstance(nested_workspace, dict):
            return _required_str(nested_workspace, "workspace_id")
        return _required_str(body, "workspace_id")

    def _configure_session(self, client: httpx.Client, session_id: str) -> None:
        payload: dict[str, object] = {
            "session_mode": self._config.session_mode.value,
        }
        if self._config.normal_root_role_id is not None:
            payload["normal_root_role_id"] = self._config.normal_root_role_id
        if self._config.orchestration_preset_id is not None:
            payload["orchestration_preset_id"] = self._config.orchestration_preset_id
        response = client.patch(f"/api/sessions/{session_id}/topology", json=payload)
        response.raise_for_status()

    def _create_run(self, client: httpx.Client, session_id: str, prompt: str) -> str:
        payload: dict[str, object] = {
            "session_id": session_id,
            "input": [{"kind": "text", "text": prompt}],
            "execution_mode": "ai",
            "yolo": self._config.yolo,
        }
        if self._config.shell_safety_policy_enabled is not None:
            payload["shell_safety_policy_enabled"] = (
                self._config.shell_safety_policy_enabled
            )
        response = client.post("/api/runs", json=payload)
        response.raise_for_status()
        body = _json_object(response.json(), "/api/runs")
        return _required_str(body, "run_id")

    @staticmethod
    def _stream_run(
        client: httpx.Client,
        run_id: str,
        session_id: str,
    ) -> RelayRunResult:
        text_parts: list[str] = []
        token_usage = RelayTokenUsage()
        event_count = 0
        terminal_event_type = "stream_ended"
        terminal_payload: dict[str, JsonValue] = {}
        with client.stream(
            "GET",
            f"/api/runs/{run_id}/events",
            headers={"Accept": "text/event-stream"},
        ) as response:
            response.raise_for_status()
            for raw_line in response.iter_lines():
                event = parse_sse_event_line(raw_line)
                if event is None:
                    continue
                event_count += 1
                event_type = str(event.get("event_type") or "")
                payload = event_payload(event)
                if event_type == "text_delta":
                    text_parts.append(_text_delta(payload))
                elif event_type == "token_usage":
                    token_usage = token_usage.merge_payload(payload)
                elif event_type in {"run_completed", "run_failed", "run_stopped"}:
                    terminal_event_type = event_type
                    terminal_payload = payload
                    break
        return RelayRunResult(
            text="".join(text_parts),
            run_id=run_id,
            session_id=session_id,
            terminal_event_type=terminal_event_type,
            terminal_payload=terminal_payload,
            token_usage=token_usage,
            event_count=event_count,
        )


def parse_sse_event_line(raw_line: str) -> dict[str, JsonValue] | None:
    line = raw_line.strip()
    if not line.startswith("data:"):
        return None
    payload = line[5:].strip()
    if not payload:
        return None
    decoded = json.loads(payload)
    if not isinstance(decoded, dict):
        return None
    return decoded


def event_payload(event: dict[str, JsonValue]) -> dict[str, JsonValue]:
    payload_json = event.get("payload_json")
    if isinstance(payload_json, str) and payload_json.strip():
        decoded = json.loads(payload_json)
        if isinstance(decoded, dict):
            return decoded
    payload = event.get("payload")
    if isinstance(payload, dict):
        return payload
    return {}


def _text_delta(payload: dict[str, JsonValue]) -> str:
    for key in ("text", "content", "delta"):
        value = payload.get(key)
        if isinstance(value, str):
            return value
    return ""


def _json_object(value: object, endpoint: str) -> dict[str, JsonValue]:
    if not isinstance(value, dict):
        raise RuntimeError(f"Expected object response from {endpoint}: {value!r}")
    return value


def _required_str(value: dict[str, JsonValue], key: str) -> str:
    result = value.get(key)
    if not isinstance(result, str) or not result:
        raise RuntimeError(f"Expected string field {key!r}: {value!r}")
    return result


def _int_field(payload: dict[str, JsonValue], key: str) -> int:
    value = payload.get(key)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str) and value.isdigit():
        return int(value)
    return 0


def _optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _optional_path(value: str | None) -> Path | None:
    stripped = _optional_text(value)
    if stripped is None:
        return None
    return Path(stripped).expanduser()


def _float_env(name: str, default: float) -> float:
    value = _optional_text(os.environ.get(name))
    if value is None:
        return default
    return float(value)


def _bool_env(name: str, default: bool) -> bool:
    value = _optional_text(os.environ.get(name))
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "y", "on"}


def _optional_bool_env(name: str) -> bool | None:
    value = _optional_text(os.environ.get(name))
    if value is None:
        return None
    return value.lower() in {"1", "true", "yes", "y", "on"}
