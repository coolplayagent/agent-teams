#!/bin/sh
# Run a relay-teams benchmark against a server started inside this container.
#
# This mirrors the SWE-bench Docker mode: the benchmark container mounts the
# /opt/agent-runtime volume from agent-teams-runtime:latest, starts the server
# locally, then points the benchmark runner at http://127.0.0.1:8000.

set -eu

CONFIG_STAGING="${AGENT_TEAMS_CONFIG_STAGING:-/agent-config-host}"
CONFIG_TARGET="${AGENT_TEAMS_CONFIG_TARGET:-/root/.relay-teams}"
SERVER_HOST="${RELAY_TEAMS_BENCH_CONTAINER_SERVER_HOST:-127.0.0.1}"
SERVER_PORT="${RELAY_TEAMS_BENCH_CONTAINER_SERVER_PORT:-8000}"
SERVER_LOG="${RELAY_TEAMS_BENCH_SERVER_LOG:-/tmp/relay-teams-agentbench-server.log}"
SERVER_BIN="${RELAY_TEAMS_BENCH_SERVER_BIN:-/opt/agent-runtime/bin/relay-teams}"
SERVER_URL="http://127.0.0.1:${SERVER_PORT}"
SKIP_SERVER_START="${RELAY_TEAMS_BENCH_SKIP_SERVER_START:-false}"

