from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from collections.abc import Callable, Sequence
from importlib import import_module
import json
from pathlib import Path
import time
from typing import Protocol, TypeVar, cast

import typer

from relay_teams_evals.agentbench_runs.docker_runner import (
    AgentBenchDockerRunner,
    normalize_agentbench_dataset_name,
)
from relay_teams_evals.agentbench_runs.reporting import (
    write_agentbench_results_from_eval_report,
    write_agentbench_summary_from_eval_report,
)
from relay_teams_evals.backends.agent_teams import AgentTeamsBackend
from relay_teams_evals.backends.agentbench_run import AgentBenchRunBackend
from relay_teams_evals.backends.base import AgentBackend
from relay_teams_evals.checkpoint import (
    EvalCheckpointSignature,
    EvalCheckpointStore,
    archive_output_dir,
    build_checkpoint_signature,
)
from relay_teams_evals.loaders.agentbench_task_loader import AgentBenchLoader
from relay_teams_evals.loaders.jsonl_loader import JsonlLoader
from relay_teams_evals.loaders.swebench_loader import SWEBenchLoader
from relay_teams_evals.models import EvalItem, EvalReport, EvalResult
from relay_teams_evals.reporter import EvalReporter, build_report
from relay_teams_evals.run_config import RunConfig, load_run_config, sample_yaml
from relay_teams_evals.runner import EvalRunner
from relay_teams_evals.scorers.agentbench_scorer import AgentBenchScorer
from relay_teams_evals.scorers.event_status_scorer import EventStatusScorer
from relay_teams_evals.scorers.keyword_scorer import KeywordScorer
from relay_teams_evals.scorers.regex_scorer import RegexScorer
from relay_teams_evals.scorers.swebench_docker_scorer import SWEBenchDockerScorer
from relay_teams_evals.scorers.swebench_scorer import SWEBenchScorer
from relay_teams_evals.workspace.artifact_collector import ArtifactCollector
from relay_teams_evals.workspace.docker_setup import DockerWorkspaceSetup
from relay_teams_evals.workspace.git_setup import GitWorkspaceSetup
from relay_teams_evals.workspace.patch_extractor import PatchExtractor

app = typer.Typer(help="Agent benchmark evaluation CLI", add_completion=False)
T = TypeVar("T")
_AGENTBENCH_DB_MUTATION_QUERY_TYPES = frozenset({"INSERT", "UPDATE", "DELETE"})


class _DockerClient(Protocol): ...


class _DockerModule(Protocol):
    def from_env(self) -> _DockerClient: ...


def _load_docker_module() -> _DockerModule:
    return cast(_DockerModule, import_module("docker"))


def _validate_unique_item_ids(items: list[EvalItem]) -> None:
    seen: set[str] = set()
    duplicates: list[str] = []
    for item in items:
        if item.item_id in seen and item.item_id not in duplicates:
            duplicates.append(item.item_id)
        seen.add(item.item_id)
    if duplicates:
        duplicate_text = ", ".join(sorted(duplicates))
        raise ValueError(
            f"Duplicate item_id values are not supported: {duplicate_text}"
        )


def _signature_without_item_ids(
    signature: EvalCheckpointSignature,
) -> dict[str, object]:
    payload = signature.model_dump()
    del payload["item_ids"]
    return payload


