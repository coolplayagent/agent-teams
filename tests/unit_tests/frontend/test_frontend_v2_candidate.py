# -*- coding: utf-8 -*-
from __future__ import annotations

import re
from pathlib import Path

NAMED_IMPORT_RE = re.compile(
    r"import\s*\{(?P<names>.*?)\}\s*from\s*['\"](?P<source>\.[^'\"]+)['\"]",
    re.DOTALL,
)
DIRECT_EXPORT_RE = re.compile(
    r"export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)"
)
NAMED_EXPORT_RE = re.compile(r"export\s*\{(?P<names>.*?)\}", re.DOTALL)


def test_frontend_candidate_is_source_tree_not_dist_mirror() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    candidate_root = repo_root / "frontend" / "v2"
    source_root = candidate_root / "src"

    assert (source_root / "index.html").is_file()
    assert (source_root / "app" / "main.js").is_file()
    assert not (candidate_root / "index.html").exists()
    assert not (source_root / "js").exists()
    assert not (source_root / "css" / "components").exists()
    assert len(tuple(source_root.rglob("*.*"))) <= 12


def test_frontend_candidate_file_names_do_not_include_candidate_marker() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    candidate_root = repo_root / "frontend" / "v2" / "src"
    candidate_files = tuple(
        path for path in candidate_root.rglob("*") if path.is_file()
    )

    assert candidate_files
    assert all("v2" not in path.name.lower() for path in candidate_files)


def test_frontend_candidate_relative_named_imports_are_exported() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    candidate_root = repo_root / "frontend" / "v2" / "src"

    missing_exports: list[str] = []
    for importer in candidate_root.rglob("*.js"):
        for imported_name, source_path in _relative_named_imports(importer):
            resolved_module = (importer.parent / source_path).resolve()
            if not resolved_module.exists():
                missing_exports.append(
                    f"{importer.relative_to(repo_root)} imports {source_path}, "
                    "but the module file is missing"
                )
                continue
            exported_names = _exported_names(resolved_module)
            if imported_name not in exported_names:
                missing_exports.append(
                    f"{importer.relative_to(repo_root)} imports {imported_name} "
                    f"from {resolved_module.relative_to(repo_root)}, but it is not exported"
                )

    assert missing_exports == []


def test_v1_frontend_links_to_candidate() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    index_html = (repo_root / "frontend" / "dist" / "index.html").read_text(
        encoding="utf-8"
    )
    base_css = (
        repo_root / "frontend" / "dist" / "css" / "components" / "base.css"
    ).read_text(encoding="utf-8")

    assert 'id="try-v2-btn"' in index_html
    assert 'href="/v2/"' in index_html
    assert "体验新版" in index_html
    assert "<svg" in index_html[index_html.index('id="try-v2-btn"') :]
    assert ".try-v2-btn" in base_css


def test_frontend_candidate_links_back_to_v1() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    shell_js = (repo_root / "frontend" / "v2" / "src" / "app" / "shell.js").read_text(
        encoding="utf-8"
    )
    app_css = (repo_root / "frontend" / "v2" / "src" / "styles" / "app.css").read_text(
        encoding="utf-8"
    )

    assert 'href="/"' in shell_js
    assert "返回旧版" in shell_js
    assert "<svg" in shell_js
    assert ".version-switch" in app_css


def _relative_named_imports(importer: Path) -> tuple[tuple[str, Path], ...]:
    content = importer.read_text(encoding="utf-8")
    imports: list[tuple[str, Path]] = []
    for match in NAMED_IMPORT_RE.finditer(content):
        source_path = Path(match.group("source"))
        for raw_name in match.group("names").split(","):
            imported_name = raw_name.strip()
            if not imported_name:
                continue
            imports.append((_imported_binding_name(imported_name), source_path))
    return tuple(imports)


def _imported_binding_name(raw_name: str) -> str:
    parts = tuple(part.strip() for part in raw_name.split(" as ", maxsplit=1))
    return parts[0]


def _exported_names(module_path: Path) -> set[str]:
    content = module_path.read_text(encoding="utf-8")
    names = set(DIRECT_EXPORT_RE.findall(content))
    for match in NAMED_EXPORT_RE.finditer(content):
        for raw_name in match.group("names").split(","):
            export_name = raw_name.strip()
            if not export_name:
                continue
            names.add(_exported_alias_name(export_name))
    return names


def _exported_alias_name(raw_name: str) -> str:
    parts = tuple(part.strip() for part in raw_name.split(" as ", maxsplit=1))
    if len(parts) == 2:
        return parts[1]
    return parts[0]
