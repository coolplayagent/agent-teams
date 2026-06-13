# Benchmark Suite

This directory contains the benchmark system for relay-teams.

## Layer 1: Micro-Benchmarks

**Location:** `benchmarks/micro/`

Individual capability performance tests using `pytest-benchmark`. These tests measure the raw throughput of core operations.

### Core capabilities covered

| Benchmark file | Capability measured |
|---|---|
| `test_micro_role_creation.py` | RoleDefinition JSON parsing and validation speed |
| `test_micro_task_creation.py` | TaskEnvelope creation and dependency graph resolution |
| `test_micro_graph_topology.py` | DAG topological sort performance |
| `test_micro_verification.py` | Verification check construction and evaluation |
| `test_micro_wakeup_queue.py` | Wakeup queue entry creation and coalescing |
| `test_micro_memory_search.py` | BM25 search and memory entry serialization |

### Running locally

```bash
# Run with benchmark timing enabled
uv run --extra dev pytest benchmarks/micro/ --benchmark-only

# Run without benchmark timing (for CI validation)
uv run --extra dev pytest benchmarks/micro/ --benchmark-disable

# Save results as JSON
uv run --extra dev pytest benchmarks/micro/ --benchmark-only --benchmark-json=tmp/bench-results.json
```

### CI integration

- **Trigger:** Push to `main`, PR to `main`, manual dispatch
- **Workflow:** `.github/workflows/benchmarks-micro.yml`
- **Regression detection:** Performance deviation greater than 10% from baseline triggers a warning

## Layer 2: SWE-bench Continuous Tracking

**Location:** `benchmarks/swebench/`

End-to-end task resolution tracking against the SWE-bench Verified dataset. Measures the percentage of SWE-bench instances that relay-teams can successfully resolve.

### Components

| File | Purpose |
|---|---|
| `config.py` | `SWEBenchConfig`, `SWEBenchInstanceResult`, `SWEBenchRunResult` models |
| `runner.py` | `SWEBenchRunner` -- orchestrates instance execution |
| `reporter.py` | Report generation (JSON) and summary output |

### Running locally

```bash
# Ensure SWE-bench dataset is available (JSONL format)
uv run --extra dev python -c "
import asyncio
from pathlib import Path
from benchmarks.swebench.config import SWEBenchConfig
from benchmarks.swebench.runner import SWEBenchRunner
from benchmarks.swebench.reporter import generate_report, print_summary

config = SWEBenchConfig(
    dataset_path=Path('tmp/swebench-dataset.jsonl'),
    max_instances=10,
    output_dir=Path('benchmarks/swebench/results'),
)
runner = SWEBenchRunner()
result = asyncio.run(runner.run(config))
path = generate_report(result, config.output_dir)
print_summary(result)
"
```

### CI integration

- **Trigger:** Push to `main`, daily schedule (06:00 UTC), manual dispatch
- **Workflow:** `.github/workflows/benchmarks-swebench.yml`
- **Output:** JSON report persisted as CI artifact

## Layer 3: Spec-Compliance Check

**Location:** `benchmarks/spec_compliance/`

Static analysis of `src/relay_teams/` against coding standards defined in `AGENTS.md`. Produces an overall compliance score and per-file violation details.

### Check categories (8 total)

| Category | What it checks |
|---|---|
| `model_types` | No `typing.Any`, no `@dataclass` |
| `annotations` | `from __future__ import annotations` present |
| `imports` | No `TYPE_CHECKING` import guards |
| `path_usage` | No `os.path` -- must use `pathlib.Path` |
| `emoji_free` | No emoji characters in source |
| `type_ignore_free` | No `# type: ignore` comments |
| `hasattr_free` | No `hasattr()` calls |
| `module_init` | All packages have `__init__.py` |

### Running locally

```bash
# Run compliance check
uv run --extra dev python -m benchmarks.spec_compliance.runner

# Or via Python API
uv run --extra dev python -c "
from benchmarks.spec_compliance.runner import SpecComplianceRunner
runner = SpecComplianceRunner()
result = runner.run()
print(f'Overall score: {result.overall_score:.1%}')
print(f'Modules checked: {result.modules_checked}')
"
```

### CI integration

- **Trigger:** PR to `main`, manual dispatch
- **Workflow:** `.github/workflows/benchmarks-spec-compliance.yml`
- **Failure threshold:** `overall_score < 0.7` (70%)

## AgentBench

**Location:** `benchmarks/agentbench/`, `benchmarks/docker/`,
`scripts/benchmarks/`, `src/relay_teams_evals/`

The AgentBench runner runs relay-teams through the public HTTP/SSE API and lets
the benchmark harness score OS and DB task behavior. API keys are not stored in
this repository; pass the target model key into the Docker run as an environment
variable.

The preferred entrypoint is now the same eval CLI used by SWE-bench:

