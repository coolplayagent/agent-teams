# Repository Guidelines

## Project Structure & Module Organization
- Core code lives in `src/agent_teams/`.
- Main areas:
  - `core/`: shared models, enums, IDs, runtime config.
  - `agents/`, `coordination/`, `workflow/`: orchestration and execution flow.
  - `tools/`: collaboration tools and pydantic_ai tool adapters.
  - `providers/`: LLM provider integration (OpenAI-compatible via `pydantic_ai`).
  - `state/`, `events/`, `runtime/`: SQLite state, event bus, run-time injection/event hub.
  - `interfaces/cli` and `interfaces/sdk`: CLI and Python SDK entry points.
- Role definitions are Markdown files in `roles/`.
- Tests are in `tests/` with `test_*.py` naming.

## Build, Test, and Development Commands
- `uv sync`: install project dependencies from `pyproject.toml`.
- `uv run agent-teams roles-validate`: validate role files in `roles/`.
- `uv run agent-teams run-intent --intent "..."`: run a single intent.
- `uv run agent-teams run-intent-stream --intent "..."`: stream run events.
- `uv run pytest -q`: run full test suite quietly.
- `uv run pytest tests/test_example.py::test_function -v`: run single test.
- `uv run pytest tests/ -k "pattern"`: run tests matching pattern.
- If using the virtualenv directly on Windows:
  - `.\.venv\Scripts\agent-teams.exe run-intent --intent "hello"`
  - `.\.venv\Scripts\pytest.exe tests/test_example.py::test_function -v`

## Code Style & Type Conventions

### General
- Language: Python 3.12+ with type-first design (Pydantic models/enums over loose dicts).
- Use 4-space indentation and UTF-8 files.
- Avoid `Any` in core flow; keep domain interfaces strongly typed.

### Naming
- modules/functions: `snake_case`
- classes/enums: `PascalCase`
- constants: `UPPER_SNAKE_CASE`
- Private members (not for external use): prefix with `_`

### Imports
- Use `from __future__ import annotations` for forward references.
- Group imports in this order: stdlib, third-party, local (separate with blank line).
- Prefer absolute imports: `from agent_teams.core import models`.
- Avoid wildcard imports (`from x import *`).
- Example:
  ```python
  from __future__ import annotations

  import json
  from pathlib import Path
  from typing import Callable

  import pydantic
  import typer

  from agent_teams.core.config import load_runtime_config
  from agent_teams.core.enums import RunEventType
  ```

### Type Annotations
- All function parameters must have type annotations (including `ctx` in tool functions).
- Return type annotations are required for all functions.
- Use `X | None` over `Optional[X]`.
- Use `tuple[X, ...]` for homogeneous tuples, not `Tuple[X, ...]`.
- Pydantic models: use `Field(default=..., ge=...)` for validation.

### Pydantic Models
- Use `model_config = ConfigDict(extra='forbid')` to reject unknown fields.
- Use `Field` with constraints: `Field(default=..., min_length=1, ge=0)`.
- Use `Field(default_factory=...)` for mutable defaults (e.g., `datetime.now`).
- Example:
  ```python
  class TaskRecord(BaseModel):
      model_config = ConfigDict(extra='forbid')

      task_id: str = Field(min_length=1)
      status: TaskStatus = TaskStatus.CREATED
      created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
  ```

### Error Handling
- Raise specific exceptions with descriptive messages: `raise ValueError(f'Unknown tools: {missing}')`.
- Use `try/except` blocks only when you can handle the error meaningfully.
- Propagate unexpected errors after logging; don't swallow silently.
- For recoverable errors, return `None` or a result type rather than raising.

### Logging
- Use `runtime.console` for structured debug logs: `log_debug('[module:action] detail')`.
- Format: `[scope:action] key=value ...`
- Avoid `print()` in production code.

### Dataclasses
- Use `@dataclass` for simple data holders.
- Use `@dataclass(frozen=True)` for immutable records (e.g., `ToolSpec`).
- Mark fields with `_` prefix for private: `_internal: int`.

## Testing Guidelines
- Framework: `pytest`.
- Test files: `tests/test_*.py`; test functions: `test_*`.
- Prefer focused unit tests for model validation, queue/event behavior, and orchestration transitions.
- Add integration tests for run streaming and injection behavior when changing runtime flow.
- Use `pytest.raises` for exception testing.
- Example:
  ```python
  import pytest
  from agent_teams.tools.defaults import build_default_registry

  def test_registry_rejects_unknown_tools() -> None:
      registry = build_default_registry()
      with pytest.raises(ValueError):
          registry.validate_known(('read', 'unknown_tool'))
  ```

## Git Conventions

### Commit Messages
- Follow existing history style: short imperative subject lines.
- Examples:
  - `Implement run-time injection queue and event streaming for react flow`
  - `Chore: tidy git ignore rules and remove IDE artifacts`
  - `Fix: handle missing coordinator instance in session recovery`
- Keep commits scoped to one logical change.

### Pull Requests
- Include:
  - purpose and summary of behavior changes,
  - key files/modules touched,
  - test evidence (commands + results),
  - config or migration notes (`.agent_teams/.env`, schema/runtime changes).

## Security & Configuration
- Store credentials only in `.agent_teams/.env` (never commit secrets).
- Use `.agent_teams/.env.example` as the template.
- Required model settings: `OPENAI_MODEL`, `OPENAI_BASE_URL`, `OPENAI_API_KEY`.
- If these are empty, the app falls back to local `EchoProvider` for smoke testing.

## Tool Development
- Tools live in `src/agent_teams/tools/<name>/`.
- Structure: `__init__.py` exports `TOOL_SPEC`, `mount.py` contains the pydantic_ai mount function.
- Use `ToolRegistry` to register and validate tools.
- Example structure:
  ```
  tools/
    read/
      __init__.py   # exports TOOL_SPEC = ToolSpec(name='read', mount=mount)
      mount.py      # def mount(agent: Agent[ToolDeps, str]) -> None: ...
  ```
- Document tool purpose and parameters in the function docstring.
