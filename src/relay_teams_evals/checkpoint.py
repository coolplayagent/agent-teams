from __future__ import annotations

import hashlib
import threading
from collections.abc import Mapping, Sequence
from datetime import datetime, timezone
from pathlib import Path
from typing import Protocol

from pydantic import BaseModel, ConfigDict, Field

from relay_teams_evals.models import EvalResult

_CHECKPOINT_VERSION = 1


class AgentBenchCheckpointSettings(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    benchmark_image: str
    runtime_image: str
    api_key_env_var: str
    execution_mode: str
    suite: str
    os_suite: str
    num_os_tasks: int | None
    num_db_tasks: int | None
    max_steps: int | None
    task_timeout_seconds: float | None
    model: str
    model_base_url: str
    os_prompt_template: str | None
    db_prompt_template: str | None


class _CheckpointAgentTeamsConfig(Protocol):
    @property
    def execution_mode(self) -> str:
        raise NotImplementedError

    @property
    def session_mode(self) -> str:
        raise NotImplementedError

    @property
    def orchestration_preset_id(self) -> str | None:
        raise NotImplementedError

    @property
    def yolo(self) -> bool:
        raise NotImplementedError

    @property
    def timeout_seconds(self) -> float:
        raise NotImplementedError

    @property
    def config_dir(self) -> Path | None:
        raise NotImplementedError


class _CheckpointDockerConfig(Protocol):
    @property
    def image_prefix(self) -> str:
        raise NotImplementedError

    @property
    def agent_runtime_image(self) -> str:
        raise NotImplementedError

    @property
    def agent_runtime_bin(self) -> str:
        raise NotImplementedError

    @property
    def container_repo_path(self) -> str:
        raise NotImplementedError

    @property
    def forward_env_vars(self) -> Sequence[str]:
        raise NotImplementedError

    @property
    def extra_env(self) -> Mapping[str, str]:
        raise NotImplementedError


class _CheckpointAgentBenchConfig(Protocol):
    @property
    def benchmark_image(self) -> str:
        raise NotImplementedError

    @property
    def runtime_image(self) -> str:
        raise NotImplementedError

    @property
    def api_key_env_var(self) -> str:
        raise NotImplementedError

    @property
    def execution_mode(self) -> str:
        raise NotImplementedError

    @property
    def suite(self) -> str:
        raise NotImplementedError

    @property
    def os_suite(self) -> str:
        raise NotImplementedError

    @property
    def num_os_tasks(self) -> int | None:
        raise NotImplementedError

    @property
    def num_db_tasks(self) -> int | None:
        raise NotImplementedError

    @property
    def max_steps(self) -> int | None:
        raise NotImplementedError

    @property
    def task_timeout_seconds(self) -> float | None:
        raise NotImplementedError

    @property
    def model(self) -> str:
        raise NotImplementedError

    @property
    def model_base_url(self) -> str:
        raise NotImplementedError

    @property
    def os_prompt_template(self) -> str | None:
        raise NotImplementedError

    @property
    def db_prompt_template(self) -> str | None:
        raise NotImplementedError


class _CheckpointRunConfig(Protocol):
    @property
    def dataset(self) -> str:
        raise NotImplementedError

    @property
    def scorer(self) -> str:
        raise NotImplementedError

    @property
    def swebench_pass_threshold(self) -> float:
        raise NotImplementedError

    @property
    def backend(self) -> str:
        raise NotImplementedError

    @property
    def workspace_mode(self) -> str:
        raise NotImplementedError

    @property
    def agent_teams(self) -> _CheckpointAgentTeamsConfig:
        raise NotImplementedError

    @property
    def git_clone_timeout_seconds(self) -> float:
        raise NotImplementedError

    @property
    def docker(self) -> _CheckpointDockerConfig:
        raise NotImplementedError

    @property
    def agentbench(self) -> _CheckpointAgentBenchConfig:
        raise NotImplementedError


class EvalCheckpointSignature(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    dataset: str
    dataset_path: str
    dataset_sha256: str
    item_ids: tuple[str, ...]
    scorer: str
    swebench_pass_threshold: float
    backend: str
    workspace_mode: str
    agent_execution_mode: str
    agent_session_mode: str
    agent_orchestration_preset_id: str | None = None
    agent_yolo: bool
    agent_timeout_seconds: float
    agent_config_dir: str | None = None
    git_clone_timeout_seconds: float | None = None
    docker_image_prefix: str | None = None
    docker_agent_runtime_image: str | None = None
    docker_agent_runtime_bin: str | None = None
    docker_container_repo_path: str | None = None
    docker_forward_env_vars: tuple[str, ...] = ()
    docker_extra_env: tuple[tuple[str, str], ...] = ()
    agentbench: AgentBenchCheckpointSettings | None = None


class EvalCheckpointMeta(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    version: int = _CHECKPOINT_VERSION
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    signature: EvalCheckpointSignature


def build_checkpoint_signature(
    cfg: _CheckpointRunConfig,
    *,
    dataset_path: Path,
    item_ids: tuple[str, ...],
) -> EvalCheckpointSignature:
    resolved_dataset_path = dataset_path.resolve()
    dataset_bytes = resolved_dataset_path.read_bytes()
    docker_extra_env = _checkpoint_docker_extra_env(cfg.docker.extra_env)
    agentbench_settings = (
        _agentbench_checkpoint_settings(cfg) if cfg.dataset == "agentbench" else None
    )
    return EvalCheckpointSignature(
        dataset=cfg.dataset,
        dataset_path=str(resolved_dataset_path),
        dataset_sha256=hashlib.sha256(dataset_bytes).hexdigest(),
        item_ids=item_ids,
        scorer=cfg.scorer,
        swebench_pass_threshold=cfg.swebench_pass_threshold,
        backend=cfg.backend,
        workspace_mode=cfg.workspace_mode,
        agent_execution_mode=cfg.agent_teams.execution_mode,
        agent_session_mode=cfg.agent_teams.session_mode,
        agent_orchestration_preset_id=cfg.agent_teams.orchestration_preset_id,
        agent_yolo=cfg.agent_teams.yolo,
        agent_timeout_seconds=cfg.agent_teams.timeout_seconds,
        agent_config_dir=(
            str(cfg.agent_teams.config_dir.expanduser().resolve())
            if cfg.agent_teams.config_dir is not None
            else None
        ),
        git_clone_timeout_seconds=(
            cfg.git_clone_timeout_seconds if cfg.workspace_mode == "git" else None
        ),
        docker_image_prefix=(
            cfg.docker.image_prefix if cfg.workspace_mode == "docker" else None
        ),
        docker_agent_runtime_image=(
            cfg.docker.agent_runtime_image if cfg.workspace_mode == "docker" else None
        ),
        docker_agent_runtime_bin=(
            cfg.docker.agent_runtime_bin if cfg.workspace_mode == "docker" else None
        ),
        docker_container_repo_path=(
            cfg.docker.container_repo_path if cfg.workspace_mode == "docker" else None
        ),
        docker_forward_env_vars=(
            tuple(cfg.docker.forward_env_vars) if cfg.workspace_mode == "docker" else ()
        ),
        docker_extra_env=docker_extra_env if cfg.workspace_mode == "docker" else (),
        agentbench=agentbench_settings,
    )


def _checkpoint_docker_extra_env(
    extra_env: Mapping[str, str],
) -> tuple[tuple[str, str], ...]:
    return tuple(
        (key, _checkpoint_env_value_digest(value))
        for key, value in sorted(extra_env.items())
    )


def _checkpoint_env_value_digest(value: str) -> str:
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()
    return f"sha256:{digest}"


def _agentbench_checkpoint_settings(
    cfg: _CheckpointRunConfig,
) -> AgentBenchCheckpointSettings:
    agentbench = cfg.agentbench
    return AgentBenchCheckpointSettings(
        benchmark_image=agentbench.benchmark_image,
        runtime_image=agentbench.runtime_image,
        api_key_env_var=agentbench.api_key_env_var,
        execution_mode=agentbench.execution_mode,
        suite=agentbench.suite,
        os_suite=agentbench.os_suite,
        num_os_tasks=agentbench.num_os_tasks,
        num_db_tasks=agentbench.num_db_tasks,
        max_steps=agentbench.max_steps,
        task_timeout_seconds=agentbench.task_timeout_seconds,
        model=agentbench.model,
        model_base_url=agentbench.model_base_url,
        os_prompt_template=agentbench.os_prompt_template,
        db_prompt_template=agentbench.db_prompt_template,
    )


def archive_output_dir(output_dir: Path, *, now: datetime | None = None) -> Path | None:
    if not output_dir.exists():
        return None
    timestamp = (now or datetime.now(tz=timezone.utc)).strftime("%Y%m%dT%H%M%SZ")
    archive_base = output_dir.parent / f"{output_dir.name}.{timestamp}"
    archive_path = archive_base
    suffix = 1
    while archive_path.exists():
        archive_path = output_dir.parent / f"{archive_base.name}.{suffix}"
        suffix += 1
    output_dir.rename(archive_path)
    return archive_path


class EvalCheckpointStore:
    def __init__(self, output_dir: Path) -> None:
        self._output_dir = output_dir
        self._meta_path = output_dir / "checkpoint.meta.json"
        self._results_path = output_dir / "checkpoint.results.jsonl"
        self._lock = threading.Lock()

    @property
    def meta_path(self) -> Path:
        return self._meta_path

    @property
    def results_path(self) -> Path:
        return self._results_path

    def exists(self) -> bool:
        return self._meta_path.exists() or self._results_path.exists()

    def ensure_initialized(self, signature: EvalCheckpointSignature) -> None:
        self._output_dir.mkdir(parents=True, exist_ok=True)
        existing = self.load_meta()
        if existing is not None:
            if existing.signature != signature:
                raise ValueError(
                    "Checkpoint signature does not match the current eval configuration."
                )
            return
        meta = EvalCheckpointMeta(signature=signature)
        tmp_path = self._meta_path.with_suffix(".json.tmp")
        tmp_path.write_text(meta.model_dump_json(indent=2), encoding="utf-8")
        tmp_path.replace(self._meta_path)

    def load_meta(self) -> EvalCheckpointMeta | None:
        if not self._meta_path.exists():
            return None
        raw = self._meta_path.read_text(encoding="utf-8")
        return EvalCheckpointMeta.model_validate_json(raw)

    def load_results(self) -> dict[str, EvalResult]:
        if not self._results_path.exists():
            return {}

        loaded: dict[str, EvalResult] = {}
        lines = self._results_path.read_text(encoding="utf-8").splitlines()
        non_empty_lines = [
            (index + 1, line) for index, line in enumerate(lines) if line.strip()
        ]
        last_line_number = non_empty_lines[-1][0] if non_empty_lines else 0

        for line_number, line in non_empty_lines:
            try:
                result = EvalResult.model_validate_json(line)
            except ValueError:
                if line_number == last_line_number:
                    break
                raise
            loaded[result.item_id] = result
        return loaded

    def append_result(self, result: EvalResult) -> None:
        payload = result.model_dump_json()
        with self._lock:
            self._output_dir.mkdir(parents=True, exist_ok=True)
            with self._results_path.open("a", encoding="utf-8", newline="\n") as handle:
                handle.write(payload)
                handle.write("\n")
