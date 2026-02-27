from __future__ import annotations

from dataclasses import dataclass
from uuid import uuid4


@dataclass(frozen=True)
class RoleId:
    value: str


@dataclass(frozen=True)
class InstanceId:
    value: str


@dataclass(frozen=True)
class TaskId:
    value: str


@dataclass(frozen=True)
class WorkflowId:
    value: str


@dataclass(frozen=True)
class TraceId:
    value: str


def new_trace_id() -> TraceId:
    return TraceId(value=str(uuid4()))


def new_instance_id() -> InstanceId:
    return InstanceId(value=str(uuid4()))


def new_task_id() -> TaskId:
    return TaskId(value=str(uuid4()))
