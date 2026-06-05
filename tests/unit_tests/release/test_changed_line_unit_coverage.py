# -*- coding: utf-8 -*-
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from coverage import Coverage
import pytest

from relay_teams.release.changed_line_unit_coverage import (
    ChangedLineCoverageError,
    ChangedLineCoverageReport,
    FileCoverageSummary,
    _analyze_source_file,
    _build_report,
    _matches_include_patterns,
    _parse_hunk_new_start,
    _parse_new_file_path,
    _require_mapping,
    _require_number,
    _require_string_tuple,
    build_changed_line_coverage_report,
    enforce_changed_line_coverage,
    format_changed_line_coverage_report,
    main,
    parse_cli_args,
    parse_changed_lines,
)


def test_parse_cli_args_handles_defaults_values_help_and_errors(
    capsys: pytest.CaptureFixture[str],
) -> None:
    assert parse_cli_args(()).coverage_file == Path(".coverage")

    args = parse_cli_args(
        (
            "--coverage-file",
            "coverage.db",
            "--diff-file",
            "changes.diff",
            "--config-file",
            "coverage.toml",
        )
    )

    assert args.coverage_file == Path("coverage.db")
    assert args.diff_file == Path("changes.diff")
    assert args.config_file == Path("coverage.toml")
    with pytest.raises(SystemExit) as exc_info:
        parse_cli_args(("--help",))
    assert exc_info.value.code == 0
    assert "Usage:" in capsys.readouterr().out
    with pytest.raises(ChangedLineCoverageError, match="Unknown option"):
        parse_cli_args(("--unknown",))
    with pytest.raises(ChangedLineCoverageError, match="requires a value"):
        parse_cli_args(("--coverage-file",))
    with pytest.raises(ChangedLineCoverageError, match="requires a value"):
        parse_cli_args(("--coverage-file", "--diff-file"))


def test_parse_changed_lines_filters_included_new_python_lines(tmp_path: Path) -> None:
    diff_file = tmp_path / "diff.patch"
    diff_file.write_text(
        "\n".join(
            [
                "diff --git a/src/relay_teams/example.py b/src/relay_teams/example.py",
                "--- a/src/relay_teams/example.py",
                "+++ b/src/relay_teams/example.py",
                "@@ -1,3 +1,4 @@",
                " def covered_value() -> int:",
                "+    return 1",
                "-    return 0",
                " ",
                "+# non-executable comment",
                "diff --git a/docs/example.md b/docs/example.md",
                "--- a/docs/example.md",
                "+++ b/docs/example.md",
                "@@ -1 +1 @@",
                "+ignored",
            ]
        ),
        encoding="utf-8",
    )

    changed_lines = parse_changed_lines(
        diff_file,
        include_patterns=("src/relay_teams/**/*.py",),
    )

    assert [(line.path.as_posix(), line.line_number) for line in changed_lines] == [
        ("src/relay_teams/example.py", 2),
        ("src/relay_teams/example.py", 4),
    ]


def test_parse_changed_lines_handles_deleted_files_and_hunk_edges(
    tmp_path: Path,
) -> None:
    diff_file = tmp_path / "edge.diff"
    diff_file.write_text(
        "\n".join(
            [
                "diff --git a/src/relay_teams/deleted.py b/src/relay_teams/deleted.py",
                "--- a/src/relay_teams/deleted.py",
                "+++ /dev/null",
                "@@ -1 +0,0 @@",
                "-old_line = 1",
                "diff --git a/docs/ignored.py b/docs/ignored.py",
                "--- a/docs/ignored.py",
                "+++ b/docs/ignored.py",
                "@@ -1 +1 @@",
                "+ignored = 1",
                "diff --git a/src/relay_teams/new.py b/src/relay_teams/new.py",
                "--- a/src/relay_teams/new.py",
                "+++ b/src/relay_teams/new.py",
                "@@ -0,0 +1,2 @@",
                "\\ No newline at end of file",
                "+value = 1",
            ]
        ),
        encoding="utf-8",
    )

    changed_lines = parse_changed_lines(
        diff_file,
        include_patterns=("src/relay_teams/**/*.py",),
    )

    assert [(line.path.as_posix(), line.line_number) for line in changed_lines] == [
        ("src/relay_teams/new.py", 1)
    ]
    assert (
        _parse_new_file_path(
            "+++ /dev/null",
            include_patterns=("src/relay_teams/**/*.py",),
        )
        is None
    )
    assert (
        _parse_new_file_path(
            "+++ b/docs/ignored.py",
            include_patterns=("src/relay_teams/**/*.py",),
        )
        is None
    )
    assert _matches_include_patterns(
        Path("src/relay_teams/example.py"),
        ("src/relay_teams/*.py",),
    )
    with pytest.raises(ChangedLineCoverageError, match="Invalid unified diff"):
        _parse_hunk_new_start("@@ invalid @@")


