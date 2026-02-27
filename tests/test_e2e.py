from pathlib import Path

from agent_teams.core.models import IntentInput
from agent_teams.interfaces.sdk.client import AgentTeamsApp


def test_e2e_run_intent(tmp_path: Path) -> None:
    db_path = tmp_path / 'agent_teams.db'
    app = AgentTeamsApp(roles_dir=Path('roles'), db_path=db_path)

    result = app.run_intent(IntentInput(session_id='s1', intent='write a short echo'))

    assert result.status in ('completed', 'failed')
    assert result.root_task_id
    task = app.query_task(result.root_task_id)
    assert task.envelope.objective == 'write a short echo'
