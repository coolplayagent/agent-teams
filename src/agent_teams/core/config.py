from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel, ConfigDict

from agent_teams.core.models import ModelEndpointConfig, SamplingConfig


class RuntimePaths(BaseModel):
    model_config = ConfigDict(extra='forbid')

    config_dir: Path
    env_file: Path
    db_path: Path
    roles_dir: Path


class RuntimeConfig(BaseModel):
    model_config = ConfigDict(extra='forbid')

    paths: RuntimePaths
    model_endpoint: ModelEndpointConfig | None = None


def load_runtime_config(
    config_dir: Path = Path('.agent_teams'),
    roles_dir: Path | None = None,
    db_path: Path | None = None,
) -> RuntimeConfig:
    config_dir.mkdir(parents=True, exist_ok=True)
    env_file = config_dir / '.env'
    pairs = _parse_env_file(env_file) if env_file.exists() else ()

    resolved_roles_dir = roles_dir or Path(_get_value(pairs, 'AGENT_TEAMS_ROLES_DIR') or config_dir / 'roles')
    resolved_db_path = db_path or _resolve_path(config_dir, _get_value(pairs, 'AGENT_TEAMS_DB_PATH') or 'agent_teams.db')
    endpoint = _parse_endpoint(pairs)

    return RuntimeConfig(
        paths=RuntimePaths(
            config_dir=config_dir,
            env_file=env_file,
            db_path=resolved_db_path,
            roles_dir=resolved_roles_dir,
        ),
        model_endpoint=endpoint,
    )


def _parse_endpoint(pairs: tuple[tuple[str, str], ...]) -> ModelEndpointConfig | None:
    model = _get_value(pairs, 'OPENAI_MODEL')
    base_url = _get_value(pairs, 'OPENAI_BASE_URL')
    api_key = _get_value(pairs, 'OPENAI_API_KEY')
    if not model or not base_url or not api_key:
        return None

    temperature = _get_float(pairs, 'OPENAI_TEMPERATURE', 0.2)
    top_p = _get_float(pairs, 'OPENAI_TOP_P', 1.0)
    max_tokens = _get_int(pairs, 'OPENAI_MAX_TOKENS', 1024)
    top_k = _get_optional_int(pairs, 'OPENAI_TOP_K')

    return ModelEndpointConfig(
        model=model,
        base_url=base_url,
        api_key=api_key,
        sampling=SamplingConfig(
            temperature=temperature,
            top_p=top_p,
            max_tokens=max_tokens,
            top_k=top_k,
        ),
    )


def _parse_env_file(path: Path) -> tuple[tuple[str, str], ...]:
    rows: list[tuple[str, str]] = []
    for raw_line in path.read_text(encoding='utf-8').splitlines():
        line = raw_line.strip()
        if not line or line.startswith('#'):
            continue
        if '=' not in line:
            continue
        key, value = line.split('=', 1)
        rows.append((key.strip(), _strip_quotes(value.strip())))
    return tuple(rows)


def _get_value(pairs: tuple[tuple[str, str], ...], key: str) -> str | None:
    for current_key, current_value in reversed(pairs):
        if current_key == key:
            return current_value
    return None


def _resolve_path(config_dir: Path, raw_path: str) -> Path:
    candidate = Path(raw_path)
    if candidate.is_absolute():
        return candidate
    return config_dir / candidate


def _strip_quotes(value: str) -> str:
    if value.startswith('"') and value.endswith('"') and len(value) >= 2:
        return value[1:-1]
    if value.startswith("'") and value.endswith("'") and len(value) >= 2:
        return value[1:-1]
    return value


def _get_float(pairs: tuple[tuple[str, str], ...], key: str, default: float) -> float:
    value = _get_value(pairs, key)
    if value is None or value == '':
        return default
    return float(value)


def _get_int(pairs: tuple[tuple[str, str], ...], key: str, default: int) -> int:
    value = _get_value(pairs, key)
    if value is None or value == '':
        return default
    return int(value)


def _get_optional_int(pairs: tuple[tuple[str, str], ...], key: str) -> int | None:
    value = _get_value(pairs, key)
    if value is None or value == '':
        return None
    return int(value)
