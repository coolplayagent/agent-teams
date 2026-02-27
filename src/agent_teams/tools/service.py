from __future__ import annotations

from agent_teams.agents.instance_pool import InstancePool
from agent_teams.core.enums import EventType, TaskStatus
from agent_teams.core.models import EventEnvelope, SubAgentInstance, TaskRecord, VerificationResult
from agent_teams.events.event_bus import EventBus
from agent_teams.state.shared_store import SharedStore
from agent_teams.state.task_repo import TaskRepository
from agent_teams.tools.models import (
    AssignTaskRequest,
    CreateSubAgentRequest,
    CreateTaskRequest,
    EmitEventRequest,
    ManageStateRequest,
    QueryTaskRequest,
    VerifyTaskRequest,
)


class CollaborationTools:
    def __init__(
        self,
        task_repo: TaskRepository,
        instance_pool: InstancePool,
        shared_store: SharedStore,
        event_bus: EventBus,
    ) -> None:
        self._task_repo = task_repo
        self._instance_pool = instance_pool
        self._shared_store = shared_store
        self._event_bus = event_bus

    def create_task(self, req: CreateTaskRequest) -> None:
        self._task_repo.create(req.envelope)

    def assign_task(self, req: AssignTaskRequest) -> None:
        self._task_repo.update_status(
            task_id=req.task_id,
            status=TaskStatus.ASSIGNED,
            assigned_instance_id=req.instance_id,
        )

    def query_task(self, req: QueryTaskRequest) -> TaskRecord:
        return self._task_repo.get(req.task_id)

    def verify_task(self, req: VerifyTaskRequest) -> VerificationResult:
        task = self._task_repo.get(req.task_id)
        if task.status != TaskStatus.COMPLETED or task.result is None:
            passed = False
            details = ('Task not completed yet',)
            event_type = EventType.VERIFICATION_FAILED
        else:
            checklist = task.envelope.verification.checklist
            result = task.result.lower()
            missing = tuple(item for item in checklist if item.lower() not in result)
            passed = len(missing) == 0
            details = ('All checklist items found in result',) if passed else missing
            event_type = EventType.VERIFICATION_PASSED if passed else EventType.VERIFICATION_FAILED

        verification = VerificationResult(task_id=task.envelope.task_id, passed=passed, details=details)
        self._event_bus.emit(
            EventEnvelope(
                event_type=event_type,
                trace_id=task.envelope.trace_id,
                session_id=task.envelope.session_id,
                task_id=task.envelope.task_id,
                payload_json=verification.model_dump_json(),
            )
        )
        return verification

    def list_tasks(self) -> tuple[TaskRecord, ...]:
        return self._task_repo.list_all()

    def create_subagent(self, req: CreateSubAgentRequest) -> SubAgentInstance:
        return self._instance_pool.create_subagent(req.role_id)

    def manage_state(self, req: ManageStateRequest) -> None:
        self._shared_store.manage_state(req.mutation)

    def emit_event(self, req: EmitEventRequest) -> None:
        self._event_bus.emit(req.event)
