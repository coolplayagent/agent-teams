import pytest
from pathlib import Path

from agent_teams.tools.stage_docs import current_stage_doc_path, previous_stage_doc_path
from agent_teams.tools.stage_docs import write_stage_doc_once


def test_stage_doc_paths() -> None:
    root = Path('D:/workspace/agent_teams')
    run_id = 'run123'

    assert str(current_stage_doc_path(workspace_root=root, run_id=run_id, role_id='spec_builder')).endswith(
        '.agent_teams/stage_docs/run123/spec.md'.replace('/', '\\')
    )
    assert str(current_stage_doc_path(workspace_root=root, run_id=run_id, role_id='design_builder')).endswith(
        '.agent_teams/stage_docs/run123/design.md'.replace('/', '\\')
    )
    assert str(current_stage_doc_path(workspace_root=root, run_id=run_id, role_id='verify')).endswith(
        '.agent_teams/stage_docs/run123/verify.md'.replace('/', '\\')
    )

    assert str(previous_stage_doc_path(workspace_root=root, run_id=run_id, role_id='design_builder')).endswith(
        '.agent_teams/stage_docs/run123/spec.md'.replace('/', '\\')
    )
    assert str(previous_stage_doc_path(workspace_root=root, run_id=run_id, role_id='verify')).endswith(
        '.agent_teams/stage_docs/run123/design.md'.replace('/', '\\')
    )


def test_write_stage_doc_once_rejects_duplicate(monkeypatch: pytest.MonkeyPatch) -> None:
    path = Path('smoke_stage_doc_once.md')
    written = {'exists': False}

    def _exists(_: Path) -> bool:
        return written['exists']

    def _mkdir(_: Path, parents: bool, exist_ok: bool) -> None:
        return None

    def _write_text(_: Path, content: str, encoding: str) -> int:
        written['exists'] = True
        return len(content)

    monkeypatch.setattr(Path, 'exists', _exists)
    monkeypatch.setattr(Path, 'write_text', _write_text)
    monkeypatch.setattr(Path, 'mkdir', _mkdir)

    write_stage_doc_once(path=path, content='v1')
    with pytest.raises(ValueError):
        write_stage_doc_once(path=path, content='v2')