```bash
relay-teams-evals run --config .agent_teams/evals/configs/normal/eval-agentbench.yaml --limit 5 --concurrency 2
relay-teams-evals run --config .agent_teams/evals/configs/orchestration/eval-agentbench.yaml --limit 5 --concurrency 2
```

The `scripts/benchmarks/run_*_docker.py` wrappers remain available for direct
harness debugging, but first-class eval runs should use `relay-teams-evals run`
so reports, checkpoints, and artifacts are generated through the same path as
SWE-bench.

### Prepared benchmark image

The Docker image pins the AgentBench source used by the runner:

| Benchmark | Source | Pin |
|---|---|---|
| AgentBench OS/DB | `THUDM/AgentBench` | `d1e4a10db08c87075c78972e48ecc182be03e2d5` |

```bash
# Build the relay-teams runtime image, AgentBench image, and pinned benchmark repo
python scripts/benchmarks/prepare_benchmarks.py
```

The script creates local cache/output state under `.agent_teams/benchmarks/`
and builds `agent-teams-runtime:latest` plus
`relay-teams-agentbench-tools:latest`. The tool image copies the pinned local
repository cache into the image so Docker builds do not need to clone benchmark
sources again.

### Runtime assumptions

AgentBench runs in the same Docker-contained style as SWE-bench. Build the
relay-teams runtime image once, create a runtime data container, and mount it
into the benchmark container with `--volumes-from`. The benchmark entrypoint
starts `relay-teams server` inside the benchmark container and points the
runner at `http://127.0.0.1:8000`.

Provide the model key through the configured benchmark `api_key_env_var`
environment variable. The tracked example configs default to
`DEEPSEEK_API_KEY`; `RELAY_TEAMS_BENCH_API_KEY` is also accepted as a generic
one-off override. When no staged `model.json` is mounted, the benchmark
entrypoint writes a container-local model profile and defaults to
`deepseek-v4-flash` at `https://api.deepseek.com`.

```bash
DOCKER=/Applications/Docker.app/Contents/Resources/bin/docker
DOCKER_PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"

# Avoid putting the key directly in command history.
read -rsp 'DEEPSEEK_API_KEY: ' DEEPSEEK_API_KEY
echo
export DEEPSEEK_API_KEY

RUNTIME_CONTAINER=$(PATH="$DOCKER_PATH" "$DOCKER" create agent-teams-runtime:latest)
```

Useful environment variables:

| Variable | Purpose |
|---|---|
| `DEEPSEEK_API_KEY` | Default key variable consumed by the container-local `model.json` |
| `RELAY_TEAMS_BENCH_API_KEY` | Generic one-off key variable, used when the configured key variable is unset |
| `RELAY_TEAMS_BENCH_API_KEY_ENV_VAR` | Name of the provider-specific key variable to read inside the benchmark container |
| `RELAY_TEAMS_BENCH_MODEL` | Model name, defaults to `deepseek-v4-flash` |
| `RELAY_TEAMS_BENCH_MODEL_BASE_URL` | Model base URL, defaults to `https://api.deepseek.com` |
| `RELAY_TEAMS_BENCH_MODEL_PROFILE` | Container-local profile name, defaults to `deepseek` |
| `RELAY_TEAMS_BENCH_BASE_URL` | relay-teams API URL; set by the Docker entrypoint for AgentBench |
| `RELAY_TEAMS_BENCH_WORKSPACE` | Optional container workspace path passed to `/api/workspaces/pick` |
| `RELAY_TEAMS_BENCH_SESSION_MODE` | `normal` or `orchestration` |
| `RELAY_TEAMS_BENCH_ROLE_ID` | Optional normal-mode root role |
| `RELAY_TEAMS_BENCH_ORCHESTRATION_ID` | Optional orchestration preset |
| `RELAY_TEAMS_BENCH_YOLO` | Defaults to `true` for unattended benchmark execution |
| `RELAY_TEAMS_BENCH_SKIP_SERVER_START` | Set to `true` only for manifest discovery or when a relay-teams server is already running |

### AgentBench OS and DB

First-class eval run:

```bash
relay-teams-evals run \
  --config .agent_teams/evals/configs/normal/eval-agentbench.yaml \
  --limit 5 \
  --concurrency 2

relay-teams-evals run \
  --config .agent_teams/evals/configs/orchestration/eval-agentbench.yaml \
  --limit 5 \
  --concurrency 2
```

Direct harness run:

```bash
python scripts/benchmarks/run_agentbench_docker.py \
  --suite all \
  --api-key-env-var DEEPSEEK_API_KEY
```

By default the AgentBench runner does not impose a per-task step cap or
wall-clock timeout. Use `--max-steps` or `--task-timeout-seconds` only when a
bounded smoke/debug run is desired:

```bash
python scripts/benchmarks/run_agentbench_docker.py \
  --suite os \
  --os-suite dev \
  --num-os-tasks 1 \
  --max-steps 6 \
  --task-timeout-seconds 900
```

Use explicit task counts for a smaller smoke run:

```bash
python scripts/benchmarks/run_agentbench_docker.py \
  --suite all \
  --os-suite dev \
  --num-os-tasks 2 \
  --num-db-tasks 2
```

The AgentBench runner uses the official AgentBench OS/DB task data while
running through relay-teams' container-local HTTP API. By default, OS uses the
official `os-std` split from `configs/tasks/os.yaml` (144 tasks). Use
`--os-suite dev` only for the smaller 26-task development split. The OS task
runs commands inside short-lived Docker containers based on the `local-os/*`
images built by `prepare_benchmarks.py`; the DB task evaluates SQL over
the benchmark table payloads inside the benchmark container.

AgentBench writes `results.json` after every task and classifies failed tasks as
`failure_kind=agent` or `failure_kind=infra`. Infrastructure failures are retried
inside the benchmark container with `--infra-retry-attempts` and
`--infra-retry-backoff-seconds`. After the Docker wrapper finishes, it writes the
same eval-style `evaluation.json`, `report.json`, `checkpoint.meta.json`,
`checkpoint.results.jsonl`, and `artifacts/` files described above. To resume a
previous run directory and only rerun infrastructure failures:

```bash
python scripts/benchmarks/run_agentbench_docker.py \
  --run-id 2026-05-25__10-55-13 \
  --suite all \
  --rerun-infra-failures
```

The tracked eval configs under `.agent_teams/evals/configs/normal/` and
`.agent_teams/evals/configs/orchestration/` are the canonical local examples
for first-class AgentBench runs. Raw
benchmark result files are still produced by the official harness, then
converted into eval-style `evaluation.json`, `report.json`, `report.html`,
checkpoint files, and per-task artifacts under the configured eval
`output_dir`.

## Rust Performance Self-Iteration

**Location:** `tools/performance_self_iteration/`

The performance self-iteration harness is an independent Rust tool for local
high-concurrency improvement loops. It generates candidate patches through
Codex, runs quality gates plus an async HTTP/SSE pressure workload, records
backend warnings/errors as improvement items, and accepts or rejects the
candidate using a stability-first score.

Stable entrypoint:

```bash
./self-iterate-performance.sh once --profile pressure-fast --yolo
./self-iterate-performance.sh evaluate --use-current-candidate --profile smoke
./self-iterate-performance.sh chart
```

Profiles:

| Profile | Purpose |
|---|---|
| `smoke` | Validates the Rust harness and report flow without backend pressure; smoke runs cannot accept or commit candidates. |
| `pressure-fast` | Default local pressure profile: configurable 64-100+ async concurrency against a managed backend restarted from the current workspace. |
| `pressure-full` | Longer local pressure profile with higher minimum concurrency and duration. |

For non-smoke profiles, the harness restarts a managed `relay-teams server`
from the current workspace before scoring, stops it gracefully after pressure,
and uses forced cleanup only if graceful teardown fails. Use a loopback
`--base-url` matching the managed server host and port:

```bash
./self-iterate-performance.sh evaluate \
  --use-current-candidate \
  --profile pressure-fast \
  --base-url http://127.0.0.1:8000 \
  --concurrency 100 \
  --duration-seconds 120 \
  --sessions 20 \
  --log-files /path/to/backend.log
```

State is stored under `.git/relay-teams-performance-iteration/`:

| Path | Purpose |
|---|---|
| `patches/` | Candidate diffs captured with `git diff --binary`. |
| `reports/` | Full JSON reports with pressure metrics and log findings. |
| `runs.jsonl` | Score history, reject reasons, and accepted status. |
| `memory/` | Per-run records injected into future Codex prompts. |
| `score.csv` | Exported trend data from `chart` mode. |

Failure policy:

- `Server is busy`, HTTP `503`, `429`, or other `5xx` responses reject a candidate.
- SSE streams that do not reach a terminal event reject a candidate.
- New `ERROR` log findings reject a candidate.
- `WARNING` log findings do not automatically fail the run, but they are
  recorded in `log_findings` and passed into the next self-iteration prompt as
  improvement items.
- By default accepted candidates are left in the working tree for review; pass
  `--commit-accepted` to let the harness create the commit.

## Design Principles

1. **Micro-benchmarks** validate individual component performance; they should complete in under 60 seconds total
2. **SWE-bench tracking** measures end-to-end quality at the task resolution level; it is expensive and runs on schedule
3. **Spec-compliance** acts as a CI gate to prevent coding standard drift; it is fast and runs on every PR
4. **AgentBench** measures OS/DB task-solving behavior through public interfaces and should run from isolated Docker tooling
