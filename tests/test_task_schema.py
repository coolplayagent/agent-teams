import pytest

from pydantic import ValidationError

from agent_teams.core.models import TaskEnvelope, VerificationPlan


def test_task_envelope_requires_fields() -> None:
    with pytest.raises(ValidationError):
        TaskEnvelope(
            task_id='',
            trace_id='t1',
            objective='obj',
            verification=VerificationPlan(checklist=('echo',)),
        )
