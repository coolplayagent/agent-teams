# -*- coding: utf-8 -*-
from __future__ import annotations

import re
import sys
import tomllib
from pathlib import Path
from typing import NamedTuple

from coverage import Coverage
from coverage.exceptions import CoverageException

_DEFAULT_CONFIG_PATH = Path("pyproject.toml")
_DEFAULT_COVERAGE_PATH = Path(".coverage")
_DEFAULT_DIFF_PATH = Path(".tmp/diff-cover-copy-aware.diff")
_HUNK_HEADER_PATTERN = re.compile(r"^@@ -\d+(?:,\d+)? \+(?P<start>\d+)(?:,\d+)? @@")
_USAGE = """
Usage:
  python -m relay_teams.release.changed_line_unit_coverage
      [--coverage-file PATH]
      [--diff-file PATH]
      [--config-file PATH]

Reads [tool.diff_cover] include/fail_under settings from the config file and
checks changed executable Python lines directly against the .coverage database.
""".strip()


class ChangedLineCoverageError(ValueError):
    pass


class ChangedLine(NamedTuple):
    path: Path
    line_number: int


class ChangedLineCoverageSettings(NamedTuple):
    include_patterns: tuple[str, ...]
    fail_under: float


class FileCoverageSummary(NamedTuple):
    path: Path
    changed_statement_lines: tuple[int, ...]
    missing_statement_lines: tuple[int, ...]

    @property
    def total_changed_statements(self) -> int:
        return len(self.changed_statement_lines)

    @property
    def total_missing_statements(self) -> int:
        return len(self.missing_statement_lines)

    @property
    def coverage_percent(self) -> float:
        if self.total_changed_statements == 0:
            return 100.0
        covered_lines = self.total_changed_statements - self.total_missing_statements
        return covered_lines / self.total_changed_statements * 100.0


class ChangedLineCoverageReport(NamedTuple):
    summaries: tuple[FileCoverageSummary, ...]
    total_changed_statements: int
    total_missing_statements: int
    coverage_percent: float


class ChangedLineCoverageCliArgs(NamedTuple):
    coverage_file: Path
    diff_file: Path
    config_file: Path


def parse_cli_args(argv: tuple[str, ...]) -> ChangedLineCoverageCliArgs:
    coverage_file = _DEFAULT_COVERAGE_PATH
    diff_file = _DEFAULT_DIFF_PATH
    config_file = _DEFAULT_CONFIG_PATH
    index = 0
    while index < len(argv):
        option = argv[index]
        if option in {"-h", "--help"}:
            print(_USAGE)
            raise SystemExit(0)
        if option == "--coverage-file":
            coverage_file = Path(_next_option_value(argv, index, option))
            index += 2
            continue
        if option == "--diff-file":
            diff_file = Path(_next_option_value(argv, index, option))
            index += 2
            continue
        if option == "--config-file":
            config_file = Path(_next_option_value(argv, index, option))
            index += 2
            continue
        raise ChangedLineCoverageError(f"Unknown option: {option}")
    return ChangedLineCoverageCliArgs(
        coverage_file=coverage_file,
        diff_file=diff_file,
        config_file=config_file,
    )


def _next_option_value(
    argv: tuple[str, ...],
    index: int,
    option: str,
) -> str:
    value_index = index + 1
    if value_index >= len(argv):
        raise ChangedLineCoverageError(f"{option} requires a value")
    value = argv[value_index]
    if value.startswith("--"):
        raise ChangedLineCoverageError(f"{option} requires a value")
    return value


def load_changed_line_coverage_settings(
    config_file: Path,
) -> ChangedLineCoverageSettings:
    payload: object = tomllib.loads(config_file.read_text(encoding="utf-8"))
    tool = _require_mapping(payload, "tool")
    diff_cover = _require_mapping(tool, "diff_cover")
    include_patterns = _require_string_tuple(diff_cover, "include")
    fail_under = _require_number(diff_cover, "fail_under")
    return ChangedLineCoverageSettings(
        include_patterns=include_patterns,
        fail_under=fail_under,
    )


