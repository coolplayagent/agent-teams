from __future__ import annotations

from relay_teams_evals import backends
from relay_teams_evals.backends import AgentBenchRunBackend, AgentTeamsBackend
from relay_teams_evals.backends.agent_teams import (
    AgentTeamsBackend as DirectAgentTeamsBackend,
)
from relay_teams_evals.backends.agentbench_run import (
    AgentBenchRunBackend as DirectAgentBenchRunBackend,
)


def test_backends_package_exports_runtime_backends() -> None:
    assert AgentTeamsBackend is DirectAgentTeamsBackend
    assert AgentBenchRunBackend is DirectAgentBenchRunBackend
    assert "AgentTeamsBackend" in backends.__all__
    assert "AgentBenchRunBackend" in backends.__all__
