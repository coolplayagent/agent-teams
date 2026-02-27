from __future__ import annotations

from pathlib import Path

import typer

from agent_teams.core.models import IntentInput
from agent_teams.interfaces.sdk.client import AgentTeamsApp
from agent_teams.roles.registry import RoleLoader

app = typer.Typer(no_args_is_help=True)


def _roles_dir() -> Path:
    return Path('roles')


def _db_path() -> Path:
    return Path('.agent_teams.db')


@app.command('run-intent')
def run_intent(intent: str, session_id: str = 'default-session') -> None:
    sdk = AgentTeamsApp(roles_dir=_roles_dir(), db_path=_db_path())
    result = sdk.run_intent(IntentInput(session_id=session_id, intent=intent))
    typer.echo(result.model_dump_json(indent=2))


@app.command('tasks-list')
def tasks_list() -> None:
    sdk = AgentTeamsApp(roles_dir=_roles_dir(), db_path=_db_path())
    for task in sdk.list_tasks():
        typer.echo(task.model_dump_json())


@app.command('tasks-query')
def tasks_query(task_id: str) -> None:
    sdk = AgentTeamsApp(roles_dir=_roles_dir(), db_path=_db_path())
    task = sdk.query_task(task_id)
    typer.echo(task.model_dump_json(indent=2))


@app.command('roles-validate')
def roles_validate() -> None:
    registry = RoleLoader().load_all(_roles_dir())
    typer.echo(f'Loaded {len(registry.list_roles())} roles')


def main() -> None:
    app()