copy_staged_config() {
    if [ ! -d "$CONFIG_STAGING" ]; then
        return
    fi

    mkdir -p "$CONFIG_TARGET"
    for entry in model.json notifications.json orchestration.json .env mcp.json logger.ini; do
        if [ -f "$CONFIG_STAGING/$entry" ]; then
            cp -a "$CONFIG_STAGING/$entry" "$CONFIG_TARGET/$entry"
        fi
    done

    for entry in roles skills; do
        if [ -d "$CONFIG_STAGING/$entry" ]; then
            cp -a "$CONFIG_STAGING/$entry" "$CONFIG_TARGET/"
        fi
    done

    rm -f "$CONFIG_TARGET"/*.db "$CONFIG_TARGET"/*.db-wal "$CONFIG_TARGET"/*.db-shm
}

write_benchmark_model_config() {
    mkdir -p "$CONFIG_TARGET"
    python - <<'PY'
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

config_target = Path(os.environ.get("AGENT_TEAMS_CONFIG_TARGET", "/root/.relay-teams"))
model_config_path = config_target / "model.json"
profile_name = os.environ.get("RELAY_TEAMS_BENCH_MODEL_PROFILE", "deepseek")
api_key_env_var = os.environ.get(
    "RELAY_TEAMS_BENCH_API_KEY_ENV_VAR", "DEEPSEEK_API_KEY"
).strip() or "DEEPSEEK_API_KEY"
api_key = (
    os.environ.get(api_key_env_var, "").strip()
    or os.environ.get("RELAY_TEAMS_BENCH_API_KEY", "").strip()
)


def configured_profile() -> dict[str, object]:
    return {
        "provider": os.environ.get(
            "RELAY_TEAMS_BENCH_MODEL_PROVIDER", "openai_compatible"
        ),
        "model": os.environ.get("RELAY_TEAMS_BENCH_MODEL", "deepseek-v4-flash"),
        "base_url": os.environ.get(
            "RELAY_TEAMS_BENCH_MODEL_BASE_URL", "https://api.deepseek.com"
        ),
        "temperature": float(
            os.environ.get("RELAY_TEAMS_BENCH_MODEL_TEMPERATURE", "0.7")
        ),
        "top_p": float(os.environ.get("RELAY_TEAMS_BENCH_MODEL_TOP_P", "1.0")),
        "is_default": True,
    }


payload: dict[str, object] = {}
if model_config_path.exists():
    loaded = json.loads(model_config_path.read_text(encoding="utf-8"))
    if isinstance(loaded, dict):
        payload = {str(key): value for key, value in loaded.items()}


profile_obj = payload.get(profile_name)
existing_profile: dict[str, object] = {}
if isinstance(profile_obj, dict):
    existing_profile = {
        str(key): value
        for key, value in profile_obj.items()
    }
existing_api_key_obj = existing_profile.get("api_key")
existing_api_key = (
    existing_api_key_obj.strip()
    if isinstance(existing_api_key_obj, str)
    else ""
)
resolved_api_key = api_key or existing_api_key
if not resolved_api_key:
    print(
        f"{api_key_env_var} or RELAY_TEAMS_BENCH_API_KEY is required when the "
        f"staged model.json profile {profile_name!r} does not contain an api_key. "
        "Docker benchmark containers cannot read the host keyring.",
        file=sys.stderr,
    )
    print(
        f"Pass it with: docker run -e {api_key_env_var}=... "
        "--volumes-from <agent-runtime-container> ...",
        file=sys.stderr,
    )
    raise SystemExit(2)
for payload_key, payload_value in tuple(payload.items()):
    if payload_key == profile_name or not isinstance(payload_value, dict):
        continue
    updated_profile = {
        str(key): value
        for key, value in payload_value.items()
    }
    updated_profile["is_default"] = False
    payload[payload_key] = updated_profile
payload[profile_name] = {
    **existing_profile,
    **configured_profile(),
    "api_key": resolved_api_key,
    "is_default": True,
}
config_target.mkdir(parents=True, exist_ok=True)
model_config_path.write_text(
    json.dumps(payload, indent=2),
    encoding="utf-8",
)
PY
}

write_benchmark_main_agent_role() {
    if [ "${RELAY_TEAMS_BENCH_SESSION_MODE:-normal}" != "normal" ]; then
        return
    fi

    model_profile="${RELAY_TEAMS_BENCH_MODEL_PROFILE:-deepseek}"
    mkdir -p "$CONFIG_TARGET/roles"
    cat > "$CONFIG_TARGET/roles/MainAgent.md" <<EOF
---
role_id: MainAgent
name: Main Agent
description: Executes benchmark action prompts directly without relay tools.
model_profile: ${model_profile}
version: 1.0.0
mode: primary
mcp_servers: []
skills: []
tools: []
contract:
  invariants:
    - invariant: must_not_have_tools
      description: Benchmark runs must execute commands through the benchmark adapter only.
      tools:
        - office_read_markdown
        - todo_write
        - todo_read
---

You are AT Agent, the normal-mode MainAgent for relay-teams benchmark runs.

Return only the action JSON requested by the current benchmark prompt. Do not use relay-teams tools, do not inspect files through relay-teams, do not run shell commands through relay-teams, and do not write markdown. The benchmark adapter will execute JSON commands in the task environment and then send back the observed output.
EOF
}

wait_for_server() {
    python - "$SERVER_URL" <<'PY'
from __future__ import annotations

import sys
import time
import urllib.error
import urllib.request

base_url = sys.argv[1]
deadline = time.monotonic() + 90.0
while time.monotonic() < deadline:
    try:
        with urllib.request.urlopen(f"{base_url}/api/workspaces", timeout=3):
            raise SystemExit(0)
    except Exception:
        time.sleep(1.5)
raise SystemExit(1)
PY
}

if [ "$SKIP_SERVER_START" = "true" ]; then
    exec "$@"
fi

if [ ! -x "$SERVER_BIN" ]; then
    echo "relay-teams runtime was not found at $SERVER_BIN." >&2
    echo "Create an agent-teams-runtime container and pass --volumes-from <container>." >&2
    exit 2
fi

copy_staged_config
write_benchmark_model_config
write_benchmark_main_agent_role

"$SERVER_BIN" server start --host "$SERVER_HOST" --port "$SERVER_PORT" > "$SERVER_LOG" 2>&1 &
SERVER_PID="$!"

cleanup() {
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

if ! wait_for_server; then
    echo "relay-teams server did not become ready at $SERVER_URL." >&2
    echo "Server log tail:" >&2
    tail -n 80 "$SERVER_LOG" >&2 || true
    exit 2
fi

export RELAY_TEAMS_BENCH_BASE_URL="$SERVER_URL"
export RELAY_TEAMS_BENCH_HOST_HEADER=""

"$@"
