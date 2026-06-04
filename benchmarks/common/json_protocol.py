from __future__ import annotations

import json
from collections.abc import Iterator

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    JsonValue,
    model_validator,
    ValidationError,
)


class BenchmarkJsonError(ValueError):
    """Raised when a benchmark adapter response cannot be decoded."""


class CommandDecision(BaseModel):
    model_config = ConfigDict(extra="ignore")

    commands: tuple[str, ...] = ()
    command_durations: tuple[float, ...] = ()
    done: bool = False
    task_complete: bool = False
    answer: str = ""
    analysis: str = ""
    plan: str = ""

    @model_validator(mode="before")
    @classmethod
    def normalize_command_payload(cls, value: object) -> object:
        if not isinstance(value, dict):
            return value
        normalized: dict[str, object] = dict(value)
        commands, durations = _normalize_terminal_commands(normalized.get("commands"))
        normalized["commands"] = tuple(commands)
        normalized["command_durations"] = tuple(durations)

        done_obj = normalized.get("done")
        task_complete_obj = normalized.get("task_complete")
        done = _bool_value(done_obj)
        task_complete = _bool_value(task_complete_obj)
        normalized["done"] = done or task_complete
        normalized["task_complete"] = task_complete or done
        return normalized


class ToolCallDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    arguments: dict[str, JsonValue] = Field(default_factory=dict)

    @field_validator("arguments", mode="before")
    @classmethod
    def normalize_arguments(cls, value: object) -> object:
        if isinstance(value, str):
            try:
                decoded = json.loads(value)
            except json.JSONDecodeError:
                return value
            if isinstance(decoded, dict):
                return decoded
        return value


class AgentBenchDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    arguments: dict[str, JsonValue] = Field(default_factory=dict)

    @field_validator("arguments", mode="before")
    @classmethod
    def normalize_arguments(cls, value: object) -> object:
        return ToolCallDecision.normalize_arguments(value)


def _normalize_terminal_commands(value: object) -> tuple[list[str], list[float]]:
    commands: list[str] = []
    durations: list[float] = []
    if not isinstance(value, list | tuple):
        return commands, durations
    for item in value:
        if isinstance(item, str):
            commands.append(item)
            durations.append(1.0)
            continue
        if isinstance(item, dict):
            command = _command_from_object(item)
            commands.append(command)
            durations.append(_duration_from_object(item))
    return commands, durations


def _command_from_object(value: dict[object, object]) -> str:
    keystrokes = value.get("keystrokes")
    if isinstance(keystrokes, str):
        return keystrokes
    command = value.get("command")
    if isinstance(command, str):
        return command
    return ""


def _duration_from_object(value: dict[object, object]) -> float:
    duration = _float_value(value.get("duration"), default=1.0)
    return min(max(duration, 0.0), 60.0)


def _float_value(value: object, *, default: float) -> float:
    if isinstance(value, bool):
        return default
    if isinstance(value, int | float):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return default
    return default


def _bool_value(value: object) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"true", "1", "yes"}
    return False


def parse_command_decision(text: str) -> CommandDecision:
    return _parse_model(text, CommandDecision)


def parse_agentbench_decision(text: str) -> AgentBenchDecision:
    return _parse_model(text, AgentBenchDecision)


def extract_first_json_object(text: str) -> str:
    for start in _object_start_indexes(text):
        parsed = _scan_json_object(text, start)
        if parsed:
            return parsed
    raise BenchmarkJsonError("no JSON object found in model response")


def _parse_model[T: BaseModel](text: str, model_type: type[T]) -> T:
    payload = extract_first_json_object(text)
    try:
        return model_type.model_validate_json(payload)
    except ValidationError as exc:
        raise BenchmarkJsonError(str(exc)) from exc


def _object_start_indexes(text: str) -> Iterator[int]:
    for index, character in enumerate(text):
        if character == "{":
            yield index


def _scan_json_object(text: str, start: int) -> str | None:
    depth = 0
    in_string = False
    escaped = False
    for index in range(start, len(text)):
        character = text[index]
        if in_string:
            if escaped:
                escaped = False
            elif character == "\\":
                escaped = True
            elif character == '"':
                in_string = False
            continue
        if character == '"':
            in_string = True
        elif character == "{":
            depth += 1
        elif character == "}":
            depth -= 1
            if depth == 0:
                candidate = text[start : index + 1]
                try:
                    json.loads(candidate)
                except json.JSONDecodeError:
                    return None
                return candidate
    return None