def parse_changed_lines(
    diff_file: Path,
    *,
    include_patterns: tuple[str, ...],
) -> tuple[ChangedLine, ...]:
    changed_lines: set[ChangedLine] = set()
    current_path: Path | None = None
    current_new_line: int | None = None
    for raw_line in diff_file.read_text(encoding="utf-8").splitlines():
        if raw_line.startswith("diff --git "):
            current_path = None
            current_new_line = None
            continue
        if raw_line.startswith("+++ "):
            current_path = _parse_new_file_path(
                raw_line,
                include_patterns=include_patterns,
            )
            current_new_line = None
            continue
        if raw_line.startswith("@@ "):
            if current_path is None:
                current_new_line = None
                continue
            current_new_line = _parse_hunk_new_start(raw_line)
            continue
        if current_new_line is None:
            continue
        if current_path is None:
            continue
        if raw_line.startswith("\\"):
            continue
        if raw_line.startswith("+"):
            changed_lines.add(
                ChangedLine(path=current_path, line_number=current_new_line)
            )
            current_new_line += 1
            continue
        if raw_line.startswith("-"):
            continue
        current_new_line += 1
    return tuple(
        sorted(changed_lines, key=lambda line: (line.path.as_posix(), line.line_number))
    )


def build_changed_line_coverage_report(
    *,
    project_root: Path,
    coverage_file: Path,
    diff_file: Path,
    config_file: Path,
) -> ChangedLineCoverageReport:
    settings = load_changed_line_coverage_settings(config_file)
    changed_lines = parse_changed_lines(
        diff_file,
        include_patterns=settings.include_patterns,
    )
    changed_lines_by_path = _group_changed_lines_by_path(changed_lines)
    coverage = Coverage(
        data_file=str(coverage_file),
        config_file=str(config_file),
    )
    coverage.load()
    summaries: list[FileCoverageSummary] = []
    for relative_path, changed_line_numbers in sorted(
        changed_lines_by_path.items(),
        key=lambda item: item[0].as_posix(),
    ):
        statement_lines, missing_lines = _analyze_source_file(
            coverage=coverage,
            source_file=project_root / relative_path,
        )
        changed_statement_lines = tuple(
            sorted(line for line in changed_line_numbers if line in statement_lines)
        )
        missing_statement_lines = tuple(
            line for line in changed_statement_lines if line in missing_lines
        )
        summaries.append(
            FileCoverageSummary(
                path=relative_path,
                changed_statement_lines=changed_statement_lines,
                missing_statement_lines=missing_statement_lines,
            )
        )
    return _build_report(tuple(summaries))


def enforce_changed_line_coverage(
    *,
    report: ChangedLineCoverageReport,
    fail_under: float,
) -> None:
    if report.coverage_percent + 1e-9 < fail_under:
        raise ChangedLineCoverageError(
            "Changed-line unit coverage "
            f"{report.coverage_percent:.2f}% is below required "
            f"{fail_under:.2f}%."
        )


def format_changed_line_coverage_report(
    *,
    report: ChangedLineCoverageReport,
    fail_under: float,
) -> str:
    lines = [
        "-------------",
        "Diff Coverage",
        "-------------",
    ]
    if not report.summaries:
        lines.append("No changed executable Python lines matched the coverage gate.")
    for summary in report.summaries:
        if summary.total_changed_statements == 0:
            continue
        lines.append(f"{summary.path.as_posix()} ({summary.coverage_percent:.0f}%)")
        if summary.missing_statement_lines:
            missing = ", ".join(str(line) for line in summary.missing_statement_lines)
            lines.append(f"  Missing lines: {missing}")
    lines.extend(
        [
            "-------------",
            f"Total:   {report.total_changed_statements} lines",
            f"Missing: {report.total_missing_statements} lines",
            f"Coverage: {report.coverage_percent:.2f}%",
            f"Required: {fail_under:.2f}%",
            "-------------",
        ]
    )
    return "\n".join(lines)


def _parse_new_file_path(
    raw_line: str,
    *,
    include_patterns: tuple[str, ...],
) -> Path | None:
    marker = raw_line.removeprefix("+++ ").strip()
    if marker == "/dev/null":
        return None
    if marker.startswith("b/"):
        marker = marker.removeprefix("b/")
    relative_path = Path(marker)
    if not _matches_include_patterns(relative_path, include_patterns):
        return None
    return relative_path


