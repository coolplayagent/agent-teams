# -*- coding: utf-8 -*-
from __future__ import annotations

import json
from pathlib import Path
import subprocess
from typing import cast

from pydantic import JsonValue


def test_backend_status_initializing_hint_shows_loading_banner(tmp_path: Path) -> None:
    payload = _run_backend_status_script(
        tmp_path=tmp_path,
        runner_source="""
const { initBackendStatusMonitor, getBackendStatus } = await import("./backendStatus.mjs");

initBackendStatusMonitor();
globalThis.__listeners["agent-teams-backend-status-hint"]({
    detail: { status: "initializing" },
});

console.log(JSON.stringify({
    status: getBackendStatus(),
    classes: globalThis.__backendStatus.classes,
    label: globalThis.__backendStatusLabel.textContent,
    ariaBusy: globalThis.__backendStatus.attributes["aria-busy"],
    banner: globalThis.__body.children[0],
    bannerLabel: globalThis.__body.children[0].label,
}));
""".strip(),
    )

    banner = cast(dict[str, JsonValue], payload["banner"])

    assert payload["status"] == "initializing"
    assert "initializing" in cast(list[str], payload["classes"])
    assert payload["label"] == "Loading page..."
    assert payload["ariaBusy"] == "true"
    assert "is-visible" in cast(list[str], banner["classes"])
    assert payload["bannerLabel"] == "Loading page..."


def test_backend_status_online_hint_hides_loading_banner(tmp_path: Path) -> None:
    payload = _run_backend_status_script(
        tmp_path=tmp_path,
        runner_source="""
const { initBackendStatusMonitor } = await import("./backendStatus.mjs");

initBackendStatusMonitor();
globalThis.__listeners["agent-teams-backend-status-hint"]({
    detail: { status: "initializing" },
});
globalThis.__listeners["agent-teams-backend-status-hint"]({
    detail: { status: "online" },
});

console.log(JSON.stringify({
    classes: globalThis.__backendStatus.classes,
    label: globalThis.__backendStatusLabel.textContent,
    ariaBusy: globalThis.__backendStatus.attributes["aria-busy"],
    banner: globalThis.__body.children[0],
}));
""".strip(),
    )

    banner = cast(dict[str, JsonValue], payload["banner"])

    assert "online" in cast(list[str], payload["classes"])
    assert payload["label"] == "Backend Connected"
    assert payload["ariaBusy"] == "false"
    assert "is-visible" not in cast(list[str], banner["classes"])
    banner_attributes = cast(dict[str, JsonValue], banner["attributes"])
    assert banner_attributes["aria-hidden"] == "true"


def _run_backend_status_script(
    tmp_path: Path,
    runner_source: str,
) -> dict[str, JsonValue]:
    repo_root = Path(__file__).resolve().parents[3]
    source_path = repo_root / "frontend" / "dist" / "js" / "utils" / "backendStatus.js"

    backend_status_module_path = tmp_path / "backendStatus.mjs"
    mock_dom_path = tmp_path / "mockDom.mjs"
    mock_i18n_path = tmp_path / "mockI18n.mjs"
    runner_path = tmp_path / "runner.mjs"

    mock_dom_path.write_text(
        """
export const els = {
    backendStatus: globalThis.__backendStatus,
    backendStatusLabel: globalThis.__backendStatusLabel,
};
""".strip(),
        encoding="utf-8",
    )
    mock_i18n_path.write_text(
        """
const table = {
    "backend.status.connected": "Backend Connected",
    "backend.status.offline": "Backend Offline",
    "backend.status.busy": "Backend Busy",
    "backend.status.checking": "Checking backend...",
    "backend.status.initializing": "Loading page...",
};

export function t(key) {
    return table[key] || key;
}
""".strip(),
        encoding="utf-8",
    )

    source_text = (
        source_path.read_text(encoding="utf-8")
        .replace("./dom.js", "./mockDom.mjs")
        .replace("./i18n.js", "./mockI18n.mjs")
    )
    backend_status_module_path.write_text(source_text, encoding="utf-8")

    runner_path.write_text(
        f"""
function createClassList(owner) {{
    return {{
        add(...names) {{
            for (const name of names) {{
                if (!owner.classes.includes(name)) owner.classes.push(name);
            }}
        }},
        remove(...names) {{
            owner.classes = owner.classes.filter(name => !names.includes(name));
        }},
    }};
}}

function createElement(tagName) {{
    const element = {{
        tagName,
        id: "",
        className: "",
        classes: [],
        attributes: {{}},
        dataset: {{}},
        children: [],
        textContent: "",
        hidden: false,
        classList: null,
        setAttribute(name, value) {{
            this.attributes[name] = String(value);
        }},
        removeAttribute(name) {{
            delete this.attributes[name];
        }},
        appendChild(child) {{
            this.children.push(child);
            return child;
        }},
        contains(child) {{
            return this.children.includes(child);
        }},
        querySelector(selector) {{
            if (selector === "[data-runtime-loading-label]") {{
                return this.children.find(child => child.attributes["data-runtime-loading-label"] !== undefined) || null;
            }}
            return null;
        }},
    }};
    element.classList = createClassList(element);
    Object.defineProperty(element, "innerHTML", {{
        set(value) {{
            this.html = value;
            const spinner = createElement("span");
            spinner.classes = ["runtime-loading-spinner"];
            const label = createElement("span");
            label.classes = ["runtime-loading-label"];
            label.attributes["data-runtime-loading-label"] = "";
            this.children = [spinner, label];
        }},
    }});
    Object.defineProperty(element, "className", {{
        get() {{
            return this.classes.join(" ");
        }},
        set(value) {{
            this.classes = String(value || "").split(/\\s+/).filter(Boolean);
        }},
    }});
    Object.defineProperty(element, "label", {{
        get() {{
            const label = this.querySelector("[data-runtime-loading-label]");
            return label ? label.textContent : "";
        }},
    }});
    return element;
}}

globalThis.__listeners = {{}};
globalThis.__backendStatus = createElement("div");
globalThis.__backendStatus.classes = ["status-indicator", "checking"];
globalThis.__backendStatusLabel = createElement("span");
globalThis.__body = createElement("body");
globalThis.window = {{
    location: {{
        hostname: "127.0.0.1",
        origin: "http://127.0.0.1:8000",
    }},
    localStorage: {{
        getItem() {{
            return null;
        }},
        setItem() {{}},
        removeItem() {{}},
    }},
    addEventListener(name, handler) {{
        globalThis.__listeners[name] = handler;
    }},
    setInterval() {{
        return 1;
    }},
    setTimeout(callback) {{
        callback();
        return 1;
    }},
    clearTimeout() {{}},
}};
globalThis.document = {{
    body: globalThis.__body,
    addEventListener(name, handler) {{
        globalThis.__listeners[name] = handler;
    }},
    createElement,
    getElementById(id) {{
        return globalThis.__body.children.find(child => child.id === id) || null;
    }},
}};
globalThis.fetch = async () => ({{
    ok: false,
    async json() {{
        return {{}};
    }},
}});
{runner_source}
""".strip(),
        encoding="utf-8",
    )

    completed = subprocess.run(
        ["node", str(runner_path)],
        capture_output=True,
        check=False,
        cwd=str(repo_root),
        text=True,
        timeout=30,
    )
    if completed.returncode != 0:
        raise AssertionError(
            "Node runner failed:\n"
            f"STDOUT:\n{completed.stdout}\n"
            f"STDERR:\n{completed.stderr}"
        )
    return cast(dict[str, JsonValue], json.loads(completed.stdout))