def test_changed_line_coverage_uses_coverage_data_without_xml(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    project_root = tmp_path
    package_root = project_root / "src" / "relay_teams"
    package_root.mkdir(parents=True)
    (package_root / "__init__.py").write_text("", encoding="utf-8")
    sample_file = package_root / "sample.py"
    sample_file.write_text(
        "\n".join(
            [
                "from __future__ import annotations",
                "",
                "def covered_value() -> int:",
                "    return 1",
                "",
                "def uncovered_value() -> int:",
                "    return 2",
                "",
                "# comment-only changed lines are ignored",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    runner_file = project_root / "run_sample.py"
    runner_file.write_text(
        "from relay_teams import sample\n\nsample.covered_value()\n",
        encoding="utf-8",
    )
    config_file = project_root / "pyproject.toml"
    config_file.write_text(
        "\n".join(
            [
                "[tool.coverage.run]",
                'source = ["src/relay_teams"]',
                "",
                "[tool.diff_cover]",
                "fail_under = 90",
                'include = ["src/relay_teams/**/*.py"]',
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    coverage_file = project_root / ".coverage"
    env = os.environ.copy()
    env["PYTHONPATH"] = str(project_root / "src")
    subprocess.run(
        [
            sys.executable,
            "-m",
            "coverage",
            "run",
            "--rcfile",
            str(config_file),
            "--data-file",
            str(coverage_file),
            str(runner_file),
        ],
        check=True,
        cwd=project_root,
        env=env,
    )
    diff_file = project_root / "diff.patch"
    diff_file.write_text(
        "\n".join(
            [
                "diff --git a/src/relay_teams/sample.py b/src/relay_teams/sample.py",
                "--- a/src/relay_teams/sample.py",
                "+++ b/src/relay_teams/sample.py",
                "@@ -1,9 +1,9 @@",
                " from __future__ import annotations",
                " ",
                " def covered_value() -> int:",
                "+    return 1",
                " ",
                " def uncovered_value() -> int:",
                "+    return 2",
                " ",
                "+# comment-only changed lines are ignored",
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    report = build_changed_line_coverage_report(
        project_root=project_root,
        coverage_file=coverage_file,
        diff_file=diff_file,
        config_file=config_file,
    )

    assert report.total_changed_statements == 2
    assert report.total_missing_statements == 1
    assert report.coverage_percent == 50.0
    formatted_report = format_changed_line_coverage_report(
        report=report,
        fail_under=90.0,
    )
    assert "src/relay_teams/sample.py (50%)" in formatted_report
    assert "Missing lines: 7" in formatted_report
    with pytest.raises(ChangedLineCoverageError):
        enforce_changed_line_coverage(report=report, fail_under=90.0)

    config_file.write_text(
        "\n".join(
            [
                "[tool.coverage.run]",
                'source = ["src/relay_teams"]',
                "",
                "[tool.diff_cover]",
                "fail_under = 50",
                'include = ["src/relay_teams/**/*.py"]',
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    monkeypatch.chdir(project_root)

    assert (
        main(
            (
                "--coverage-file",
                str(coverage_file),
                "--diff-file",
                str(diff_file),
                "--config-file",
                str(config_file),
            )
        )
        == 0
    )
    assert "Coverage: 50.00%" in capsys.readouterr().out
    assert main(("--unknown",)) == 1
    assert "Unknown option" in capsys.readouterr().err


def test_report_formatting_handles_empty_and_zero_statement_reports() -> None:
    empty_report = ChangedLineCoverageReport(
        summaries=(),
        total_changed_statements=0,
        total_missing_statements=0,
        coverage_percent=100.0,
    )

    assert "No changed executable Python lines" in format_changed_line_coverage_report(
        report=empty_report,
        fail_under=90.0,
    )

    zero_statement_report = _build_report(
        (
            FileCoverageSummary(
                path=Path("src/relay_teams/empty.py"),
                changed_statement_lines=(),
                missing_statement_lines=(),
            ),
        )
    )

    assert zero_statement_report.coverage_percent == 100.0
    assert "src/relay_teams/empty.py" not in format_changed_line_coverage_report(
        report=zero_statement_report,
        fail_under=90.0,
    )


def test_config_validation_reports_shape_errors() -> None:
    with pytest.raises(ChangedLineCoverageError, match="TOML mapping"):
        _require_mapping([], "tool")
    with pytest.raises(ChangedLineCoverageError, match="missing \\[tool\\]"):
        _require_mapping({}, "tool")
    with pytest.raises(ChangedLineCoverageError, match="numeric field"):
        _require_number({}, "fail_under")
    with pytest.raises(ChangedLineCoverageError, match="list field"):
        _require_string_tuple({}, "include")
    with pytest.raises(ChangedLineCoverageError, match="contain strings"):
        _require_string_tuple({"include": [123]}, "include")


def test_analyze_source_file_wraps_coverage_errors(tmp_path: Path) -> None:
    coverage = Coverage()

    with pytest.raises(ChangedLineCoverageError, match="Could not analyze coverage"):
        _analyze_source_file(
            coverage=coverage,
            source_file=tmp_path / "missing.py",
        )