def _parse_hunk_new_start(raw_line: str) -> int:
    match = _HUNK_HEADER_PATTERN.match(raw_line)
    if match is None:
        raise ChangedLineCoverageError(f"Invalid unified diff hunk header: {raw_line}")
    return int(match.group("start"))


def _matches_include_patterns(
    relative_path: Path,
    include_patterns: tuple[str, ...],
) -> bool:
    relative_path_text = relative_path.as_posix()
    for pattern in include_patterns:
        if pattern.endswith("/**/*.py"):
            root = pattern.removesuffix("/**/*.py")
            if relative_path_text.startswith(
                f"{root}/"
            ) and relative_path_text.endswith(".py"):
                return True
            continue
        if relative_path.match(pattern):
            return True
    return False


def _group_changed_lines_by_path(
    changed_lines: tuple[ChangedLine, ...],
) -> dict[Path, set[int]]:
    grouped: dict[Path, set[int]] = {}
    for changed_line in changed_lines:
        line_numbers = grouped.setdefault(changed_line.path, set())
        line_numbers.add(changed_line.line_number)
    return grouped


def _analyze_source_file(
    *,
    coverage: Coverage,
    source_file: Path,
) -> tuple[set[int], set[int]]:
    try:
        analysis = coverage.analysis2(str(source_file))
    except CoverageException as exc:
        raise ChangedLineCoverageError(
            f"Could not analyze coverage for {source_file}: {exc}"
        ) from exc
    statement_lines = set(analysis[1])
    missing_lines = set(analysis[3])
    return statement_lines, missing_lines


def _build_report(
    summaries: tuple[FileCoverageSummary, ...],
) -> ChangedLineCoverageReport:
    total_changed_statements = sum(
        summary.total_changed_statements for summary in summaries
    )
    total_missing_statements = sum(
        summary.total_missing_statements for summary in summaries
    )
    if total_changed_statements == 0:
        coverage_percent = 100.0
    else:
        covered_lines = total_changed_statements - total_missing_statements
        coverage_percent = covered_lines / total_changed_statements * 100.0
    return ChangedLineCoverageReport(
        summaries=summaries,
        total_changed_statements=total_changed_statements,
        total_missing_statements=total_missing_statements,
        coverage_percent=coverage_percent,
    )


def _require_mapping(payload: object, key: str) -> dict[str, object]:
    if not isinstance(payload, dict):
        raise ChangedLineCoverageError("Coverage config must be a TOML mapping")
    value = payload.get(key)
    if not isinstance(value, dict):
        raise ChangedLineCoverageError(f"Coverage config is missing [{key}]")
    return value


def _require_number(payload: dict[str, object], key: str) -> float:
    value = payload.get(key)
    if not isinstance(value, int | float):
        raise ChangedLineCoverageError(
            f"Coverage config is missing numeric field: {key}"
        )
    return float(value)


def _require_string_tuple(payload: dict[str, object], key: str) -> tuple[str, ...]:
    value = payload.get(key)
    if not isinstance(value, list):
        raise ChangedLineCoverageError(f"Coverage config is missing list field: {key}")
    result: list[str] = []
    for item in value:
        if not isinstance(item, str):
            raise ChangedLineCoverageError(
                f"Coverage config list field must contain strings: {key}"
            )
        result.append(item)
    return tuple(result)


def main(argv: tuple[str, ...] | None = None) -> int:
    try:
        args = parse_cli_args(tuple(sys.argv[1:] if argv is None else argv))
        project_root = Path.cwd()
        settings = load_changed_line_coverage_settings(args.config_file)
        report = build_changed_line_coverage_report(
            project_root=project_root,
            coverage_file=args.coverage_file,
            diff_file=args.diff_file,
            config_file=args.config_file,
        )
        print(
            format_changed_line_coverage_report(
                report=report,
                fail_under=settings.fail_under,
            )
        )
        enforce_changed_line_coverage(
            report=report,
            fail_under=settings.fail_under,
        )
    except ChangedLineCoverageError as exc:
        print(f"changed-line coverage check failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