def _normalize_item_ids(raw_item_ids: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for raw_value in raw_item_ids:
        for part in raw_value.split(","):
            item_id = part.strip()
            if not item_id:
                raise ValueError(
                    "--item-ids contains an empty item id; "
                    "use comma-separated values like 'a,b,c'"
                )
            if item_id in seen:
                continue
            seen.add(item_id)
            normalized.append(item_id)
    return normalized


def _ordered_results(
    item_ids: tuple[str, ...],
    results_by_item_id: dict[str, EvalResult],
) -> list[EvalResult]:
    return [
        results_by_item_id[item_id]
        for item_id in item_ids
        if item_id in results_by_item_id
    ]


def _build_report_snapshot(
    *,
    cfg: RunConfig,
    scorer_name: str,
    item_ids: tuple[str, ...],
    results_by_item_id: dict[str, EvalResult],
) -> EvalReport:
    return build_report(
        _ordered_results(item_ids, results_by_item_id),
        dataset=cfg.dataset,
        scorer_name=scorer_name,
        cost_per_million_input=cfg.cost_per_million_input_tokens,
        cost_per_million_cached_input=cfg.cost_per_million_cached_input_tokens,
        cost_per_million_output=cfg.cost_per_million_output_tokens,
        cost_per_million_reasoning_output=(
            cfg.cost_per_million_reasoning_output_tokens
        ),
    )


def _write_report_snapshot(
    *,
    cfg: RunConfig,
    reporter: EvalReporter,
    report: EvalReport,
) -> None:
    cfg.output_dir.mkdir(parents=True, exist_ok=True)
    json_path = cfg.output_dir / "report.json"
    reporter.write_json(report, json_path)
    if cfg.report_format in ("html", "both"):
        html_path = cfg.output_dir / "report.html"
        reporter.write_html(report, html_path)


def _load_checkpoint_results(
    *,
    cfg: RunConfig,
    signature: EvalCheckpointSignature,
    rerun_item_ids: tuple[str, ...] = (),
) -> dict[str, EvalResult]:
    store = EvalCheckpointStore(cfg.output_dir)

    if not store.exists():
        if cfg.output_dir.exists() and any(cfg.output_dir.iterdir()):
            raise ValueError(
                f"Output directory already contains files but no checkpoint: {cfg.output_dir}"
            )
        store.ensure_initialized(signature)
        return {}

    existing_meta = store.load_meta()
    if existing_meta is None:
        raise ValueError(
            f"Checkpoint metadata is missing from output_dir: {cfg.output_dir}"
        )
    existing_signature = existing_meta.signature
    if rerun_item_ids:
        if _signature_without_item_ids(
            existing_signature
        ) != _signature_without_item_ids(signature):
            raise ValueError(
                "Checkpoint signature does not match the current eval configuration."
            )
        existing_item_ids = set(existing_signature.item_ids)
        missing_item_ids = [
            item_id for item_id in rerun_item_ids if item_id not in existing_item_ids
        ]
        if missing_item_ids:
            missing_text = ", ".join(sorted(missing_item_ids))
            raise ValueError(
                f"Cannot rerun items that are not in the checkpoint: {missing_text}"
            )
    else:
        store.ensure_initialized(signature)
    return store.load_results()


def _agentbench_resume_results(
    *,
    cfg: RunConfig,
    items: Sequence[EvalItem],
    results_by_item_id: dict[str, EvalResult],
) -> dict[str, EvalResult]:
    if cfg.dataset != "agentbench" or not results_by_item_id:
        return results_by_item_id

    rerun_item_ids: set[str] = set()
    if cfg.agentbench.rerun_infra_failures:
        rerun_item_ids.update(
            item_id
            for item_id, result in results_by_item_id.items()
            if _agentbench_result_has_failure_kind(result, "infra")
        )
    if cfg.agentbench.rerun_db_mutation_failures:
        rerun_item_ids.update(
            item.item_id
            for item in items
            if item.item_id in results_by_item_id
            and _is_agentbench_db_mutation_item(item)
        )

    if not rerun_item_ids:
        return results_by_item_id
    return {
        item_id: result
        for item_id, result in results_by_item_id.items()
        if item_id not in rerun_item_ids
    }


def _agentbench_result_has_failure_kind(
    result: EvalResult,
    failure_kind: str,
) -> bool:
    expected_detail = f"failure_kind={failure_kind}"
    return any(
        part.strip() == expected_detail for part in result.scorer_detail.split(";")
    )


def _is_agentbench_db_mutation_item(item: EvalItem) -> bool:
    suite = item.extra_fields.get("suite", "").lower()
    if suite and suite != "db":
        return False
    if not suite and not item.item_id.startswith("db:"):
        return False
    return (
        _agentbench_item_query_type(item).upper() in _AGENTBENCH_DB_MUTATION_QUERY_TYPES
    )


def _agentbench_item_query_type(item: EvalItem) -> str:
    raw_value = item.extra_fields.get("query_type") or item.extra_fields.get("type")
    if raw_value is None:
        return ""
    stripped_value = raw_value.strip()
    if not stripped_value:
        return ""
    if not stripped_value.startswith("["):
        return stripped_value
    try:
        parsed = cast(object, json.loads(stripped_value))
    except json.JSONDecodeError:
        return stripped_value
    if isinstance(parsed, list) and parsed:
        first_value = parsed[0]
        return first_value if isinstance(first_value, str) else str(first_value)
    return stripped_value


def _run_retryable_infra_operation(
    *,
    label: str,
    infra_retry_attempts: int,
    infra_retry_backoff_seconds: float,
    operation: Callable[[], T],
) -> T:
    total_attempts = max(0, infra_retry_attempts) + 1
    backoff_seconds = max(0.0, infra_retry_backoff_seconds)
    for attempt_number in range(1, total_attempts + 1):
        try:
            return operation()
        except (OSError, RuntimeError, TimeoutError) as exc:
            if attempt_number >= total_attempts:
                raise
            typer.echo(
                f"{label} retryable infra failure on attempt "
                f"{attempt_number}/{total_attempts}: {exc}"
            )
            if backoff_seconds > 0:
                typer.echo(f"{label} retrying after {backoff_seconds:.1f}s backoff ...")
                time.sleep(backoff_seconds)
    raise RuntimeError(f"{label} retry state was exhausted without a result.")


@app.command()
def run(
    config_file: Path = typer.Option(
        ..., "--config", "-c", help="Path to YAML run config"
    ),
    limit: int | None = typer.Option(None, help="Override: max items to evaluate"),
    item_ids: list[str] = typer.Option(
        [],
        help=(
            "Override: specific item IDs to run "
            "(repeat option or use comma-separated values)"
        ),
    ),
    concurrency: int | None = typer.Option(None, help="Override: parallel workers"),
    keep_workspaces: bool | None = typer.Option(None, help="Override: keep workspaces"),
    base_url: str | None = typer.Option(None, help="Override: backend base URL"),
    restart: bool = typer.Option(
        False, help="Archive the current output_dir and start a fresh eval run"
    ),
    rerun: bool = typer.Option(
        False,
        help="Force rerunning the selected --item-ids and overwrite their report/artifacts",
    ),
) -> None:
    cfg = load_run_config(config_file)
    try:
        normalized_item_ids = _normalize_item_ids(item_ids)
    except ValueError as exc:
        typer.echo(f"Error: {exc}", err=True)
        raise typer.Exit(1) from exc

    # Apply CLI overrides
    overrides: dict[str, object] = {}
    if limit is not None:
        overrides["limit"] = limit
    if normalized_item_ids:
        overrides["item_ids"] = tuple(normalized_item_ids)
    if concurrency is not None:
        overrides["concurrency"] = concurrency
    if keep_workspaces is not None:
        overrides["keep_workspaces"] = keep_workspaces
    if overrides:
        cfg = cfg.model_copy(update=overrides)
    if base_url is not None:
        cfg = cfg.model_copy(
            update={
                "agent_teams": cfg.agent_teams.model_copy(update={"base_url": base_url})
            }
        )

    if rerun and not normalized_item_ids:
        typer.echo("Error: --rerun requires at least one --item-ids value.", err=True)
        raise typer.Exit(1)

    agentbench_name = normalize_agentbench_dataset_name(cfg.dataset)
    agentbench_manifest_path: Path | None = None
    agentbench_discovered_items = None
    if agentbench_name is not None:
        if cfg.workspace_mode != "docker":
            typer.echo(
                "Error: AgentBench evals require "
                "workspace_mode: docker in the eval config.",
                err=True,
            )
            raise typer.Exit(1)
        if cfg.scorer == "keyword":
            cfg = cfg.model_copy(update={"scorer": agentbench_name})
        elif cfg.scorer != agentbench_name:
            typer.echo(
                "Error: AgentBench scorer must match dataset "
                f"('{agentbench_name}'), got '{cfg.scorer}'.",
                err=True,
            )
            raise typer.Exit(1)
        if cfg.dataset_path is None:
            try:
                manifest = _run_retryable_infra_operation(
                    label="AgentBench task discovery",
                    infra_retry_attempts=cfg.infra_retry_attempts,
                    infra_retry_backoff_seconds=cfg.infra_retry_backoff_seconds,
                    operation=lambda: AgentBenchDockerRunner(cfg).discover_items(
                        benchmark=agentbench_name
                    ),
                )
            except RuntimeError as exc:
                typer.echo(f"Error: {exc}", err=True)
                raise typer.Exit(1) from exc
            agentbench_manifest_path = manifest.manifest_path
            agentbench_discovered_items = list(manifest.items)

    dataset_path_for_signature = cfg.dataset_path or agentbench_manifest_path
    if dataset_path_for_signature is None:
        typer.echo("Error: dataset_path is required in the config file.", err=True)
        raise typer.Exit(1)

    typer.echo(f"Config: {config_file}")
    typer.echo(
        f"  dataset={cfg.dataset}  scorer={cfg.scorer}"
        f"  backend={cfg.backend}  workspace_mode={cfg.workspace_mode}"
        f"  concurrency={cfg.concurrency}"
    )

    # Backend
    backend: AgentBackend | None
    if agentbench_name is not None:
        backend = None
    else:
        match cfg.backend:
            case "agent_teams":
                backend = AgentTeamsBackend(cfg.agent_teams)
            case _:
                typer.echo(f"Error: unknown backend '{cfg.backend}'", err=True)
                raise typer.Exit(1)

    # Workspace setup
    workspace_setup = None
    patch_extractor = None
    if agentbench_name is None:
        match cfg.workspace_mode:
            case "docker":
                workspace_setup = DockerWorkspaceSetup(
                    cfg.docker, cfg.agent_teams.config_dir
                )
            case "git":
                if cfg.dataset == "swebench":
                    workspace_setup = GitWorkspaceSetup(
                        cfg.evals_workdir, cfg.git_clone_timeout_seconds
                    )
                    patch_extractor = PatchExtractor()

    # Scorer
    match cfg.scorer:
        case "swebench_docker":
            scorer = SWEBenchDockerScorer(
                client=_load_docker_module().from_env(),
                patch_pass_threshold=cfg.swebench_pass_threshold,
            )
            if patch_extractor is None and workspace_setup is not None:
                patch_extractor = PatchExtractor()
        case "swebench":
            scorer = SWEBenchScorer(cfg.swebench_pass_threshold)
            if patch_extractor is None and workspace_setup is not None:
                patch_extractor = PatchExtractor()
        case "regex":
            scorer = RegexScorer()
        case "event_status":
            scorer = EventStatusScorer()
        case "keyword":
            scorer = KeywordScorer()
        case "agentbench":
            scorer = AgentBenchScorer()
        case _:
            typer.echo(f"Error: unknown scorer '{cfg.scorer}'", err=True)
            raise typer.Exit(1)

    # Load dataset
    if agentbench_discovered_items is not None:
        items = agentbench_discovered_items
    elif cfg.dataset == "swebench":
        loader = SWEBenchLoader()
        items = loader.load(dataset_path_for_signature)
    elif agentbench_name == "agentbench":
        loader = AgentBenchLoader()
        items = loader.load(dataset_path_for_signature)
    else:
        loader = JsonlLoader(dataset_name=cfg.dataset)
        items = loader.load(dataset_path_for_signature)
    typer.echo(f"Loaded {len(items)} items from {dataset_path_for_signature}")

    if cfg.item_ids:
        id_set = set(cfg.item_ids)
        items = [it for it in items if it.item_id in id_set]
        typer.echo(f"Filtered to {len(items)} items by item_ids")

    if cfg.limit is not None:
        items = items[: cfg.limit]
        typer.echo(f"Limited to {len(items)} items")

    try:
        _validate_unique_item_ids(items)
    except ValueError as exc:
        typer.echo(f"Error: {exc}", err=True)
        raise typer.Exit(1) from exc

    ordered_item_ids = tuple(item.item_id for item in items)
    checkpoint_store = EvalCheckpointStore(cfg.output_dir)
    checkpoint_signature = build_checkpoint_signature(
        cfg,
        dataset_path=dataset_path_for_signature,
        item_ids=ordered_item_ids,
    )

    if restart:
        archived_path = archive_output_dir(cfg.output_dir)
        if archived_path is not None:
            typer.echo(f"Archived previous output_dir to {archived_path}")
    try:
        if restart:
            checkpoint_store.ensure_initialized(checkpoint_signature)
            results_by_item_id: dict[str, EvalResult] = {}
        else:
            results_by_item_id = _load_checkpoint_results(
                cfg=cfg,
                signature=checkpoint_signature,
                rerun_item_ids=tuple(normalized_item_ids) if rerun else (),
            )
            if not rerun:
                results_by_item_id = _agentbench_resume_results(
                    cfg=cfg,
                    items=items,
                    results_by_item_id=results_by_item_id,
                )
    except ValueError as exc:
        typer.echo(f"Error: {exc}", err=True)
        raise typer.Exit(1) from exc

    report_item_ids = ordered_item_ids
    completed_item_ids = set(results_by_item_id)
    items_to_run = [item for item in items if item.item_id not in completed_item_ids]
    if rerun and results_by_item_id:
        existing_meta = checkpoint_store.load_meta()
        if existing_meta is not None:
            report_item_ids = existing_meta.signature.item_ids
        items_to_run = list(items)
    if results_by_item_id and not rerun:
        typer.echo(
            f"Resuming from checkpoint: {len(results_by_item_id)} completed, "
            f"{len(items_to_run)} remaining"
        )
    elif rerun:
        typer.echo(
            f"Rerunning {len(items_to_run)} item(s) against existing results in {cfg.output_dir}"
        )

    artifact_collector = (
        ArtifactCollector(cfg.output_dir) if cfg.save_artifacts else None
    )
    runner_backend = backend
    if agentbench_name is not None:
        runner_backend = AgentBenchRunBackend(
            cfg,
            scheduled_item_ids=tuple(item.item_id for item in items_to_run),
        )
    if runner_backend is None:
        typer.echo("Error: no eval backend was configured.", err=True)
        raise typer.Exit(1)

    runner = EvalRunner(
        backend=runner_backend,
        scorer=scorer,
        workspace_setup=workspace_setup,
        patch_extractor=patch_extractor,
        artifact_collector=artifact_collector,
        keep_workspaces=cfg.keep_workspaces,
        concurrency=cfg.concurrency,
        infra_retry_attempts=cfg.infra_retry_attempts,
        infra_retry_backoff_seconds=cfg.infra_retry_backoff_seconds,
    )

    total = len(items_to_run)
    typer.echo(
        f"Running {total} items (concurrency={cfg.concurrency}) "
        f"[remaining={len(items_to_run)}] ..."
    )
    completed = 0
    reporter = EvalReporter()

    def _format_usage_for_progress(result: EvalResult) -> str:
        in_k = result.token_usage.input_tokens / 1000
        cached_k = result.token_usage.cached_input_tokens / 1000
        out_k = result.token_usage.output_tokens / 1000
        reasoning_k = result.token_usage.reasoning_output_tokens / 1000
        return (
            f"input:{in_k:.1f}k cached:{cached_k:.1f}k "
            f"output:{out_k:.1f}k reasoning:{reasoning_k:.1f}k "
            f"requests:{result.token_usage.total_requests} "
            f"tool_calls:{result.token_usage.total_tool_calls}"
        )

    def _print_result(result: EvalResult) -> None:
        nonlocal completed
        completed += 1
        status = "PASS" if result.passed else "FAIL"
        typer.echo(
            f"[{completed}/{total}] {result.item_id}  {status}"
            f"  score={result.score:.3f}"
            f"  usage={_format_usage_for_progress(result)}"
            f"  dur={result.duration_seconds:.1f}s"
            f"  {result.scorer_detail}"
        )
        if result.error:
            typer.echo(f"  error: {result.error}")
        if result.build_log_path:
            typer.echo(f"  build_log: {result.build_log_path}")

    try:
        if cfg.concurrency <= 1:
            for item in items_to_run:
                result = runner.run_item(item)
                checkpoint_store.append_result(result)
                results_by_item_id[result.item_id] = result
                report_snapshot = _build_report_snapshot(
                    cfg=cfg,
                    scorer_name=scorer.name,
                    item_ids=report_item_ids,
                    results_by_item_id=results_by_item_id,
                )
                _write_report_snapshot(
                    cfg=cfg,
                    reporter=reporter,
                    report=report_snapshot,
                )
                _print_result(result)
        else:
            with ThreadPoolExecutor(max_workers=cfg.concurrency) as pool:
                futures = {
                    pool.submit(runner.run_item, item): item for item in items_to_run
                }
                for future in as_completed(futures):
                    result = future.result()
                    checkpoint_store.append_result(result)
                    results_by_item_id[result.item_id] = result
                    report_snapshot = _build_report_snapshot(
                        cfg=cfg,
                        scorer_name=scorer.name,
                        item_ids=report_item_ids,
                        results_by_item_id=results_by_item_id,
                    )
                    _write_report_snapshot(
                        cfg=cfg,
                        reporter=reporter,
                        report=report_snapshot,
                    )
                    _print_result(result)
    finally:
        if workspace_setup is not None:
            workspace_setup.teardown()

    report = _build_report_snapshot(
        cfg=cfg,
        scorer_name=scorer.name,
        item_ids=report_item_ids,
        results_by_item_id=results_by_item_id,
    )
    reporter.print_summary(report)
    _write_report_snapshot(cfg=cfg, reporter=reporter, report=report)
    json_path = cfg.output_dir / "report.json"
    typer.echo(f"JSON report: {json_path}")
    if cfg.report_format in ("html", "both"):
        html_path = cfg.output_dir / "report.html"
        typer.echo(f"HTML report: {html_path}")
    if agentbench_name is not None:
        agentbench_results_path = write_agentbench_results_from_eval_report(
            report=report,
            output_dir=cfg.output_dir,
        )
        agentbench_summary_path = write_agentbench_summary_from_eval_report(
            benchmark=agentbench_name,
            report=report,
            results_file=agentbench_results_path,
        )
        typer.echo(f"AgentBench results: {agentbench_results_path}")
        typer.echo(f"AgentBench summary: {agentbench_summary_path}")


@app.command(name="init-config")
def init_config(
    output: Path = typer.Option(
        Path("eval.yaml"), help="Output path for sample config"
    ),
) -> None:
    """Generate a sample YAML run config."""
    output.write_text(sample_yaml(), encoding="utf-8")
    typer.echo(f"Sample config written to: {output}")
    typer.echo(f"Edit it, then run:  relay-teams-evals run --config {output}")


@app.command()
def report(
    results_file: Path = typer.Option(..., help="Path to JSON report file"),
    format: str = typer.Option("html", help="Output format: html | json | both"),
    output_file: Path | None = typer.Option(None, help="Output file path"),
) -> None:
    raw = results_file.read_text(encoding="utf-8")
    report_obj = EvalReport.model_validate(json.loads(raw))
    reporter = EvalReporter()
    reporter.print_summary(report_obj)

    if output_file is None:
        suffix = ".html" if format == "html" else ".json"
        output_file = results_file.with_suffix(suffix)

    if format in ("html", "both"):
        html_path = (
            output_file if format == "html" else output_file.with_suffix(".html")
        )
        reporter.write_html(report_obj, html_path)
        typer.echo(f"HTML report: {html_path}")
    if format in ("json", "both"):
        json_path = (
            output_file if format == "json" else output_file.with_suffix(".json")
        )
        reporter.write_json(report_obj, json_path)
        typer.echo(f"JSON report: {json_path}")


if __name__ == "__main__":
    app()
