from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path
from typing import cast

from .css_helpers import load_components_css


def load_frontend_file(*parts: str) -> str:
    return (
        Path(__file__).resolve().parents[3] / "frontend" / "dist" / Path(*parts)
    ).read_text(encoding="utf-8")


def load_memory_css() -> str:
    return load_frontend_file("css", "components", "memory.css")


def load_memory_view_source() -> str:
    return load_frontend_file("js", "components", "memoryView.js")


def load_project_view_source() -> str:
    return load_frontend_file("js", "components", "projectView.js")


def load_sidebar_source() -> str:
    return load_frontend_file("js", "components", "sidebar.js")


def _merge_mock_api_source(base_source: str, override_source: str) -> str:
    merged_source = base_source
    for block in re.split(
        r"(?=^export async function )", override_source, flags=re.MULTILINE
    ):
        stripped_block = block.strip()
        if not stripped_block:
            continue
        export_match = re.match(r"export async function (\w+)\s*\(", stripped_block)
        if export_match is None:
            merged_source = f"{merged_source}\n\n{stripped_block}"
            continue
        export_name = export_match.group(1)
        export_pattern = re.compile(
            rf"export async function {export_name}\s*\([^)]*\)\s*\{{[\s\S]*?\n\}}",
            flags=re.MULTILINE,
        )
        if export_pattern.search(merged_source):
            merged_source = export_pattern.sub(
                lambda _match: stripped_block,
                merged_source,
                count=1,
            )
        else:
            merged_source = f"{merged_source}\n\n{stripped_block}"
    return merged_source


def test_project_view_opens_progressively_and_reuses_cached_tree_and_diff(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    hideProjectView,
    initializeProjectView,
    openWorkspaceProjectView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openWorkspaceProjectView({ workspace_id: "alpha-project" });

const initialHtml = els.projectViewContent.innerHTML;

await flushTasks();
await flushTasks();
const initialToggle = els.projectViewContent.querySelector(".workspace-tree-toggle");
const initialExpanded = initialToggle?.getAttribute("aria-expanded");
const diffLoadedHtml = els.projectViewContent.innerHTML;

initialToggle?.onclick?.();
await flushTasks();
const expandedToggle = els.projectViewContent.querySelector(".workspace-tree-toggle");
const expandedState = expandedToggle?.getAttribute("aria-expanded");
const fileEntry = els.projectViewContent.querySelector(".workspace-tree-file");
fileEntry?.onclick?.();
await flushTasks();
const selectedHtml = els.projectViewContent.innerHTML;
const selectedFileEntry = els.projectViewContent.querySelector(".workspace-tree-file");
const selectedDiffCard = els.projectViewContent.querySelector(".workspace-diff-card");

hideProjectView();
await openWorkspaceProjectView({ workspace_id: "alpha-project" });
const reopenedHtml = els.projectViewContent.innerHTML;
const reopenedSummary = els.projectViewSummary.textContent;
const reopenedToggle = els.projectViewContent.querySelector(".workspace-tree-toggle");
reopenedToggle?.onclick?.();
const collapsedToggle = els.projectViewContent.querySelector(".workspace-tree-toggle");
const collapsedState = collapsedToggle?.getAttribute("aria-expanded");
const collapsedHtml = els.projectViewContent.innerHTML;
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    projectViewDisplay: els.projectView.style.display,
    chatContainerDisplay: els.chatContainer.style.display,
    initialExpanded,
    expandedState,
    collapsedState,
    initialHasNestedFile: initialHtml.includes('data-tree-file-path="src/main.py"'),
    initialHasTreeIcons: diffLoadedHtml.includes("workspace-tree-icon"),
    initialShowsDiffLoading: initialHtml.includes("Loading changes"),
    diffLoadedHasCard: diffLoadedHtml.includes("workspace-diff-card"),
    diffLoadedHasDetail: diffLoadedHtml.includes("changed file"),
    selectedFileEntryPressed: selectedFileEntry?.getAttribute("aria-pressed"),
    selectedDiffClassName: selectedDiffCard?.getAttribute("class"),
    expandedHasNestedFile: selectedHtml.includes('data-tree-file-path="src/main.py"'),
    collapsedHasNestedFile: collapsedHtml.includes('data-tree-file-path="src/main.py"'),
    reopenedHasNestedFile: reopenedHtml.includes('data-tree-file-path="src/main.py"'),
    reopenedHasDetail: reopenedHtml.includes("changed file"),
    reopenedSummary,
    snapshotRequests: globalThis.__snapshotRequests,
    diffRequests: globalThis.__diffRequests,
    diffFileRequests: globalThis.__diffFileRequests,
    treeRequests: globalThis.__treeRequests,
}));
""".strip(),
    )

    assert payload["projectViewDisplay"] == "block"
    assert payload["chatContainerDisplay"] == "none"
    assert payload["initialExpanded"] == "false"
    assert payload["expandedState"] == "true"
    assert payload["collapsedState"] == "false"
    assert payload["initialHasNestedFile"] is False
    assert payload["initialHasTreeIcons"] is True
    assert payload["initialShowsDiffLoading"] is True
    assert payload["diffLoadedHasCard"] is True
    assert payload["diffLoadedHasDetail"] is True
    assert payload["selectedFileEntryPressed"] == "true"
    assert "is-selected" in str(payload["selectedDiffClassName"])
    assert payload["expandedHasNestedFile"] is True
    assert payload["collapsedHasNestedFile"] is False
    assert payload["reopenedHasNestedFile"] is True
    assert payload["reopenedHasDetail"] is True
    assert payload["reopenedSummary"] == "1 changed files"
    assert payload["snapshotRequests"] == ["alpha-project", "alpha-project"]
    assert payload["diffRequests"] == [
        {"workspaceId": "alpha-project", "mount": None},
        {"workspaceId": "alpha-project", "mount": "default"},
    ]
    assert payload["diffFileRequests"] == [
        {"workspaceId": "alpha-project", "path": "src/main.py", "mount": "default"},
    ]
    assert payload["treeRequests"] == [
        {"workspaceId": "alpha-project", "path": "src", "mount": "default"},
    ]


def test_project_view_opens_workspace_root_from_header(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openWorkspaceProjectView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openWorkspaceProjectView({ workspace_id: "alpha-project" });
await flushTasks();
await flushTasks();

const openRootButton = els.projectViewContent.querySelector("[data-open-workspace-root]");
openRootButton?.onclick?.();

console.log(JSON.stringify({
    contentHtml: els.projectViewContent.innerHTML,
    openWorkspaceRootCalls: globalThis.__openWorkspaceRootCalls,
    toastCalls: globalThis.__toastCalls || [],
}));
""".strip(),
    )

    assert "data-open-workspace-root" in str(payload["contentHtml"])
    assert "/work/alpha-project" in str(payload["contentHtml"])
    assert payload["openWorkspaceRootCalls"] == [
        {"workspaceId": "alpha-project", "mount": "default"},
    ]
    assert payload["toastCalls"] == []


def test_project_view_renders_multi_mount_workspace_and_switches_active_mount(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        mock_api_source="""
export async function fetchWorkspaceSnapshot(workspaceId) {
    await new Promise(resolve => setTimeout(resolve, 0));
    globalThis.__snapshotRequests.push(workspaceId);
    return {
        workspace_id: workspaceId,
        default_mount_name: "app",
        default_mount_root: "/work/app",
        tree: {
            name: workspaceId,
            path: ".",
            kind: "directory",
            has_children: true,
            children: [
                {
                    name: "app",
                    path: "app",
                    kind: "directory",
                    has_children: true,
                    children: [],
                },
                {
                    name: "ops",
                    path: "ops",
                    kind: "directory",
                    has_children: true,
                    children: [],
                },
            ],
        },
    };
}

export async function openWorkspaceRoot(workspaceId, mount = null) {
    globalThis.__openWorkspaceRootCalls.push({ workspaceId, mount });
    return { status: "ok" };
}

export async function fetchWorkspaceTree(workspaceId, path, mount = null) {
    globalThis.__treeRequests.push({ workspaceId, path, mount });
    if (mount === "ops") {
        return {
            workspace_id: workspaceId,
            mount_name: "ops",
            directory_path: path,
            children: [
                {
                    name: "deploy.yaml",
                    path: "deploy.yaml",
                    kind: "file",
                    has_children: false,
                    children: [],
                },
            ],
        };
    }
    return {
        workspace_id: workspaceId,
        mount_name: "app",
        directory_path: path,
        children: [
            {
                name: "src",
                path: "src",
                kind: "directory",
                has_children: true,
                children: [],
            },
        ],
    };
}

export async function fetchWorkspaceDiffs(workspaceId, mount = null) {
    await new Promise(resolve => setTimeout(resolve, 0));
    globalThis.__diffRequests.push({ workspaceId, mount });
    if (mount === "ops") {
        return {
            workspace_id: workspaceId,
            mount_name: "ops",
            root_path: "/srv/ops",
            is_git_repository: false,
            git_root_path: null,
            diff_message: "Workspace mount does not support diff: ops",
            diff_files: [],
        };
    }
    return {
        workspace_id: workspaceId,
        mount_name: "app",
        root_path: "/work/app",
        is_git_repository: true,
        git_root_path: "/work/app",
        diff_message: null,
        diff_files: [
            {
                path: "src/main.py",
                change_type: "modified",
            },
        ],
    };
}

export async function fetchWorkspaceDiffFile(workspaceId, path, mount = null) {
    globalThis.__diffFileRequests.push({ workspaceId, path, mount });
    return {
        workspace_id: workspaceId,
        mount_name: mount || "app",
        path,
        change_type: "modified",
        diff: `diff for ${mount || "app"}:${path}`,
        is_binary: false,
    };
}
""".strip(),
        runner_source="""
import {
    initializeProjectView,
    openWorkspaceProjectView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openWorkspaceProjectView({
    workspace_id: "alpha-project",
    default_mount_name: "app",
    mounts: [
        {
            mount_name: "app",
            provider: "local",
            provider_config: { root_path: "/work/app" },
        },
        {
            mount_name: "ops",
            provider: "ssh",
            provider_config: { ssh_profile_id: "prod", remote_root: "/srv/ops" },
        },
    ],
});
await flushTasks();
await flushTasks();
await flushTasks();
await flushTasks();

const initialHtml = els.projectViewContent.innerHTML;
els.projectViewContent.querySelector("[data-open-workspace-root]")?.onclick?.();

const opsMountButton = Array.from(
    els.projectViewContent.querySelectorAll("[data-workspace-mount]"),
).find(node => node?.getAttribute?.("data-workspace-mount") === "ops");
opsMountButton?.onclick?.();
await flushTasks();
await flushTasks();
await flushTasks();
await flushTasks();

const switchedHtml = els.projectViewContent.innerHTML;
console.log(JSON.stringify({
    initialHtml,
    switchedHtml,
    opsMountActive: /data-workspace-mount="ops"[\\s\\S]*?aria-pressed="true"/.test(switchedHtml),
    snapshotRequests: globalThis.__snapshotRequests,
    diffRequests: globalThis.__diffRequests,
    diffFileRequests: globalThis.__diffFileRequests,
    treeRequests: globalThis.__treeRequests,
    openWorkspaceRootCalls: globalThis.__openWorkspaceRootCalls,
}));
""".strip(),
    )

    assert 'data-workspace-mount="app"' in str(payload["initialHtml"])
    assert 'data-workspace-mount="ops"' in str(payload["initialHtml"])
    assert "SSH profile: prod" in str(payload["initialHtml"])
    assert "/work/app" in str(payload["initialHtml"])
    assert payload["openWorkspaceRootCalls"] == [
        {"workspaceId": "alpha-project", "mount": "app"},
    ]
    assert payload["opsMountActive"] is True
    assert "/srv/ops" in str(payload["switchedHtml"])
    assert "deploy.yaml" in str(payload["switchedHtml"])
    assert "Workspace mount does not support diff: ops" in str(payload["switchedHtml"])
    assert (
        str(payload["switchedHtml"]).count("Workspace mount does not support diff: ops")
        == 1
    )
    assert "data-open-workspace-root" not in str(payload["switchedHtml"])
    assert payload["snapshotRequests"] == ["alpha-project"]
    assert payload["diffRequests"] == [
        {"workspaceId": "alpha-project", "mount": "app"},
        {"workspaceId": "alpha-project", "mount": "ops"},
    ]
    assert payload["treeRequests"] == [
        {"workspaceId": "alpha-project", "path": ".", "mount": "app"},
        {"workspaceId": "alpha-project", "path": ".", "mount": "ops"},
    ]
    assert payload["diffFileRequests"] == [
        {"workspaceId": "alpha-project", "path": "src/main.py", "mount": "app"},
    ]


def test_project_view_add_mount_action_updates_workspace_with_ssh_profile(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openWorkspaceProjectView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

globalThis.__mockSshProfiles = [
    {
        ssh_profile_id: "prod",
    },
];
globalThis.__showFormDialogResult = {
    mount_name: "prod",
    provider: "ssh",
    local_root_path: "",
    ssh_profile_id: "prod",
    remote_root: "/srv/app",
    set_default: true,
};

initializeProjectView();
await openWorkspaceProjectView({
    workspace_id: "alpha-project",
    default_mount_name: "default",
    mounts: [
        {
            mount_name: "default",
            provider: "local",
            provider_config: {
                root_path: "/work/alpha-project",
            },
        },
    ],
});
await flushTasks();
await flushTasks();

const button = document.querySelector("[data-workspace-add-mount]");
await button?.onclick?.();
await flushTasks();
await flushTasks();

const dialogCall = globalThis.__showFormDialogCalls.at(-1) || {};
const fields = Array.isArray(dialogCall.fields) ? dialogCall.fields : [];
const sshProfileField = fields.find(field => field.id === "ssh_profile_id") || {};
const fieldVisibilityRules = fields.map(field => ({
    id: field.id,
    visibleWhen: field.visibleWhen || null,
}));

console.log(JSON.stringify({
    buttonFound: Boolean(button),
    updatedWorkspacePayload: globalThis.__updatedWorkspacePayload,
    fieldIds: fields.map(field => field.id),
    fieldVisibilityRules,
    sshProfileOptions: sshProfileField.options || [],
    toastCalls: globalThis.__toastCalls || [],
}));
""".strip(),
    )

    assert payload["buttonFound"] is True
    assert payload["fieldIds"] == [
        "mount_name",
        "provider",
        "local_root_path",
        "ssh_profile_id",
        "remote_root",
        "set_default",
    ]
    assert payload["fieldVisibilityRules"] == [
        {"id": "mount_name", "visibleWhen": None},
        {"id": "provider", "visibleWhen": None},
        {
            "id": "local_root_path",
            "visibleWhen": {"field": "provider", "equals": "local"},
        },
        {"id": "ssh_profile_id", "visibleWhen": {"field": "provider", "equals": "ssh"}},
        {"id": "remote_root", "visibleWhen": {"field": "provider", "equals": "ssh"}},
        {"id": "set_default", "visibleWhen": {"field": "provider", "equals": "local"}},
    ]
    assert payload["sshProfileOptions"] == [
        {"value": "", "label": "Select an SSH profile"},
        {"value": "prod", "label": "prod"},
    ]
    assert payload["updatedWorkspacePayload"] == {
        "workspaceId": "alpha-project",
        "payload": {
            "default_mount_name": "default",
            "mounts": [
                {
                    "mount_name": "default",
                    "provider": "local",
                    "provider_config": {
                        "root_path": "/work/alpha-project",
                    },
                },
                {
                    "mount_name": "prod",
                    "provider": "ssh",
                    "provider_config": {
                        "ssh_profile_id": "prod",
                        "remote_root": "/srv/app",
                    },
                },
            ],
        },
    }
    assert payload["toastCalls"] == [
        {
            "title": "Mount Added",
            "message": "Added mount prod.",
            "tone": "success",
        }
    ]


def test_project_view_edit_mount_dialog_prefills_selected_provider_fields(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openWorkspaceProjectView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

globalThis.__mockSshProfiles = [
    {
        ssh_profile_id: "prod",
    },
];

initializeProjectView();
await openWorkspaceProjectView({
    workspace_id: "alpha-project",
    default_mount_name: "prod",
    mounts: [
        {
            mount_name: "app",
            provider: "local",
            provider_config: {
                root_path: "/work/app",
            },
        },
        {
            mount_name: "prod",
            provider: "ssh",
            provider_config: {
                ssh_profile_id: "prod",
                remote_root: "/srv/app",
            },
        },
    ],
});
await flushTasks();
await flushTasks();

const editButton = document.querySelector("[data-workspace-edit-mount]");
await editButton?.onclick?.();
await flushTasks();
await flushTasks();

const dialogCall = globalThis.__showFormDialogCalls.at(-1) || {};
const fields = Array.isArray(dialogCall.fields) ? dialogCall.fields : [];
const pickField = fieldId => fields.find(field => field.id === fieldId) || null;

console.log(JSON.stringify({
    buttonFound: Boolean(editButton),
    providerField: pickField("provider"),
    localRootField: pickField("local_root_path"),
    sshProfileField: pickField("ssh_profile_id"),
    remoteRootField: pickField("remote_root"),
}));
""".strip(),
    )

    assert payload["buttonFound"] is True
    assert payload["providerField"] == {
        "id": "provider",
        "label": "Provider",
        "type": "select",
        "value": "ssh",
        "options": [
            {"value": "local", "label": "Local"},
            {"value": "ssh", "label": "SSH"},
        ],
    }
    local_root_field = cast(dict[str, object], payload["localRootField"])
    ssh_profile_field = cast(dict[str, object], payload["sshProfileField"])
    remote_root_field = cast(dict[str, object], payload["remoteRootField"])

    assert local_root_field["id"] == "local_root_path"
    assert local_root_field["type"] == "text"
    assert local_root_field["value"] == ""
    assert local_root_field["visibleWhen"] == {
        "field": "provider",
        "equals": "local",
    }
    assert ssh_profile_field["id"] == "ssh_profile_id"
    assert ssh_profile_field["type"] == "select"
    assert ssh_profile_field["value"] == "prod"
    assert ssh_profile_field["options"] == [
        {"value": "", "label": "Select an SSH profile"},
        {"value": "prod", "label": "prod"},
    ]
    assert ssh_profile_field["visibleWhen"] == {
        "field": "provider",
        "equals": "ssh",
    }
    assert remote_root_field["id"] == "remote_root"
    assert remote_root_field["type"] == "text"
    assert remote_root_field["value"] == "/srv/app"
    assert remote_root_field["visibleWhen"] == {
        "field": "provider",
        "equals": "ssh",
    }
    assert cast(dict[str, object], payload["providerField"])["value"] == "ssh"


def test_project_view_edit_mount_action_preserves_worktree_metadata(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openWorkspaceProjectView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

globalThis.__showFormDialogResult = {
    mount_name: "fork",
    provider: "local",
    local_root_path: "/work/fork-renamed",
    ssh_profile_id: "",
    remote_root: "",
    set_default: true,
};

initializeProjectView();
await openWorkspaceProjectView({
    workspace_id: "alpha-project",
    default_mount_name: "fork",
    mounts: [
        {
            mount_name: "fork",
            provider: "local",
            provider_config: {
                root_path: "/work/fork",
            },
            working_directory: "packages/app",
            readable_paths: [".", "docs"],
            writable_paths: [".", "packages/app"],
            capabilities: {
                can_read: true,
                can_write: true,
                can_search: true,
                can_shell: true,
                can_diff: true,
                can_preview: true,
            },
            branch_name: "fork/alpha-project",
            source_root_path: "/work/source",
            forked_from_workspace_id: "project-alpha",
        },
    ],
});
await flushTasks();
await flushTasks();

const editButton = document.querySelector("[data-workspace-edit-mount]");
await editButton?.onclick?.();
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    updatedWorkspacePayload: globalThis.__updatedWorkspacePayload,
}));
""".strip(),
    )

    assert payload["updatedWorkspacePayload"] == {
        "workspaceId": "alpha-project",
        "payload": {
            "default_mount_name": "fork",
            "mounts": [
                {
                    "mount_name": "fork",
                    "provider": "local",
                    "provider_config": {
                        "root_path": "/work/fork-renamed",
                    },
                    "working_directory": "packages/app",
                    "readable_paths": [".", "docs"],
                    "writable_paths": [".", "packages/app"],
                    "capabilities": {
                        "can_read": True,
                        "can_write": True,
                        "can_search": True,
                        "can_shell": True,
                        "can_diff": True,
                        "can_preview": True,
                    },
                    "branch_name": "fork/alpha-project",
                    "source_root_path": "/work/source",
                    "forked_from_workspace_id": "project-alpha",
                }
            ],
        },
    }


def test_project_view_remove_default_mount_falls_back_to_first_local_mount(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openWorkspaceProjectView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

globalThis.__showConfirmDialogResult = true;

initializeProjectView();
await openWorkspaceProjectView({
    workspace_id: "alpha-project",
    default_mount_name: "default",
    mounts: [
        {
            mount_name: "default",
            provider: "local",
            provider_config: {
                root_path: "/work/default",
            },
        },
        {
            mount_name: "prod",
            provider: "ssh",
            provider_config: {
                ssh_profile_id: "prod",
                remote_root: "/srv/app",
            },
        },
        {
            mount_name: "ops",
            provider: "local",
            provider_config: {
                root_path: "/work/ops",
            },
        },
    ],
});
await flushTasks();
await flushTasks();

const mountButtons = Array.from(els.projectViewContent.querySelectorAll("[data-workspace-mount]"));
const mountOrder = mountButtons.map(button => button.getAttribute("data-workspace-mount"));
const defaultMountButton = mountButtons.find(button => button.getAttribute("data-mount-name") === "default") || null;
defaultMountButton?.click();
await flushTasks();
await flushTasks();

const removeButton = els.projectViewContent.querySelector("[data-workspace-delete-mount]");
await removeButton?.onclick?.();
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    mountOrder,
    updatedWorkspacePayload: globalThis.__updatedWorkspacePayload,
    toastCalls: globalThis.__toastCalls || [],
}));
""".strip(),
    )

    assert payload["mountOrder"] == ["default", "ops", "prod"]
    assert payload["updatedWorkspacePayload"] == {
        "workspaceId": "alpha-project",
        "payload": {
            "default_mount_name": "ops",
            "mounts": [
                {
                    "mount_name": "ops",
                    "provider": "local",
                    "provider_config": {
                        "root_path": "/work/ops",
                    },
                },
                {
                    "mount_name": "prod",
                    "provider": "ssh",
                    "provider_config": {
                        "ssh_profile_id": "prod",
                        "remote_root": "/srv/app",
                    },
                },
            ],
        },
    }
    assert payload["toastCalls"] == [
        {
            "title": "Mount Removed",
            "message": "Removed mount default.",
            "tone": "success",
        }
    ]


def test_project_view_mount_profiles_button_opens_workspace_settings(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openWorkspaceProjectView,
} from "./projectView.mjs";
import { flushTasks } from "./mockDom.mjs";

globalThis.window = {
    openSettings(tab) {
        globalThis.__openedSettingsTab = tab;
    },
};

initializeProjectView();
await openWorkspaceProjectView({
    workspace_id: "alpha-project",
    default_mount_name: "default",
    mounts: [
        {
            mount_name: "default",
            provider: "local",
            provider_config: {
                root_path: "/work/alpha-project",
            },
        },
    ],
});
await flushTasks();
await flushTasks();

const button = document.querySelector("[data-workspace-open-settings]");
button?.onclick?.();

console.log(JSON.stringify({
    buttonFound: Boolean(button),
    openedSettingsTab: globalThis.__openedSettingsTab || "",
    toastCalls: globalThis.__toastCalls || [],
}));
""".strip(),
    )

    assert payload["buttonFound"] is True
    assert payload["openedSettingsTab"] == "workspace"
    assert payload["toastCalls"] == []


def test_project_view_updates_automation_project_with_feishu_binding(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openAutomationProjectView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openAutomationProjectView({ automation_project_id: "aut_1", workspace_id: "alpha-project" });
await flushTasks();
await flushTasks();

const editButton = document.querySelector("[data-automation-edit]");
editButton?.onclick?.();
await flushTasks();
await flushTasks();

document.getElementById("automation-editor-display-name-input").value = "Friday Briefing";
document.getElementById("automation-editor-prompt-input").value = "Summarize the latest project changes.";
document.getElementById("automation-editor-timezone-input").value = "Asia/Shanghai";
document.getElementById("automation-editor-delivery-binding-input").value = "feishu::trg_feishu::tenant-1::oc_123::session-im-1";
document.querySelector("[data-automation-editor-binding]")?.onchange?.({
    target: document.getElementById("automation-editor-delivery-binding-input"),
});
await flushTasks();
await flushTasks();
document.getElementById("automation-editor-schedule-kind-input").value = "weekly";
document.querySelector("[data-automation-editor-schedule-kind]")?.onchange?.({
    target: document.getElementById("automation-editor-schedule-kind-input"),
});
await flushTasks();
await flushTasks();
document.getElementById("automation-editor-time-input").value = "18:30";
document.getElementById("automation-editor-weekday-input").value = "5";
document.getElementById("automation-editor-delivery-started-input").checked = true;
document.getElementById("automation-editor-delivery-completed-input").checked = true;
document.getElementById("automation-editor-delivery-failed-input").checked = true;
const editorHtmlBeforeSave = els.projectViewContent.innerHTML;
document.querySelector("[data-automation-editor-save]")?.onclick?.();
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    contentHtml: els.projectViewContent.innerHTML,
    editorHtml: editorHtmlBeforeSave,
    updatePayload: globalThis.__updatedAutomationPayload,
}));
""".strip(),
        mock_api_source="""
export async function disableAutomationProject() {
    return { status: "disabled" };
}

export async function enableAutomationProject() {
    return { status: "enabled" };
}

export async function createAutomationProject() {
    return { automation_project_id: "aut_new" };
}

export async function deleteAutomationProject() {
    return { status: "ok" };
}

export async function fetchAutomationProject() {
    return {
        automation_project_id: "aut_1",
        name: "daily-briefing",
        display_name: "Daily Briefing",
        status: "enabled",
        workspace_id: "alpha-project",
        prompt: "Summarize the latest project changes.",
        schedule_mode: "cron",
        cron_expression: "0 9 * * *",
        timezone: "UTC",
        delivery_binding: {
            provider: "feishu",
            trigger_id: "trg_feishu",
            tenant_key: "tenant-1",
            chat_id: "oc_123",
            session_id: "session-im-1",
            chat_type: "group",
            source_label: "Release Updates",
        },
        delivery_events: ["started"],
        run_config: {
            session_mode: "normal",
            normal_root_role_id: "Writer",
            orchestration_preset_id: null,
            execution_mode: "ai",
            yolo: true,
            thinking: { enabled: false, effort: null },
        },
        next_run_at: "2026-03-14T09:00:00Z",
    };
}

export async function fetchAutomationFeishuBindings() {
    return [
        {
            provider: "feishu",
            trigger_id: "trg_feishu",
            trigger_name: "Feishu Main",
            tenant_key: "tenant-1",
            chat_id: "oc_123",
            chat_type: "group",
            source_label: "Release Updates",
            session_id: "session-im-1",
            session_title: "feishu_main - Release Updates",
            updated_at: "2026-03-14T10:00:00Z",
        },
    ];
}

export async function fetchAutomationProjectSessions() {
    return [];
}

export async function fetchAutomationProjects() {
    return [{ automation_project_id: "aut_1", display_name: "Daily Briefing", name: "daily-briefing", status: "enabled", workspace_id: "alpha-project" }];
}

export async function fetchWorkspaces() {
    return [
        {
            workspace_id: "alpha-project",
            root_path: "/work/alpha-project",
        },
    ];
}

export async function fetchWorkspaceSnapshot() {
    throw new Error("not used");
}

export async function fetchWorkspaceTree() {
    throw new Error("not used");
}

export async function fetchWorkspaceDiffs() {
    throw new Error("not used");
}

export async function fetchWorkspaceDiffFile() {
    throw new Error("not used");
}

export async function runAutomationProject() {
    return { status: "ok" };
}

export async function fetchConfigStatus() {
    if (globalThis.__deferredConfigStatusPromise) {
        return await globalThis.__deferredConfigStatusPromise;
    }
    return { skills: { skills: [] } };
}

export async function fetchOrchestrationConfig() {
    return { presets: [] };
}

export async function fetchRoleConfigOptions() {
    return { normal_mode_roles: [{ role_id: "Writer", name: "Writer" }] };
}

export async function fetchTriggers() {
    return [];
}

export async function fetchWeChatGatewayAccounts() {
    return [];
}

export async function fetchGitHubTriggerAccounts() {
    return globalThis.__mockGitHubAccounts || [];
}

export async function fetchGitHubRepoSubscriptions() {
    return globalThis.__mockGitHubRepos || [];
}

export async function fetchGitHubAccountRepositories() {
    return globalThis.__mockGitHubAvailableRepos || [];
}

export async function fetchGitHubTriggerRules() {
    return globalThis.__mockGitHubRules || [];
}

export async function reloadSkillsConfig() {
    return { status: "ok" };
}

export async function fetchSshProfiles() {
    return globalThis.__mockSshProfiles || [];
}

export async function updateWorkspace(workspaceId, payload) {
    globalThis.__updatedWorkspacePayload = { workspaceId, payload };
    return {
        workspace_id: workspaceId,
        default_mount_name: payload?.default_mount_name || "default",
        mounts: Array.isArray(payload?.mounts) ? payload.mounts : [],
    };
}

export async function createTrigger() {
    return { status: "ok" };
}

export async function updateTrigger() {
    return { status: "ok" };
}

export async function deleteTrigger() {
    return { status: "ok" };
}

export async function enableTrigger() {
    return { status: "ok" };
}

export async function disableTrigger() {
    return { status: "ok" };
}

export async function startWeChatGatewayLogin() {
    return { session_key: "wechat-login-1", qr_code_url: "https://example.test/qr.png" };
}

export async function waitWeChatGatewayLogin() {
    return { connected: true };
}

export async function updateWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function enableWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function disableWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function deleteWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function updateAutomationProject(_automationProjectId, payload) {
    globalThis.__updatedAutomationPayload = payload;
    return { status: "ok" };
}
""".strip(),
    )

    update_payload = cast(dict[str, object], payload["updatePayload"])
    delivery_binding = cast(dict[str, object], update_payload["delivery_binding"])
    delivery_events = cast(list[object], update_payload["delivery_events"])
    assert delivery_binding["trigger_id"] == "trg_feishu"
    assert delivery_binding["chat_id"] == "oc_123"
    assert delivery_binding["session_id"] == "session-im-1"
    assert delivery_events == [
        "started",
        "completed",
        "failed",
    ]
    assert update_payload["display_name"] == "Friday Briefing"
    assert update_payload["cron_expression"] == "30 18 * * 5"
    assert update_payload["timezone"] == "Asia/Shanghai"
    run_config = cast(dict[str, object], update_payload["run_config"])
    assert run_config["session_mode"] == "normal"
    assert run_config["normal_root_role_id"] == "Writer"
    assert run_config["orchestration_preset_id"] is None
    assert "automation-editor-page-title" in str(payload["editorHtml"])
    assert "feishu_main - Release Updates" in str(payload["contentHtml"])
    assert "Writer" in str(payload["contentHtml"])


def test_project_view_preserves_saved_normal_role_when_session_config_helpers_fail(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openAutomationProjectView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openAutomationProjectView({ automation_project_id: "aut_1", workspace_id: "alpha-project" });
await flushTasks();
await flushTasks();

document.querySelector("[data-automation-edit]")?.onclick?.();
await flushTasks();
await flushTasks();

const editorHtmlBeforeSave = els.projectViewContent.innerHTML;
document.querySelector("[data-automation-editor-save]")?.onclick?.();
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    editorHtml: editorHtmlBeforeSave,
    updatePayload: globalThis.__updatedAutomationPayload,
}));
""".strip(),
        mock_api_source="""
export async function disableAutomationProject() {
    return { status: "disabled" };
}

export async function enableAutomationProject() {
    return { status: "enabled" };
}

export async function createAutomationProject() {
    return { automation_project_id: "aut_new" };
}

export async function deleteAutomationProject() {
    return { status: "ok" };
}

export async function fetchAutomationProject() {
    return {
        automation_project_id: "aut_1",
        name: "daily-briefing",
        display_name: "Daily Briefing",
        status: "enabled",
        workspace_id: "alpha-project",
        prompt: "Summarize the latest project changes.",
        schedule_mode: "cron",
        cron_expression: "0 9 * * *",
        timezone: "UTC",
        run_config: {
            session_mode: "normal",
            normal_root_role_id: "Writer",
            orchestration_preset_id: null,
        },
    };
}

export async function fetchAutomationFeishuBindings() {
    return [];
}

export async function fetchAutomationProjectSessions() {
    return [];
}

export async function fetchAutomationProjects() {
    return [{ automation_project_id: "aut_1", display_name: "Daily Briefing", name: "daily-briefing", status: "enabled", workspace_id: "alpha-project" }];
}

export async function fetchWorkspaces() {
    return [{ workspace_id: "alpha-project", root_path: "/work/alpha-project" }];
}

export async function fetchWorkspaceSnapshot() {
    throw new Error("not used");
}

export async function fetchWorkspaceTree() {
    throw new Error("not used");
}

export async function fetchWorkspaceDiffs() {
    throw new Error("not used");
}

export async function fetchWorkspaceDiffFile() {
    throw new Error("not used");
}

export async function runAutomationProject() {
    return { status: "ok" };
}

export async function fetchConfigStatus() {
    return { skills: { skills: [] } };
}

export async function fetchOrchestrationConfig() {
    throw new Error("orchestration fetch failed");
}

export async function fetchRoleConfigOptions() {
    throw new Error("role fetch failed");
}

export async function fetchTriggers() {
    return [];
}

export async function fetchWeChatGatewayAccounts() {
    return [];
}

export async function reloadSkillsConfig() {
    return { status: "ok" };
}

export async function createTrigger() {
    return { status: "ok" };
}

export async function updateTrigger() {
    return { status: "ok" };
}

export async function deleteTrigger() {
    return { status: "ok" };
}

export async function enableTrigger() {
    return { status: "ok" };
}

export async function disableTrigger() {
    return { status: "ok" };
}

export async function startWeChatGatewayLogin() {
    return { session_key: "wechat-login-1", qr_code_url: "https://example.test/qr.png" };
}

export async function waitWeChatGatewayLogin() {
    return { connected: true };
}

export async function updateWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function enableWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function disableWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function deleteWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function updateAutomationProject(_automationProjectId, payload) {
    globalThis.__updatedAutomationPayload = payload;
    return { status: "ok" };
}
""".strip(),
    )

    update_payload = cast(dict[str, object], payload["updatePayload"])
    run_config = cast(dict[str, object], update_payload["run_config"])
    assert "automation-editor-page-title" in str(payload["editorHtml"])
    assert 'id="automation-editor-normal-root-role-id-input"' in str(
        payload["editorHtml"]
    )
    assert "Writer" in str(payload["editorHtml"])
    assert run_config["session_mode"] == "normal"
    assert run_config["normal_root_role_id"] == "Writer"
    assert run_config["orchestration_preset_id"] is None


def test_project_view_preserves_saved_orchestration_preset_when_options_omit_it(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openAutomationProjectView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openAutomationProjectView({ automation_project_id: "aut_1", workspace_id: "alpha-project" });
await flushTasks();
await flushTasks();

document.querySelector("[data-automation-edit]")?.onclick?.();
await flushTasks();
await flushTasks();

const editorHtmlBeforeSave = els.projectViewContent.innerHTML;
document.querySelector("[data-automation-editor-save]")?.onclick?.();
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    editorHtml: editorHtmlBeforeSave,
    updatePayload: globalThis.__updatedAutomationPayload,
}));
""".strip(),
        mock_api_source="""
export async function disableAutomationProject() {
    return { status: "disabled" };
}

export async function enableAutomationProject() {
    return { status: "enabled" };
}

export async function createAutomationProject() {
    return { automation_project_id: "aut_new" };
}

export async function deleteAutomationProject() {
    return { status: "ok" };
}

export async function fetchAutomationProject() {
    return {
        automation_project_id: "aut_1",
        name: "daily-briefing",
        display_name: "Daily Briefing",
        status: "enabled",
        workspace_id: "alpha-project",
        prompt: "Summarize the latest project changes.",
        schedule_mode: "cron",
        cron_expression: "0 9 * * *",
        timezone: "UTC",
        run_config: {
            session_mode: "orchestration",
            normal_root_role_id: null,
            orchestration_preset_id: "preset-missing-name",
        },
    };
}

export async function fetchAutomationFeishuBindings() {
    return [];
}

export async function fetchAutomationProjectSessions() {
    return [];
}

export async function fetchAutomationProjects() {
    return [{ automation_project_id: "aut_1", display_name: "Daily Briefing", name: "daily-briefing", status: "enabled", workspace_id: "alpha-project" }];
}

export async function fetchWorkspaces() {
    return [{ workspace_id: "alpha-project", root_path: "/work/alpha-project" }];
}

export async function fetchWorkspaceSnapshot() {
    throw new Error("not used");
}

export async function fetchWorkspaceTree() {
    throw new Error("not used");
}

export async function fetchWorkspaceDiffs() {
    throw new Error("not used");
}

export async function fetchWorkspaceDiffFile() {
    throw new Error("not used");
}

export async function runAutomationProject() {
    return { status: "ok" };
}

export async function fetchConfigStatus() {
    return { skills: { skills: [] } };
}

export async function fetchOrchestrationConfig() {
    return {
        presets: [{ preset_id: "preset-other", name: "Other Preset" }],
    };
}

export async function fetchRoleConfigOptions() {
    return {
        normal_mode_roles: [{ role_id: "Writer", name: "Writer" }],
    };
}

export async function fetchTriggers() {
    return [];
}

export async function fetchWeChatGatewayAccounts() {
    return [];
}

export async function reloadSkillsConfig() {
    return { status: "ok" };
}

export async function createTrigger() {
    return { status: "ok" };
}

export async function updateTrigger() {
    return { status: "ok" };
}

export async function deleteTrigger() {
    return { status: "ok" };
}

export async function enableTrigger() {
    return { status: "ok" };
}

export async function disableTrigger() {
    return { status: "ok" };
}

export async function startWeChatGatewayLogin() {
    return { session_key: "wechat-login-1", qr_code_url: "https://example.test/qr.png" };
}

export async function waitWeChatGatewayLogin() {
    return { connected: true };
}

export async function updateWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function enableWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function disableWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function deleteWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function updateAutomationProject(_automationProjectId, payload) {
    globalThis.__updatedAutomationPayload = payload;
    return { status: "ok" };
}
""".strip(),
    )

    update_payload = cast(dict[str, object], payload["updatePayload"])
    run_config = cast(dict[str, object], update_payload["run_config"])
    assert "automation-editor-page-title" in str(payload["editorHtml"])
    assert 'id="automation-editor-orchestration-preset-id-input"' in str(
        payload["editorHtml"]
    )
    assert "preset-missing-name" in str(payload["editorHtml"])
    assert run_config["session_mode"] == "orchestration"
    assert run_config["normal_root_role_id"] is None
    assert run_config["orchestration_preset_id"] == "preset-missing-name"


def test_project_view_keeps_null_normal_role_unset_when_editing_existing_project(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openAutomationProjectView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openAutomationProjectView({ automation_project_id: "aut_1", workspace_id: "alpha-project" });
await flushTasks();
await flushTasks();

document.querySelector("[data-automation-edit]")?.onclick?.();
await flushTasks();
await flushTasks();

const editorHtml = els.projectViewContent.innerHTML;
document.querySelector("[data-automation-editor-save]")?.onclick?.();
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    editorHtml,
    updatePayload: globalThis.__updatedAutomationPayload,
}));
""".strip(),
        mock_api_source="""
export async function disableAutomationProject() {
    return { status: "disabled" };
}

export async function enableAutomationProject() {
    return { status: "enabled" };
}

export async function createAutomationProject() {
    return { automation_project_id: "aut_new" };
}

export async function deleteAutomationProject() {
    return { status: "ok" };
}

export async function fetchAutomationProject() {
    return {
        automation_project_id: "aut_1",
        name: "daily-briefing",
        display_name: "Daily Briefing",
        status: "enabled",
        workspace_id: "alpha-project",
        prompt: "Summarize the latest project changes.",
        schedule_mode: "cron",
        cron_expression: "0 9 * * *",
        timezone: "UTC",
        run_config: {
            session_mode: "normal",
            normal_root_role_id: null,
            orchestration_preset_id: null,
        },
    };
}

export async function fetchAutomationFeishuBindings() {
    return [];
}

export async function fetchAutomationProjectSessions() {
    return [];
}

export async function fetchAutomationProjects() {
    return [{ automation_project_id: "aut_1", display_name: "Daily Briefing", name: "daily-briefing", status: "enabled", workspace_id: "alpha-project" }];
}

export async function fetchWorkspaces() {
    return [{ workspace_id: "alpha-project", root_path: "/work/alpha-project" }];
}

export async function fetchWorkspaceSnapshot() {
    throw new Error("not used");
}

export async function fetchWorkspaceTree() {
    throw new Error("not used");
}

export async function fetchWorkspaceDiffs() {
    throw new Error("not used");
}

export async function fetchWorkspaceDiffFile() {
    throw new Error("not used");
}

export async function runAutomationProject() {
    return { status: "ok" };
}

export async function fetchConfigStatus() {
    return { skills: { skills: [] } };
}

export async function fetchOrchestrationConfig() {
    return {
        presets: [{ preset_id: "preset-default", name: "Default Orchestration" }],
    };
}

export async function fetchRoleConfigOptions() {
    return {
        normal_mode_roles: [{ role_id: "Writer", name: "Writer" }],
    };
}

export async function fetchTriggers() {
    return [];
}

export async function fetchWeChatGatewayAccounts() {
    return [];
}

export async function reloadSkillsConfig() {
    return { status: "ok" };
}

export async function createTrigger() {
    return { status: "ok" };
}

export async function updateTrigger() {
    return { status: "ok" };
}

export async function deleteTrigger() {
    return { status: "ok" };
}

export async function enableTrigger() {
    return { status: "ok" };
}

export async function disableTrigger() {
    return { status: "ok" };
}

export async function startWeChatGatewayLogin() {
    return { session_key: "wechat-login-1", qr_code_url: "https://example.test/qr.png" };
}

export async function waitWeChatGatewayLogin() {
    return { connected: true };
}

export async function updateWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function enableWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function disableWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function deleteWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function updateAutomationProject(_automationProjectId, payload) {
    globalThis.__updatedAutomationPayload = payload;
    return { status: "ok" };
}
""".strip(),
    )

    update_payload = cast(dict[str, object], payload["updatePayload"])
    run_config = cast(dict[str, object], update_payload["run_config"])
    assert 'id="automation-editor-normal-root-role-id-input"' in str(
        payload["editorHtml"]
    )
    assert run_config["session_mode"] == "normal"
    assert run_config["normal_root_role_id"] is None
    assert run_config["orchestration_preset_id"] is None


def test_project_view_does_not_pin_first_preset_for_existing_orchestration_project(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openAutomationProjectView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openAutomationProjectView({ automation_project_id: "aut_1", workspace_id: "alpha-project" });
await flushTasks();
await flushTasks();

document.querySelector("[data-automation-edit]")?.onclick?.();
await flushTasks();
await flushTasks();

const editorHtml = els.projectViewContent.innerHTML;
document.querySelector("[data-automation-editor-save]")?.onclick?.();
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    editorHtml,
    updatePayload: globalThis.__updatedAutomationPayload || null,
    editorHtmlAfterSave: els.projectViewContent.innerHTML,
}));
""".strip(),
        mock_api_source="""
export async function disableAutomationProject() {
    return { status: "disabled" };
}

export async function enableAutomationProject() {
    return { status: "enabled" };
}

export async function createAutomationProject() {
    return { automation_project_id: "aut_new" };
}

export async function deleteAutomationProject() {
    return { status: "ok" };
}

export async function fetchAutomationProject() {
    return {
        automation_project_id: "aut_1",
        name: "daily-briefing",
        display_name: "Daily Briefing",
        status: "enabled",
        workspace_id: "alpha-project",
        prompt: "Summarize the latest project changes.",
        schedule_mode: "cron",
        cron_expression: "0 9 * * *",
        timezone: "UTC",
        run_config: {
            session_mode: "orchestration",
            normal_root_role_id: null,
            orchestration_preset_id: null,
        },
    };
}

export async function fetchAutomationFeishuBindings() {
    return [];
}

export async function fetchAutomationProjectSessions() {
    return [];
}

export async function fetchAutomationProjects() {
    return [{ automation_project_id: "aut_1", display_name: "Daily Briefing", name: "daily-briefing", status: "enabled", workspace_id: "alpha-project" }];
}

export async function fetchWorkspaces() {
    return [{ workspace_id: "alpha-project", root_path: "/work/alpha-project" }];
}

export async function fetchWorkspaceSnapshot() {
    throw new Error("not used");
}

export async function fetchWorkspaceTree() {
    throw new Error("not used");
}

export async function fetchWorkspaceDiffs() {
    throw new Error("not used");
}

export async function fetchWorkspaceDiffFile() {
    throw new Error("not used");
}

export async function runAutomationProject() {
    return { status: "ok" };
}

export async function fetchConfigStatus() {
    return { skills: { skills: [] } };
}

export async function fetchOrchestrationConfig() {
    return {
        presets: [{ preset_id: "preset-default", name: "Default Orchestration" }],
    };
}

export async function fetchRoleConfigOptions() {
    return {
        normal_mode_roles: [{ role_id: "Writer", name: "Writer" }],
    };
}

export async function fetchTriggers() {
    return [];
}

export async function fetchWeChatGatewayAccounts() {
    return [];
}

export async function reloadSkillsConfig() {
    return { status: "ok" };
}

export async function createTrigger() {
    return { status: "ok" };
}

export async function updateTrigger() {
    return { status: "ok" };
}

export async function deleteTrigger() {
    return { status: "ok" };
}

export async function enableTrigger() {
    return { status: "ok" };
}

export async function disableTrigger() {
    return { status: "ok" };
}

export async function startWeChatGatewayLogin() {
    return { session_key: "wechat-login-1", qr_code_url: "https://example.test/qr.png" };
}

export async function waitWeChatGatewayLogin() {
    return { connected: true };
}

export async function updateWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function enableWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function disableWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function deleteWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function updateAutomationProject(_automationProjectId, payload) {
    globalThis.__updatedAutomationPayload = payload;
    return { status: "ok" };
}
""".strip(),
    )

    assert payload["updatePayload"] is None
    assert "Default Orchestration" in str(payload["editorHtml"])
    assert "Preset is required in orchestration mode." in str(
        payload["editorHtmlAfterSave"]
    )


def test_project_view_preserves_session_config_selections_across_mode_switches(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openAutomationProjectView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openAutomationProjectView({ automation_project_id: "aut_1", workspace_id: "alpha-project" });
await flushTasks();
await flushTasks();

document.querySelector("[data-automation-edit]")?.onclick?.();
await flushTasks();
await flushTasks();

document.getElementById("automation-editor-session-mode-input").value = "orchestration";
document.querySelector("[data-automation-editor-session-mode]")?.onchange?.({
    target: document.getElementById("automation-editor-session-mode-input"),
});
await flushTasks();
await flushTasks();

document.getElementById("automation-editor-orchestration-preset-id-input").value = "preset-default";

document.getElementById("automation-editor-session-mode-input").value = "normal";
document.querySelector("[data-automation-editor-session-mode]")?.onchange?.({
    target: document.getElementById("automation-editor-session-mode-input"),
});
await flushTasks();
await flushTasks();

const normalModeHtml = els.projectViewContent.innerHTML;

document.getElementById("automation-editor-session-mode-input").value = "orchestration";
document.querySelector("[data-automation-editor-session-mode]")?.onchange?.({
    target: document.getElementById("automation-editor-session-mode-input"),
});
await flushTasks();
await flushTasks();

const orchestrationModeHtml = els.projectViewContent.innerHTML;
document.querySelector("[data-automation-editor-save]")?.onclick?.();
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    normalModeHtml,
    orchestrationModeHtml,
    updatePayload: globalThis.__updatedAutomationPayload,
}));
""".strip(),
        mock_api_source="""
export async function disableAutomationProject() {
    return { status: "disabled" };
}

export async function enableAutomationProject() {
    return { status: "enabled" };
}

export async function createAutomationProject() {
    return { automation_project_id: "aut_new" };
}

export async function deleteAutomationProject() {
    return { status: "ok" };
}

export async function fetchAutomationProject() {
    return {
        automation_project_id: "aut_1",
        name: "daily-briefing",
        display_name: "Daily Briefing",
        status: "enabled",
        workspace_id: "alpha-project",
        prompt: "Summarize the latest project changes.",
        schedule_mode: "cron",
        cron_expression: "0 9 * * *",
        timezone: "UTC",
        run_config: {
            session_mode: "normal",
            normal_root_role_id: "Writer",
            orchestration_preset_id: null,
        },
    };
}

export async function fetchAutomationFeishuBindings() {
    return [];
}

export async function fetchAutomationProjectSessions() {
    return [];
}

export async function fetchAutomationProjects() {
    return [{ automation_project_id: "aut_1", display_name: "Daily Briefing", name: "daily-briefing", status: "enabled", workspace_id: "alpha-project" }];
}

export async function fetchWorkspaces() {
    return [{ workspace_id: "alpha-project", root_path: "/work/alpha-project" }];
}

export async function fetchWorkspaceSnapshot() {
    throw new Error("not used");
}

export async function fetchWorkspaceTree() {
    throw new Error("not used");
}

export async function fetchWorkspaceDiffs() {
    throw new Error("not used");
}

export async function fetchWorkspaceDiffFile() {
    throw new Error("not used");
}

export async function runAutomationProject() {
    return { status: "ok" };
}

export async function fetchConfigStatus() {
    return { skills: { skills: [] } };
}

export async function fetchOrchestrationConfig() {
    return {
        presets: [{ preset_id: "preset-default", name: "Default Orchestration" }],
    };
}

export async function fetchRoleConfigOptions() {
    return {
        normal_mode_roles: [{ role_id: "Writer", name: "Writer" }],
    };
}

export async function fetchTriggers() {
    return [];
}

export async function fetchWeChatGatewayAccounts() {
    return [];
}

export async function reloadSkillsConfig() {
    return { status: "ok" };
}

export async function createTrigger() {
    return { status: "ok" };
}

export async function updateTrigger() {
    return { status: "ok" };
}

export async function deleteTrigger() {
    return { status: "ok" };
}

export async function enableTrigger() {
    return { status: "ok" };
}

export async function disableTrigger() {
    return { status: "ok" };
}

export async function startWeChatGatewayLogin() {
    return { session_key: "wechat-login-1", qr_code_url: "https://example.test/qr.png" };
}

export async function waitWeChatGatewayLogin() {
    return { connected: true };
}

export async function updateWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function enableWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function disableWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function deleteWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function updateAutomationProject(_automationProjectId, payload) {
    globalThis.__updatedAutomationPayload = payload;
    return { status: "ok" };
}
""".strip(),
    )

    update_payload = cast(dict[str, object], payload["updatePayload"])
    run_config = cast(dict[str, object], update_payload["run_config"])
    assert "Writer" in str(payload["normalModeHtml"])
    assert "Default Orchestration" in str(payload["orchestrationModeHtml"])
    assert run_config["session_mode"] == "orchestration"
    assert run_config["orchestration_preset_id"] == "preset-default"


def test_project_view_updates_automation_project_with_xiaoluban_binding(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openAutomationHomeView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openAutomationHomeView("aut_1");
await flushTasks();
await flushTasks();

const editButton = els.projectViewContent.querySelector("[data-automation-edit]");
editButton?.onclick?.();
await flushTasks();

const displayNameInput = document.getElementById("automation-editor-display-name-input");
if (displayNameInput) {
    displayNameInput.value = "Friday Briefing";
}
const bindingSelect = document.getElementById("automation-editor-delivery-binding-input");
if (bindingSelect) {
    bindingSelect.value = "xiaoluban::xlb_1";
    bindingSelect.onchange?.({ target: bindingSelect });
}
await flushTasks();

const saveButton = document.querySelector("[data-automation-editor-save]");
saveButton?.onclick?.();
await flushTasks();

console.log(JSON.stringify({
    contentHtml: els.projectViewContent.innerHTML,
    updatePayload: globalThis.__updatedAutomationPayload,
}));
""".strip(),
        mock_api_source="""
export async function disableAutomationProject() {
    return { status: "disabled" };
}

export async function enableAutomationProject() {
    return { status: "enabled" };
}

export async function createAutomationProject() {
    return { automation_project_id: "aut_new" };
}

export async function deleteAutomationProject() {
    return { status: "ok" };
}

export async function fetchAutomationProject() {
    return {
        automation_project_id: "aut_1",
        name: "daily-briefing",
        display_name: "Daily Briefing",
        status: "enabled",
        workspace_id: "alpha-project",
        prompt: "Summarize the latest project changes.",
        schedule_mode: "cron",
        cron_expression: "0 9 * * *",
        timezone: "UTC",
        delivery_binding: {
            provider: "xiaoluban",
            account_id: "xlb_1",
            display_name: "小鲁班主账号",
            derived_uid: "uid_self",
            source_label: "发送给自己（uid_self）",
        },
        delivery_events: ["completed"],
        next_run_at: "2026-03-14T09:00:00Z",
    };
}

export async function fetchAutomationFeishuBindings() {
    return [
        {
            provider: "feishu",
            trigger_id: "trg_feishu",
            trigger_name: "Feishu Main",
            tenant_key: "tenant-1",
            chat_id: "oc_123",
            chat_type: "group",
            source_label: "Release Updates",
            session_id: "session-im-1",
            session_title: "feishu_main - Release Updates",
            updated_at: "2026-03-14T10:00:00Z",
        },
        {
            provider: "xiaoluban",
            account_id: "xlb_1",
            display_name: "小鲁班主账号",
            derived_uid: "uid_self",
            source_label: "发送给自己（uid_self）",
            updated_at: "2026-03-14T10:05:00Z",
        },
    ];
}

export async function fetchAutomationProjectSessions() {
    return [];
}

export async function fetchAutomationProjects() {
    return [{ automation_project_id: "aut_1", display_name: "Daily Briefing", name: "daily-briefing", status: "enabled", workspace_id: "alpha-project" }];
}

export async function fetchWorkspaces() {
    return [{ workspace_id: "alpha-project", root_path: "/work/alpha-project" }];
}

export async function fetchWorkspaceSnapshot() { throw new Error("not used"); }
export async function fetchWorkspaceTree() { throw new Error("not used"); }
export async function fetchWorkspaceDiffs() { throw new Error("not used"); }
export async function fetchWorkspaceDiffFile() { throw new Error("not used"); }
export async function runAutomationProject() { return { status: "ok" }; }
export async function fetchConfigStatus() { return { skills: { skills: [] } }; }
export async function fetchOrchestrationConfig() { return { presets: [] }; }
export async function fetchRoleConfigOptions() { return { normal_mode_roles: [] }; }
export async function fetchTriggers() { return []; }
export async function fetchWeChatGatewayAccounts() { return []; }
export async function fetchXiaolubanGatewayAccounts() { return []; }
export async function reloadSkillsConfig() { return { status: "ok" }; }
export async function fetchSshProfiles() { return []; }
export async function updateWorkspace() { return { status: "ok" }; }
export async function createTrigger() { return { status: "ok" }; }
export async function updateTrigger() { return { status: "ok" }; }
export async function deleteTrigger() { return { status: "ok" }; }
export async function enableTrigger() { return { status: "ok" }; }
export async function disableTrigger() { return { status: "ok" }; }
export async function startWeChatGatewayLogin() { return { session_key: "wechat-login-1", qr_code_url: "https://example.test/qr.png" }; }
export async function waitWeChatGatewayLogin() { return { connected: true }; }
export async function updateWeChatGatewayAccount() { return { status: "ok" }; }
export async function enableWeChatGatewayAccount() { return { status: "ok" }; }
export async function disableWeChatGatewayAccount() { return { status: "ok" }; }
export async function deleteWeChatGatewayAccount() { return { status: "ok" }; }
export async function createXiaolubanGatewayAccount() { return { status: "ok" }; }
export async function updateXiaolubanGatewayAccount() { return { status: "ok" }; }
export async function enableXiaolubanGatewayAccount() { return { status: "ok" }; }
export async function disableXiaolubanGatewayAccount() { return { status: "ok" }; }
export async function deleteXiaolubanGatewayAccount() { return { status: "ok" }; }
export async function updateAutomationProject(_automationProjectId, payload) {
    globalThis.__updatedAutomationPayload = payload;
    return { status: "ok" };
}
""".strip(),
    )

    update_payload = cast(dict[str, object], payload["updatePayload"])
    delivery_binding = cast(dict[str, object], update_payload["delivery_binding"])
    assert delivery_binding == {
        "provider": "xiaoluban",
        "account_id": "xlb_1",
        "display_name": "小鲁班主账号",
        "derived_uid": "uid_self",
        "source_label": "发送给自己（uid_self）",
    }
    assert update_payload["delivery_events"] == ["completed"]
    assert "发送给自己（uid_self）" in str(payload["contentHtml"])


def test_project_view_keeps_automation_xiaoluban_binding_errors_inline(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openAutomationHomeView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openAutomationHomeView("aut_1");
await flushTasks();
await flushTasks();

document.querySelector("[data-automation-edit]")?.onclick?.();
await flushTasks();
await flushTasks();

document.querySelector("[data-automation-editor-save]")?.onclick?.();
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    editorHtml: els.projectViewContent.innerHTML,
    updateAttempts: globalThis.__automationUpdateAttempts || 0,
}));
""".strip(),
        mock_api_source="""
export async function disableAutomationProject() {
    return { status: "disabled" };
}

export async function enableAutomationProject() {
    return { status: "enabled" };
}

export async function createAutomationProject() {
    return { automation_project_id: "aut_new" };
}

export async function deleteAutomationProject() {
    return { status: "ok" };
}

export async function fetchAutomationProject() {
    return {
        automation_project_id: "aut_1",
        name: "daily-briefing",
        display_name: "Daily Briefing",
        status: "enabled",
        workspace_id: "alpha-project",
        prompt: "Summarize the latest project changes.",
        schedule_mode: "cron",
        cron_expression: "0 9 * * *",
        timezone: "UTC",
        delivery_binding: {
            provider: "xiaoluban",
            account_id: "xlb_1",
            display_name: "小鲁班主账号",
            derived_uid: "uid_self",
            source_label: "发送给自己（uid_self）",
        },
        delivery_events: ["completed"],
        next_run_at: "2026-03-14T09:00:00Z",
    };
}

export async function fetchAutomationFeishuBindings() {
    return [
        {
            provider: "xiaoluban",
            account_id: "xlb_1",
            display_name: "小鲁班主账号",
            derived_uid: "uid_self",
            source_label: "发送给自己（uid_self）",
            updated_at: "2026-03-14T10:05:00Z",
        },
    ];
}

export async function fetchAutomationProjectSessions() {
    return [];
}

export async function fetchAutomationProjects() {
    return [{ automation_project_id: "aut_1", display_name: "Daily Briefing", name: "daily-briefing", status: "enabled", workspace_id: "alpha-project" }];
}

export async function fetchWorkspaces() {
    return [{ workspace_id: "alpha-project", root_path: "/work/alpha-project" }];
}

export async function fetchWorkspaceSnapshot() { throw new Error("not used"); }
export async function fetchWorkspaceTree() { throw new Error("not used"); }
export async function fetchWorkspaceDiffs() { throw new Error("not used"); }
export async function fetchWorkspaceDiffFile() { throw new Error("not used"); }
export async function runAutomationProject() { return { status: "ok" }; }
export async function fetchConfigStatus() { return { skills: { skills: [] } }; }
export async function fetchOrchestrationConfig() { return { presets: [] }; }
export async function fetchRoleConfigOptions() { return { normal_mode_roles: [] }; }
export async function fetchTriggers() { return []; }
export async function fetchWeChatGatewayAccounts() { return []; }
export async function fetchXiaolubanGatewayAccounts() { return []; }
export async function reloadSkillsConfig() { return { status: "ok" }; }
export async function fetchSshProfiles() { return []; }
export async function updateWorkspace() { return { status: "ok" }; }
export async function createTrigger() { return { status: "ok" }; }
export async function updateTrigger() { return { status: "ok" }; }
export async function deleteTrigger() { return { status: "ok" }; }
export async function enableTrigger() { return { status: "ok" }; }
export async function disableTrigger() { return { status: "ok" }; }
export async function startWeChatGatewayLogin() { return { session_key: "wechat-login-1", qr_code_url: "https://example.test/qr.png" }; }
export async function waitWeChatGatewayLogin() { return { connected: true }; }
export async function updateWeChatGatewayAccount() { return { status: "ok" }; }
export async function enableWeChatGatewayAccount() { return { status: "ok" }; }
export async function disableWeChatGatewayAccount() { return { status: "ok" }; }
export async function deleteWeChatGatewayAccount() { return { status: "ok" }; }
export async function createXiaolubanGatewayAccount() { return { status: "ok" }; }
export async function updateXiaolubanGatewayAccount() { return { status: "ok" }; }
export async function enableXiaolubanGatewayAccount() { return { status: "ok" }; }
export async function disableXiaolubanGatewayAccount() { return { status: "ok" }; }
export async function deleteXiaolubanGatewayAccount() { return { status: "ok" }; }
export async function updateAutomationProject() {
    globalThis.__automationUpdateAttempts = (globalThis.__automationUpdateAttempts || 0) + 1;
    throw new Error("delivery_binding.account_id does not have usable Xiaoluban credentials");
}
""".strip(),
    )

    assert payload["updateAttempts"] == 1
    assert (
        "The selected Xiaoluban account is unavailable. Check the personal token or account status."
        in str(payload["editorHtml"])
    )
    assert (
        "delivery_binding.account_id does not have usable Xiaoluban credentials"
        not in str(payload["editorHtml"])
    )


def test_project_view_defaults_delivery_notifications_on_first_binding_selection(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openAutomationHomeView,
} from "./projectView.mjs";
import { flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openAutomationHomeView("aut_1");
await flushTasks();
await flushTasks();

document.querySelector("[data-automation-edit]")?.onclick?.();
await flushTasks();
await flushTasks();

const firstBinding = document.getElementById("automation-editor-delivery-binding-input");
firstBinding.value = "feishu::trg_feishu::tenant-1::oc_123::session-im-1";
document.querySelector("[data-automation-editor-binding]")?.onchange?.({ target: firstBinding });
await flushTasks();
await flushTasks();

const defaultsAfterFirstSelection = {
    started: document.getElementById("automation-editor-delivery-started-input")?.checked === true,
    completed: document.getElementById("automation-editor-delivery-completed-input")?.checked === true,
    failed: document.getElementById("automation-editor-delivery-failed-input")?.checked === true,
};

document.getElementById("automation-editor-delivery-completed-input").checked = false;

const secondBinding = document.getElementById("automation-editor-delivery-binding-input");
secondBinding.value = "feishu::trg_feishu_alt::tenant-1::oc_456::session-im-2";
document.querySelector("[data-automation-editor-binding]")?.onchange?.({ target: secondBinding });
await flushTasks();
await flushTasks();

const stateAfterSwitch = {
    started: document.getElementById("automation-editor-delivery-started-input")?.checked === true,
    completed: document.getElementById("automation-editor-delivery-completed-input")?.checked === true,
    failed: document.getElementById("automation-editor-delivery-failed-input")?.checked === true,
};

document.querySelector("[data-automation-editor-save]")?.onclick?.();
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    defaultsAfterFirstSelection,
    stateAfterSwitch,
    updatePayload: globalThis.__updatedAutomationPayload || null,
}));
""".strip(),
        mock_api_source="""
export async function disableAutomationProject() {
    return { status: "disabled" };
}

export async function enableAutomationProject() {
    return { status: "enabled" };
}

export async function createAutomationProject() {
    return { automation_project_id: "aut_new" };
}

export async function deleteAutomationProject() {
    return { status: "ok" };
}

export async function fetchAutomationProject() {
    return {
        automation_project_id: "aut_1",
        name: "daily-briefing",
        display_name: "Daily Briefing",
        status: "enabled",
        workspace_id: "alpha-project",
        prompt: "Summarize the latest project changes.",
        schedule_mode: "cron",
        cron_expression: "0 9 * * *",
        timezone: "UTC",
        delivery_events: [],
        next_run_at: "2026-03-14T09:00:00Z",
    };
}

export async function fetchAutomationFeishuBindings() {
    return [
        {
            provider: "feishu",
            trigger_id: "trg_feishu",
            trigger_name: "Feishu Main",
            tenant_key: "tenant-1",
            chat_id: "oc_123",
            chat_type: "group",
            source_label: "Release Updates",
            session_id: "session-im-1",
            session_title: "feishu_main - Release Updates",
            updated_at: "2026-03-14T10:00:00Z",
        },
        {
            provider: "feishu",
            trigger_id: "trg_feishu_alt",
            trigger_name: "Feishu Alt",
            tenant_key: "tenant-1",
            chat_id: "oc_456",
            chat_type: "group",
            source_label: "Operations",
            session_id: "session-im-2",
            session_title: "feishu_alt - Operations",
            updated_at: "2026-03-14T10:05:00Z",
        },
    ];
}

export async function fetchAutomationProjectSessions() {
    return [];
}

export async function fetchAutomationProjects() {
    return [{ automation_project_id: "aut_1", display_name: "Daily Briefing", name: "daily-briefing", status: "enabled", workspace_id: "alpha-project" }];
}

export async function fetchWorkspaces() {
    return [{ workspace_id: "alpha-project", root_path: "/work/alpha-project" }];
}

export async function fetchWorkspaceSnapshot() { throw new Error("not used"); }
export async function fetchWorkspaceTree() { throw new Error("not used"); }
export async function fetchWorkspaceDiffs() { throw new Error("not used"); }
export async function fetchWorkspaceDiffFile() { throw new Error("not used"); }
export async function runAutomationProject() { return { status: "ok" }; }
export async function fetchConfigStatus() { return { skills: { skills: [] } }; }
export async function fetchOrchestrationConfig() { return { presets: [] }; }
export async function fetchRoleConfigOptions() { return { normal_mode_roles: [] }; }
export async function fetchTriggers() { return []; }
export async function fetchWeChatGatewayAccounts() { return []; }
export async function fetchXiaolubanGatewayAccounts() { return []; }
export async function reloadSkillsConfig() { return { status: "ok" }; }
export async function fetchSshProfiles() { return []; }
export async function updateWorkspace() { return { status: "ok" }; }
export async function createTrigger() { return { status: "ok" }; }
export async function updateTrigger() { return { status: "ok" }; }
export async function deleteTrigger() { return { status: "ok" }; }
export async function enableTrigger() { return { status: "ok" }; }
export async function disableTrigger() { return { status: "ok" }; }
export async function startWeChatGatewayLogin() { return { session_key: "wechat-login-1", qr_code_url: "https://example.test/qr.png" }; }
export async function waitWeChatGatewayLogin() { return { connected: true }; }
export async function updateWeChatGatewayAccount() { return { status: "ok" }; }
export async function enableWeChatGatewayAccount() { return { status: "ok" }; }
export async function disableWeChatGatewayAccount() { return { status: "ok" }; }
export async function deleteWeChatGatewayAccount() { return { status: "ok" }; }
export async function createXiaolubanGatewayAccount() { return { status: "ok" }; }
export async function updateXiaolubanGatewayAccount() { return { status: "ok" }; }
export async function enableXiaolubanGatewayAccount() { return { status: "ok" }; }
export async function disableXiaolubanGatewayAccount() { return { status: "ok" }; }
export async function deleteXiaolubanGatewayAccount() { return { status: "ok" }; }
export async function updateAutomationProject(_automationProjectId, payload) {
    globalThis.__updatedAutomationPayload = payload;
    return { status: "ok" };
}
""".strip(),
    )

    assert payload["defaultsAfterFirstSelection"] == {
        "started": True,
        "completed": True,
        "failed": True,
    }
    assert payload["stateAfterSwitch"] == {
        "started": True,
        "completed": False,
        "failed": True,
    }
    update_payload = cast(dict[str, object], payload["updatePayload"])
    delivery_binding = cast(dict[str, object], update_payload["delivery_binding"])
    assert delivery_binding["trigger_id"] == "trg_feishu_alt"
    assert update_payload["delivery_events"] == ["started", "failed"]


def test_project_view_renders_github_automation_section_without_connection_settings(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openAutomationGitHubView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

globalThis.__mockGitHubAccounts = [
    {
        account_id: "ghta_1",
        name: "github-main",
        display_name: "GitHub Main",
        status: "enabled",
        token_configured: true,
        webhook_secret_configured: true,
    },
];
globalThis.__mockGitHubRepos = [
    {
        repo_subscription_id: "ghrs_1",
        account_id: "ghta_1",
        owner: "octocat",
        repo_name: "Hello-World",
        full_name: "octocat/Hello-World",
        callback_url: "https://example.com/github/webhook",
        webhook_status: "registered",
        enabled: true,
        subscribed_events: ["pull_request"],
    },
];
globalThis.__mockGitHubRules = [
    {
        trigger_rule_id: "trg_1",
        repo_subscription_id: "ghrs_1",
        name: "pr-opened",
        enabled: true,
        match_config: {
            event_name: "pull_request",
            actions: ["opened"],
        },
    },
];

initializeProjectView();
await openAutomationGitHubView("access");
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    contentHtml: els.projectViewContent.innerHTML,
    toolbarHtml: els.projectViewToolbarActions.innerHTML,
    summary: els.projectViewSummary.textContent,
    bindCalls: globalThis.__githubSettingsBindCalls || 0,
    loadCalls: globalThis.__githubSettingsLoadCalls || 0,
}));
""".strip(),
    )

    assert "GitHub Event Automation" in str(payload["contentHtml"])
    assert "Connection status" in str(payload["contentHtml"])
    assert "Bind repositories" in str(payload["contentHtml"])
    assert "Create trigger rules" in str(payload["contentHtml"])
    assert "Manage GitHub Connector" in str(payload["contentHtml"])
    assert 'data-github-open-connector=""' in str(payload["contentHtml"])
    assert "Advanced Connection Settings" not in str(payload["contentHtml"])
    assert '<details class="github-access-advanced">' not in str(payload["contentHtml"])
    assert 'id="feature-github-token"' not in str(payload["contentHtml"])
    assert 'id="feature-github-webhook-base-url"' not in str(payload["contentHtml"])
    assert "secure-input-row" not in str(payload["contentHtml"])
    assert "proxy-inline-field" not in str(payload["contentHtml"])
    assert "github.com/settings/tokens" not in str(payload["contentHtml"])
    assert "octocat/Hello-World" in str(payload["contentHtml"])
    assert 'data-github-repo-create="ghta_1"' in str(payload["contentHtml"])
    assert 'data-github-rule-create="ghrs_1"' in str(payload["contentHtml"])
    assert 'data-automation-section="github"' in str(payload["toolbarHtml"])
    assert "data-github-account-create" not in str(payload["toolbarHtml"])
    assert payload["summary"] == "1 accounts · 1 repos · 1 rules"
    assert payload["bindCalls"] == 0
    assert payload["loadCalls"] == 0


def test_project_view_github_access_empty_state_shows_disabled_workflow_steps(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openAutomationGitHubView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

globalThis.__mockGitHubAccounts = [];
globalThis.__mockGitHubRepos = [];
globalThis.__mockGitHubRules = [];

initializeProjectView();
await openAutomationGitHubView("access");
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    contentHtml: els.projectViewContent.innerHTML,
    toolbarHtml: els.projectViewToolbarActions.innerHTML,
}));
""".strip(),
    )

    content_html = str(payload["contentHtml"])
    assert "GitHub Event Automation" in content_html
    assert "Connection status" in content_html
    assert 'data-github-open-connector=""' in content_html
    assert (
        "GitHub is not connected yet. Configure a GitHub account in Connectors first."
        in content_html
    )
    assert "data-github-account-create" not in content_html
    assert "Connect a GitHub account before binding repositories." in content_html
    assert "Bind a repository before creating trigger rules." in content_html
    assert content_html.count("github-flow-step is-disabled") == 2
    assert '<details class="github-access-advanced">' not in content_html
    assert 'id="feature-github-token"' not in content_html
    assert "secure-input-row" not in content_html
    assert "github.com/settings/tokens" not in content_html
    assert "data-github-account-create" not in str(payload["toolbarHtml"])


def test_project_view_github_connector_entry_syncs_feature_navigation_state(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openAutomationGitHubView,
} from "./projectView.mjs";
import { state } from "./mockState.mjs";
import { els, flushTasks } from "./mockDom.mjs";

globalThis.__mockGitHubAccounts = [];
globalThis.__mockGitHubRepos = [];
globalThis.__mockGitHubRules = [];

initializeProjectView();
await openAutomationGitHubView("access");
await flushTasks();
await flushTasks();

const button = document.querySelector("[data-github-open-connector]");
button?.onclick?.();
await flushTasks();
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    buttonFound: Boolean(button),
    featureId: state.currentFeatureViewId,
    projectViewWorkspaceId: state.currentProjectViewWorkspaceId,
    title: els.projectViewTitle.textContent,
    dispatchedEvents: globalThis.__dispatchedEvents,
}));
""".strip(),
    )

    assert payload["buttonFound"] is True
    assert payload["featureId"] == "connectors"
    assert payload["projectViewWorkspaceId"] == "feature:connectors"
    events = cast(list[dict[str, object]], payload["dispatchedEvents"])
    feature_events = [
        event
        for event in events
        if event.get("type") == "agent-teams-feature-view-changed"
    ]
    assert feature_events[-1]["detail"] == {"featureId": "connectors"}

    sidebar_source = load_sidebar_source()
    assert "agent-teams-feature-view-changed" in sidebar_source
    assert "syncFeatureNavigationState(featureId)" in sidebar_source


def test_project_view_github_connector_modal_owns_connection_settings_and_accounts(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openImFeatureView,
} from "./projectView.mjs";
import { flushTasks } from "./mockDom.mjs";

globalThis.__mockGitHubAccounts = [
    {
        account_id: "ghta_1",
        name: "github-main",
        display_name: "GitHub Main",
        status: "enabled",
        token_configured: true,
        webhook_secret_configured: true,
    },
];
globalThis.__mockGitHubRepos = [
    {
        repo_subscription_id: "ghrs_1",
        account_id: "ghta_1",
        owner: "octocat",
        repo_name: "Hello-World",
        full_name: "octocat/Hello-World",
        enabled: true,
    },
];

initializeProjectView();
await openImFeatureView();
await flushTasks();
await flushTasks();

document.querySelector("[data-connector-open]")?.onclick?.();
await flushTasks();
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    modalHtml: globalThis.__bodyChildren.map(node => node.innerHTML).join("\\n"),
    bindCalls: globalThis.__githubSettingsBindCalls || 0,
    loadCalls: globalThis.__githubSettingsLoadCalls || 0,
}));
""".strip(),
        mock_api_source="""
export async function fetchConnectors() {
    return {
        summary: { connected: 1, needs_config: 0, disabled: 0, error: 0, total: 1 },
        items: [{ provider: "github", connector_id: "github", status: "connected", account_count: 1 }],
    };
}
""".strip(),
    )

    modal_html = str(payload["modalHtml"])
    assert "GitHub Connector" in modal_html
    assert "Connection settings" in modal_html
    assert "GitHub accounts" in modal_html
    assert 'id="feature-github-token"' in modal_html
    assert 'id="feature-github-webhook-base-url"' in modal_html
    assert "secure-input-row" in modal_html
    assert "proxy-inline-field" in modal_html
    assert 'data-github-account-create=""' in modal_html
    assert 'data-github-account-edit="ghta_1"' in modal_html
    assert 'data-github-account-toggle="ghta_1"' in modal_html
    assert 'data-github-account-delete="ghta_1"' in modal_html
    assert cast(int, payload["bindCalls"]) >= 1
    assert cast(int, payload["loadCalls"]) >= 1


def test_project_view_github_connector_modal_preserves_dirty_settings_on_rerender(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openImFeatureView,
} from "./projectView.mjs";
import { flushTasks } from "./mockDom.mjs";

globalThis.__mockGitHubAccounts = [];
globalThis.__mockGitHubSettingsToken = "ghp_saved";
globalThis.__mockGitHubSettingsWebhookBaseUrl = "https://saved.example.com";

initializeProjectView();
await openImFeatureView();
await flushTasks();
await flushTasks();

document.querySelector("[data-connector-open]")?.onclick?.();
await flushTasks();
await flushTasks();
await flushTasks();

const tokenInput = document.getElementById("feature-github-token");
const webhookInput = document.getElementById("feature-github-webhook-base-url");
tokenInput.value = "ghp_dirty";
tokenInput.oninput?.();
webhookInput.value = "https://dirty.example.com";
webhookInput.oninput?.();

const searchInput = document.querySelector("[data-connectors-search]");
searchInput.value = "git";
searchInput.oninput?.();
await flushTasks();
await flushTasks();

const preservedTokenValue = document.getElementById("feature-github-token")?.value || "";
const preservedWebhookValue = document.getElementById("feature-github-webhook-base-url")?.value || "";

document.querySelector("[data-connector-modal-close]")?.onclick?.();
await flushTasks();
await flushTasks();

document.querySelector("[data-connector-open]")?.onclick?.();
await flushTasks();
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    preservedTokenValue,
    preservedWebhookValue,
    tokenValue: document.getElementById("feature-github-token")?.value || "",
    webhookValue: document.getElementById("feature-github-webhook-base-url")?.value || "",
    loadCalls: globalThis.__githubSettingsLoadCalls || 0,
    restoreCalls: globalThis.__githubSettingsRestoreCalls || 0,
    resetCalls: globalThis.__githubSettingsResetCalls || 0,
    loadOptions: globalThis.__githubSettingsLoadOptions || [],
}));
""".strip(),
        mock_api_source="""
export async function fetchConnectors() {
    return {
        summary: { connected: 0, needs_config: 1, disabled: 0, error: 0, total: 1 },
        items: [{ provider: "github", connector_id: "github", status: "needs_config", account_count: 0 }],
    };
}
""".strip(),
    )

    assert payload["preservedTokenValue"] == "ghp_dirty"
    assert payload["preservedWebhookValue"] == "https://dirty.example.com"
    assert payload["tokenValue"] == "ghp_saved"
    assert payload["webhookValue"] == "https://saved.example.com"
    assert payload["loadCalls"] == 2
    assert cast(int, payload["restoreCalls"]) >= 2
    assert payload["resetCalls"] == 1
    assert payload["loadOptions"] == [{"preserveDirty": True}, {"preserveDirty": True}]


def test_project_view_github_connector_modal_uses_api_status(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openImFeatureView,
} from "./projectView.mjs";
import { flushTasks } from "./mockDom.mjs";

globalThis.__mockGitHubAccounts = [];

initializeProjectView();
await openImFeatureView();
await flushTasks();
await flushTasks();

document.querySelector("[data-connector-open]")?.onclick?.();
await flushTasks();
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    modalHtml: globalThis.__bodyChildren.map(node => node.innerHTML).join("\\n"),
}));
""".strip(),
        mock_api_source="""
export async function fetchConnectors() {
    return {
        summary: { connected: 1, needs_config: 0, disabled: 0, error: 0, total: 1 },
        items: [{ provider: "github", connector_id: "github", status: "connected", account_count: 0 }],
    };
}
""".strip(),
    )

    assert "Connected" in str(payload["modalHtml"])
    assert "Unconnected" not in str(payload["modalHtml"])


def test_project_view_github_account_create_refreshes_connector_status(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openImFeatureView,
} from "./projectView.mjs";
import { flushTasks } from "./mockDom.mjs";

globalThis.__mockGitHubAccounts = [];
globalThis.__showFormDialogResult = {
    name: "github-main",
    display_name: "GitHub Main",
    token: "ghp_new",
    clear_token: false,
    webhook_secret: "secret",
    clear_webhook_secret: false,
    enabled: true,
};

initializeProjectView();
await openImFeatureView();
await flushTasks();
await flushTasks();

document.querySelector("[data-connector-open]")?.onclick?.();
await flushTasks();
await flushTasks();
await flushTasks();

document.querySelector("[data-github-account-create]")?.onclick?.();
await flushTasks();
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    fetchConnectorsCalls: globalThis.__fetchConnectorsCalls || 0,
    createdPayload: globalThis.__createdGitHubAccountPayload || null,
    modalHtml: globalThis.__bodyChildren.map(node => node.innerHTML).join("\\n"),
}));
""".strip(),
        mock_api_source="""
export async function fetchConnectors() {
    globalThis.__fetchConnectorsCalls = (globalThis.__fetchConnectorsCalls || 0) + 1;
    const connected = Boolean(globalThis.__createdGitHubAccountPayload);
    return {
        summary: connected
            ? { connected: 1, needs_config: 0, disabled: 0, error: 0, total: 1 }
            : { connected: 0, needs_config: 1, disabled: 0, error: 0, total: 1 },
        items: [{
            provider: "github",
            connector_id: "github",
            status: connected ? "connected" : "needs_config",
            account_count: connected ? 1 : 0,
        }],
    };
}
""".strip(),
    )

    assert cast(int, payload["fetchConnectorsCalls"]) >= 2
    assert payload["createdPayload"] == {
        "name": "github-main",
        "display_name": "GitHub Main",
        "token": "ghp_new",
        "webhook_secret": "secret",
        "enabled": True,
    }
    assert "Connected" in str(payload["modalHtml"])
    assert "1/1 accounts enabled" in str(payload["modalHtml"])


def test_project_view_github_settings_save_refreshes_connector_status(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openImFeatureView,
} from "./projectView.mjs";
import { flushTasks } from "./mockDom.mjs";

globalThis.__mockGitHubAccounts = [];

initializeProjectView();
await openImFeatureView();
await flushTasks();
await flushTasks();

document.querySelector("[data-connector-open]")?.onclick?.();
await flushTasks();
await flushTasks();
await flushTasks();

await globalThis.__githubSettingsSaveHandler?.();
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    savedKind: globalThis.__githubSettingsSaved || "",
    bindCalls: globalThis.__githubSettingsBindCalls || 0,
    fetchConnectorsCalls: globalThis.__fetchConnectorsCalls || 0,
    modalHtml: globalThis.__bodyChildren.map(node => node.innerHTML).join("\\n"),
}));
""".strip(),
        mock_api_source="""
export async function fetchConnectors() {
    globalThis.__fetchConnectorsCalls = (globalThis.__fetchConnectorsCalls || 0) + 1;
    const connected = Boolean(globalThis.__githubSettingsSaved);
    return {
        summary: connected
            ? { connected: 1, needs_config: 0, disabled: 0, error: 0, total: 1 }
            : { connected: 0, needs_config: 1, disabled: 0, error: 0, total: 1 },
        items: [{
            provider: "github",
            connector_id: "github",
            status: connected ? "connected" : "needs_config",
            account_count: 0,
        }],
    };
}
""".strip(),
    )

    assert payload["savedKind"] == "token"
    assert cast(int, payload["bindCalls"]) >= 2
    assert cast(int, payload["fetchConnectorsCalls"]) >= 2
    assert "Connected" in str(payload["modalHtml"])
    assert "Unconnected" not in str(payload["modalHtml"])


def test_project_view_repo_detail_shows_full_github_rule_configuration(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openAutomationGitHubView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

globalThis.__mockGitHubAccounts = [
    {
        account_id: "ghta_1",
        name: "github-main",
        display_name: "GitHub Main",
        status: "enabled",
        token_configured: true,
        webhook_secret_configured: true,
    },
];
globalThis.__mockGitHubRepos = [
    {
        repo_subscription_id: "ghrs_1",
        account_id: "ghta_1",
        owner: "octocat",
        repo_name: "Hello-World",
        full_name: "octocat/Hello-World",
        callback_url: "https://example.com/github/webhook",
        webhook_status: "registered",
        enabled: true,
        subscribed_events: ["pull_request"],
    },
];
globalThis.__mockGitHubRules = [
    {
        trigger_rule_id: "trg_1",
        repo_subscription_id: "ghrs_1",
        name: "pr-opened",
        enabled: true,
        match_config: {
            event_name: "pull_request",
            actions: ["opened", "edited"],
            draft_pr: false,
            base_branches: ["main", "release/*"],
        },
        dispatch_config: {
            target_type: "run_template",
            run_template: {
                workspace_id: "rule-workspace",
                prompt_template: "Review the PR\\nand summarize impact.",
            },
        },
    },
];

initializeProjectView();
await openAutomationGitHubView("repo:ghrs_1");
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    contentHtml: els.projectViewContent.innerHTML,
}));
""".strip(),
    )

    assert "Workspace ID" in str(payload["contentHtml"])
    assert "rule-workspace" in str(payload["contentHtml"])
    assert "Subscribed Event" in str(payload["contentHtml"])
    assert "Pull Request" in str(payload["contentHtml"])
    assert "Actions" in str(payload["contentHtml"])
    assert "opened, edited" in str(payload["contentHtml"])
    assert "Draft Pull Request" in str(payload["contentHtml"])
    assert "Ready for review only" in str(payload["contentHtml"])
    assert "Base Branches" in str(payload["contentHtml"])
    assert "main, release/*" in str(payload["contentHtml"])
    assert "Task Prompt" in str(payload["contentHtml"])
    assert "Review the PR" in str(payload["contentHtml"])
    assert "summarize impact." in str(payload["contentHtml"])
    assert "Open Webhooks" in str(payload["contentHtml"])
    assert "https://github.com/octocat/Hello-World/settings/hooks" in str(
        payload["contentHtml"]
    )


def test_project_view_refreshes_github_repo_webhook_state_after_rule_create(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openAutomationGitHubView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

globalThis.__mockGitHubAccounts = [
    {
        account_id: "ghta_1",
        name: "github-main",
        display_name: "GitHub Main",
        status: "enabled",
        token_configured: true,
        webhook_secret_configured: true,
    },
];
globalThis.__mockGitHubRepos = [
    {
        repo_subscription_id: "ghrs_1",
        account_id: "ghta_1",
        owner: "octocat",
        repo_name: "Hello-World",
        full_name: "octocat/Hello-World",
        callback_url: "https://example.com/github/webhook",
        webhook_status: "unregistered",
        enabled: true,
        subscribed_events: [],
    },
];
globalThis.__mockGitHubRules = [];
globalThis.__showFormDialogResult = {
    name: "pr-opened",
    workspace_id: "alpha-project",
    event_name: "pull_request",
    actions: ["opened"],
    draft_pr: "any",
    base_branches: "",
    prompt_template: "Review the incoming PR.",
    enabled: true,
};

initializeProjectView();
await openAutomationGitHubView("repo:ghrs_1");
await flushTasks();
await flushTasks();

const beforeHtml = els.projectViewContent.innerHTML;
const createRuleButton = els.projectViewContent
    .querySelectorAll("[data-github-rule-create]")
    .find(button => button.getAttribute("data-github-rule-create") === "ghrs_1");
createRuleButton?.onclick?.();
await flushTasks();
await flushTasks();
await new Promise(resolve => setTimeout(resolve, 10));
await flushTasks();

console.log(JSON.stringify({
    beforeHtml,
    afterHtml: els.projectViewContent.innerHTML,
    buttonFound: Boolean(createRuleButton),
    repoFetchCalls: globalThis.__fetchGitHubRepoSubscriptionsCalls || 0,
    createdRulePayload: globalThis.__createdGitHubRulePayload || null,
}));
""".strip(),
        mock_api_source="""
export async function fetchWorkspaces() {
    return [{ workspace_id: "alpha-project", name: "Alpha Project" }];
}

export async function fetchGitHubRepoSubscriptions() {
    globalThis.__fetchGitHubRepoSubscriptionsCalls =
        (globalThis.__fetchGitHubRepoSubscriptionsCalls || 0) + 1;
    return globalThis.__mockGitHubRepos || [];
}

export async function createGitHubTriggerRule(payload) {
    globalThis.__createdGitHubRulePayload = payload;
    globalThis.__mockGitHubRules = [
        {
            trigger_rule_id: "trg_new",
            provider: "github",
            account_id: "ghta_1",
            repo_subscription_id: "ghrs_1",
            name: payload?.name || "rule",
            enabled: true,
            match_config: payload?.match_config || {},
            dispatch_config: payload?.dispatch_config || {},
        },
    ];
    globalThis.__mockGitHubRepos = [
        {
            repo_subscription_id: "ghrs_1",
            account_id: "ghta_1",
            owner: "octocat",
            repo_name: "Hello-World",
            full_name: "octocat/Hello-World",
            callback_url: "https://example.com/github/webhook",
            webhook_status: "registered",
            enabled: true,
            subscribed_events: ["pull_request"],
        },
    ];
    return globalThis.__mockGitHubRules[0];
}
""".strip(),
    )

    assert "Unregistered" in str(payload["beforeHtml"])
    assert payload["buttonFound"] is True
    assert "Registered" in str(payload["afterHtml"])
    assert "pull_request" in str(payload["afterHtml"])
    assert cast(int, payload["repoFetchCalls"]) >= 2
    assert (
        cast(dict[str, object], payload["createdRulePayload"])["repo_subscription_id"]
        == "ghrs_1"
    )


def test_project_view_github_account_dialog_uses_secure_fields(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openImFeatureView,
} from "./projectView.mjs";
import { flushTasks } from "./mockDom.mjs";

globalThis.__mockGitHubAccounts = [
    {
        account_id: "ghta_1",
        name: "github-main",
        display_name: "GitHub Main",
        status: "enabled",
        token_configured: true,
        webhook_secret_configured: true,
    },
];

initializeProjectView();
await openImFeatureView();
await flushTasks();
await flushTasks();

document.querySelector("[data-connector-open]")?.onclick?.();
await flushTasks();
await flushTasks();

const editButton = document.querySelector('[data-github-account-edit]');
editButton?.onclick?.();
await flushTasks();
await flushTasks();

const dialogCall = globalThis.__showFormDialogCalls.at(-1) || {};
const fields = Array.isArray(dialogCall.fields) ? dialogCall.fields : [];
    const secureFields = fields
        .filter(field => field.id === "token" || field.id === "webhook_secret")
        .map(field => ({
            id: field.id,
            type: field.type || "text",
            allowEmptyReveal: field.allowEmptyReveal === true,
            showLabel: field.showLabel || "",
            hideLabel: field.hideLabel || "",
        }));

console.log(JSON.stringify({
    buttonFound: Boolean(editButton),
    secureFields,
}));
""".strip(),
        mock_api_source="""
export async function fetchConnectors() {
    return {
        summary: { connected: 1, needs_config: 0, disabled: 0, error: 0, total: 1 },
        items: [{ provider: "github", connector_id: "github", status: "connected", account_count: 1 }],
    };
}
""".strip(),
    )

    assert payload["buttonFound"] is True
    assert payload["secureFields"] == [
        {
            "id": "token",
            "type": "password",
            "allowEmptyReveal": True,
            "showLabel": "Show GitHub token",
            "hideLabel": "Hide GitHub token",
        },
        {
            "id": "webhook_secret",
            "type": "password",
            "allowEmptyReveal": True,
            "showLabel": "Show Webhook Secret",
            "hideLabel": "Hide Webhook Secret",
        },
    ]


def test_project_view_new_github_account_dialog_allows_empty_reveal(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openImFeatureView,
} from "./projectView.mjs";
import { flushTasks } from "./mockDom.mjs";

globalThis.__mockGitHubAccounts = [];

initializeProjectView();
await openImFeatureView();
await flushTasks();
await flushTasks();

document.querySelector("[data-connector-open]")?.onclick?.();
await flushTasks();
await flushTasks();

const createButton = document.querySelector('[data-github-account-create]');
createButton?.onclick?.();
await flushTasks();
await flushTasks();

const dialogCall = globalThis.__showFormDialogCalls.at(-1) || {};
const fields = Array.isArray(dialogCall.fields) ? dialogCall.fields : [];
const secureFields = fields
    .filter(field => field.id === "token" || field.id === "webhook_secret")
    .map(field => ({
        id: field.id,
        type: field.type || "text",
        allowEmptyReveal: field.allowEmptyReveal === true,
    }));

console.log(JSON.stringify({
    buttonFound: Boolean(createButton),
    secureFields,
}));
""".strip(),
        mock_api_source="""
export async function fetchConnectors() {
    return {
        summary: { connected: 0, needs_config: 1, disabled: 0, error: 0, total: 1 },
        items: [{ provider: "github", connector_id: "github", status: "needs_config", account_count: 0 }],
    };
}
""".strip(),
    )

    assert payload["buttonFound"] is True
    assert payload["secureFields"] == [
        {
            "id": "token",
            "type": "password",
            "allowEmptyReveal": True,
        },
        {
            "id": "webhook_secret",
            "type": "password",
            "allowEmptyReveal": True,
        },
    ]


def test_project_view_edits_github_account_with_inline_submit_handler(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openImFeatureView,
} from "./projectView.mjs";
import { flushTasks } from "./mockDom.mjs";

globalThis.__mockGitHubAccounts = [
    {
        account_id: "ghta_1",
        name: "github-main",
        display_name: "GitHub Main",
        status: "enabled",
        token_configured: true,
        webhook_secret_configured: true,
    },
];
globalThis.__showFormDialogResult = {
    name: "github-main",
    display_name: "GitHub Main",
    token: "",
    clear_token: false,
    webhook_secret: "",
    clear_webhook_secret: false,
    enabled: true,
};

initializeProjectView();
await openImFeatureView();
await flushTasks();
await flushTasks();

document.querySelector("[data-connector-open]")?.onclick?.();
await flushTasks();
await flushTasks();

const editButton = document.querySelector('[data-github-account-edit]');
editButton?.onclick?.();
await flushTasks();
await flushTasks();

const dialogCall = globalThis.__showFormDialogCalls.at(-1) || {};

console.log(JSON.stringify({
    buttonFound: Boolean(editButton),
    submitHandlerType: typeof dialogCall.submitHandler,
    updatedPayload: globalThis.__updatedGitHubAccountPayload || null,
    toastCalls: globalThis.__toastCalls || [],
}));
""".strip(),
        mock_api_source="""
export async function fetchConnectors() {
    return {
        summary: { connected: 1, needs_config: 0, disabled: 0, error: 0, total: 1 },
        items: [{ provider: "github", connector_id: "github", status: "connected", account_count: 1 }],
    };
}
""".strip(),
    )

    assert payload["buttonFound"] is True
    assert payload["submitHandlerType"] == "function"
    assert payload["updatedPayload"] == {
        "accountId": "ghta_1",
        "payload": {
            "name": "github-main",
            "display_name": "GitHub Main",
            "enabled": True,
        },
    }
    assert payload["toastCalls"] == [
        {
            "title": "Saved",
            "message": "GitHub Main",
            "tone": "success",
        }
    ]


def test_project_view_creates_github_repo_from_repository_dropdown(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openAutomationGitHubView,
} from "./projectView.mjs";
import { flushTasks } from "./mockDom.mjs";

globalThis.__mockGitHubAccounts = [
    {
        account_id: "ghta_1",
        name: "github-main",
        display_name: "GitHub Main",
        status: "enabled",
        token_configured: true,
        webhook_secret_configured: true,
    },
];
globalThis.__mockGitHubRepos = [];
globalThis.__mockGitHubRules = [];
globalThis.__mockGitHubAvailableRepos = [
    {
        owner: "octocat",
        repo_name: "Hello-World",
        full_name: "octocat/Hello-World",
        default_branch: "main",
        private: false,
    },
];

initializeProjectView();
await openAutomationGitHubView("account:ghta_1");
await flushTasks();
await flushTasks();

globalThis.__showFormDialogResult = {
    full_name: "octocat/Hello-World",
    enabled: true,
};

const button = document.querySelector('[data-github-repo-create]');
button?.onclick?.();
await flushTasks();
await flushTasks();

const dialogCall = globalThis.__showFormDialogCalls.at(-1) || {};
const fields = Array.isArray(dialogCall.fields) ? dialogCall.fields : [];

console.log(JSON.stringify({
    buttonFound: Boolean(button),
    buttonValue: button?.getAttribute?.("data-github-repo-create") || "",
    createdPayload: globalThis.__createdGitHubRepoPayload || null,
    fieldIds: fields.map(field => field.id),
    fieldTypes: fields.map(field => field.type || "text"),
    firstFieldOptions: fields[0]?.options || [],
    toastCalls: globalThis.__toastCalls || [],
}));
""".strip(),
    )

    assert payload["buttonFound"] is True
    assert payload["buttonValue"] == "ghta_1"
    assert payload["createdPayload"] == {
        "account_id": "ghta_1",
        "owner": "octocat",
        "repo_name": "Hello-World",
        "enabled": True,
    }
    assert payload["fieldIds"] == ["full_name", "enabled"]
    assert payload["fieldTypes"] == ["select", "checkbox"]
    assert payload["firstFieldOptions"] == [
        {"value": "", "label": "Select a repository"},
        {"value": "octocat/Hello-World", "label": "octocat/Hello-World"},
    ]


def test_project_view_github_rule_dialog_exposes_subscribed_event_field() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    source = (
        repo_root / "frontend" / "dist" / "js" / "components" / "projectView.js"
    ).read_text(encoding="utf-8")

    assert "function getGitHubRuleEventOptions()" in source
    assert "id: 'workspace_id'" in source
    assert "description: t('feature.automation.github_rule_workspace_copy')" in source
    assert "id: 'event_name'" in source
    assert "label: t('feature.automation.github_event_subscription')" in source
    assert "description: t('feature.automation.github_event_copy')" in source
    assert "options: getGitHubRuleEventOptions()" in source
    assert "label: t('feature.automation.github_rule_name')" in source
    assert "id: 'actions'" in source
    assert "type: 'multiselect'" in source
    assert "options: getGitHubRuleActionOptions()" in source
    assert "placeholder: t('feature.automation.github_actions_placeholder')" in source
    assert "description: t('feature.automation.github_actions_copy')" in source
    assert "id: 'draft_pr'" in source
    assert "options: getGitHubDraftPrOptions()" in source
    assert "description: t('feature.automation.github_draft_pr_copy')" in source
    assert "id: 'head_branches'" not in source
    assert "id: 'comment_on_completion'" not in source
    assert "id: 'completion_comment_template'" not in source
    assert "id: 'labels_any'" not in source
    assert "id: 'labels_all'" not in source
    assert "id: 'label_match_mode'" not in source
    assert "id: 'labels'" not in source
    assert "id: 'sender_allow'" not in source
    assert "id: 'sender_deny'" not in source
    assert "id: 'paths_any'" not in source
    assert "id: 'paths_ignore'" not in source


def test_project_view_github_rule_edit_dialog_preserves_event_selection_controls() -> (
    None
):
    repo_root = Path(__file__).resolve().parents[3]
    i18n_source = (
        repo_root / "frontend" / "dist" / "js" / "utils" / "i18n.js"
    ).read_text(encoding="utf-8")

    assert (
        "'feature.automation.github_event_subscription': 'Subscribed Event'"
        in i18n_source
    )
    assert (
        "'feature.automation.github_event_copy': 'Select the GitHub webhook event for this rule. The repository subscribed events are derived automatically from enabled rules.'"
        in i18n_source
    )
    assert (
        "'feature.automation.github_event_pull_request': 'Pull Request'" in i18n_source
    )
    assert "'feature.automation.github_event_issues': 'Issues'" in i18n_source
    assert "'feature.automation.github_rule_name': 'Rule Name'" in i18n_source
    assert (
        "'feature.automation.github_actions_copy': 'Select one or more GitHub actions."
        in i18n_source
    )
    assert "'feature.automation.github_draft_pr': 'Draft Pull Request'" in i18n_source
    assert (
        "'feature.automation.github_rule_workspace_summary': 'Workspace: {workspace}'"
        in i18n_source
    )
    assert "review_requested" in i18n_source


def test_project_view_w3_messages_use_localized_error_codes() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    source = (
        repo_root / "frontend" / "dist" / "js" / "components" / "projectView.js"
    ).read_text(encoding="utf-8")
    i18n_source = (
        repo_root / "frontend" / "dist" / "js" / "utils" / "i18n.js"
    ).read_text(encoding="utf-8")

    assert "function formatW3ConnectorResultMessage(result" in source
    assert "function formatW3ConnectorStatusMessage(status" in source
    assert "result?.error_code" in source
    assert "last_login_error_code" in source
    assert "validateW3CredentialPayload(payload)" in source
    assert "w3StatusMessage: message" in source
    assert "'feature.connectors.w3.message.saved':" in i18n_source
    assert "'feature.connectors.w3.message.invalid_credentials':" in i18n_source
    assert "'feature.connectors.w3.message.login_timeout':" in i18n_source
    assert "'feature.connectors.w3.message.network_error':" in i18n_source
    assert "'feature.connectors.w3.message.auth_token_missing':" in i18n_source
    assert "'feature.connectors.w3.message.login_failed':" in i18n_source


def test_project_view_github_rule_payload_clears_pr_only_filters_for_issue_rules() -> (
    None
):
    repo_root = Path(__file__).resolve().parents[3]
    source = (
        repo_root / "frontend" / "dist" / "js" / "components" / "projectView.js"
    ).read_text(encoding="utf-8")

    assert "draft_pr: normalizeGitHubDraftPrValue(values.draft_pr)," in source
    assert (
        "base_branches: normalizeCommaSeparatedValues(values.base_branches)," in source
    )
    assert (
        "const selectedActions = normalizeCommaSeparatedValues(values.actions);"
        in source
    )
    assert "actions: selectedActions," in source
    assert (
        "head_branches: normalizeCommaSeparatedValues(values.head_branches),"
        not in source
    )
    assert "comment_on_completion" not in source
    assert "completion_comment_template" not in source
    assert "labels_any:" not in source
    assert "labels_all:" not in source
    assert "sender_allow:" not in source
    assert "sender_deny:" not in source
    assert "paths_any:" not in source
    assert "paths_ignore:" not in source


def test_project_view_automation_schedule_editor_supports_interval_and_advanced_cron() -> (
    None
):
    repo_root = Path(__file__).resolve().parents[3]
    source = (
        repo_root / "frontend" / "dist" / "js" / "components" / "projectView.js"
    ).read_text(encoding="utf-8")
    i18n_source = (
        repo_root / "frontend" / "dist" / "js" / "utils" / "i18n.js"
    ).read_text(encoding="utf-8")

    assert "interval: 'interval'" in source
    assert "advancedCron: 'advanced_cron'" in source
    assert "schedule_mode: 'interval'" in source
    assert "interval_every: intervalEvery" in source
    assert "interval_unit: intervalUnit" in source
    assert "automation-editor-cron-expression-input" in source
    assert "schedule_mode: 'cron'" in source
    assert "cron_expression: cronExpression" in source
    assert "'automation.schedule.interval': 'Every interval'" in i18n_source
    assert "'automation.schedule.advanced_cron': 'Advanced cron'" in i18n_source
    assert "'automation.schedule.interval': '固定间隔'" in i18n_source
    assert "'automation.schedule.advanced_cron': '高级 Cron'" in i18n_source


def test_project_view_keeps_non_fixed_cron_as_advanced_cron(tmp_path: Path) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openAutomationProjectView,
} from "./projectView.mjs";
import { flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openAutomationProjectView({ automation_project_id: "aut_1", workspace_id: "alpha-project" });
await flushTasks();
await flushTasks();

document.querySelector("[data-automation-edit]")?.onclick?.();
await flushTasks();
await flushTasks();

const scheduleKindInput = document.getElementById("automation-editor-schedule-kind-input");
const cronExpressionInput = document.getElementById("automation-editor-cron-expression-input");
document.querySelector("[data-automation-editor-save]")?.onclick?.();
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    scheduleKind: scheduleKindInput?.value || "",
    cronExpression: cronExpressionInput?.value || "",
    updatePayload: globalThis.__updatedAutomationPayload,
}));
""".strip(),
        mock_api_source="""
export async function fetchAutomationProject() {
    return {
        automation_project_id: "aut_1",
        name: "quarter-hour-build-check",
        display_name: "Quarter-hour build check",
        status: "enabled",
        workspace_id: "alpha-project",
        prompt: "Check build health.",
        schedule_mode: "cron",
        cron_expression: "*/15 * * * *",
        timezone: "UTC",
        delivery_binding: null,
        delivery_events: [],
        run_config: {
            session_mode: "normal",
            normal_root_role_id: "Writer",
            orchestration_preset_id: null,
            execution_mode: "ai",
            yolo: false,
            thinking: { enabled: false, effort: null },
        },
        next_run_at: "2026-03-14T09:15:00Z",
    };
}

export async function fetchAutomationProjects() {
    return [
        {
            automation_project_id: "aut_1",
            display_name: "Quarter-hour build check",
            name: "quarter-hour-build-check",
            status: "enabled",
            workspace_id: "alpha-project",
        },
    ];
}

export async function fetchWorkspaces() {
    return [
        {
            workspace_id: "alpha-project",
            root_path: "/work/alpha-project",
        },
    ];
}

export async function fetchRoleConfigOptions() {
    return { normal_mode_roles: [{ role_id: "Writer", name: "Writer" }] };
}

export async function updateAutomationProject(_automationProjectId, payload) {
    globalThis.__updatedAutomationPayload = payload;
    return { status: "ok" };
}
""".strip(),
    )

    update_payload = cast(dict[str, object], payload["updatePayload"])
    assert payload["scheduleKind"] == "advanced_cron"
    assert payload["cronExpression"] == "*/15 * * * *"
    assert update_payload["schedule_mode"] == "cron"
    assert update_payload["cron_expression"] == "*/15 * * * *"


def test_feedback_form_dialog_supports_multiselect_fields() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    source = (
        repo_root / "frontend" / "dist" / "js" / "utils" / "feedback.js"
    ).read_text(encoding="utf-8")

    assert "fieldType === 'multiselect'" in source
    assert 'data-feedback-form-type="multiselect"' in source
    assert "data-feedback-multiselect-option" in source
    assert "bindMultiselectControls(hosts.dialogRoot);" in source
    assert "summaryMode" in source
    assert "data-feedback-multiselect-summary-key" in source
    assert "data-feedback-multiselect-summary-all-value" in source
    assert "data-feedback-multiselect-summary-none-value" in source
    assert "formatMessage(summaryKey, { count })" in source
    assert "function bindMultiselectControls(dialogNode)" in source
    assert "const syncSelection = changedOption =>" in source
    assert "changedValue === summaryNoneValue" in source
    assert "changedValue === summaryAllValue" in source


def test_feedback_password_toggle_preserves_edited_revealed_value() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    source = (
        repo_root / "frontend" / "dist" / "js" / "utils" / "feedback.js"
    ).read_text(encoding="utf-8")

    assert "let inputEditedAfterReveal = false;" in source
    assert (
        "inputEditedAfterReveal = String(matchedInput.value || '') !== revealedValue;"
        in source
    )
    assert "if (!nextRevealed && maskedValue && !inputEditedAfterReveal)" in source
    assert "formatMessage('feedback.reveal_sensitive_failed'" in source
    assert "showDialogSubmitError(" in source


def test_feedback_form_dialog_supports_inline_submit_errors() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    source = (
        repo_root / "frontend" / "dist" / "js" / "utils" / "feedback.js"
    ).read_text(encoding="utf-8")

    assert "submitHandler = null" in source
    assert "typeof activeDialog?.submitHandler === 'function'" in source
    assert "feedback-dialog-submit-error" in source
    assert "data-feedback-field-error" in source
    assert "function showDialogSubmitError(dialogNode, submitError, error)" in source
    assert "error?.fieldId || error?.field_id" in source
    assert "setDialogSubmittingState({" in source
    assert "submitError.hidden = false;" in source


def test_feedback_form_dialog_supports_conditional_field_visibility() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    source = (
        repo_root / "frontend" / "dist" / "js" / "utils" / "feedback.js"
    ).read_text(encoding="utf-8")

    assert (
        "bindConditionalFieldVisibility(hosts.dialogRoot, activeDialog.fields, formInputs);"
        in source
    )
    assert "data-feedback-form-field" in source
    assert "function evaluateDialogFieldVisibility(field, currentValues)" in source
    assert "function findFirstVisibleFormInput(formInputs)" in source
    assert "visibleWhen" in source


def test_project_view_updates_local_github_rule_state_after_mutations() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    source = (
        repo_root / "frontend" / "dist" / "js" / "components" / "projectView.js"
    ).read_text(encoding="utf-8")

    assert "function upsertGitHubRuleInState(rule)" in source
    assert "function removeGitHubRuleFromState(triggerRuleId)" in source
    assert "async function refreshGitHubRepoSubscriptionsInState()" in source
    assert "upsertGitHubRuleInState(created);" in source
    assert "upsertGitHubRuleInState(updated);" in source
    assert "removeGitHubRuleFromState(rule.trigger_rule_id);" in source
    assert source.count("await refreshGitHubRepoSubscriptionsInState();") >= 4
    assert "renderAutomationHomeView();" in source


def test_project_view_preserves_disabled_one_shot_automation_on_edit(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openAutomationProjectView,
} from "./projectView.mjs";
import { flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openAutomationProjectView({ automation_project_id: "aut_1", workspace_id: "alpha-project" });
await flushTasks();
await flushTasks();

document.querySelector("[data-automation-edit]")?.onclick?.();
await flushTasks();
await flushTasks();

document.getElementById("automation-editor-prompt-input").value = "Run once and stay disabled.";
document.querySelector("[data-automation-editor-save]")?.onclick?.();
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    updatePayload: globalThis.__updatedAutomationPayload,
}));
""".strip(),
        mock_api_source="""
export async function disableAutomationProject() {
    return { status: "disabled" };
}

export async function enableAutomationProject() {
    return { status: "enabled" };
}

export async function createAutomationProject() {
    return { automation_project_id: "aut_new" };
}

export async function deleteAutomationProject() {
    return { status: "ok" };
}

export async function fetchAutomationProject() {
    return {
        automation_project_id: "aut_1",
        name: "one-shot-briefing",
        display_name: "One-shot Briefing",
        status: "disabled",
        workspace_id: "alpha-project",
        prompt: "Run once and stay disabled.",
        schedule_mode: "one_shot",
        cron_expression: null,
        run_at: "2026-03-14T09:30:00.000Z",
        timezone: "Asia/Shanghai",
        delivery_events: [],
        run_config: {
            session_mode: "normal",
            normal_root_role_id: "Writer",
            orchestration_preset_id: null,
            execution_mode: "ai",
            yolo: true,
            thinking: { enabled: false, effort: null },
        },
    };
}

export async function fetchAutomationFeishuBindings() {
    return [];
}

export async function fetchAutomationProjectSessions() {
    return [];
}

export async function fetchAutomationProjects() {
    return [{ automation_project_id: "aut_1", display_name: "One-shot Briefing", name: "one-shot-briefing", status: "disabled", workspace_id: "alpha-project" }];
}

export async function fetchWorkspaces() {
    return [{ workspace_id: "alpha-project", root_path: "/work/alpha-project" }];
}

export async function fetchWorkspaceSnapshot() {
    throw new Error("not used");
}

export async function fetchWorkspaceTree() {
    throw new Error("not used");
}

export async function fetchWorkspaceDiffs() {
    throw new Error("not used");
}

export async function fetchWorkspaceDiffFile() {
    throw new Error("not used");
}

export async function runAutomationProject() {
    return { status: "ok" };
}

export async function fetchConfigStatus() {
    return { skills: { skills: [] } };
}

export async function fetchOrchestrationConfig() {
    return { presets: [] };
}

export async function fetchRoleConfigOptions() {
    return { normal_mode_roles: [{ role_id: "Writer", name: "Writer" }] };
}

export async function fetchTriggers() {
    return [];
}

export async function fetchWeChatGatewayAccounts() {
    return [];
}

export async function reloadSkillsConfig() {
    return { status: "ok" };
}

export async function createTrigger() {
    return { status: "ok" };
}

export async function updateTrigger() {
    return { status: "ok" };
}

export async function deleteTrigger() {
    return { status: "ok" };
}

export async function enableTrigger() {
    return { status: "ok" };
}

export async function disableTrigger() {
    return { status: "ok" };
}

export async function startWeChatGatewayLogin() {
    return { session_key: "wechat-login-1", qr_code_url: "https://example.test/qr.png" };
}

export async function waitWeChatGatewayLogin() {
    return { connected: true };
}

export async function updateWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function enableWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function disableWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function deleteWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function updateAutomationProject(_automationProjectId, payload) {
    globalThis.__updatedAutomationPayload = payload;
    return { status: "ok" };
}
""".strip(),
    )

    update_payload = cast(dict[str, object], payload["updatePayload"])
    assert update_payload["enabled"] is False
    assert update_payload["schedule_mode"] == "one_shot"
    assert update_payload["cron_expression"] is None
    assert update_payload["run_at"] == "2026-03-14T09:30:00.000Z"
    run_config = cast(dict[str, object], update_payload["run_config"])
    assert run_config["session_mode"] == "normal"
    assert run_config["normal_root_role_id"] == "Writer"


def test_project_view_keeps_automation_view_for_reused_bound_session_run(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openAutomationProjectView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openAutomationProjectView({ automation_project_id: "aut_1", workspace_id: "alpha-project" });
await flushTasks();
await flushTasks();

const runButton = document.querySelector("[data-automation-run]");
runButton?.onclick?.();
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    dispatchedEvents: globalThis.__dispatchedEvents,
    logs: globalThis.__logs,
    projectViewSummary: els.projectViewSummary.textContent,
}));
""".strip(),
        mock_api_source="""
export async function disableAutomationProject() {
    return { status: "disabled" };
}

export async function enableAutomationProject() {
    return { status: "enabled" };
}

export async function createAutomationProject() {
    return { automation_project_id: "aut_new" };
}

export async function deleteAutomationProject() {
    return { status: "ok" };
}

export async function fetchAutomationProject() {
    return {
        automation_project_id: "aut_1",
        name: "daily-briefing",
        display_name: "Daily Briefing",
        status: "enabled",
        workspace_id: "alpha-project",
        prompt: "Summarize the latest project changes.",
        schedule_mode: "cron",
        cron_expression: "0 9 * * *",
        timezone: "UTC",
        last_session_id: "session-im-1",
        next_run_at: "2026-03-14T09:00:00Z",
    };
}

export async function fetchAutomationFeishuBindings() {
    return [];
}

export async function fetchAutomationProjectSessions() {
    return [
        {
            session_id: "session-im-1",
            workspace_id: "alpha-project",
            project_kind: "workspace",
            project_id: "alpha-project",
            metadata: { title: "feishu_main - Release Updates" },
            updated_at: "2026-03-14T10:00:00Z",
        },
    ];
}

export async function fetchAutomationProjects() {
    return [{ automation_project_id: "aut_1", display_name: "Daily Briefing", name: "daily-briefing", status: "enabled", workspace_id: "alpha-project" }];
}

export async function fetchWorkspaces() {
    return [{ workspace_id: "alpha-project", root_path: "/work/alpha-project" }];
}

export async function fetchWorkspaceSnapshot() {
    throw new Error("not used");
}

export async function fetchWorkspaceTree() {
    throw new Error("not used");
}

export async function fetchWorkspaceDiffs() {
    throw new Error("not used");
}

export async function fetchWorkspaceDiffFile() {
    throw new Error("not used");
}

export async function runAutomationProject() {
    return {
        automation_project_id: "aut_1",
        session_id: "session-im-1",
        run_id: "run-1",
        queued: false,
        reused_bound_session: true,
    };
}

export async function fetchConfigStatus() {
    return { skills: { skills: [] } };
}

export async function fetchOrchestrationConfig() {
    return { presets: [] };
}

export async function fetchRoleConfigOptions() {
    return { normal_mode_roles: [] };
}

export async function fetchTriggers() {
    return [];
}

export async function fetchWeChatGatewayAccounts() {
    return [];
}

export async function reloadSkillsConfig() {
    return { status: "ok" };
}

export async function createTrigger() {
    return { status: "ok" };
}

export async function updateTrigger() {
    return { status: "ok" };
}

export async function deleteTrigger() {
    return { status: "ok" };
}

export async function enableTrigger() {
    return { status: "ok" };
}

export async function disableTrigger() {
    return { status: "ok" };
}

export async function startWeChatGatewayLogin() {
    return { session_key: "wechat-login-1", qr_code_url: "https://example.test/qr.png" };
}

export async function waitWeChatGatewayLogin() {
    return { connected: true };
}

export async function updateWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function createXiaolubanGatewayAccount(payload) {
    globalThis.__createdXiaolubanAccountPayload = payload;
    return { account_id: "xlb_new", display_name: payload?.display_name || "Xiaoluban", derived_uid: "uid_self" };
}

export async function updateXiaolubanGatewayAccount(accountId, payload) {
    globalThis.__updatedXiaolubanAccountPayload = { accountId, payload };
    return { account_id: accountId, display_name: payload?.display_name || "Xiaoluban", derived_uid: "uid_self" };
}

export async function enableWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function enableXiaolubanGatewayAccount(accountId) {
    globalThis.__enabledXiaolubanAccountId = accountId;
    return { account_id: accountId, status: "enabled" };
}

export async function disableWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function disableXiaolubanGatewayAccount(accountId) {
    globalThis.__disabledXiaolubanAccountId = accountId;
    return { account_id: accountId, status: "disabled" };
}

export async function deleteWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function deleteXiaolubanGatewayAccount(accountId) {
    globalThis.__deletedXiaolubanAccountId = accountId;
    return { status: "ok" };
}

export async function updateAutomationProject() {
    return { status: "ok" };
}
""".strip(),
    )

    dispatched_events = cast(list[dict[str, object]], payload["dispatchedEvents"])
    assert {
        "type": "agent-teams-feature-view-changed",
        "detail": {"featureId": "automation"},
    } in dispatched_events
    business_events = [
        event
        for event in dispatched_events
        if event.get("type") != "agent-teams-feature-view-changed"
    ]
    assert business_events == [
        {
            "type": "agent-teams-session-upserted",
            "detail": {
                "sessionId": "session-im-1",
                "workspaceId": "alpha-project",
                "session": {
                    "session_id": "session-im-1",
                    "workspace_id": "alpha-project",
                    "project_kind": "automation",
                    "project_id": "aut_1",
                    "metadata": {"title": "Daily Briefing"},
                },
            },
        },
        {"type": "agent-teams-projects-changed", "detail": None},
    ]
    assert payload["logs"] == [
        "Started automation run in bound IM session: session-im-1"
    ]
    assert "1 " in str(payload["projectViewSummary"])


def test_project_view_keeps_feature_page_visible_after_manual_automation_run(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openAutomationHomeView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openAutomationHomeView("aut_1");
await flushTasks();
await flushTasks();

const runButton = document.querySelector("[data-automation-run]");
runButton?.onclick?.();
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    dispatchedEvents: globalThis.__dispatchedEvents,
    logs: globalThis.__logs,
    projectViewTitle: els.projectViewTitle.textContent,
    contentHtml: els.projectViewContent.innerHTML,
}));
""".strip(),
        mock_api_source="""
let projectSessions = [
    {
        session_id: "session-old-1",
        workspace_id: "alpha-project",
        project_kind: "workspace",
        project_id: "alpha-project",
        metadata: { title: "Old run" },
        updated_at: "2026-03-14T09:00:00Z",
    },
];

export async function disableAutomationProject() {
    return { status: "disabled" };
}

export async function enableAutomationProject() {
    return { status: "enabled" };
}

export async function createAutomationProject() {
    return { automation_project_id: "aut_new" };
}

export async function deleteAutomationProject() {
    return { status: "ok" };
}

export async function fetchAutomationProject() {
    return {
        automation_project_id: "aut_1",
        name: "daily-briefing",
        display_name: "Daily Briefing",
        status: "enabled",
        workspace_id: "alpha-project",
        prompt: "Summarize the latest project changes.",
        schedule_mode: "cron",
        cron_expression: "0 9 * * *",
        timezone: "UTC",
        next_run_at: "2026-03-14T09:00:00Z",
    };
}

export async function fetchAutomationFeishuBindings() {
    return [];
}

export async function fetchAutomationProjectSessions() {
    return projectSessions;
}

export async function fetchAutomationProjects() {
    return [{ automation_project_id: "aut_1", display_name: "Daily Briefing", name: "daily-briefing", status: "enabled", workspace_id: "alpha-project" }];
}

export async function fetchWorkspaces() {
    return [{ workspace_id: "alpha-project", root_path: "/work/alpha-project" }];
}

export async function fetchWorkspaceSnapshot() {
    throw new Error("not used");
}

export async function fetchWorkspaceTree() {
    throw new Error("not used");
}

export async function fetchWorkspaceDiffs() {
    throw new Error("not used");
}

export async function fetchWorkspaceDiffFile() {
    throw new Error("not used");
}

export async function runAutomationProject() {
    projectSessions = [
        {
            session_id: "session-new-1",
            workspace_id: "alpha-project",
            project_kind: "workspace",
            project_id: "alpha-project",
            metadata: { title: "Manual Run" },
            updated_at: "2026-03-14T10:00:00Z",
        },
        ...projectSessions,
    ];
    return {
        automation_project_id: "aut_1",
        session_id: "session-new-1",
        run_id: "run-2",
        queued: false,
        reused_bound_session: false,
    };
}

export async function fetchConfigStatus() {
    return { skills: { skills: [] } };
}

export async function fetchOrchestrationConfig() {
    return { presets: [] };
}

export async function fetchRoleConfigOptions() {
    return { normal_mode_roles: [] };
}

export async function fetchTriggers() {
    return [];
}

export async function fetchWeChatGatewayAccounts() {
    return [];
}

export async function reloadSkillsConfig() {
    return { status: "ok" };
}

export async function createTrigger() {
    return { status: "ok" };
}

export async function updateTrigger() {
    return { status: "ok" };
}

export async function deleteTrigger() {
    return { status: "ok" };
}

export async function enableTrigger() {
    return { status: "ok" };
}

export async function disableTrigger() {
    return { status: "ok" };
}

export async function startWeChatGatewayLogin() {
    return { session_key: "wechat-login-1", qr_code_url: "https://example.test/qr.png" };
}

export async function waitWeChatGatewayLogin() {
    return { connected: true };
}

export async function updateWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function enableWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function disableWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function deleteWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function updateAutomationProject() {
    return { status: "ok" };
}
""".strip(),
    )

    dispatched_events = cast(list[dict[str, object]], payload["dispatchedEvents"])
    logs = cast(list[object], payload["logs"])
    dispatched_event_types = [str(entry["type"]) for entry in dispatched_events]

    assert "agent-teams-projects-changed" in dispatched_event_types
    assert "agent-teams-session-upserted" in dispatched_event_types
    assert "agent-teams-select-session" not in dispatched_event_types
    assert payload["projectViewTitle"] == "Automation"
    assert "Manual Run" in str(payload["contentHtml"])
    assert "Started automation run: session-new-1" in [str(item) for item in logs]


def test_project_view_renders_automation_details_without_helper_copy_and_prompt_card(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openAutomationHomeView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openAutomationHomeView("aut_1");
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    contentHtml: els.projectViewContent.innerHTML,
}));
""".strip(),
        mock_api_source="""
export async function disableAutomationProject() {
    return { status: "disabled" };
}

export async function enableAutomationProject() {
    return { status: "enabled" };
}

export async function createAutomationProject() {
    return { automation_project_id: "aut_new" };
}

export async function deleteAutomationProject() {
    return { status: "ok" };
}

export async function fetchAutomationProject() {
    return {
        automation_project_id: "aut_1",
        name: "daily-briefing",
        display_name: "Daily Briefing",
        status: "enabled",
        workspace_id: "alpha-project",
        prompt: "Line one.\\nLine two.",
        schedule_mode: "cron",
        cron_expression: "0 9 * * *",
        timezone: "Asia/Shanghai",
        next_run_at: "2026-05-07T08:30:00+08:00",
        last_run_started_at: "",
        delivery_events: [],
    };
}

export async function fetchAutomationFeishuBindings() {
    return [];
}

export async function fetchAutomationProjectSessions() {
    return [
        {
            session_id: "session-failed-1",
            metadata: { title: "Failed scheduled run" },
            active_run_status: "",
            latest_terminal_run_status: "failed",
            updated_at: "2026-05-06T23:58:00Z",
        },
        {
            session_id: "session-queued-1",
            metadata: { title: "Queued scheduled run" },
            active_run_status: "queued",
            latest_terminal_run_status: "",
            updated_at: "2026-05-06T23:57:00Z",
        },
        {
            session_id: "session-paused-1",
            metadata: { title: "Paused scheduled run" },
            active_run_status: "paused",
            latest_terminal_run_status: "",
            updated_at: "2026-05-06T23:56:00Z",
        },
        {
            session_id: "session-stopping-1",
            metadata: { title: "Stopping scheduled run" },
            active_run_status: "stopping",
            latest_terminal_run_status: "",
            updated_at: "2026-05-06T23:55:00Z",
        },
    ];
}

export async function fetchAutomationProjects() {
    return [{ automation_project_id: "aut_1", display_name: "Daily Briefing", name: "daily-briefing", status: "enabled", workspace_id: "alpha-project" }];
}

export async function fetchWorkspaces() {
    return [{ workspace_id: "alpha-project", root_path: "/work/alpha-project" }];
}

export async function fetchWorkspaceSnapshot() {
    throw new Error("not used");
}

export async function fetchWorkspaceTree() {
    throw new Error("not used");
}

export async function fetchWorkspaceDiffs() {
    throw new Error("not used");
}

export async function fetchWorkspaceDiffFile() {
    throw new Error("not used");
}

export async function runAutomationProject() {
    throw new Error("not used");
}

export async function fetchConfigStatus() {
    return { skills: { skills: [] } };
}

export async function fetchOrchestrationConfig() {
    return { presets: [] };
}

export async function fetchRoleConfigOptions() {
    return { normal_mode_roles: [] };
}

export async function fetchTriggers() {
    return [];
}

export async function fetchWeChatGatewayAccounts() {
    return [];
}

export async function reloadSkillsConfig() {
    return { status: "ok" };
}

export async function createTrigger() {
    return { status: "ok" };
}

export async function updateTrigger() {
    return { status: "ok" };
}

export async function deleteTrigger() {
    return { status: "ok" };
}

export async function enableTrigger() {
    return { status: "ok" };
}

export async function disableTrigger() {
    return { status: "ok" };
}

export async function startWeChatGatewayLogin() {
    return { session_key: "wechat-login-1", qr_code_url: "https://example.test/qr.png" };
}

export async function waitWeChatGatewayLogin() {
    return { connected: true };
}

export async function updateWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function enableWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function disableWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function deleteWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function updateAutomationProject() {
    return { status: "ok" };
}
""".strip(),
    )

    content_html = str(payload["contentHtml"])
    assert "Review schedule and recent runs." not in content_html
    assert "Automation notifications are currently disabled." not in content_html
    assert (
        "Automation updates will be pushed to the selected Feishu chat."
        not in content_html
    )
    assert "automation-prompt-card" not in content_html
    assert "automation-prompt-inline" in content_html
    assert "2026-05-07 00:30 UTC" in content_html
    assert "Never" in content_html
    assert "feature-card automation-runs-card" not in content_html
    assert "automation-history-section" in content_html
    assert "Failed scheduled run" in content_html
    assert "Failed" in content_html
    assert "is-failed" in content_html
    assert "Queued scheduled run" in content_html
    assert "Queued" in content_html
    assert "is-queued" in content_html
    assert "Paused scheduled run" in content_html
    assert "Paused" in content_html
    assert "is-paused" in content_html
    assert "Stopping scheduled run" in content_html
    assert "Stopping" in content_html
    assert "is-stopping" in content_html


def test_project_view_formats_automation_project_detail_times_as_utc() -> None:
    source = Path("frontend/dist/js/components/projectView.js").read_text(
        encoding="utf-8"
    )

    assert "function formatAutomationUtcDateTime" in source
    assert (
        "const nextRunAt = formatAutomationUtcDateTime(project?.next_run_at" in source
    )
    assert (
        "const lastRunAt = formatAutomationUtcDateTime(project?.last_run_started_at"
        in source
    )


def test_project_view_keeps_automation_detail_visible_when_session_config_helpers_fail(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openAutomationHomeView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openAutomationHomeView("aut_1");
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    contentHtml: els.projectViewContent.innerHTML,
}));
""".strip(),
        mock_api_source="""
export async function disableAutomationProject() {
    return { status: "disabled" };
}

export async function enableAutomationProject() {
    return { status: "enabled" };
}

export async function createAutomationProject() {
    return { automation_project_id: "aut_new" };
}

export async function deleteAutomationProject() {
    return { status: "ok" };
}

export async function fetchAutomationProject() {
    return {
        automation_project_id: "aut_1",
        name: "daily-briefing",
        display_name: "Daily Briefing",
        status: "enabled",
        workspace_id: "alpha-project",
        prompt: "Line one.\\nLine two.",
        schedule_mode: "cron",
        cron_expression: "0 9 * * *",
        timezone: "Asia/Shanghai",
        next_run_at: "2026-03-14T09:00:00Z",
        run_config: {
            session_mode: "orchestration",
            normal_root_role_id: null,
            orchestration_preset_id: "preset-missing-name",
        },
    };
}

export async function fetchAutomationFeishuBindings() {
    return [];
}

export async function fetchAutomationProjectSessions() {
    return [];
}

export async function fetchAutomationProjects() {
    return [{ automation_project_id: "aut_1", display_name: "Daily Briefing", name: "daily-briefing", status: "enabled", workspace_id: "alpha-project" }];
}

export async function fetchWorkspaces() {
    return [{ workspace_id: "alpha-project", root_path: "/work/alpha-project" }];
}

export async function fetchWorkspaceSnapshot() {
    throw new Error("not used");
}

export async function fetchWorkspaceTree() {
    throw new Error("not used");
}

export async function fetchWorkspaceDiffs() {
    throw new Error("not used");
}

export async function fetchWorkspaceDiffFile() {
    throw new Error("not used");
}

export async function runAutomationProject() {
    throw new Error("not used");
}

export async function fetchConfigStatus() {
    return { skills: { skills: [] } };
}

export async function fetchOrchestrationConfig() {
    throw new Error("orchestration fetch failed");
}

export async function fetchRoleConfigOptions() {
    throw new Error("role fetch failed");
}

export async function fetchTriggers() {
    return [];
}

export async function fetchWeChatGatewayAccounts() {
    return [];
}

export async function reloadSkillsConfig() {
    return { status: "ok" };
}

export async function createTrigger() {
    return { status: "ok" };
}

export async function updateTrigger() {
    return { status: "ok" };
}

export async function deleteTrigger() {
    return { status: "ok" };
}

export async function enableTrigger() {
    return { status: "ok" };
}

export async function disableTrigger() {
    return { status: "ok" };
}

export async function startWeChatGatewayLogin() {
    return { session_key: "wechat-login-1", qr_code_url: "https://example.test/qr.png" };
}

export async function waitWeChatGatewayLogin() {
    return { connected: true };
}

export async function updateWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function enableWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function disableWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function deleteWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function updateAutomationProject() {
    return { status: "ok" };
}
""".strip(),
    )

    content_html = str(payload["contentHtml"])
    assert "Daily Briefing" in content_html
    assert "preset-missing-name" in content_html
    assert "workspace-empty-state" not in content_html


def test_project_view_automation_home_sidebar_uses_flat_list_without_duplicate_title(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openAutomationHomeView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openAutomationHomeView("aut_1");
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    contentHtml: els.projectViewContent.innerHTML,
}));
""".strip(),
        mock_api_source="""
export async function disableAutomationProject() {
    return { status: "disabled" };
}

export async function enableAutomationProject() {
    return { status: "enabled" };
}

export async function createAutomationProject() {
    return { automation_project_id: "aut_new" };
}

export async function deleteAutomationProject() {
    return { status: "ok" };
}

export async function fetchAutomationProject() {
    return {
        automation_project_id: "aut_1",
        name: "daily-briefing",
        display_name: "Daily Briefing",
        status: "enabled",
        workspace_id: "alpha-project",
        prompt: "Line one.\\nLine two.",
        schedule_mode: "cron",
        cron_expression: "0 9 * * *",
        timezone: "Asia/Shanghai",
        next_run_at: "2026-03-14T09:00:00Z",
        last_run_started_at: "2026-03-14T08:00:00Z",
        delivery_events: [],
    };
}

export async function fetchAutomationFeishuBindings() {
    return [];
}

export async function fetchAutomationProjectSessions() {
    return [];
}

export async function fetchAutomationProjects() {
    return [
        { automation_project_id: "aut_1", display_name: "Daily Briefing", name: "daily-briefing", status: "enabled", workspace_id: "alpha-project", cron_expression: "0 9 * * *" },
        { automation_project_id: "aut_2", display_name: "Nightly Sync", name: "nightly-sync", status: "disabled", workspace_id: "alpha-project", cron_expression: "0 21 * * *" },
    ];
}

export async function fetchWorkspaces() {
    return [{ workspace_id: "alpha-project", root_path: "/work/alpha-project" }];
}

export async function fetchWorkspaceSnapshot() {
    throw new Error("not used");
}

export async function fetchWorkspaceTree() {
    throw new Error("not used");
}

export async function fetchWorkspaceDiffs() {
    throw new Error("not used");
}

export async function fetchWorkspaceDiffFile() {
    throw new Error("not used");
}

export async function runAutomationProject() {
    throw new Error("not used");
}

export async function fetchConfigStatus() {
    return { skills: { skills: [] } };
}

export async function fetchOrchestrationConfig() {
    return { presets: [] };
}

export async function fetchRoleConfigOptions() {
    return { normal_mode_roles: [] };
}

export async function fetchTriggers() {
    return [];
}

export async function fetchWeChatGatewayAccounts() {
    return [];
}

export async function reloadSkillsConfig() {
    return { status: "ok" };
}

export async function createTrigger() {
    return { status: "ok" };
}

export async function updateTrigger() {
    return { status: "ok" };
}

export async function deleteTrigger() {
    return { status: "ok" };
}

export async function enableTrigger() {
    return { status: "ok" };
}

export async function disableTrigger() {
    return { status: "ok" };
}

export async function startWeChatGatewayLogin() {
    return { session_key: "wechat-login-1", qr_code_url: "https://example.test/qr.png" };
}

export async function waitWeChatGatewayLogin() {
    return { connected: true };
}

export async function updateWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function enableWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function disableWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function deleteWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function updateAutomationProject() {
    return { status: "ok" };
}
""".strip(),
    )

    content_html = str(payload["contentHtml"])
    assert "workspace-view-panel-header" not in content_html
    assert content_html.count("data-automation-list-back") == 1
    assert content_html.count("data-automation-home-project-id") == 0

    components_css = load_components_css()

    assert ".automation-directory {" in components_css
    assert ".automation-document-layout {" in components_css
    assert ".automation-breadcrumb button {" in components_css
    assert (
        "border-bottom: 1px solid color-mix(in srgb, var(--primary)" in components_css
    )
    assert ".automation-record {" in components_css
    assert "border-radius: 8px;" in components_css
    assert "border-bottom: 1px solid" in components_css


def test_project_view_automation_home_groups_schedule_list_by_status(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openAutomationHomeView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openAutomationHomeView();
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    contentHtml: els.projectViewContent.innerHTML,
    toolbarHtml: els.projectViewToolbarActions.innerHTML,
}));
""".strip(),
        mock_api_source="""
export async function fetchAutomationProjects() {
    return [
        {
            automation_project_id: "aut_running",
            display_name: "Running Report",
            name: "running-report",
            status: "enabled",
            active_run_status: "running",
            workspace_id: "alpha-project",
            schedule_mode: "cron",
            cron_expression: "0 9 * * *",
        },
        {
            automation_project_id: "aut_active",
            display_name: "Daily Briefing",
            name: "daily-briefing",
            status: "enabled",
            workspace_id: "alpha-project",
            schedule_mode: "cron",
            cron_expression: "0 10 * * *",
        },
        {
            automation_project_id: "aut_paused",
            display_name: "Nightly Sync",
            name: "nightly-sync",
            status: "disabled",
            workspace_id: "alpha-project",
            schedule_mode: "cron",
            cron_expression: "0 21 * * *",
        },
    ];
}
""".strip(),
    )

    content_html = str(payload["contentHtml"])
    toolbar_html = str(payload["toolbarHtml"])
    assert "Running" in content_html
    assert "Paused" in content_html
    assert "Current" in content_html
    assert "New Automation" in content_html
    assert "data-feature-automation-create" in content_html
    assert "data-feature-automation-create" not in toolbar_html
    assert content_html.count("automation-status-column") >= 3
    assert content_html.count("data-automation-home-project-id") == 3
    assert content_html.count("data-automation-list-run") == 3
    assert content_html.count("data-automation-list-edit") == 3
    assert content_html.count("data-automation-list-more") == 3


def test_project_view_automation_list_detail_load_error_renders_feature_error(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openAutomationHomeView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openAutomationHomeView();
await flushTasks();
await flushTasks();

const rowButton = document.querySelector("[data-automation-home-project-id]");
await rowButton?.onclick?.();
await flushTasks();
await flushTasks();
await new Promise(resolve => setTimeout(resolve, 10));
await flushTasks();

console.log(JSON.stringify({
    buttonFound: Boolean(rowButton),
    summary: els.projectViewSummary.textContent,
    contentHtml: els.projectViewContent.innerHTML,
    logs: globalThis.__logs,
}));
""".strip(),
        mock_api_source="""
export async function fetchAutomationProjects() {
    return [
        {
            automation_project_id: "aut_1",
            display_name: "Daily Briefing",
            name: "daily-briefing",
            status: "enabled",
            workspace_id: "alpha-project",
            schedule_mode: "cron",
            cron_expression: "0 9 * * *",
        },
    ];
}

export async function fetchAutomationProject() {
    throw new Error("detail request failed");
}
""".strip(),
    )

    assert payload["buttonFound"] is True
    assert payload["summary"] == "Load failed"
    assert "detail request failed" in str(payload["contentHtml"])
    assert any(
        "Failed to load automation detail: detail request failed" in str(item)
        for item in cast(list[object], payload["logs"])
    )


def test_project_view_automation_list_edit_detail_load_error_renders_feature_error(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openAutomationHomeView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openAutomationHomeView();
await flushTasks();
await flushTasks();

const editButton = document.querySelector("[data-automation-list-edit]");
editButton?.onclick?.({ stopPropagation() {} });
await flushTasks();
await flushTasks();
await new Promise(resolve => setTimeout(resolve, 10));
await flushTasks();

console.log(JSON.stringify({
    buttonFound: Boolean(editButton),
    summary: els.projectViewSummary.textContent,
    contentHtml: els.projectViewContent.innerHTML,
    logs: globalThis.__logs,
}));
""".strip(),
        mock_api_source="""
export async function fetchAutomationProjects() {
    return [
        {
            automation_project_id: "aut_1",
            display_name: "Daily Briefing",
            name: "daily-briefing",
            status: "enabled",
            workspace_id: "alpha-project",
            schedule_mode: "cron",
            cron_expression: "0 9 * * *",
        },
    ];
}

export async function fetchAutomationProject() {
    throw new Error("edit detail request failed");
}
""".strip(),
    )

    assert payload["buttonFound"] is True
    assert payload["summary"] == "Load failed"
    assert "edit detail request failed" in str(payload["contentHtml"])
    assert any(
        "Failed to load automation detail: edit detail request failed" in str(item)
        for item in cast(list[object], payload["logs"])
    )


def test_project_view_automation_list_run_error_shows_toast(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openAutomationHomeView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openAutomationHomeView();
await flushTasks();
await flushTasks();

const runButton = document.querySelector("[data-automation-list-run]");
runButton?.onclick?.({ stopPropagation() {} });
await flushTasks();
await flushTasks();
await new Promise(resolve => setTimeout(resolve, 10));
await flushTasks();

console.log(JSON.stringify({
    buttonFound: Boolean(runButton),
    contentHtml: els.projectViewContent.innerHTML,
    toastCalls: globalThis.__toastCalls || [],
    logs: globalThis.__logs,
}));
""".strip(),
        mock_api_source="""
export async function fetchAutomationProjects() {
    return [
        {
            automation_project_id: "aut_1",
            display_name: "Daily Briefing",
            name: "daily-briefing",
            status: "enabled",
            workspace_id: "alpha-project",
            schedule_mode: "cron",
            cron_expression: "0 9 * * *",
        },
    ];
}

export async function runAutomationProject() {
    throw new Error("manual run failed");
}
""".strip(),
    )

    assert payload["buttonFound"] is True
    assert "Daily Briefing" in str(payload["contentHtml"])
    toast_calls = cast(list[dict[str, object]], payload["toastCalls"])
    assert toast_calls == [
        {
            "title": "Run now",
            "message": "manual run failed",
            "tone": "danger",
        }
    ]
    assert any(
        "Run now: manual run failed" in str(item)
        for item in cast(list[object], payload["logs"])
    )


def test_project_view_automation_edit_save_refresh_error_renders_feature_error(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openAutomationHomeView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openAutomationHomeView("aut_1");
await flushTasks();
await flushTasks();

const editButton = els.projectViewContent.querySelector("[data-automation-edit]");
editButton?.onclick?.();
await flushTasks();
await flushTasks();
await new Promise(resolve => setTimeout(resolve, 10));
await flushTasks();

const promptInput = els.projectViewContent.getElementById("automation-editor-prompt-input");
if (promptInput) {
    promptInput.value = "Updated prompt.";
}
els.projectViewContent.querySelector("[data-automation-editor-save]")?.onclick?.();
await flushTasks();
await flushTasks();
await new Promise(resolve => setTimeout(resolve, 10));
await flushTasks();

console.log(JSON.stringify({
    editButtonFound: Boolean(editButton),
    promptInputFound: Boolean(promptInput),
    summary: els.projectViewSummary.textContent,
    contentHtml: els.projectViewContent.innerHTML,
    updatePayload: globalThis.__updatedAutomationPayload || null,
    logs: globalThis.__logs,
}));
""".strip(),
        mock_api_source="""
globalThis.__failAutomationListRefresh = false;

export async function fetchAutomationProjects() {
    if (globalThis.__failAutomationListRefresh === true) {
        throw new Error("post-save list refresh failed");
    }
    return [
        {
            automation_project_id: "aut_1",
            display_name: "Daily Briefing",
            name: "daily-briefing",
            status: "enabled",
            workspace_id: "alpha-project",
            schedule_mode: "cron",
            cron_expression: "0 9 * * *",
        },
    ];
}

export async function fetchAutomationProject() {
    return {
        automation_project_id: "aut_1",
        display_name: "Daily Briefing",
        name: "daily-briefing",
        status: "enabled",
        workspace_id: "alpha-project",
        prompt: "Original prompt.",
        schedule_mode: "cron",
        cron_expression: "0 9 * * *",
    };
}

export async function fetchWorkspaces() {
    return [{ workspace_id: "alpha-project", name: "Alpha Project" }];
}

export async function updateAutomationProject(_automationProjectId, payload) {
    globalThis.__updatedAutomationPayload = payload;
    globalThis.__failAutomationListRefresh = true;
    return {
        automation_project_id: "aut_1",
        display_name: payload?.display_name || "Daily Briefing",
        name: "daily-briefing",
        status: "enabled",
        workspace_id: payload?.workspace_id || "alpha-project",
        prompt: payload?.prompt || "Updated prompt.",
        schedule_mode: "cron",
        cron_expression: "0 9 * * *",
    };
}
""".strip(),
    )

    assert payload["editButtonFound"] is True
    assert payload["promptInputFound"] is True
    assert payload["summary"] == "Load failed"
    assert "post-save list refresh failed" in str(payload["contentHtml"])
    assert "automation-editor-page" not in str(payload["contentHtml"])
    assert (
        cast(dict[str, object], payload["updatePayload"])["prompt"] == "Updated prompt."
    )
    assert any(
        "Failed to load automation detail: post-save list refresh failed" in str(item)
        for item in cast(list[object], payload["logs"])
    )


def test_project_view_automation_create_refresh_error_renders_feature_error(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openAutomationHomeView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openAutomationHomeView();
await flushTasks();
await flushTasks();

els.projectViewContent.querySelector("[data-feature-automation-create]")?.onclick?.();
await flushTasks();
await flushTasks();
await new Promise(resolve => setTimeout(resolve, 10));
await flushTasks();

const nameInput = els.projectViewContent.getElementById("automation-editor-display-name-input");
const workspaceInput = els.projectViewContent.getElementById("automation-editor-workspace-id-input");
const promptInput = els.projectViewContent.getElementById("automation-editor-prompt-input");
if (nameInput) {
    nameInput.value = "Created Briefing";
}
if (workspaceInput) {
    workspaceInput.value = "alpha-project";
}
if (promptInput) {
    promptInput.value = "Created prompt.";
}
els.projectViewContent.querySelector("[data-automation-editor-save]")?.onclick?.();
await flushTasks();
await flushTasks();
await new Promise(resolve => setTimeout(resolve, 10));
await flushTasks();

console.log(JSON.stringify({
    nameInputFound: Boolean(nameInput),
    promptInputFound: Boolean(promptInput),
    summary: els.projectViewSummary.textContent,
    contentHtml: els.projectViewContent.innerHTML,
    createPayload: globalThis.__createdAutomationPayload || null,
    logs: globalThis.__logs,
}));
""".strip(),
        mock_api_source="""
globalThis.__failAutomationListRefresh = false;

export async function fetchAutomationProjects() {
    if (globalThis.__failAutomationListRefresh === true) {
        throw new Error("post-create list refresh failed");
    }
    return [];
}

export async function fetchWorkspaces() {
    return [{ workspace_id: "alpha-project", name: "Alpha Project" }];
}

export async function createAutomationProject(payload) {
    globalThis.__createdAutomationPayload = payload;
    globalThis.__failAutomationListRefresh = true;
    return {
        automation_project_id: "aut_new",
        display_name: payload?.display_name || "Created Briefing",
        name: "created-briefing",
        status: "enabled",
        workspace_id: payload?.workspace_id || "alpha-project",
        prompt: payload?.prompt || "Created prompt.",
        schedule_mode: "cron",
        cron_expression: "0 9 * * *",
    };
}
""".strip(),
    )

    assert payload["nameInputFound"] is True
    assert payload["promptInputFound"] is True
    assert payload["summary"] == "Load failed"
    assert "post-create list refresh failed" in str(payload["contentHtml"])
    assert "automation-editor-page" not in str(payload["contentHtml"])
    create_payload = cast(dict[str, object], payload["createPayload"])
    assert create_payload["display_name"] == "Created Briefing"
    assert create_payload["prompt"] == "Created prompt."
    assert any(
        "Failed to load automation detail: post-create list refresh failed" in str(item)
        for item in cast(list[object], payload["logs"])
    )


def test_project_view_automation_delete_refresh_error_renders_feature_error(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openAutomationHomeView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openAutomationHomeView("aut_1");
await flushTasks();
await flushTasks();

document.querySelector("[data-automation-delete]")?.onclick?.();
await flushTasks();
await flushTasks();
await new Promise(resolve => setTimeout(resolve, 10));
await flushTasks();

console.log(JSON.stringify({
    summary: els.projectViewSummary.textContent,
    contentHtml: els.projectViewContent.innerHTML,
    deletedAutomationId: globalThis.__deletedAutomationId || "",
    confirmCalls: globalThis.__showConfirmDialogCalls || [],
    logs: globalThis.__logs,
}));
""".strip(),
        mock_api_source="""
globalThis.__failAutomationListRefresh = false;

export async function fetchAutomationProjects() {
    if (globalThis.__failAutomationListRefresh === true) {
        throw new Error("post-delete list refresh failed");
    }
    return [
        {
            automation_project_id: "aut_1",
            display_name: "Daily Briefing",
            name: "daily-briefing",
            status: "enabled",
            workspace_id: "alpha-project",
            schedule_mode: "cron",
            cron_expression: "0 9 * * *",
        },
    ];
}

export async function fetchAutomationProject() {
    return {
        automation_project_id: "aut_1",
        display_name: "Daily Briefing",
        name: "daily-briefing",
        status: "enabled",
        workspace_id: "alpha-project",
        prompt: "Original prompt.",
        schedule_mode: "cron",
        cron_expression: "0 9 * * *",
    };
}

export async function deleteAutomationProject(automationProjectId) {
    globalThis.__deletedAutomationId = automationProjectId;
    globalThis.__failAutomationListRefresh = true;
    return { status: "ok" };
}
""".strip(),
    )

    assert payload["summary"] == "Load failed"
    assert "post-delete list refresh failed" in str(payload["contentHtml"])
    assert payload["deletedAutomationId"] == "aut_1"
    assert len(cast(list[object], payload["confirmCalls"])) == 1
    assert any(
        "Failed to load automation detail: post-delete list refresh failed" in str(item)
        for item in cast(list[object], payload["logs"])
    )


def test_project_view_automation_detail_run_refresh_error_renders_feature_error(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openAutomationHomeView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openAutomationHomeView("aut_1");
await flushTasks();
await flushTasks();

document.querySelector("[data-automation-run]")?.onclick?.();
await flushTasks();
await flushTasks();
await new Promise(resolve => setTimeout(resolve, 10));
await flushTasks();

console.log(JSON.stringify({
    summary: els.projectViewSummary.textContent,
    contentHtml: els.projectViewContent.innerHTML,
    dispatchedEvents: globalThis.__dispatchedEvents,
    logs: globalThis.__logs,
}));
""".strip(),
        mock_api_source="""
globalThis.__failAutomationListRefresh = false;

export async function fetchAutomationProjects() {
    if (globalThis.__failAutomationListRefresh === true) {
        throw new Error("post-run list refresh failed");
    }
    return [
        {
            automation_project_id: "aut_1",
            display_name: "Daily Briefing",
            name: "daily-briefing",
            status: "enabled",
            workspace_id: "alpha-project",
            schedule_mode: "cron",
            cron_expression: "0 9 * * *",
        },
    ];
}

export async function fetchAutomationProject() {
    return {
        automation_project_id: "aut_1",
        display_name: "Daily Briefing",
        name: "daily-briefing",
        status: "enabled",
        workspace_id: "alpha-project",
        prompt: "Original prompt.",
        schedule_mode: "cron",
        cron_expression: "0 9 * * *",
    };
}

export async function runAutomationProject() {
    globalThis.__failAutomationListRefresh = true;
    return {
        status: "started",
        session_id: "session-new-1",
    };
}
""".strip(),
    )

    assert payload["summary"] == "Load failed"
    assert "post-run list refresh failed" in str(payload["contentHtml"])
    assert any(
        "session-new-1" in str(item) for item in cast(list[object], payload["logs"])
    )
    assert any(
        "Failed to load automation detail: post-run list refresh failed" in str(item)
        for item in cast(list[object], payload["logs"])
    )
    event_types = [
        str(item.get("type"))
        for item in cast(list[dict[str, object]], payload["dispatchedEvents"])
    ]
    assert "agent-teams-session-upserted" in event_types
    assert "agent-teams-projects-changed" in event_types


def test_project_view_automation_detail_toggle_refresh_error_renders_feature_error(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openAutomationHomeView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openAutomationHomeView("aut_1");
await flushTasks();
await flushTasks();

document.querySelector("[data-automation-toggle]")?.onclick?.();
await flushTasks();
await flushTasks();
await new Promise(resolve => setTimeout(resolve, 10));
await flushTasks();

console.log(JSON.stringify({
    summary: els.projectViewSummary.textContent,
    contentHtml: els.projectViewContent.innerHTML,
    disabledId: globalThis.__disabledAutomationId || "",
    logs: globalThis.__logs,
}));
""".strip(),
        mock_api_source="""
globalThis.__failAutomationListRefresh = false;

export async function fetchAutomationProjects() {
    if (globalThis.__failAutomationListRefresh === true) {
        throw new Error("post-toggle list refresh failed");
    }
    return [
        {
            automation_project_id: "aut_1",
            display_name: "Daily Briefing",
            name: "daily-briefing",
            status: "enabled",
            workspace_id: "alpha-project",
            schedule_mode: "cron",
            cron_expression: "0 9 * * *",
        },
    ];
}

export async function fetchAutomationProject() {
    return {
        automation_project_id: "aut_1",
        display_name: "Daily Briefing",
        name: "daily-briefing",
        status: "enabled",
        workspace_id: "alpha-project",
        prompt: "Original prompt.",
        schedule_mode: "cron",
        cron_expression: "0 9 * * *",
    };
}

export async function disableAutomationProject(projectId) {
    globalThis.__disabledAutomationId = projectId;
    globalThis.__failAutomationListRefresh = true;
    return { status: "disabled" };
}
""".strip(),
    )

    assert payload["summary"] == "Load failed"
    assert "post-toggle list refresh failed" in str(payload["contentHtml"])
    assert payload["disabledId"] == "aut_1"
    assert any(
        "Failed to load automation detail: post-toggle list refresh failed" in str(item)
        for item in cast(list[object], payload["logs"])
    )


def test_project_view_automation_list_detail_ignores_stale_responses(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openAutomationHomeView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openAutomationHomeView();
await flushTasks();
await flushTasks();

const rows = Array.from(els.projectViewContent.querySelectorAll("[data-automation-home-project-id]"));
rows[0]?.onclick?.();
rows[1]?.onclick?.();
await flushTasks();

globalThis.__resolveAutomationProject("aut_2");
await flushTasks();
await new Promise(resolve => setTimeout(resolve, 10));
await flushTasks();
const afterSecond = els.projectViewContent.innerHTML;

globalThis.__resolveAutomationProject("aut_1");
await flushTasks();
await new Promise(resolve => setTimeout(resolve, 10));
await flushTasks();

console.log(JSON.stringify({
    rowCount: rows.length,
    fetchCalls: globalThis.__fetchAutomationProjectCalls || [],
    afterSecond,
    afterLateFirst: els.projectViewContent.innerHTML,
}));
""".strip(),
        mock_api_source="""
export async function fetchAutomationProjects() {
    return [
        {
            automation_project_id: "aut_1",
            display_name: "First Task",
            name: "first-task",
            status: "enabled",
            workspace_id: "alpha-project",
            schedule_mode: "cron",
            cron_expression: "0 9 * * *",
        },
        {
            automation_project_id: "aut_2",
            display_name: "Second Task",
            name: "second-task",
            status: "enabled",
            workspace_id: "alpha-project",
            schedule_mode: "cron",
            cron_expression: "0 10 * * *",
        },
    ];
}

globalThis.__automationProjectResolvers = {};
globalThis.__resolveAutomationProject = projectId => {
    const resolver = globalThis.__automationProjectResolvers[projectId];
    if (resolver) {
        resolver();
    }
};

export async function fetchAutomationProject(projectId) {
    globalThis.__fetchAutomationProjectCalls = globalThis.__fetchAutomationProjectCalls || [];
    globalThis.__fetchAutomationProjectCalls.push(projectId);
    return await new Promise(resolve => {
        globalThis.__automationProjectResolvers[projectId] = () => {
            resolve({
                automation_project_id: projectId,
                display_name: projectId === "aut_1" ? "First Task" : "Second Task",
                name: projectId === "aut_1" ? "first-task" : "second-task",
                status: "enabled",
                workspace_id: "alpha-project",
                prompt: projectId === "aut_1" ? "First prompt should stay stale." : "Second prompt should remain visible.",
                schedule_mode: "cron",
                cron_expression: projectId === "aut_1" ? "0 9 * * *" : "0 10 * * *",
            });
        };
    });
}
""".strip(),
    )

    assert payload["rowCount"] == 2
    assert payload["fetchCalls"] == ["aut_1", "aut_2"]
    assert "Second prompt should remain visible." in str(payload["afterSecond"])
    assert "Second prompt should remain visible." in str(payload["afterLateFirst"])
    assert "First prompt should stay stale." not in str(payload["afterLateFirst"])


def test_project_view_automation_list_return_invalidates_pending_detail(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openAutomationHomeView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openAutomationHomeView();
await flushTasks();
await flushTasks();

const row = els.projectViewContent.querySelector("[data-automation-home-project-id]");
row?.onclick?.();
await flushTasks();

const scheduleButton = Array.from(
    els.projectViewToolbarActions.querySelectorAll("[data-automation-section]"),
).find(button => button.getAttribute("data-automation-section") === "schedules");
scheduleButton?.onclick?.();
await flushTasks();
const afterReturn = els.projectViewContent.innerHTML;

globalThis.__resolveAutomationProject("aut_1");
await flushTasks();
await new Promise(resolve => setTimeout(resolve, 10));
await flushTasks();

console.log(JSON.stringify({
    rowFound: Boolean(row),
    fetchCalls: globalThis.__fetchAutomationProjectCalls || [],
    afterReturn,
    afterLateDetail: els.projectViewContent.innerHTML,
}));
""".strip(),
        mock_api_source="""
export async function fetchAutomationProjects() {
    return [
        {
            automation_project_id: "aut_1",
            display_name: "First Task",
            name: "first-task",
            status: "enabled",
            workspace_id: "alpha-project",
            schedule_mode: "cron",
            cron_expression: "0 9 * * *",
        },
    ];
}

globalThis.__automationProjectResolvers = {};
globalThis.__resolveAutomationProject = projectId => {
    const resolver = globalThis.__automationProjectResolvers[projectId];
    if (resolver) {
        resolver();
    }
};

export async function fetchAutomationProject(projectId) {
    globalThis.__fetchAutomationProjectCalls = globalThis.__fetchAutomationProjectCalls || [];
    globalThis.__fetchAutomationProjectCalls.push(projectId);
    return await new Promise(resolve => {
        globalThis.__automationProjectResolvers[projectId] = () => {
            resolve({
                automation_project_id: projectId,
                display_name: "First Task",
                name: "first-task",
                status: "enabled",
                workspace_id: "alpha-project",
                prompt: "Late prompt should not reopen detail.",
                schedule_mode: "cron",
                cron_expression: "0 9 * * *",
            });
        };
    });
}
""".strip(),
    )

    assert payload["rowFound"] is True
    assert payload["fetchCalls"] == ["aut_1"]
    assert "First Task" in str(payload["afterReturn"])
    assert "Late prompt should not reopen detail." not in str(payload["afterReturn"])
    assert "First Task" in str(payload["afterLateDetail"])
    assert "Late prompt should not reopen detail." not in str(
        payload["afterLateDetail"]
    )


def test_project_view_automation_schedules_tab_refreshes_after_github(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openAutomationHomeView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

globalThis.__automationProjectsVersion = "old";

initializeProjectView();
await openAutomationHomeView();
await flushTasks();
await flushTasks();

const githubButton = Array.from(
    els.projectViewToolbarActions.querySelectorAll("[data-automation-section]"),
).find(button => button.getAttribute("data-automation-section") === "github");
githubButton?.onclick?.();
await flushTasks();
await flushTasks();

globalThis.__automationProjectsVersion = "new";
const scheduleButton = Array.from(
    els.projectViewToolbarActions.querySelectorAll("[data-automation-section]"),
).find(button => button.getAttribute("data-automation-section") === "schedules");
scheduleButton?.onclick?.();
await flushTasks();
await flushTasks();
await new Promise(resolve => setTimeout(resolve, 10));
await flushTasks();

console.log(JSON.stringify({
    fetchCalls: globalThis.__fetchAutomationProjectsCalls || 0,
    contentHtml: els.projectViewContent.innerHTML,
}));
""".strip(),
        mock_api_source="""
export async function fetchAutomationProjects() {
    globalThis.__fetchAutomationProjectsCalls = (globalThis.__fetchAutomationProjectsCalls || 0) + 1;
    const isNew = globalThis.__automationProjectsVersion === "new";
    return [
        {
            automation_project_id: isNew ? "aut_new" : "aut_old",
            display_name: isNew ? "Fresh Task" : "Cached Task",
            name: isNew ? "fresh-task" : "cached-task",
            status: "enabled",
            workspace_id: "alpha-project",
            schedule_mode: "cron",
            cron_expression: "0 9 * * *",
        },
    ];
}
""".strip(),
    )

    assert payload["fetchCalls"] == 2
    assert "Fresh Task" in str(payload["contentHtml"])
    assert "Cached Task" not in str(payload["contentHtml"])


def test_project_view_language_refresh_scopes_automation_page_editor(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openAutomationHomeView,
    openImFeatureView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openAutomationHomeView();
await flushTasks();
await flushTasks();

els.projectViewContent.querySelector("[data-feature-automation-create]")?.onclick?.();
await flushTasks();
await flushTasks();
await new Promise(resolve => setTimeout(resolve, 10));
await flushTasks();
const editorBeforeLanguage = els.projectViewContent.innerHTML;

document.dispatchEvent({ type: "agent-teams-language-changed" });
await flushTasks();
await flushTasks();
const editorAfterAutomationLanguage = els.projectViewContent.innerHTML;

await openImFeatureView();
await flushTasks();
await flushTasks();
const gatewayBeforeLanguage = els.projectViewContent.innerHTML;

document.dispatchEvent({ type: "agent-teams-language-changed" });
await flushTasks();
await flushTasks();
const gatewayAfterLanguage = els.projectViewContent.innerHTML;

console.log(JSON.stringify({
    editorBeforeLanguage,
    editorAfterAutomationLanguage,
    gatewayBeforeLanguage,
    gatewayAfterLanguage,
}));
""".strip(),
        mock_api_source="""
export async function fetchAutomationProjects() {
    return [];
}

export async function fetchWorkspaces() {
    return [{ workspace_id: "alpha-project", name: "Alpha Project" }];
}
""".strip(),
    )

    assert "automation-editor-page" in str(payload["editorBeforeLanguage"])
    assert "automation-editor-page" in str(payload["editorAfterAutomationLanguage"])
    assert "automation-editor-page" not in str(payload["gatewayBeforeLanguage"])
    assert "automation-editor-page" not in str(payload["gatewayAfterLanguage"])
    assert "automation-home-page" not in str(payload["gatewayBeforeLanguage"])
    assert "automation-home-page" not in str(payload["gatewayAfterLanguage"])
    assert "connectors-page" in str(payload["gatewayBeforeLanguage"])
    assert "connectors-page" in str(payload["gatewayAfterLanguage"])


def test_project_view_automation_header_keeps_action_row_out_of_prompt_flow() -> None:
    components_css = load_components_css()

    assert ".automation-document-layout {" in components_css
    assert (
        "grid-template-columns: minmax(0, 1fr) minmax(260px, 320px);" in components_css
    )
    assert ".automation-sidebar-actions {" in components_css
    assert "justify-content: flex-end;" in components_css


def test_project_view_automation_editor_actions_keep_buttons_single_line() -> None:
    components_css = load_components_css()

    assert (
        ".automation-editor-modal .automation-editor-modal-content {" in components_css
    )
    assert "width: min(84vw, 1160px) !important;" in components_css
    assert ".automation-editor-actions {" in components_css
    assert "flex-wrap: nowrap;" in components_css
    assert ".automation-editor-actions .secondary-btn," in components_css
    assert "white-space: nowrap;" in components_css


def test_project_view_feedback_submit_error_aligns_with_form_fields() -> None:
    components_css = load_components_css()

    assert ".feedback-dialog-submit-error {" in components_css
    assert "padding: 0 1.15rem;" in components_css
    assert ".feedback-dialog-field-error {" in components_css
    assert ".feedback-dialog-field-compact {" in components_css
    assert ".feedback-dialog-textarea-compact {" in components_css


def test_project_view_skills_market_card_actions_are_compact() -> None:
    components_css = load_components_css()

    assert ".primary-btn.feature-skills-card-install," in components_css
    assert ".secondary-btn.feature-skills-card-install {" in components_css
    assert "width: auto;" in components_css
    assert "min-height: 30px;" in components_css


def test_project_view_skills_feature_does_not_repeat_inner_title(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openSkillsFeatureView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openSkillsFeatureView();
await flushTasks();
await flushTasks();

els.projectViewToolbarActions
    .querySelector("[data-feature-skills-clawhub-settings]")
    ?.onclick?.();
await flushTasks();

console.log(JSON.stringify({
    projectViewTitle: els.projectViewTitle.textContent,
    toolbarHtml: els.projectViewToolbarActions.innerHTML,
    contentHtml: els.projectViewContent.innerHTML,
    modalHtml: (globalThis.__bodyChildren || []).map(node => node.innerHTML || "").join("\\n"),
    clawhubSettingsBindCalls: globalThis.__clawhubSettingsBindCalls || 0,
    clawhubSettingsLoadCalls: globalThis.__clawhubSettingsLoadCalls || 0,
}));
""".strip(),
        mock_api_source="""
export async function disableAutomationProject() {
    return { status: "disabled" };
}

export async function enableAutomationProject() {
    return { status: "enabled" };
}

export async function createAutomationProject() {
    return { automation_project_id: "aut_new" };
}

export async function deleteAutomationProject() {
    return { status: "ok" };
}

export async function fetchAutomationProject() {
    throw new Error("not used");
}

export async function fetchAutomationFeishuBindings() {
    return [];
}

export async function fetchAutomationProjectSessions() {
    return [];
}

export async function fetchAutomationProjects() {
    globalThis.__fetchAutomationProjectsCalls = (globalThis.__fetchAutomationProjectsCalls || 0) + 1;
    if (globalThis.__deferredAutomationProjectsPromise) {
        return await globalThis.__deferredAutomationProjectsPromise;
    }
    return [];
}

export async function fetchWorkspaces() {
    return globalThis.__mockWorkspaces || [];
}

export async function fetchWorkspaceSnapshot() {
    throw new Error("not used");
}

export async function fetchWorkspaceTree() {
    throw new Error("not used");
}

export async function fetchWorkspaceDiffs() {
    throw new Error("not used");
}

export async function fetchWorkspaceDiffFile() {
    throw new Error("not used");
}

export async function runAutomationProject() {
    throw new Error("not used");
}

export async function fetchConfigStatus() {
    return {
        skills: {
            skills: [
                {
                    name: "schedule-tasks",
                    description: "Run scheduled checks.",
                    ref: "schedule-tasks",
                    path: "/skills/schedule-tasks",
                    scope: "builtin",
                },
            ],
        },
    };
}

export async function fetchOrchestrationConfig() {
    return { presets: [] };
}

export async function fetchRoleConfigOptions() {
    return { normal_mode_roles: [] };
}

export async function fetchTriggers() {
    return [];
}

export async function fetchWeChatGatewayAccounts() {
    return [];
}

export async function reloadSkillsConfig() {
    return { status: "ok" };
}

export async function createTrigger() {
    return { status: "ok" };
}

export async function updateTrigger() {
    return { status: "ok" };
}

export async function deleteTrigger() {
    return { status: "ok" };
}

export async function enableTrigger() {
    return { status: "ok" };
}

export async function disableTrigger() {
    return { status: "ok" };
}

export async function startWeChatGatewayLogin() {
    return { session_key: "wechat-login-1", qr_code_url: "https://example.test/qr.png" };
}

export async function waitWeChatGatewayLogin() {
    return { connected: true };
}

export async function updateWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function enableWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function disableWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function deleteWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function updateAutomationProject() {
    return { status: "ok" };
}
""".strip(),
    )

    assert payload["projectViewTitle"] == "Skills"
    assert "<h3>Skills</h3>" not in str(payload["contentHtml"])
    assert 'data-feature-skills-tab="market"' in str(payload["contentHtml"])
    assert 'data-feature-skills-tab="installed"' in str(payload["contentHtml"])
    assert "feature-skills-market" in str(payload["contentHtml"])
    assert "skills-clawhub-panel" not in str(payload["contentHtml"])
    assert "data-feature-skills-clawhub-settings" in str(payload["toolbarHtml"])
    assert "skills-clawhub-settings-modal" in str(payload["modalHtml"])
    assert "skills-modal-close-btn" in str(payload["modalHtml"])
    assert "&times;" not in str(payload["modalHtml"])
    assert payload["clawhubSettingsBindCalls"] == 1
    assert payload["clawhubSettingsLoadCalls"] == 1
    assert "No matching skills" in str(payload["contentHtml"])
    assert "Self-Improving Agent" not in str(payload["contentHtml"])
    assert "WorkBuddy" not in str(payload["contentHtml"])
    assert "SkillHub" not in str(payload["contentHtml"])


def test_project_view_skills_feature_switches_between_market_and_installed(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openSkillsFeatureView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openSkillsFeatureView();
await flushTasks();
await flushTasks();

const marketHtml = els.projectViewContent.innerHTML;
els.projectViewContent
    .querySelectorAll('[data-feature-skills-tab]')
    .find(node => node.getAttribute('data-feature-skills-tab') === 'installed')
    ?.onclick?.();
await flushTasks();
const installedHtml = els.projectViewContent.innerHTML;
const installedToolbarHtml = els.projectViewToolbarActions.innerHTML;

console.log(JSON.stringify({
    marketHtml,
    installedHtml,
    installedToolbarHtml,
}));
""".strip(),
        mock_api_source="""
export async function fetchConfigStatus() {
    return {
        skills: {
            skills: [
                {
                    name: "schedule-tasks",
                    description: "Run scheduled checks.",
                    ref: "schedule-tasks",
                    path: "/skills/schedule-tasks",
                    scope: "builtin",
                },
                {
                    name: "writer-helper",
                    description: "Draft writing help.",
                    ref: "writer-helper",
                    path: "/skills/writer-helper",
                    scope: "user_relay_teams",
                },
            ],
        },
    };
}
""".strip(),
    )

    assert "feature-skills-market" in str(payload["marketHtml"])
    assert "skills-clawhub-panel" not in str(payload["marketHtml"])
    assert "No matching skills" in str(payload["marketHtml"])
    assert "Self-Improving Agent" not in str(payload["marketHtml"])
    assert "schedule-tasks" not in str(payload["marketHtml"])
    assert "feature-skills-market" not in str(payload["installedHtml"])
    assert "schedule-tasks" in str(payload["installedHtml"])
    assert "writer-helper" in str(payload["installedHtml"])
    assert "2 installed" in str(payload["installedHtml"])
    assert "data-feature-skills-reload" in str(payload["installedHtml"])
    assert 'data-feature-skills-installed-uninstall="writer-helper"' in str(
        payload["installedHtml"]
    )
    assert "data-feature-skills-reload" not in str(payload["installedToolbarHtml"])
    assert "data-project-view-close" not in str(payload["installedToolbarHtml"])
    assert "workspace-view-panel skills-directory-panel" not in str(
        payload["installedHtml"]
    )
    assert "Installed Skills" not in str(payload["installedHtml"])


def test_project_view_installed_skills_can_uninstall_user_skill(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openSkillsFeatureView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openSkillsFeatureView();
await flushTasks();
await flushTasks();

els.projectViewContent
    .querySelectorAll('[data-feature-skills-tab]')
    .find(node => node.getAttribute('data-feature-skills-tab') === 'installed')
    ?.onclick?.();
await flushTasks();

const beforeHtml = els.projectViewContent.innerHTML;
els.projectViewContent
    .querySelectorAll('[data-feature-skills-installed-uninstall]')
    .find(node => node.getAttribute('data-feature-skills-installed-uninstall') === 'writer-helper')
    ?.onclick?.({
        stopPropagation() {
            globalThis.__installedUninstallStopPropagation =
                (globalThis.__installedUninstallStopPropagation || 0) + 1;
        },
    });
await flushTasks();
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    beforeHtml,
    afterHtml: els.projectViewContent.innerHTML,
    runtimeSkillUninstallRequests: globalThis.__runtimeSkillUninstallRequests || [],
    confirmCalls: globalThis.__showConfirmDialogCalls || [],
    toastCalls: globalThis.__toastCalls || [],
    stopPropagationCalls: globalThis.__installedUninstallStopPropagation || 0,
}));
""".strip(),
        mock_api_source="""
export async function fetchConfigStatus() {
    const uninstalled = Boolean(
        globalThis.__runtimeSkillUninstallRequests?.includes("writer-helper"),
    );
    return {
        skills: {
            skills: uninstalled ? [] : [
                {
                    name: "writer-helper",
                    description: "Draft writing help.",
                    ref: "writer-helper",
                    path: "/skills/writer-helper",
                    scope: "user_relay_teams",
                },
            ],
        },
    };
}
""".strip(),
    )

    assert 'data-feature-skills-installed-uninstall="writer-helper"' in str(
        payload["beforeHtml"]
    )
    assert payload["runtimeSkillUninstallRequests"] == ["writer-helper"]
    assert payload["stopPropagationCalls"] == 1
    confirm_calls = cast(list[dict[str, object]], payload["confirmCalls"])
    assert confirm_calls[0]["title"] == "Uninstall skill"
    assert 'data-feature-skills-installed-uninstall="writer-helper"' not in str(
        payload["afterHtml"]
    )
    toast_calls = cast(list[dict[str, object]], payload["toastCalls"])
    assert toast_calls[-1]["title"] == "Skill uninstalled"


def test_project_view_runtime_uninstall_clears_market_card_by_runtime_ref(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openSkillsFeatureView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

globalThis.__clawHubMarketBrowseResponse = {
    ok: true,
    query: "",
    items: [
        {
            slug: "skill-creator",
            title: "Skill Creator",
            version: "v1.0.0",
            score: 1,
            installed: false,
        },
    ],
};

initializeProjectView();
await openSkillsFeatureView();
await flushTasks();
await flushTasks();

const initialMarketHtml = els.projectViewContent.innerHTML;
els.projectViewContent
    .querySelectorAll('[data-feature-skills-tab]')
    .find(node => node.getAttribute('data-feature-skills-tab') === 'installed')
    ?.onclick?.();
await flushTasks();
els.projectViewContent
    .querySelectorAll('[data-feature-skills-installed-uninstall]')
    .find(node => node.getAttribute('data-feature-skills-installed-uninstall') === 'clawhub/skill-creator')
    ?.onclick?.({ stopPropagation() {} });
await flushTasks();
await flushTasks();
await flushTasks();
els.projectViewContent
    .querySelectorAll('[data-feature-skills-tab]')
    .find(node => node.getAttribute('data-feature-skills-tab') === 'market')
    ?.onclick?.();
await flushTasks();

console.log(JSON.stringify({
    initialMarketHtml,
    afterUninstallMarketHtml: els.projectViewContent.innerHTML,
    runtimeSkillUninstallRequests: globalThis.__runtimeSkillUninstallRequests || [],
}));
""".strip(),
        mock_api_source="""
export async function fetchConfigStatus() {
    const uninstalled = Boolean(
        globalThis.__runtimeSkillUninstallRequests?.includes("clawhub/skill-creator"),
    );
    return {
        skills: {
            skills: uninstalled ? [] : [
                {
                    name: "Skill Creator",
                    description: "Create skills.",
                    ref: "clawhub/skill-creator",
                    path: "/skills/skill-creator",
                    scope: "user_relay_teams",
                },
            ],
        },
    };
}
""".strip(),
    )

    assert 'data-feature-skill-detail="installed:clawhub/skill-creator"' in str(
        payload["initialMarketHtml"]
    )
    assert payload["runtimeSkillUninstallRequests"] == ["clawhub/skill-creator"]
    assert 'data-feature-skills-market-install="skill-creator"' in str(
        payload["afterUninstallMarketHtml"]
    )
    assert 'data-feature-skills-market-uninstall="skill-creator"' not in str(
        payload["afterUninstallMarketHtml"]
    )


def test_project_view_skills_market_searches_and_installs_real_clawhub_results(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openSkillsFeatureView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

const storageData = new Map();
globalThis.localStorage = {
    getItem(key) {
        return storageData.has(key) ? storageData.get(key) : null;
    },
    setItem(key, value) {
        storageData.set(key, String(value));
    },
    removeItem(key) {
        storageData.delete(key);
    },
};
globalThis.__clawHubMarketSearchResponse = {
    ok: true,
    query: "skill",
    items: [
        {
            slug: "skill-creator",
            title: "Skill Creator",
            version: "v1.0.0",
            score: 4.25,
            installed: false,
        },
    ],
};
globalThis.__clawHubMarketInstallResponse = {
    ok: true,
    slug: "skill-creator",
    installed_skill: {
        skill_id: "skill-creator",
        runtime_name: "Skill Creator",
        ref: "clawhub/skill-creator",
        source: "user_relay_teams",
        directory: "/skills/skill-creator",
        manifest_path: "/skills/skill-creator/SKILL.md",
    },
    diagnostics: { skills_reloaded: true },
};
globalThis.__clawHubMarketDetailResponse = {
    ok: true,
    slug: "skill-creator",
    title: "Skill Creator",
    version: "v1.0.0",
    manifest_content: "---\\nname: skill-creator\\n---\\n# Skill Creator\\n\\n## Market Preview\\nInstall after reading.\\n\\n<img src=\\"javascript:alert(1)\\" onerror=\\"alert(1)\\">\\n<script>alert(1)</script>",
};
globalThis.__runtimeSkillDetailResponse = {
    ref: "clawhub/skill-creator",
    name: "skill-creator",
    description: "Create skills.",
    source: "user_relay_teams",
    directory: "/skills/skill-creator",
    manifest_path: "/skills/skill-creator/SKILL.md",
    instructions: "## Quick Start\\nUse this skill.",
    manifest_content: "---\\nname: skill-creator\\ndescription: Create skills.\\n---\\n# Skill Creator\\n\\n## Quick Start\\nUse this skill.\\n\\n<img src=\\"javascript:alert(1)\\" onerror=\\"alert(1)\\">\\n<script>alert(1)</script>",
};

initializeProjectView();
await openSkillsFeatureView();
await flushTasks();
await flushTasks();

const searchInput = els.projectViewToolbarActions.querySelector("[data-feature-skills-search]");
searchInput.value = "skill";
searchInput.oninput?.({ target: searchInput });
searchInput.onkeydown?.({
    key: "Enter",
    preventDefault() {
        globalThis.__skillsSearchPreventDefault =
            (globalThis.__skillsSearchPreventDefault || 0) + 1;
    },
});
await flushTasks();
await flushTasks();
const resultsHtml = els.projectViewContent.innerHTML;

els.projectViewContent
    .querySelectorAll("[data-feature-skill-detail]")
    .find(node => node.getAttribute("data-feature-skill-detail") === "market:skill-creator")
    ?.onclick?.();
await flushTasks();
await flushTasks();
await flushTasks();
const detailHtml = (globalThis.__bodyChildren || [])
    .map(node => node.innerHTML || "")
    .join("\\n");

els.projectViewContent
    .querySelectorAll("[data-feature-skills-market-install]")
    .find(node => node.getAttribute("data-feature-skills-market-install") === "skill-creator")
    ?.onclick?.();
await flushTasks();
await flushTasks();
await flushTasks();
const afterInstallHtml = els.projectViewContent.innerHTML;
const afterInstallCacheRaw = globalThis.localStorage.getItem("relay-teams.skills.market.cache.v1");

els.projectViewContent
    .querySelectorAll("[data-feature-skill-detail]")
    .find(node => node.getAttribute("data-feature-skill-detail") === "installed:clawhub/skill-creator")
    ?.onclick?.();
await flushTasks();
await flushTasks();
const installedDetailHtml = (globalThis.__bodyChildren || [])
    .map(node => node.innerHTML || "")
    .join("\\n");

els.projectViewContent
    .querySelectorAll("[data-feature-skills-market-uninstall]")
    .find(node => node.getAttribute("data-feature-skills-market-uninstall") === "skill-creator")
    ?.onclick?.();
await flushTasks();
await flushTasks();
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    browseRequests: globalThis.__clawHubMarketBrowseRequests || [],
    searchRequests: globalThis.__clawHubMarketSearchRequests || [],
    marketDetailRequests: globalThis.__clawHubMarketDetailRequests || [],
    installRequests: globalThis.__clawHubMarketInstallRequests || [],
    uninstallRequests: globalThis.__clawHubMarketUninstallRequests || [],
    detailRequests: globalThis.__runtimeSkillDetailRequests || [],
    resultsHtml,
    detailHtml,
    installedDetailHtml,
    afterInstallHtml,
    afterInstallCacheRaw,
    afterUninstallHtml: els.projectViewContent.innerHTML,
    afterUninstallCacheRaw: globalThis.localStorage.getItem("relay-teams.skills.market.cache.v1"),
    toastCalls: globalThis.__toastCalls || [],
    preventDefaultCalls: globalThis.__skillsSearchPreventDefault || 0,
}));
""".strip(),
        mock_api_source="""
export async function fetchConfigStatus() {
    const installed = Boolean(globalThis.__clawHubMarketInstallRequests?.length)
        && !globalThis.__clawHubMarketUninstallRequests?.length;
    return {
        skills: {
            skills: installed ? [
                {
                    name: "Skill Creator",
                    description: "Create skills.",
                    ref: "clawhub/skill-creator",
                    path: "/skills/skill-creator",
                    scope: "user_relay_teams",
                },
            ] : [],
        },
    };
}
""".strip(),
    )

    assert payload["preventDefaultCalls"] == 1
    assert payload["browseRequests"] == [
        {"limit": 24, "cursor": "", "sort": "popular"},
    ]
    assert payload["searchRequests"] == [
        {"query": "skill", "limit": 24},
    ]
    assert "Skill Creator" in str(payload["resultsHtml"])
    assert "skill-creator" in str(payload["resultsHtml"])
    assert "Version v1.0.0" in str(payload["resultsHtml"])
    assert "4.25" in str(payload["resultsHtml"])
    assert "Score" in str(payload["resultsHtml"])
    assert 'data-feature-skill-detail="market:skill-creator"' in str(
        payload["resultsHtml"]
    )
    assert "skills-detail-modal" in str(payload["detailHtml"])
    assert "skills-modal-close-btn" in str(payload["detailHtml"])
    assert "skills-detail-markdown msg-text" in str(payload["detailHtml"])
    assert "onerror" not in str(payload["detailHtml"])
    assert "javascript:alert" not in str(payload["detailHtml"])
    assert "<script>" not in str(payload["detailHtml"])
    assert "&times;" not in str(payload["detailHtml"])
    assert "data-feature-skills-detail-install" in str(payload["detailHtml"])
    assert payload["marketDetailRequests"] == [
        {"slug": "skill-creator", "version": "v1.0.0"}
    ]
    assert payload["installRequests"] == [
        {"slug": "skill-creator", "version": "v1.0.0", "force": False}
    ]
    assert 'data-feature-skills-market-uninstall="skill-creator"' in str(
        payload["afterInstallHtml"]
    )
    assert 'data-feature-skill-detail="installed:clawhub/skill-creator"' in str(
        payload["afterInstallHtml"]
    )
    after_install_cache = json.loads(str(payload["afterInstallCacheRaw"]))
    after_install_items = cast(
        list[dict[str, object]],
        after_install_cache["entries"][0]["items"],
    )
    assert after_install_items[0]["installed"] is True
    assert payload["detailRequests"] == ["clawhub/skill-creator"]
    assert "onerror" not in str(payload["installedDetailHtml"])
    assert "javascript:alert" not in str(payload["installedDetailHtml"])
    assert "<script>" not in str(payload["installedDetailHtml"])
    assert payload["uninstallRequests"] == ["skill-creator"]
    assert 'data-feature-skills-market-install="skill-creator"' in str(
        payload["afterUninstallHtml"]
    )
    after_uninstall_cache = json.loads(str(payload["afterUninstallCacheRaw"]))
    after_uninstall_items = cast(
        list[dict[str, object]],
        after_uninstall_cache["entries"][0]["items"],
    )
    assert after_uninstall_items[0]["installed"] is False
    toast_calls = cast(list[dict[str, object]], payload["toastCalls"])
    assert toast_calls[-1]["title"] == "Skill uninstalled"


def test_project_view_skills_market_caches_and_loads_more_results(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openSkillsFeatureView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openSkillsFeatureView();
await flushTasks();
await flushTasks();
const initialHtml = els.projectViewContent.innerHTML;

els.projectViewContent
    .querySelectorAll('[data-feature-skills-tab]')
    .find(node => node.getAttribute('data-feature-skills-tab') === 'installed')
    ?.onclick?.();
await flushTasks();
els.projectViewContent
    .querySelectorAll('[data-feature-skills-tab]')
    .find(node => node.getAttribute('data-feature-skills-tab') === 'market')
    ?.onclick?.();
await flushTasks();
const afterTabReturnHtml = els.projectViewContent.innerHTML;

els.projectViewContent
    .querySelector("[data-feature-skills-market-more]")
    ?.onclick?.();
await flushTasks();
await flushTasks();
const afterMoreHtml = els.projectViewContent.innerHTML;

await openSkillsFeatureView();
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    browseRequests: globalThis.__clawHubMarketBrowseRequests || [],
    searchRequests: globalThis.__clawHubMarketSearchRequests || [],
    initialHtml,
    afterTabReturnHtml,
    afterMoreHtml,
}));
""".strip(),
        mock_api_source="""
export async function fetchConfigStatus() {
    return {
        skills: {
            skills: [],
        },
    };
}

export async function fetchClawHubSkillMarket(options = {}) {
    globalThis.__clawHubMarketBrowseRequests =
        globalThis.__clawHubMarketBrowseRequests || [];
    const limit = options?.limit || null;
    const cursor = options?.cursor || "";
    globalThis.__clawHubMarketBrowseRequests.push({
        limit,
        cursor,
        sort: options?.sort || "",
    });
    const offset = cursor === "next-24" ? 24 : 0;
    const count = Math.min(Number(limit || 0), 24);
    return {
        ok: true,
        query: "",
        sort: "popular",
        next_cursor: cursor ? null : "next-24",
        items: Array.from({ length: count }, (_, index) => ({
            slug: `skill-${String(offset + index + 1).padStart(3, "0")}`,
            title: `Skill ${offset + index + 1}`,
            summary: `Skill ${offset + index + 1} summary`,
            version: "v1.0.0",
            stats: { installs_current: 10 },
            installed: false,
        })),
    };
}
""".strip(),
    )

    assert payload["browseRequests"] == [
        {"limit": 24, "cursor": "", "sort": "popular"},
        {"limit": 24, "cursor": "next-24", "sort": "popular"},
    ]
    assert payload["searchRequests"] == []
    assert "skill-024" in str(payload["initialHtml"])
    assert "skill-025" not in str(payload["initialHtml"])
    assert "skill-024" in str(payload["afterTabReturnHtml"])
    assert "skill-048" in str(payload["afterMoreHtml"])


def test_project_view_skills_market_restores_persisted_home_cache(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openSkillsFeatureView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

const storageData = new Map();
globalThis.localStorage = {
    getItem(key) {
        return storageData.has(key) ? storageData.get(key) : null;
    },
    setItem(key, value) {
        storageData.set(key, String(value));
    },
    removeItem(key) {
        storageData.delete(key);
    },
};
globalThis.localStorage.setItem("relay-teams.skills.market.cache.v1", JSON.stringify({
    version: 1,
    entries: [
        {
            key: "browse:popular:",
            mode: "browse",
            sort: "popular",
            query: "",
            status: "loaded",
            error: "",
            items: [
                {
                    slug: "cached-skill",
                    title: "Cached Skill",
                    summary: "Loaded from localStorage.",
                    version: "1.0.0",
                    stats: { installs_current: 123, stars: 7 },
                    installed: false,
                },
            ],
            limit: 24,
            hasMore: true,
            nextCursor: "next-cached",
            updatedAt: Date.now(),
        },
    ],
}));

initializeProjectView();
await openSkillsFeatureView();
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    html: els.projectViewContent.innerHTML,
    browseRequests: globalThis.__clawHubMarketBrowseRequests || [],
    searchRequests: globalThis.__clawHubMarketSearchRequests || [],
}));
""".strip(),
        mock_api_source="""
export async function fetchConfigStatus() {
    return {
        skills: {
            skills: [],
        },
    };
}
""".strip(),
    )

    assert payload["browseRequests"] == []
    assert payload["searchRequests"] == []
    assert "Cached Skill" in str(payload["html"])
    assert "Loaded from localStorage." in str(payload["html"])
    assert "data-feature-skills-market-more" in str(payload["html"])


def test_project_view_skills_market_falls_back_when_local_storage_is_blocked(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openSkillsFeatureView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
        throw new Error("storage blocked");
    },
});
globalThis.__clawHubMarketBrowseResponse = {
    ok: true,
    query: "",
    sort: "popular",
    next_cursor: null,
    items: [
        {
            slug: "fresh-skill",
            title: "Fresh Skill",
            summary: "Loaded without storage.",
            version: "1.0.0",
            installed: false,
        },
    ],
};

initializeProjectView();
await openSkillsFeatureView();
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    html: els.projectViewContent.innerHTML,
    browseRequests: globalThis.__clawHubMarketBrowseRequests || [],
    searchRequests: globalThis.__clawHubMarketSearchRequests || [],
}));
""".strip(),
        mock_api_source="""
export async function fetchConfigStatus() {
    return {
        skills: {
            skills: [],
        },
    };
}
""".strip(),
    )

    assert payload["browseRequests"] == [
        {"limit": 24, "cursor": "", "sort": "popular"},
    ]
    assert payload["searchRequests"] == []
    assert "Fresh Skill" in str(payload["html"])
    assert "Loaded without storage." in str(payload["html"])


def test_project_view_skills_market_reconciles_cached_installed_state(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openSkillsFeatureView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

const storageData = new Map();
globalThis.localStorage = {
    getItem(key) {
        return storageData.has(key) ? storageData.get(key) : null;
    },
    setItem(key, value) {
        storageData.set(key, String(value));
    },
    removeItem(key) {
        storageData.delete(key);
    },
};
globalThis.localStorage.setItem("relay-teams.skills.market.cache.v1", JSON.stringify({
    version: 1,
    entries: [
        {
            key: "browse:popular:",
            mode: "browse",
            sort: "popular",
            query: "",
            status: "loaded",
            error: "",
            items: [
                {
                    slug: "stale-installed-skill",
                    title: "Stale Installed Skill",
                    summary: "The installed flag is stale.",
                    version: "1.0.0",
                    installed: true,
                    installedSkill: {
                        name: "stale-installed-skill",
                        ref: "clawhub/stale-installed-skill",
                        source: "clawhub",
                        runtime_name: "stale-installed-skill",
                    },
                },
            ],
            limit: 24,
            hasMore: false,
            nextCursor: "",
            updatedAt: Date.now(),
        },
    ],
}));

initializeProjectView();
await openSkillsFeatureView();
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    html: els.projectViewContent.innerHTML,
    cachedRaw: globalThis.localStorage.getItem("relay-teams.skills.market.cache.v1"),
    browseRequests: globalThis.__clawHubMarketBrowseRequests || [],
}));
""".strip(),
        mock_api_source="""
export async function fetchConfigStatus() {
    return {
        skills: {
            skills: [],
        },
    };
}
""".strip(),
    )

    cached = json.loads(str(payload["cachedRaw"]))
    entries = cast(list[dict[str, object]], cached["entries"])
    cached_items = cast(list[dict[str, object]], entries[0]["items"])
    assert payload["browseRequests"] == []
    assert cached_items[0]["installed"] is False
    assert cached_items[0]["installedSkill"] is None
    assert 'data-feature-skills-market-install="stale-installed-skill"' in str(
        payload["html"]
    )
    assert 'data-feature-skills-market-uninstall="stale-installed-skill"' not in str(
        payload["html"]
    )


def test_project_view_skills_market_ignores_expired_persisted_cache(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openSkillsFeatureView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

const storageData = new Map();
globalThis.localStorage = {
    getItem(key) {
        return storageData.has(key) ? storageData.get(key) : null;
    },
    setItem(key, value) {
        storageData.set(key, String(value));
    },
    removeItem(key) {
        storageData.delete(key);
    },
};
globalThis.localStorage.setItem("relay-teams.skills.market.cache.v1", JSON.stringify({
    version: 1,
    entries: [
        {
            key: "browse:popular:",
            mode: "browse",
            sort: "popular",
            query: "",
            status: "loaded",
            error: "",
            items: [
                {
                    slug: "expired-skill",
                    title: "Expired Skill",
                    summary: "Should not render.",
                    version: "1.0.0",
                    installed: false,
                },
            ],
            limit: 24,
            hasMore: false,
            nextCursor: "",
            updatedAt: Date.now() - (7 * 60 * 60 * 1000),
        },
    ],
}));
globalThis.__clawHubMarketBrowseResponse = {
    ok: true,
    query: "",
    sort: "popular",
    next_cursor: null,
    items: [
        {
            slug: "fresh-skill",
            title: "Fresh Skill",
            summary: "Loaded from ClawHub.",
            version: "1.0.0",
            installed: false,
        },
    ],
};

initializeProjectView();
await openSkillsFeatureView();
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    html: els.projectViewContent.innerHTML,
    browseRequests: globalThis.__clawHubMarketBrowseRequests || [],
}));
""".strip(),
        mock_api_source="""
export async function fetchConfigStatus() {
    return {
        skills: {
            skills: [],
        },
    };
}
""".strip(),
    )

    assert payload["browseRequests"] == [
        {"limit": 24, "cursor": "", "sort": "popular"},
    ]
    assert "Fresh Skill" in str(payload["html"])
    assert "Expired Skill" not in str(payload["html"])


def test_project_view_skills_market_restores_persisted_search_cache(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openSkillsFeatureView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

const storageData = new Map();
globalThis.localStorage = {
    getItem(key) {
        return storageData.has(key) ? storageData.get(key) : null;
    },
    setItem(key, value) {
        storageData.set(key, String(value));
    },
    removeItem(key) {
        storageData.delete(key);
    },
};
globalThis.localStorage.setItem("relay-teams.skills.market.cache.v1", JSON.stringify({
    version: 1,
    entries: [
        {
            key: "search::skill",
            mode: "search",
            sort: "",
            query: "skill",
            status: "loaded",
            error: "",
            items: [
                {
                    slug: "cached-search-skill",
                    title: "Cached Search Skill",
                    summary: "Search cache result.",
                    version: "1.0.0",
                    score: 3.5,
                    installed: false,
                },
            ],
            limit: 24,
            hasMore: false,
            nextCursor: "",
            updatedAt: Date.now(),
        },
    ],
}));

initializeProjectView();
await openSkillsFeatureView();
await flushTasks();
await flushTasks();

const searchInput = els.projectViewToolbarActions.querySelector("[data-feature-skills-search]");
searchInput.value = "skill";
searchInput.oninput?.({ target: searchInput });
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    html: els.projectViewContent.innerHTML,
    browseRequests: globalThis.__clawHubMarketBrowseRequests || [],
    searchRequests: globalThis.__clawHubMarketSearchRequests || [],
}));
""".strip(),
        mock_api_source="""
export async function fetchConfigStatus() {
    return {
        skills: {
            skills: [],
        },
    };
}
""".strip(),
    )

    assert payload["browseRequests"] == [
        {"limit": 24, "cursor": "", "sort": "popular"},
    ]
    assert payload["searchRequests"] == []
    assert "Cached Search Skill" in str(payload["html"])
    assert "Search cache result." in str(payload["html"])
    assert "3.50" in str(payload["html"])


def test_project_view_skills_market_persists_loaded_pages(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openSkillsFeatureView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

const storageData = new Map();
globalThis.localStorage = {
    getItem(key) {
        return storageData.has(key) ? storageData.get(key) : null;
    },
    setItem(key, value) {
        storageData.set(key, String(value));
    },
    removeItem(key) {
        storageData.delete(key);
    },
};

initializeProjectView();
await openSkillsFeatureView();
await flushTasks();
await flushTasks();
els.projectViewContent
    .querySelector("[data-feature-skills-market-more]")
    ?.onclick?.();
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    browseRequests: globalThis.__clawHubMarketBrowseRequests || [],
    cachedRaw: globalThis.localStorage.getItem("relay-teams.skills.market.cache.v1"),
    html: els.projectViewContent.innerHTML,
}));
""".strip(),
        mock_api_source="""
export async function fetchConfigStatus() {
    return {
        skills: {
            skills: [],
        },
    };
}

export async function fetchClawHubSkillMarket(options = {}) {
    globalThis.__clawHubMarketBrowseRequests =
        globalThis.__clawHubMarketBrowseRequests || [];
    const limit = options?.limit || null;
    const cursor = options?.cursor || "";
    globalThis.__clawHubMarketBrowseRequests.push({
        limit,
        cursor,
        sort: options?.sort || "",
    });
    const offset = cursor === "next-24" ? 24 : 0;
    const count = Math.min(Number(limit || 0), 24);
    return {
        ok: true,
        query: "",
        sort: "popular",
        next_cursor: cursor ? null : "next-24",
        items: Array.from({ length: count }, (_, index) => ({
            slug: `persisted-skill-${String(offset + index + 1).padStart(3, "0")}`,
            title: `Persisted Skill ${offset + index + 1}`,
            summary: `Persisted Skill ${offset + index + 1} summary`,
            version: "1.0.0",
            installed: false,
        })),
    };
}
""".strip(),
    )

    cached = json.loads(str(payload["cachedRaw"]))
    entries = cast(list[dict[str, object]], cached["entries"])
    browse_entry = entries[0]
    cached_items = cast(list[dict[str, object]], browse_entry["items"])
    assert payload["browseRequests"] == [
        {"limit": 24, "cursor": "", "sort": "popular"},
        {"limit": 24, "cursor": "next-24", "sort": "popular"},
    ]
    assert browse_entry["nextCursor"] == ""
    assert len(cached_items) == 48
    assert cached_items[-1]["slug"] == "persisted-skill-048"
    assert "persisted-skill-048" in str(payload["html"])


def test_project_view_skills_market_uses_persisted_detail_cache(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openSkillsFeatureView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

const storageData = new Map();
globalThis.localStorage = {
    getItem(key) {
        return storageData.has(key) ? storageData.get(key) : null;
    },
    setItem(key, value) {
        storageData.set(key, String(value));
    },
    removeItem(key) {
        storageData.delete(key);
    },
};
globalThis.localStorage.setItem("relay-teams.skills.market.detail.cache.v1", JSON.stringify({
    version: 1,
    entries: [
        {
            key: "skill-creator@v1.0.0",
            slug: "skill-creator",
            version: "v1.0.0",
            markdown: "# Cached Preview\\n\\nRead before installing.",
            summary: "Cached summary.",
            source: "clawhub",
            errorMessage: "",
            updatedAt: Date.now(),
        },
    ],
}));
globalThis.__clawHubMarketBrowseResponse = {
    ok: true,
    query: "",
    items: [
        {
            slug: "skill-creator",
            title: "Skill Creator",
            summary: "Create skills.",
            version: "v1.0.0",
            installed: false,
        },
    ],
};

initializeProjectView();
await openSkillsFeatureView();
await flushTasks();
await flushTasks();
els.projectViewContent
    .querySelectorAll("[data-feature-skill-detail]")
    .find(node => node.getAttribute("data-feature-skill-detail") === "market:skill-creator")
    ?.onclick?.();
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    detailHtml: (globalThis.__bodyChildren || [])
        .map(node => node.innerHTML || "")
        .join("\\n"),
    markdownHtml: globalThis.__bodyChildren[0]
        ?.querySelector("[data-feature-skills-detail-markdown]")
        ?.innerHTML || "",
    marketDetailRequests: globalThis.__clawHubMarketDetailRequests || [],
}));
""".strip(),
        mock_api_source="""
export async function fetchConfigStatus() {
    return {
        skills: {
            skills: [],
        },
    };
}
""".strip(),
    )

    assert payload["marketDetailRequests"] == []
    assert "Cached Preview" in str(payload["markdownHtml"])
    assert "Read before installing." in str(payload["markdownHtml"])


def test_project_view_skills_market_does_not_cache_failed_detail_preview(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openSkillsFeatureView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

const storageData = new Map();
globalThis.localStorage = {
    getItem(key) {
        return storageData.has(key) ? storageData.get(key) : null;
    },
    setItem(key, value) {
        storageData.set(key, String(value));
    },
    removeItem(key) {
        storageData.delete(key);
    },
};
globalThis.__clawHubMarketBrowseResponse = {
    ok: true,
    query: "",
    items: [
        {
            slug: "skill-creator",
            title: "Skill Creator",
            summary: "Create skills.",
            version: "v1.0.0",
            installed: false,
        },
    ],
};
globalThis.__clawHubMarketDetailResponse = {
    ok: true,
    slug: "skill-creator",
    title: "Skill Creator",
    version: "v1.0.0",
    manifest_content: "",
    error_message: "Package preview is unavailable.",
    files: [],
};

initializeProjectView();
await openSkillsFeatureView();
await flushTasks();
await flushTasks();
const detailCard = els.projectViewContent
    .querySelectorAll("[data-feature-skill-detail]")
    .find(node => node.getAttribute("data-feature-skill-detail") === "market:skill-creator");
detailCard?.onclick?.();
await flushTasks();
await flushTasks();
detailCard?.onclick?.();
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    cachedRaw: globalThis.localStorage.getItem("relay-teams.skills.market.detail.cache.v1"),
    marketDetailRequests: globalThis.__clawHubMarketDetailRequests || [],
    markdownHtml: globalThis.__bodyChildren[globalThis.__bodyChildren.length - 1]
        ?.querySelector("[data-feature-skills-detail-markdown]")
        ?.innerHTML || "",
    detailHtml: (globalThis.__bodyChildren || [])
        .map(node => node.innerHTML || "")
        .join("\\n"),
}));
""".strip(),
        mock_api_source="""
export async function fetchConfigStatus() {
    return {
        skills: {
            skills: [],
        },
    };
}
""".strip(),
    )

    assert payload["marketDetailRequests"] == [
        {"slug": "skill-creator", "version": "v1.0.0"},
        {"slug": "skill-creator", "version": "v1.0.0"},
    ]
    assert payload["cachedRaw"] is None
    assert "Package preview is unavailable." in str(payload["markdownHtml"])


def test_project_view_skills_market_does_not_overlay_builtin_name_match(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openSkillsFeatureView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

globalThis.__clawHubMarketBrowseResponse = {
    ok: true,
    query: "",
    items: [
        {
            slug: "skill-creator",
            title: "skill-creator",
            version: "v1.0.0",
            score: 1,
            installed: false,
        },
    ],
};

initializeProjectView();
await openSkillsFeatureView();
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    html: els.projectViewContent.innerHTML,
}));
""".strip(),
        mock_api_source="""
export async function fetchConfigStatus() {
    return {
        skills: {
            skills: [
                {
                    name: "skill-creator",
                    description: "Built-in helper with a colliding name.",
                    ref: "skill-creator",
                    path: "/builtin/skill-creator",
                    scope: "builtin",
                },
            ],
        },
    };
}
""".strip(),
    )

    assert 'data-feature-skill-detail="market:skill-creator"' in str(payload["html"])
    assert 'data-feature-skills-market-install="skill-creator"' in str(payload["html"])
    assert 'data-feature-skills-market-uninstall="skill-creator"' not in str(
        payload["html"]
    )


def test_project_view_skills_market_installed_without_runtime_ref_opens_market_detail(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openSkillsFeatureView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

globalThis.__clawHubMarketBrowseResponse = {
    ok: true,
    query: "",
    items: [
        {
            slug: "skill-creator-2",
            title: "Skill Creator",
            version: "v1.0.0",
            score: 1,
            installed: true,
        },
    ],
};

initializeProjectView();
await openSkillsFeatureView();
await flushTasks();
await flushTasks();
const marketHtml = els.projectViewContent.innerHTML;
els.projectViewContent
    .querySelectorAll("[data-feature-skill-detail]")
    .find(node => node.getAttribute("data-feature-skill-detail") === "market:skill-creator-2")
    ?.onclick?.();
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    marketHtml,
    detailHtml: (globalThis.__bodyChildren || [])
        .map(node => node.innerHTML || "")
        .join("\\n"),
    detailRequests: globalThis.__runtimeSkillDetailRequests || [],
    marketDetailRequests: globalThis.__clawHubMarketDetailRequests || [],
}));
""".strip(),
        mock_api_source="""
export async function fetchConfigStatus() {
    return {
        skills: {
            skills: [],
        },
    };
}
""".strip(),
    )

    assert 'data-feature-skill-detail="market:skill-creator-2"' in str(
        payload["marketHtml"]
    )
    assert 'data-feature-skills-market-install="skill-creator-2"' in str(
        payload["marketHtml"]
    )
    assert 'data-feature-skills-market-uninstall="skill-creator-2"' not in str(
        payload["marketHtml"]
    )
    assert payload["detailRequests"] == []
    assert payload["marketDetailRequests"] == [
        {"slug": "skill-creator-2", "version": "v1.0.0"}
    ]


def test_project_view_skills_search_timer_is_guarded_when_leaving_feature() -> None:
    source = Path("frontend/dist/js/components/projectView.js").read_text(
        encoding="utf-8"
    )

    assert "function cancelSkillsFeatureAsyncWork()" in source
    assert "if (!isSkillsMarketViewActive())" in source
    assert "cancelSkillsFeatureAsyncWork();" in source
    assert "isInteractiveSkillCardEventTarget(event.target, card)" in source


def test_project_view_skills_market_ignores_stale_search_response(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openSkillsFeatureView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

let resolveOldSearch = null;
globalThis.__oldSkillSearchPromise = new Promise(resolve => {
    resolveOldSearch = resolve;
});

initializeProjectView();
await openSkillsFeatureView();
await flushTasks();
await flushTasks();

const searchInput = els.projectViewToolbarActions.querySelector("[data-feature-skills-search]");
searchInput.value = "old";
searchInput.oninput?.({ target: searchInput });
searchInput.onkeydown?.({ key: "Enter", preventDefault() {} });
await flushTasks();

searchInput.value = "new";
searchInput.oninput?.({ target: searchInput });
resolveOldSearch({
    ok: true,
    query: "old",
    items: [
        {
            slug: "old-skill",
            title: "Old Skill",
            version: "1.0.0",
            score: 1,
            installed: false,
        },
    ],
});
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    html: els.projectViewContent.innerHTML,
    toolbarHtml: els.projectViewToolbarActions.innerHTML,
    browseRequests: globalThis.__clawHubMarketBrowseRequests || [],
    searchRequests: globalThis.__clawHubMarketSearchRequests || [],
}));
""".strip(),
        mock_api_source="""
export async function searchClawHubSkillMarket(query, options = {}) {
    globalThis.__clawHubMarketSearchRequests =
        globalThis.__clawHubMarketSearchRequests || [];
    globalThis.__clawHubMarketSearchRequests.push({
        query,
        limit: options?.limit || null,
    });
    if (query === "old") {
        return await globalThis.__oldSkillSearchPromise;
    }
    return {
        ok: true,
        query,
        items: [],
    };
}
""".strip(),
    )

    assert payload["searchRequests"] == [
        {"query": "old", "limit": 24},
    ]
    assert payload["browseRequests"] == [
        {"limit": 24, "cursor": "", "sort": "popular"},
    ]
    assert "Old Skill" not in str(payload["html"])
    assert 'value="new"' in str(payload["toolbarHtml"])


def test_project_view_ignores_stale_feature_response_after_fast_switch(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openAutomationHomeView,
    openImFeatureView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";
import { state } from "./mockState.mjs";

initializeProjectView();
let resolveAutomationProjects = null;
globalThis.__deferredAutomationProjectsPromise = new Promise(resolve => {
    resolveAutomationProjects = resolve;
});

const automationPromise = openAutomationHomeView();
await flushTasks();
const gatewayPromise = openImFeatureView();
await flushTasks();
resolveAutomationProjects([
    {
        automation_project_id: "aut_1",
        display_name: "Delayed automation",
        workspace_id: "workspace_1",
        enabled: true,
    },
]);
await Promise.allSettled([automationPromise, gatewayPromise]);
await flushTasks();

console.log(JSON.stringify({
    title: els.projectViewTitle.textContent,
    contentHtml: els.projectViewContent.innerHTML,
    currentFeatureViewId: state.currentFeatureViewId,
    logs: globalThis.__logs,
}));
""".strip(),
    )

    assert payload["title"] == ""
    assert payload["currentFeatureViewId"] == "connectors"
    assert "Delayed automation" not in str(payload["contentHtml"])
    assert "connectors-page" in str(payload["contentHtml"])
    assert payload["logs"] == []


def test_project_view_keeps_connector_search_focused_while_typing(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openImFeatureView,
} from "./projectView.mjs";
import { flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openImFeatureView();
await flushTasks();
await flushTasks();

const searchInput = document.querySelector("[data-connectors-search]");
searchInput.value = "微";
searchInput.selectionStart = 1;
searchInput.selectionEnd = 1;
searchInput.oninput?.();
await flushTasks();

console.log(JSON.stringify({
    activeIsSearch: globalThis.__activeElement?.getAttribute?.("data-connectors-search") !== null,
    activeValue: globalThis.__activeElement?.value || "",
    selectionStart: globalThis.__activeElement?.selectionStart,
    selectionEnd: globalThis.__activeElement?.selectionEnd,
}));
""".strip(),
    )

    assert payload["activeIsSearch"] is True
    assert payload["activeValue"] == "微"
    assert payload["selectionStart"] == 1
    assert payload["selectionEnd"] == 1


def test_project_view_runs_runtime_tool_actions_from_cli_toolbar(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openImFeatureView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

initializeProjectView();
Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
        clipboard: {
            writeText(value) {
                globalThis.__copiedRuntimeToolPaths = globalThis.__copiedRuntimeToolPaths || [];
                globalThis.__copiedRuntimeToolPaths.push(value);
                return Promise.resolve();
            },
        },
    },
});
await openImFeatureView();
await flushTasks();
await flushTasks();

const beforeHtml = els.projectViewContent.innerHTML;
document.querySelector("[data-runtime-tools-system-path-add]")?.onclick?.();
await flushTasks();
document.querySelector("[data-runtime-tool-copy-path]")?.onclick?.();
await flushTasks();
document.querySelector("[data-runtime-tool-download]")?.onclick?.();
await flushTasks();

console.log(JSON.stringify({
    beforeHtml,
    copiedRuntimeToolPaths: globalThis.__copiedRuntimeToolPaths || [],
    downloadRequests: globalThis.__runtimeToolDownloadRequests || [],
    systemPathRequests: globalThis.__runtimeToolsSystemPathRequests || 0,
}));
""".strip(),
        mock_api_source="""
export async function fetchRuntimeTools() {
    return {
        items: [
            {
                tool_id: "rg",
                display_name: "ripgrep",
                status: "missing",
                download_job_id: "rg-job",
                path: "C:/bin/rg.exe",
            },
        ],
    };
}
""".strip(),
    )

    assert "data-runtime-tools-group" in str(payload["beforeHtml"])
    assert 'data-runtime-tool-card="rg"' in str(payload["beforeHtml"])
    assert 'data-runtime-tool-copy-path="rg"' in str(payload["beforeHtml"])
    assert 'data-runtime-tool-download="rg"' in str(payload["beforeHtml"])
    assert payload["copiedRuntimeToolPaths"] == ["C:/bin/rg.exe"]
    assert payload["downloadRequests"] == ["rg"]
    assert payload["systemPathRequests"] == 1


def test_project_view_can_reset_runtime_tools_system_path_after_added(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openImFeatureView,
} from "./projectView.mjs";
import { flushTasks } from "./mockDom.mjs";

globalThis.__showConfirmDialogResult = true;

initializeProjectView();
await openImFeatureView();
await flushTasks();
await flushTasks();

document.querySelector("[data-runtime-tools-system-path-add]")?.onclick?.();
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    confirmCalls: globalThis.__showConfirmDialogCalls || [],
    systemPathRequests: globalThis.__runtimeToolsSystemPathRequests || 0,
}));
""".strip(),
        mock_api_source="""
export async function fetchRuntimeTools() {
    return {
        items: [],
        system_path: {
            supported: true,
            added: true,
            bin_dir: "C:/Users/test/.relay-teams/bin",
        },
    };
}
""".strip(),
    )

    confirm_calls = cast(list[dict[str, object]], payload["confirmCalls"])

    assert len(confirm_calls) == 1
    assert (
        confirm_calls[0]["confirmLabel"] == "Reset"
        or confirm_calls[0]["confirmLabel"] == "重新设置"
    )
    assert payload["systemPathRequests"] == 1


def test_project_view_runtime_tool_polling_is_gateway_guarded() -> None:
    source = Path("frontend/dist/js/components/projectView.js").read_text(
        encoding="utf-8"
    )

    assert "currentFeatureViewId !== FEATURE_VIEW_IDS.gateway" in source
    assert source.count("currentFeatureViewId !== FEATURE_VIEW_IDS.gateway") >= 2


def test_project_view_runtime_tools_load_independently_from_connectors() -> None:
    source = Path("frontend/dist/js/components/projectView.js").read_text(
        encoding="utf-8"
    )

    assert "loadGatewayConnectors(request.token, request.signal)" in source
    assert "loadGatewayRuntimeTools(request.token, request.signal)" in source
    assert "Promise.allSettled(tasks)" in source
    assert "const [connectorsResponse, triggers" not in source
    assert "await fetchRuntimeTools({ signal });" in source


def test_project_view_surfaces_connector_load_failure_and_retries(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openImFeatureView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openImFeatureView();
await flushTasks();
await flushTasks();

const failedHtml = els.projectViewContent.innerHTML;
document.querySelector("[data-connectors-retry]")?.onclick?.();
await flushTasks();
await flushTasks();
const retriedHtml = els.projectViewContent.innerHTML;

console.log(JSON.stringify({
    failedHtml,
    retriedHtml,
    connectorFetchCalls: globalThis.__connectorFetchCalls || 0,
    logs: globalThis.__logs,
}));
""".strip(),
        mock_api_source="""
export async function fetchConnectors() {
    globalThis.__connectorFetchCalls = (globalThis.__connectorFetchCalls || 0) + 1;
    if (globalThis.__connectorFetchCalls === 1) {
        throw new Error("Gateway unavailable");
    }
    return {
        summary: { connected: 1, needs_config: 0, disabled: 0, error: 0, total: 1 },
        items: [
            {
                connector_id: "github",
                provider: "github",
                status: "connected",
                account_count: 1,
                enabled_count: 1,
                capabilities: ["repositories"],
            },
        ],
    };
}
""".strip(),
    )

    assert "data-connectors-error" in str(payload["failedHtml"])
    assert "Gateway unavailable" in str(payload["failedHtml"])
    assert "data-runtime-tools-group" in str(payload["failedHtml"])
    assert "Open Connector" in str(payload["retriedHtml"])
    assert "data-connectors-error" not in str(payload["retriedHtml"])
    assert payload["connectorFetchCalls"] == 2
    assert any(
        "Failed to load gateway connectors" in str(entry)
        for entry in cast(list[object], payload["logs"])
    )


def test_project_view_surfaces_runtime_tools_load_failure_and_retries(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openImFeatureView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openImFeatureView();
await flushTasks();
await flushTasks();

const failedHtml = els.projectViewContent.innerHTML;
document.querySelector("[data-runtime-tools-retry]")?.onclick?.();
await flushTasks();
await flushTasks();
const retriedHtml = els.projectViewContent.innerHTML;

console.log(JSON.stringify({
    failedHtml,
    retriedHtml,
    runtimeToolFetchCalls: globalThis.__runtimeToolFetchCalls || 0,
    logs: globalThis.__logs,
}));
""".strip(),
        mock_api_source="""
export async function fetchRuntimeTools() {
    globalThis.__runtimeToolFetchCalls = (globalThis.__runtimeToolFetchCalls || 0) + 1;
    if (globalThis.__runtimeToolFetchCalls === 1) {
        throw new Error("Runtime tools unavailable");
    }
    return {
        items: [
            {
                tool_id: "rg",
                display_name: "ripgrep",
                status: "missing",
            },
        ],
        system_path: {
            supported: true,
            added: false,
            bin_dir: "C:/Users/test/.relay-teams/bin",
        },
    };
}
""".strip(),
    )

    assert "data-runtime-tools-error" in str(payload["failedHtml"])
    assert "Runtime tools unavailable" in str(payload["failedHtml"])
    assert "data-runtime-tools-retry" in str(payload["failedHtml"])
    assert "data-runtime-tools-error" not in str(payload["retriedHtml"])
    assert 'data-runtime-tool-download="rg"' in str(payload["retriedHtml"])
    assert payload["runtimeToolFetchCalls"] == 2
    assert any(
        "Failed to load gateway runtime tools" in str(entry)
        for entry in cast(list[object], payload["logs"])
    )


def test_project_view_runtime_tool_download_start_is_gateway_guarded() -> None:
    source = Path("frontend/dist/js/components/projectView.js").read_text(
        encoding="utf-8"
    )

    start_index = source.index("async function handleDownloadRuntimeTool")
    poll_index = source.index("function pollRuntimeToolDownload")
    handler_source = source[start_index:poll_index]

    assert (
        handler_source.count("currentFeatureViewId !== FEATURE_VIEW_IDS.gateway") >= 2
    )


def test_project_view_runtime_tool_poll_refresh_is_gateway_guarded() -> None:
    source = Path("frontend/dist/js/components/projectView.js").read_text(
        encoding="utf-8"
    )

    start_index = source.index("function scheduleRuntimeToolDownloadPoll")
    end_index = source.index("function resumeRuntimeToolDownloadPolling")
    poll_source = source[start_index:end_index]

    assert "await refreshRuntimeToolsStatus();" in poll_source
    assert (
        "await refreshRuntimeToolsStatus();\n"
        "            if (currentFeatureViewId !== FEATURE_VIEW_IDS.gateway)"
        in poll_source
    )


def test_project_view_resumes_polling_existing_runtime_tool_jobs(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openImFeatureView,
} from "./projectView.mjs";
import { flushTasks } from "./mockDom.mjs";

const originalSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (callback, delay) => originalSetTimeout(callback, 0);
globalThis.window = globalThis;
window.setTimeout = globalThis.setTimeout;

initializeProjectView();
await openImFeatureView();
await flushTasks();
await new Promise(resolve => originalSetTimeout(resolve, 10));

console.log(JSON.stringify({
    polls: globalThis.__runtimeToolDownloadPolls || [],
}));
""".strip(),
        mock_api_source="""
export async function fetchRuntimeTools() {
    return {
        items: [
            {
                tool_id: "gh",
                display_name: "GitHub CLI",
                status: "downloading",
                download_job_id: "gh-job",
            },
        ],
    };
}
""".strip(),
    )

    assert payload["polls"] == ["gh-job"]


def test_project_view_delays_feature_loading_state_and_uses_feature_copy(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openSkillsFeatureView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

initializeProjectView();
let resolveConfigStatus = null;
globalThis.__deferredConfigStatusPromise = new Promise(resolve => {
    resolveConfigStatus = resolve;
});

const openPromise = openSkillsFeatureView();
await flushTasks();
const beforeDelay = {
    summary: els.projectViewSummary.textContent,
    contentHtml: els.projectViewContent.innerHTML,
};
await new Promise(resolve => setTimeout(resolve, 170));
const afterDelay = {
    summary: els.projectViewSummary.textContent,
    contentHtml: els.projectViewContent.innerHTML,
};
resolveConfigStatus({
    skills: {
        skills: [
            {
                name: "review",
                description: "Review changes.",
                ref: "review",
                path: "/skills/review",
                scope: "builtin",
            },
        ],
    },
});
await openPromise;
await flushTasks();

console.log(JSON.stringify({
    beforeDelay,
    afterDelay,
    finalSummary: els.projectViewSummary.textContent,
    finalContentHtml: els.projectViewContent.innerHTML,
}));
""".strip(),
    )

    before_delay = cast(dict[str, object], payload["beforeDelay"])
    after_delay = cast(dict[str, object], payload["afterDelay"])
    assert before_delay["summary"] == "Loading skills..."
    assert "feature-skills-market" in str(before_delay["contentHtml"])
    assert "Loading ClawHub skills" in str(
        before_delay["contentHtml"]
    ) or "No matching skills" in str(before_delay["contentHtml"])
    assert "Loading project snapshot" not in str(before_delay["contentHtml"])
    assert after_delay["summary"] == "Loading skills..."
    assert "feature-skills-market" in str(after_delay["contentHtml"])
    assert "Loading ClawHub skills" in str(
        after_delay["contentHtml"]
    ) or "No matching skills" in str(after_delay["contentHtml"])
    assert "Loading project snapshot" not in str(after_delay["contentHtml"])
    assert payload["finalSummary"] == "1 skills available"
    assert "Self-Improving Agent" not in str(payload["finalContentHtml"])
    assert "WorkBuddy" not in str(payload["finalContentHtml"])


def test_project_view_replaces_existing_feature_content_while_slow_feature_loads(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openAutomationHomeView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

initializeProjectView();
els.projectViewContent.innerHTML = '<div class="feature-page">Previous feature content</div>';
let resolveAutomationProjects = null;
globalThis.__deferredAutomationProjectsPromise = new Promise(resolve => {
    resolveAutomationProjects = resolve;
});

const openPromise = openAutomationHomeView();
await flushTasks();
await new Promise(resolve => setTimeout(resolve, 170));
const duringLoad = {
    summary: els.projectViewSummary.textContent,
    contentHtml: els.projectViewContent.innerHTML,
};
resolveAutomationProjects([]);
await openPromise;
await flushTasks();

console.log(JSON.stringify({
    duringLoad,
    finalContentHtml: els.projectViewContent.innerHTML,
}));
""".strip(),
    )

    during_load = cast(dict[str, object], payload["duringLoad"])
    assert during_load["summary"] == "Loading automation..."
    assert "Previous feature content" not in str(during_load["contentHtml"])
    assert "Loading automation" in str(during_load["contentHtml"])
    assert "Previous feature content" not in str(payload["finalContentHtml"])


def test_project_view_switches_from_boards_to_memory_without_surface_leak(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openBoardsFeatureView,
} from "./projectView.mjs";
import { openMemoryFeatureView } from "./memoryView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openBoardsFeatureView();
await flushTasks();
const toolbar = document.getElementById("project-view-toolbar");
const afterBoards = {
    contentHasBoardsClass: els.projectViewContent.classList.contains("is-boards-feature"),
    toolbarHidden: toolbar.classList.contains("is-hidden"),
    contentHtml: els.projectViewContent.innerHTML,
    unmountCalls: globalThis.__boardTodoUnmountCalls || 0,
};

await openMemoryFeatureView();
await flushTasks();
await flushTasks();
const afterMemory = {
    contentHasBoardsClass: els.projectViewContent.classList.contains("is-boards-feature"),
    toolbarHidden: toolbar.classList.contains("is-hidden"),
    contentHtml: els.projectViewContent.innerHTML,
    toolbarHtml: els.projectViewToolbarActions.innerHTML,
    unmountCalls: globalThis.__boardTodoUnmountCalls || 0,
};

console.log(JSON.stringify({ afterBoards, afterMemory }));
""".strip(),
    )

    after_boards = cast(dict[str, object], payload["afterBoards"])
    after_memory = cast(dict[str, object], payload["afterMemory"])
    assert after_boards["contentHasBoardsClass"] is True
    assert after_boards["toolbarHidden"] is True
    assert "board-todo-root" in str(after_boards["contentHtml"])
    assert after_memory["contentHasBoardsClass"] is False
    assert after_memory["toolbarHidden"] is False
    assert "memory-view-shell" in str(after_memory["contentHtml"])
    assert "memory-toolbar-controls" in str(after_memory["toolbarHtml"])
    assert "data-project-view-close" not in str(after_memory["toolbarHtml"])
    after_memory_unmounts = after_memory["unmountCalls"]
    after_boards_unmounts = after_boards["unmountCalls"]
    assert isinstance(after_memory_unmounts, int)
    assert isinstance(after_boards_unmounts, int)
    assert after_memory_unmounts > after_boards_unmounts

    memory_css = load_memory_css()
    assert ".memory-view-shell {" in memory_css
    assert "height: max(360px, calc(100vh - 324px));" in memory_css
    assert ".memory-list {" in memory_css
    assert "max-height: 100%;" in memory_css
    assert "scrollbar-gutter: stable;" in memory_css
    assert "scrollbar-width: thin;" in memory_css
    assert "::-webkit-scrollbar-button" in memory_css
    assert "::-webkit-scrollbar-thumb" in memory_css

    memory_source = load_memory_view_source()
    assert "captureMemoryScrollState()" in memory_source
    assert "restoreMemoryScrollState(scrollState)" in memory_source

    projects_css = load_frontend_file("css", "components", "projects.css")
    assert ".projects-workspace-scroll {" in projects_css
    assert ".projects-workspace-scroll::-webkit-scrollbar-button" in projects_css


def test_project_view_switches_from_memory_to_boards_without_toolbar_residue(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openBoardsFeatureView,
} from "./projectView.mjs";
import { openMemoryFeatureView } from "./memoryView.mjs";
import { state } from "./mockState.mjs";
import { els, flushTasks } from "./mockDom.mjs";

initializeProjectView();
state.currentWorkspaceId = "alpha-project";
await openMemoryFeatureView();
await flushTasks();
await flushTasks();
const toolbar = document.getElementById("project-view-toolbar");
const afterMemory = {
    contentHtml: els.projectViewContent.innerHTML,
    toolbarHtml: els.projectViewToolbarActions.innerHTML,
    toolbarHidden: toolbar.classList.contains("is-hidden"),
};

await openBoardsFeatureView();
await flushTasks();
const afterBoards = {
    contentHasBoardsClass: els.projectViewContent.classList.contains("is-boards-feature"),
    contentHtml: els.projectViewContent.innerHTML,
    toolbarHtml: els.projectViewToolbarActions.innerHTML,
    toolbarHidden: toolbar.classList.contains("is-hidden"),
    mountCalls: globalThis.__boardTodoMountCalls || [],
};

console.log(JSON.stringify({ afterMemory, afterBoards }));
""".strip(),
    )

    after_memory = cast(dict[str, object], payload["afterMemory"])
    after_boards = cast(dict[str, object], payload["afterBoards"])
    assert "memory-view-shell" in str(after_memory["contentHtml"])
    assert "memory-toolbar-controls" in str(after_memory["toolbarHtml"])
    assert "data-project-view-close" not in str(after_memory["toolbarHtml"])
    assert after_memory["toolbarHidden"] is False
    assert after_boards["contentHasBoardsClass"] is True
    assert after_boards["toolbarHidden"] is True
    assert "board-todo-root" in str(after_boards["contentHtml"])
    assert "memory-toolbar-controls" not in str(after_boards["toolbarHtml"])
    assert cast(list[dict[str, object]], after_boards["mountCalls"]) == [
        {"preferredWorkspaceId": "alpha-project"}
    ]


def test_board_todo_full_sync_bypasses_stale_delta_cache() -> None:
    source = (
        Path(__file__).resolve().parents[3]
        / "frontend"
        / "dist"
        / "js"
        / "components"
        / "boards"
        / "todoBoard.js"
    ).read_text(encoding="utf-8")

    assert "if (cached && sync && forceFull)" in source
    assert (
        "return syncBoardTodos({ workspaceId, includeArchived: archived });" in source
    )
    assert "function isStaleDeltaResponse(cached, response)" in source
    assert "? fetchBoardTodos({ workspaceId, includeArchived: archived })" in source


def test_project_view_opens_robot_dialog_in_gateway_feature(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openImFeatureView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openImFeatureView();
await flushTasks();
await flushTasks();

const addButton = document.querySelector("[data-feature-gateway-add-feishu]");
addButton?.onclick?.();
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    title: els.projectViewTitle.textContent,
    contentHtml: els.projectViewContent.innerHTML,
    modalHtml: globalThis.__bodyChildren.map(node => node.innerHTML).join("\\n"),
    showFormDialogCalls: globalThis.__showFormDialogCalls,
}));
""".strip(),
        mock_api_source="""
export async function disableAutomationProject() {
    return { status: "disabled" };
}

export async function enableAutomationProject() {
    return { status: "enabled" };
}

export async function createAutomationProject() {
    return { automation_project_id: "aut_new" };
}

export async function deleteAutomationProject() {
    return { status: "ok" };
}

export async function fetchAutomationProject() {
    throw new Error("not used");
}

export async function fetchAutomationFeishuBindings() {
    return [];
}

export async function fetchAutomationProjectSessions() {
    return [];
}

export async function fetchAutomationProjects() {
    if (globalThis.__deferredAutomationProjectsPromise) {
        return await globalThis.__deferredAutomationProjectsPromise;
    }
    return [];
}

export async function fetchWorkspaces() {
    return [{ workspace_id: "default", root_path: "/work/default" }];
}

export async function fetchWorkspaceSnapshot() {
    throw new Error("not used");
}

export async function fetchWorkspaceTree() {
    throw new Error("not used");
}

export async function fetchWorkspaceDiffs() {
    throw new Error("not used");
}

export async function fetchWorkspaceDiffFile() {
    throw new Error("not used");
}

export async function runAutomationProject() {
    return { status: "ok" };
}

export async function fetchConfigStatus() {
    if (globalThis.__deferredConfigStatusPromise) {
        return await globalThis.__deferredConfigStatusPromise;
    }
    return { skills: { skills: [] } };
}

export async function fetchOrchestrationConfig() {
    return { presets: [] };
}

export async function fetchRoleConfigOptions() {
    return { normal_mode_roles: [] };
}

export async function fetchTriggers() {
    return [];
}

export async function fetchWeChatGatewayAccounts() {
    return [];
}

export async function reloadSkillsConfig() {
    return { status: "ok" };
}

export async function createTrigger() {
    return { status: "ok" };
}

export async function updateTrigger() {
    return { status: "ok" };
}

export async function deleteTrigger() {
    return { status: "ok" };
}

export async function enableTrigger() {
    return { status: "ok" };
}

export async function disableTrigger() {
    return { status: "ok" };
}

export async function startWeChatGatewayLogin() {
    return { session_key: "wechat-login-1", qr_code_url: "https://example.test/qr.png" };
}

export async function waitWeChatGatewayLogin() {
    return { connected: true };
}

export async function updateWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function enableWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function disableWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function deleteWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function updateAutomationProject() {
    return { status: "ok" };
}
""".strip(),
    )

    assert payload["title"] == ""
    assert "connectors-page" in str(payload["contentHtml"])
    assert payload["showFormDialogCalls"] == []
    assert "data-feature-gateway-modal" in str(payload["modalHtml"])
    assert 'id="feishu-trigger-name-input"' in str(payload["modalHtml"])
    assert 'id="feishu-app-id-input"' in str(payload["modalHtml"])
    assert 'id="feishu-app-secret-input"' in str(payload["modalHtml"])
    assert 'id="toggle-feishu-app-secret-btn"' in str(payload["modalHtml"])
    assert "gateway-feishu-section-stack" in str(payload["modalHtml"])
    assert 'id="feishu-trigger-enabled-input"' not in str(payload["modalHtml"])
    assert 'id="feishu-trigger-name-input"' not in str(payload["contentHtml"])


def test_project_view_preserves_feishu_draft_after_deferred_trigger_load(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openImFeatureView,
} from "./projectView.mjs";
import { flushTasks } from "./mockDom.mjs";

let resolveTriggers = null;
globalThis.__deferredTriggersPromise = new Promise(resolve => {
    resolveTriggers = resolve;
});

initializeProjectView();
await openImFeatureView();
await flushTasks();
await flushTasks();

document.querySelector("[data-feature-gateway-add-feishu]")?.onclick?.();
await flushTasks();
document.getElementById("feishu-trigger-name-input").value = "Draft Feishu";
document.getElementById("feishu-trigger-name-input").oninput();
const beforeResolveHtml = globalThis.__bodyChildren.map(node => node.innerHTML).join("\\n");

resolveTriggers([
    {
        trigger_id: "feishu-existing",
        name: "Existing Feishu",
        kind: "feishu",
        status: "enabled",
        config: {
            app_id: "cli_a",
            app_secret: "secret",
            verification_token: "verify",
            encrypt_key: "encrypt",
        },
        target_config: {},
    },
]);
await flushTasks();
await flushTasks();
const afterResolveHtml = globalThis.__bodyChildren.map(node => node.innerHTML).join("\\n");

console.log(JSON.stringify({
    beforeResolveHtml,
    afterResolveHtml,
}));
""".strip(),
        mock_api_source="""
export async function fetchWorkspaces() {
    return [{ workspace_id: "default", root_path: "/work/default" }];
}

export async function fetchRoleConfigOptions() {
    return {
        normal_mode_roles: [
            {
                role_id: "role-dev",
                name: "Developer",
                enabled: true,
                mode: "normal",
            },
        ],
    };
}

export async function fetchTriggers(options = {}) {
    return await globalThis.__deferredTriggersPromise;
}
""".strip(),
    )

    assert 'id="feishu-trigger-name-input"' in str(payload["beforeResolveHtml"])
    assert 'value="Draft Feishu"' in str(payload["afterResolveHtml"])
    assert 'id="feishu-trigger-name-input"' in str(payload["afterResolveHtml"])


def test_project_view_manages_existing_feishu_connector_from_card(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openImFeatureView,
} from "./projectView.mjs";
import { flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openImFeatureView();
await flushTasks();
await flushTasks();

document.querySelector("[data-connector-open]")?.onclick?.();
await flushTasks();
const managementHtml = globalThis.__bodyChildren.map(node => node.innerHTML).join("\\n");
document.querySelector("[data-feature-feishu-edit]")?.onclick?.();
await flushTasks();

console.log(JSON.stringify({
    managementHtml,
    modalHtml: globalThis.__bodyChildren.map(node => node.innerHTML).join("\\n"),
}));
""".strip(),
        mock_api_source="""
export async function fetchConnectors() {
    return {
        summary: { connected: 1, needs_config: 0, disabled: 0, error: 0, total: 1 },
        items: [
            {
                connector_id: "feishu",
                provider: "feishu",
                category: "im",
                display_name: "Feishu",
                description: "Feishu",
                status: "connected",
                auth_type: "api_key",
                account_count: 1,
                enabled_count: 1,
                capabilities: ["messages"],
            },
        ],
    };
}

export async function fetchTriggers() {
    return [
            {
                trigger_id: "trg_feishu_1",
                name: "Existing Feishu",
                status: "enabled",
                tenant_key: "tenant-1",
                chat_id: "oc_123",
                callback_url: "http://localhost:9000/callback",
                source_config: { provider: "feishu", app_id: "cli_existing" },
                secret_status: { app_secret_configured: true },
            },
    ];
}
""".strip(),
    )

    assert "Existing Feishu" in str(payload["managementHtml"])
    assert "Connect Feishu" in str(payload["managementHtml"])
    assert "data-feature-gateway-add-feishu" not in str(payload["managementHtml"])
    assert "Test connection" not in str(payload["managementHtml"])
    assert 'id="feishu-trigger-name-input"' in str(payload["modalHtml"])
    assert "Existing Feishu" in str(payload["modalHtml"])


def test_project_view_preserves_shell_policy_when_updating_feishu_connector(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openImFeatureView,
} from "./projectView.mjs";
import { flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openImFeatureView();
await flushTasks();
await flushTasks();

document.querySelector("[data-connector-open]")?.onclick?.();
await flushTasks();
document.querySelector("[data-feature-feishu-edit]")?.onclick?.();
await flushTasks();
document.getElementById("feishu-trigger-name-input").value = "Existing Feishu";
document.getElementById("feishu-trigger-name-input").oninput();
document.querySelector("[data-feature-feishu-save]")?.onclick?.();
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    updateTriggerPayload: globalThis.__updateTriggerPayload,
}));
""".strip(),
        mock_api_source="""
export async function fetchConnectors() {
    return {
        summary: { connected: 1, needs_config: 0, disabled: 0, error: 0, total: 1 },
        items: [
            {
                connector_id: "feishu",
                provider: "feishu",
                category: "im",
                display_name: "Feishu",
                description: "Feishu",
                status: "connected",
                auth_type: "api_key",
                account_count: 1,
                enabled_count: 1,
                capabilities: ["messages"],
            },
        ],
    };
}

export async function fetchTriggers() {
    return [
        {
            trigger_id: "trg_feishu_1",
            name: "Existing Feishu",
            status: "enabled",
            tenant_key: "tenant-1",
            chat_id: "oc_123",
            callback_url: "http://localhost:9000/callback",
            source_config: { provider: "feishu", app_id: "cli_existing", app_name: "Agent Teams Bot" },
            target_config: {
                workspace_id: "default",
                session_mode: "normal",
                normal_root_role_id: "SpecCoder",
                yolo: true,
                shell_safety_policy_enabled: false,
                thinking: { enabled: false, effort: null },
            },
            secret_status: { app_secret_configured: true },
        },
    ];
}

export async function fetchWorkspaces() {
    return [{ workspace_id: "default", root_path: "/work/default" }];
}

export async function fetchRoleConfigOptions() {
    return { normal_mode_roles: [{ role_id: "SpecCoder", name: "SpecCoder" }] };
}

export async function fetchConfigStatus() {
    return { skills: { skills: [] } };
}

export async function fetchOrchestrationConfig() {
    return { presets: [] };
}

export async function updateTrigger(triggerId, payload) {
    globalThis.__updateTriggerPayload = { triggerId, payload };
    return { status: "ok" };
}
""".strip(),
    )

    update_trigger_payload = cast(dict[str, object], payload["updateTriggerPayload"])
    target_config = cast(
        dict[str, object],
        cast(dict[str, object], update_trigger_payload["payload"])["target_config"],
    )
    assert update_trigger_payload["triggerId"] == "trg_feishu_1"
    assert target_config["shell_safety_policy_enabled"] is False


def test_project_view_saves_new_feishu_connector_shell_policy(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openImFeatureView,
} from "./projectView.mjs";
import { flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openImFeatureView();
await flushTasks();
await flushTasks();

document.querySelector("[data-connector-open]")?.onclick?.();
await flushTasks();
document.querySelector("[data-feature-gateway-add-feishu]")?.onclick?.();
await flushTasks();
document.getElementById("feishu-trigger-name-input").value = "New Feishu";
document.getElementById("feishu-trigger-name-input").oninput();
document.getElementById("feishu-app-name-input").value = "Agent Teams Bot";
document.getElementById("feishu-app-name-input").oninput();
document.getElementById("feishu-app-id-input").value = "cli_new";
document.getElementById("feishu-app-id-input").oninput();
document.getElementById("feishu-app-secret-input").value = "secret";
document.getElementById("feishu-app-secret-input").oninput();
document.getElementById("feishu-trigger-shell-safety-policy-input").checked = false;
document.getElementById("feishu-trigger-shell-safety-policy-input").onchange();
document.querySelector("[data-feature-feishu-save]")?.onclick?.();
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    createTriggerPayload: globalThis.__createTriggerPayload,
}));
""".strip(),
        mock_api_source="""
export async function fetchConnectors() {
    return {
        summary: { connected: 0, needs_config: 1, disabled: 0, error: 0, total: 1 },
        items: [
            {
                connector_id: "feishu",
                provider: "feishu",
                category: "im",
                display_name: "Feishu",
                description: "Feishu",
                status: "needs_config",
                auth_type: "api_key",
                account_count: 0,
                enabled_count: 0,
                capabilities: ["messages"],
            },
        ],
    };
}

export async function fetchTriggers() {
    return [];
}

export async function fetchWorkspaces() {
    return [{ workspace_id: "default", root_path: "/work/default" }];
}

export async function fetchRoleConfigOptions() {
    return { normal_mode_roles: [{ role_id: "SpecCoder", name: "SpecCoder" }] };
}

export async function fetchConfigStatus() {
    return { skills: { skills: [] } };
}

export async function fetchOrchestrationConfig() {
    return { presets: [] };
}

export async function createTrigger(payload) {
    globalThis.__createTriggerPayload = payload;
    return { status: "ok" };
}
""".strip(),
    )

    create_trigger_payload = cast(dict[str, object], payload["createTriggerPayload"])
    target_config = cast(dict[str, object], create_trigger_payload["target_config"])
    assert target_config["shell_safety_policy_enabled"] is False


def test_project_view_adds_feishu_connector_from_empty_card(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openImFeatureView,
} from "./projectView.mjs";
import { flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openImFeatureView();
await flushTasks();
await flushTasks();

document.querySelector("[data-connector-open]")?.onclick?.();
await flushTasks();

console.log(JSON.stringify({
    modalHtml: globalThis.__bodyChildren.map(node => node.innerHTML).join("\\n"),
}));
""".strip(),
        mock_api_source="""
export async function fetchConnectors() {
    return {
        summary: { connected: 0, needs_config: 1, disabled: 0, error: 0, total: 1 },
        items: [
            {
                connector_id: "feishu",
                provider: "feishu",
                category: "im",
                display_name: "Feishu",
                description: "Feishu",
                status: "needs_config",
                auth_type: "api_key",
                account_count: 0,
                enabled_count: 0,
                capabilities: ["messages"],
            },
        ],
    };
}

export async function fetchTriggers() {
    return [];
}

export async function fetchWorkspaces() {
    return [{ workspace_id: "default", root_path: "/work/default" }];
}
""".strip(),
    )

    assert 'id="feishu-trigger-name-input"' in str(payload["modalHtml"])
    assert 'id="feishu-trigger-shell-safety-policy-input"' in str(payload["modalHtml"])


def test_project_view_enables_disabled_wechat_connector_from_management_modal(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openImFeatureView,
} from "./projectView.mjs";
import { flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openImFeatureView();
await flushTasks();
await flushTasks();

document.querySelector("[data-connector-open]")?.onclick?.();
await flushTasks();
const managementHtml = globalThis.__bodyChildren.map(node => node.innerHTML).join("\\n");
document.querySelector("[data-feature-wechat-toggle]")?.onclick?.();
await flushTasks();

console.log(JSON.stringify({
    managementHtml,
    enabledAccountId: globalThis.__enabledWeChatAccountId || "",
}));
""".strip(),
        mock_api_source="""
export async function fetchConnectors() {
    return {
        summary: { connected: 0, needs_config: 0, disabled: 1, error: 0, total: 1 },
        items: [
            {
                connector_id: "wechat",
                provider: "wechat",
                category: "im",
                display_name: "WeChat",
                description: "WeChat",
                status: "disabled",
                auth_type: "qr_login",
                account_count: 1,
                enabled_count: 0,
                capabilities: ["direct_messages"],
            },
        ],
    };
}

export async function fetchWeChatGatewayAccounts() {
    return [
        {
            account_id: "wechat_disabled",
            display_name: "Disabled WeChat",
            status: "disabled",
            workspace_id: "workspace-1",
        },
    ];
}

export async function enableWeChatGatewayAccount(accountId) {
    globalThis.__enabledWeChatAccountId = accountId;
    return { account_id: accountId, status: "enabled" };
}
""".strip(),
    )

    assert payload["enabledAccountId"] == "wechat_disabled"
    assert "Disabled WeChat" in str(payload["managementHtml"])
    assert "Connect WeChat" in str(payload["managementHtml"])
    assert "data-feature-gateway-connect-wechat" not in str(payload["managementHtml"])
    assert "Test connection" not in str(payload["managementHtml"])


def test_project_view_manages_existing_xiaoluban_connector_from_card(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openImFeatureView,
} from "./projectView.mjs";
import { flushTasks } from "./mockDom.mjs";

globalThis.__showFormDialogResult = null;

initializeProjectView();
await openImFeatureView();
await flushTasks();
await flushTasks();

document.querySelector("[data-connector-open]")?.onclick?.();
await flushTasks();
const managementHtml = globalThis.__bodyChildren.map(node => node.innerHTML).join("\\n");
globalThis.__bodyChildren[0]?.querySelector("[data-feature-xiaoluban-edit]")?.onclick?.();
await flushTasks();

const dialogCall = globalThis.__showFormDialogCalls.at(-1) || {};
const fields = Array.isArray(dialogCall.fields) ? dialogCall.fields : [];

console.log(JSON.stringify({
    managementHtml,
    fieldIds: fields.map(field => field.id),
    displayNameValue: String((fields.find(field => field.id === "display_name") || {}).value || ""),
}));
""".strip(),
        mock_api_source="""
export async function fetchConnectors() {
    return {
        summary: { connected: 1, needs_config: 0, disabled: 0, error: 0, total: 1 },
        items: [
            {
                connector_id: "xiaoluban",
                provider: "xiaoluban",
                category: "im",
                display_name: "Xiaoluban",
                description: "Xiaoluban",
                status: "connected",
                auth_type: "api_token",
                account_count: 1,
                enabled_count: 1,
                capabilities: ["im_forwarding"],
            },
        ],
    };
}

export async function fetchXiaolubanGatewayAccounts() {
    return [
        {
            account_id: "xlb_1",
            display_name: "Existing Xiaoluban",
            base_url: "http://127.0.0.1:18080/send",
            status: "enabled",
            derived_uid: "uid_self",
            secret_status: { token_configured: true },
            im_config: { workspace_id: "workspace-1" },
        },
    ];
}
""".strip(),
    )

    field_ids = cast(list[str], payload["fieldIds"])
    assert "Existing Xiaoluban" in str(payload["managementHtml"])
    assert "Connect Xiaoluban" in str(payload["managementHtml"])
    assert "data-feature-gateway-add-xiaoluban" not in str(payload["managementHtml"])
    assert "Test connection" not in str(payload["managementHtml"])
    assert "display_name" in field_ids
    assert payload["displayNameValue"] == "Existing Xiaoluban"


def test_project_view_enables_disabled_xiaoluban_connector_from_management_modal(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openImFeatureView,
} from "./projectView.mjs";
import { flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openImFeatureView();
await flushTasks();
await flushTasks();

document.querySelector("[data-connector-open]")?.onclick?.();
await flushTasks();
globalThis.__bodyChildren[0]?.querySelector("[data-feature-xiaoluban-toggle]")?.onclick?.();
await flushTasks();

console.log(JSON.stringify({
    enabledAccountId: globalThis.__enabledXiaolubanAccountId || "",
}));
""".strip(),
        mock_api_source="""
export async function fetchConnectors() {
    return {
        summary: { connected: 0, needs_config: 0, disabled: 1, error: 0, total: 1 },
        items: [
            {
                connector_id: "xiaoluban",
                provider: "xiaoluban",
                category: "im",
                display_name: "Xiaoluban",
                description: "Xiaoluban",
                status: "disabled",
                auth_type: "api_token",
                account_count: 1,
                enabled_count: 0,
                capabilities: ["im_forwarding"],
            },
        ],
    };
}

export async function fetchXiaolubanGatewayAccounts() {
    return [
        {
            account_id: "xlb_disabled",
            display_name: "Disabled Xiaoluban",
            base_url: "http://127.0.0.1:18080/send",
            status: "disabled",
            secret_status: { token_configured: true },
            im_config: { workspace_id: "workspace-1" },
        },
    ];
}
""".strip(),
    )

    assert payload["enabledAccountId"] == "xlb_disabled"


def test_project_view_opens_wechat_connect_modal_in_gateway_feature(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openImFeatureView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openImFeatureView();
await flushTasks();
await flushTasks();

const connectButton = document.querySelector("[data-feature-gateway-connect-wechat]");
connectButton?.onclick?.();
await flushTasks();
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    title: els.projectViewTitle.textContent,
    contentHtml: els.projectViewContent.innerHTML,
    modalHtml: globalThis.__bodyChildren.map(node => node.innerHTML).join("\\n"),
}));
""".strip(),
        mock_api_source="""
export async function disableAutomationProject() {
    return { status: "disabled" };
}

export async function enableAutomationProject() {
    return { status: "enabled" };
}

export async function createAutomationProject() {
    return { automation_project_id: "aut_new" };
}

export async function deleteAutomationProject() {
    return { status: "ok" };
}

export async function fetchAutomationProject() {
    throw new Error("not used");
}

export async function fetchAutomationFeishuBindings() {
    return [];
}

export async function fetchAutomationProjectSessions() {
    return [];
}

export async function fetchAutomationProjects() {
    if (globalThis.__deferredAutomationProjectsPromise) {
        return await globalThis.__deferredAutomationProjectsPromise;
    }
    return [];
}

export async function fetchWorkspaces() {
    return [{ workspace_id: "default", root_path: "/work/default" }];
}

export async function fetchWorkspaceSnapshot() {
    throw new Error("not used");
}

export async function fetchWorkspaceTree() {
    throw new Error("not used");
}

export async function fetchWorkspaceDiffs() {
    throw new Error("not used");
}

export async function fetchWorkspaceDiffFile() {
    throw new Error("not used");
}

export async function runAutomationProject() {
    return { status: "ok" };
}

export async function fetchConfigStatus() {
    if (globalThis.__deferredConfigStatusPromise) {
        return await globalThis.__deferredConfigStatusPromise;
    }
    return { skills: { skills: [] } };
}

export async function fetchOrchestrationConfig() {
    return { presets: [] };
}

export async function fetchRoleConfigOptions() {
    return { normal_mode_roles: [] };
}

export async function fetchTriggers() {
    return [];
}

export async function fetchWeChatGatewayAccounts() {
    return [];
}

export async function reloadSkillsConfig() {
    return { status: "ok" };
}

export async function createTrigger() {
    return { status: "ok" };
}

export async function updateTrigger() {
    return { status: "ok" };
}

export async function deleteTrigger() {
    return { status: "ok" };
}

export async function enableTrigger() {
    return { status: "ok" };
}

export async function disableTrigger() {
    return { status: "ok" };
}

export async function startWeChatGatewayLogin() {
    return { session_key: "wechat-login-1", qr_code_url: "https://example.test/qr.png" };
}

export async function waitWeChatGatewayLogin() {
    return { connected: false, message: "Login failed." };
}

export async function updateWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function enableWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function disableWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function deleteWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function updateAutomationProject() {
    return { status: "ok" };
}
""".strip(),
    )

    assert payload["title"] == ""
    assert "connectors-page" in str(payload["contentHtml"])
    assert "data-feature-wechat-modal" in str(payload["modalHtml"])
    assert "https://example.test/qr.png" in str(payload["modalHtml"])
    assert "gateway-qr-card" not in str(payload["contentHtml"])


def test_project_view_renders_xiaoluban_section_and_creates_account(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openImFeatureView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

globalThis.__showFormDialogResult = {
    token: "uid_self_1234567890abcdef1234567890ab",
    xiaoluban_im_workspace_id: "workspace-1",
};

initializeProjectView();
await openImFeatureView();
await flushTasks();
await flushTasks();

document.querySelector("[data-feature-gateway-add-xiaoluban]")?.onclick?.();
await flushTasks();
await flushTasks();

const dialogCall = globalThis.__showFormDialogCalls.at(-1) || {};
const fields = Array.isArray(dialogCall.fields) ? dialogCall.fields : [];

console.log(JSON.stringify({
    title: els.projectViewTitle.textContent,
    contentHtml: els.projectViewContent.innerHTML,
    createdPayload: globalThis.__createdXiaolubanAccountPayload || null,
    updatedImPayload: globalThis.__updatedXiaolubanImPayload || null,
    toastCalls: globalThis.__toastCalls || [],
    showFormDialogCalls: globalThis.__showFormDialogCalls || [],
    fieldIds: fields.map(field => field.id),
    displayNameValue: String((fields.find(field => field.id === "display_name") || {}).value || ""),
    workspaceField: fields.find(field => field.id === "notification_workspace_ids") || null,
}));
""".strip(),
        mock_api_source="""
export async function fetchTriggers() {
    return [];
}

export async function fetchWorkspaces() {
    return [{ workspace_id: "workspace-1", name: "Main Workspace" }];
}

export async function fetchXiaolubanGatewayAccounts() {
    return [
        {
            account_id: "xlb_1",
            display_name: "Self Notify",
            base_url: "http://127.0.0.1:18080/send",
            status: "enabled",
            derived_uid: "uid_self",
            notification_workspace_ids: Array.from({ length: 30 }, (_, index) => `workspace-long-id-${String(index + 1).padStart(3, "0")}`),
            notification_receiver: "group-123",
            secret_status: { token_configured: true },
        },
    ];
}

export async function fetchWeChatGatewayAccounts() {
    return [];
}

export async function createXiaolubanGatewayAccount(payload) {
    globalThis.__createdXiaolubanAccountPayload = payload;
    return {
        account_id: "xlb_new",
        display_name: payload?.display_name || "Xiaoluban Main",
        base_url: payload?.base_url || "",
        status: payload?.enabled === false ? "disabled" : "enabled",
        derived_uid: "uid_self",
        secret_status: { token_configured: true },
    };
}
""".strip(),
    )

    assert payload["title"] == ""
    assert "connectors-page" in str(payload["contentHtml"])
    assert "Xiaoluban" in str(payload["contentHtml"])
    assert "Self Notify" in str(payload["contentHtml"])
    assert "Internal ID: xlb_1" in str(payload["contentHtml"])
    assert "Notify: self + 1 groups" in str(payload["contentHtml"])
    assert "30 workspaces" in str(payload["contentHtml"])
    assert "workspace-long-id-001" not in str(payload["contentHtml"])
    assert "workspace-long-id-030" not in str(payload["contentHtml"])
    assert "data-feature-gateway-add-xiaoluban" in str(payload["contentHtml"])
    assert "http://127.0.0.1:18080/send" not in str(payload["contentHtml"])
    assert str(payload["contentHtml"]).find("WeChat") < str(
        payload["contentHtml"]
    ).find("Xiaoluban")
    assert payload["createdPayload"] == {
        "display_name": "Xiaoluban",
        "notification_workspace_ids": [],
        "notification_receivers": [],
        "notify_self": True,
        "token": "uid_self_1234567890abcdef1234567890ab",
        "im_config": {
            "workspace_id": "workspace-1",
        },
    }
    assert payload["showFormDialogCalls"] != []
    assert payload["fieldIds"] == [
        "display_name",
        "token",
        "notification_workspace_ids",
        "notification_receivers",
        "xiaoluban_im_workspace_id",
    ]
    show_form_calls = cast(list[dict[str, object]], payload["showFormDialogCalls"])
    fields = cast(list[dict[str, object]], show_form_calls[-1]["fields"])
    receivers_field = next(
        field for field in fields if field["id"] == "notification_receivers"
    )
    assert receivers_field["compact"] is True
    assert receivers_field["rows"] == 2
    assert payload["displayNameValue"] == "Xiaoluban"
    workspace_field = cast(dict[str, object], payload["workspaceField"])
    workspace_options = cast(list[dict[str, object]], workspace_field["options"])
    assert workspace_options[0]["value"] == "__no_xiaoluban_notification_workspaces__"
    assert workspace_field["value"] == ["__no_xiaoluban_notification_workspaces__"]
    assert workspace_field["summaryMode"] == "count"
    assert (
        workspace_field["summaryKey"]
        == "settings.gateway.xiaoluban_notification_workspace_count"
    )
    assert (
        workspace_field["summaryAllValue"]
        == "__all_xiaoluban_notification_workspaces__"
    )
    assert (
        workspace_field["summaryNoneValue"]
        == "__no_xiaoluban_notification_workspaces__"
    )
    toast_calls = cast(list[dict[str, object]], payload["toastCalls"])
    assert (
        toast_calls[-1]["message"]
        == "Saved. Send this in WeLink Xiaoluban to enter the local Relay Teams session: http://10.88.1.23:9009/xlb_new g"
    )


def test_project_view_renders_discord_section_and_creates_account(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openImFeatureView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

initializeProjectView();
await openImFeatureView();
await flushTasks();
await flushTasks();

document.querySelector("[data-feature-gateway-add-discord]")?.onclick?.();
await flushTasks();
await flushTasks();

const modalHtmlBeforeSave = globalThis.__bodyChildren.map(node => node.innerHTML).join("\\n");
const defaultDisplayName = document.getElementById("discord-display-name-input").value;
document.getElementById("discord-display-name-input").value = "Discord Bot";
document.getElementById("discord-bot-token-input").value = "discord-token";
document.getElementById("discord-application-id-input").value = "app-1";
document.getElementById("discord-workspace-id-input").value = "workspace-1";
document.getElementById("discord-session-mode-input").value = "normal";
document.getElementById("discord-normal-root-role-id-input").value = "role-1";
document.getElementById("discord-allowed-channel-ids-input").value = "chan-1\\nchan-2,chan-1";
document.getElementById("discord-allow-channel-messages-input").checked = true;
document.getElementById("discord-yolo-input").checked = false;
document.getElementById("discord-shell-safety-policy-input").checked = false;
document.getElementById("discord-thinking-enabled-input").checked = true;
document.getElementById("discord-thinking-effort-input").value = "high";
document.getElementById("discord-enabled-input").checked = true;
document.querySelector("[data-feature-discord-save]")?.onclick?.();
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    title: els.projectViewTitle.textContent,
    summary: els.projectViewSummary.textContent,
    contentHtml: els.projectViewContent.innerHTML,
    modalHtmlBeforeSave,
    defaultDisplayName,
    createdPayload: globalThis.__createdDiscordAccountPayload || null,
    showFormDialogCalls: globalThis.__showFormDialogCalls || [],
    toastCalls: globalThis.__toastCalls || [],
}));
""".strip(),
        mock_api_source="""
export async function fetchTriggers() {
    return [];
}

export async function fetchWorkspaces() {
    return [{ workspace_id: "workspace-1", name: "Main Workspace" }];
}

export async function fetchRoleConfigOptions() {
    return [{ role_id: "role-1", name: "Root Role" }];
}

export async function fetchDiscordGatewayAccounts() {
    return [
        {
            account_id: "discord_1",
            display_name: "Existing Discord",
            status: "enabled",
            application_id: "app-existing",
            allowed_channel_ids: ["chan-9"],
            workspace_id: "workspace-1",
            secret_status: { bot_token_configured: true },
            running: true,
        },
    ];
}

export async function fetchWeChatGatewayAccounts() {
    return [];
}

export async function fetchXiaolubanGatewayAccounts() {
    return [];
}

export async function createDiscordGatewayAccount(payload) {
    globalThis.__createdDiscordAccountPayload = payload;
    return { account_id: "discord_new", display_name: payload?.display_name || "Discord" };
}
""".strip(),
    )

    assert payload["title"] == ""
    assert payload["summary"] == ""
    assert "connectors-page" in str(payload["contentHtml"])
    assert "data-feature-gateway-add-discord" in str(payload["contentHtml"])
    assert payload["showFormDialogCalls"] == []
    modal_html = str(payload["modalHtmlBeforeSave"])
    assert payload["defaultDisplayName"] == "Discord Bot"
    assert "gateway-discord-modal-content" in modal_html
    assert "gateway-discord-token-link" in modal_html
    assert 'id="toggle-discord-bot-token-btn"' in modal_html
    assert "https://discord.com/developers/applications" in modal_html
    assert "gateway-discord-channel-card" in modal_html
    assert "gateway-toggle-grid" in modal_html
    assert 'id="discord-yolo-input"' in modal_html
    assert 'id="discord-shell-safety-policy-input"' in modal_html
    assert 'id="discord-thinking-enabled-input"' in modal_html
    assert 'id="discord-thinking-effort-input"' in modal_html
    assert modal_html.index("Discord Routing") < modal_html.index(
        "Session Configuration"
    )
    assert payload["createdPayload"] == {
        "display_name": "Discord Bot",
        "application_id": "app-1",
        "allowed_channel_ids": ["chan-1", "chan-2"],
        "allow_channel_messages": True,
        "workspace_id": "workspace-1",
        "session_mode": "normal",
        "yolo": False,
        "shell_safety_policy_enabled": False,
        "thinking": {
            "enabled": True,
            "effort": "high",
        },
        "normal_root_role_id": "role-1",
        "orchestration_preset_id": None,
        "enabled": True,
        "bot_token": "discord-token",
    }
    toast_calls = cast(list[dict[str, object]], payload["toastCalls"])
    assert toast_calls[-1]["message"] == "Discord account saved."


def test_project_view_creates_xiaoluban_account_when_prepare_fails(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openImFeatureView,
} from "./projectView.mjs";
import { flushTasks } from "./mockDom.mjs";

globalThis.__showFormDialogResult = {
    token: "uid_self_1234567890abcdef1234567890ab",
    xiaoluban_im_workspace_id: "workspace-1",
};

initializeProjectView();
await openImFeatureView();
await flushTasks();
await flushTasks();

document.querySelector("[data-feature-gateway-add-xiaoluban]")?.onclick?.();
await flushTasks();
await flushTasks();

const dialogCall = globalThis.__showFormDialogCalls.at(-1) || {};
const fields = Array.isArray(dialogCall.fields) ? dialogCall.fields : [];

console.log(JSON.stringify({
    createdPayload: globalThis.__createdXiaolubanAccountPayload || null,
    showFormDialogCalls: globalThis.__showFormDialogCalls || [],
    fieldIds: fields.map(field => field.id),
    dialogMessage: dialogCall.message || "",
    warnLogs: globalThis.__warnLogs || [],
}));
""".strip(),
        mock_api_source="""
export async function fetchTriggers() {
    return [];
}

export async function fetchWorkspaces() {
    return [{ workspace_id: "workspace-1", name: "Main Workspace" }];
}

export async function fetchXiaolubanGatewayAccounts() {
    return [];
}

export async function fetchWeChatGatewayAccounts() {
    return [];
}

export async function prepareXiaolubanGatewayAccount() {
    throw new Error("xiaoluban_im_listener_host_unavailable");
}

export async function createXiaolubanGatewayAccount(payload) {
    globalThis.__createdXiaolubanAccountPayload = payload;
    return {
        account_id: "xlb_new",
        display_name: payload?.display_name || "Xiaoluban",
        derived_uid: "uid_self",
        secret_status: { token_configured: true },
    };
}
""".strip(),
    )

    assert payload["showFormDialogCalls"] != []
    assert payload["fieldIds"] == [
        "display_name",
        "token",
        "notification_workspace_ids",
        "notification_receivers",
        "xiaoluban_im_workspace_id",
    ]
    assert payload["dialogMessage"] == ""
    assert payload["createdPayload"] == {
        "display_name": "Xiaoluban",
        "notification_workspace_ids": [],
        "notification_receivers": [],
        "notify_self": True,
        "token": "uid_self_1234567890abcdef1234567890ab",
        "im_config": {
            "workspace_id": "workspace-1",
        },
    }
    assert "Failed to prepare Xiaoluban account" in str(payload["warnLogs"])


def test_project_view_hides_prepared_forwarding_command_when_listener_is_stopped(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openImFeatureView,
} from "./projectView.mjs";
import { flushTasks } from "./mockDom.mjs";

globalThis.__showFormDialogResult = {
    token: "uid_self_1234567890abcdef1234567890ab",
    xiaoluban_im_workspace_id: "workspace-1",
};

initializeProjectView();
await openImFeatureView();
await flushTasks();
await flushTasks();

document.querySelector("[data-feature-gateway-add-xiaoluban]")?.onclick?.();
await flushTasks();
await flushTasks();

const dialogCall = globalThis.__showFormDialogCalls.at(-1) || {};
const fields = Array.isArray(dialogCall.fields) ? dialogCall.fields : [];

console.log(JSON.stringify({
    createdPayload: globalThis.__createdXiaolubanAccountPayload || null,
    fieldIds: fields.map(field => field.id),
    forwardingCommandValue: (fields.find(field => field.id === "forwarding_command") || {}).value || "",
    dialogMessage: dialogCall.message || "",
}));
""".strip(),
        mock_api_source="""
export async function fetchTriggers() {
    return [];
}

export async function fetchWorkspaces() {
    return [{ workspace_id: "workspace-1", name: "Main Workspace" }];
}

export async function fetchXiaolubanGatewayAccounts() {
    return [];
}

export async function fetchWeChatGatewayAccounts() {
    return [];
}

export async function prepareXiaolubanGatewayAccount() {
    return {
        account_id: "xlb_abcdef123456",
        forwarding_command: "http://10.88.1.23:9009/xlb_abcdef123456 g",
        listener_running: false,
    };
}

export async function createXiaolubanGatewayAccount(payload) {
    globalThis.__createdXiaolubanAccountPayload = payload;
    return {
        account_id: payload?.account_id || "xlb_new",
        display_name: payload?.display_name || "Xiaoluban",
        derived_uid: "uid_self",
        secret_status: { token_configured: true },
    };
}
""".strip(),
    )

    assert payload["fieldIds"] == [
        "display_name",
        "token",
        "notification_workspace_ids",
        "notification_receivers",
        "xiaoluban_im_workspace_id",
    ]
    assert payload["forwardingCommandValue"] == ""
    assert "xlb_abcdef123456" in str(payload["dialogMessage"])
    assert payload["createdPayload"] == {
        "display_name": "Xiaoluban",
        "notification_workspace_ids": [],
        "notification_receivers": [],
        "notify_self": True,
        "account_id": "xlb_abcdef123456",
        "token": "uid_self_1234567890abcdef1234567890ab",
        "im_config": {
            "workspace_id": "workspace-1",
        },
    }


def test_project_view_updates_toggles_and_deletes_xiaoluban_account(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openImFeatureView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

globalThis.__showFormDialogResult = {
    display_name: "Self Notify Updated",
    token: "",
    xiaoluban_im_workspace_id: "workspace-1",
};

initializeProjectView();
await openImFeatureView();
await flushTasks();
await flushTasks();

els.projectViewContent.querySelector('[data-feature-xiaoluban-edit]')?.onclick?.();
await flushTasks();
await flushTasks();

const dialogCall = globalThis.__showFormDialogCalls.at(-1) || {};
const fields = dialogCall.fields || [];

els.projectViewContent.querySelector('[data-feature-xiaoluban-toggle]')?.onclick?.();
await flushTasks();
await flushTasks();

els.projectViewContent.querySelector('[data-feature-xiaoluban-delete]')?.onclick?.();
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    updatedPayload: globalThis.__updatedXiaolubanAccountPayload || null,
    updatedImPayload: globalThis.__updatedXiaolubanImPayload || null,
    disabledAccountId: globalThis.__disabledXiaolubanAccountId || null,
    deletedAccountId: globalThis.__deletedXiaolubanAccountId || null,
    editDialogMessage: dialogCall.message || "",
    tokenFieldPlaceholder: fields.find(field => field.id === "token")?.placeholder || "",
    tokenFieldDescription: fields.find(field => field.id === "token")?.description || "",
    receiverFieldPlaceholder: fields.find(field => field.id === "notification_receivers")?.placeholder || "",
    receiverFieldDescription: fields.find(field => field.id === "notification_receivers")?.description || "",
    toastCalls: globalThis.__toastCalls || [],
}));
""".strip(),
        mock_api_source="""
export async function fetchTriggers() {
    return [];
}

export async function fetchWorkspaces() {
    return [{ workspace_id: "workspace-1", name: "Main Workspace" }];
}

export async function fetchXiaolubanGatewayAccounts() {
    return [
        {
            account_id: "xlb_1",
            display_name: "Self Notify",
            base_url: "http://127.0.0.1:18080/send",
            status: "enabled",
            derived_uid: "uid_self",
            im_config: {
                workspace_id: "workspace-1",
            },
            secret_status: { token_configured: true },
        },
    ];
}

export async function fetchWeChatGatewayAccounts() {
    return [];
}

export async function updateXiaolubanGatewayAccount(accountId, payload) {
    globalThis.__updatedXiaolubanAccountPayload = { accountId, payload };
    return {
        account_id: accountId,
        display_name: payload?.display_name || "Self Notify Updated",
        base_url: payload?.base_url || "",
        status: payload?.enabled === false ? "disabled" : "enabled",
        derived_uid: "uid_self",
        secret_status: { token_configured: true },
    };
}

export async function disableXiaolubanGatewayAccount(accountId) {
    globalThis.__disabledXiaolubanAccountId = accountId;
    return { account_id: accountId, status: "disabled" };
}

export async function deleteXiaolubanGatewayAccount(accountId) {
    globalThis.__deletedXiaolubanAccountId = accountId;
    return { status: "ok" };
}
""".strip(),
    )

    assert payload["updatedPayload"] == {
        "accountId": "xlb_1",
        "payload": {
            "display_name": "Self Notify Updated",
            "notification_workspace_ids": [],
            "notification_receivers": [],
            "notify_self": True,
            "im_config": {
                "workspace_id": "workspace-1",
            },
        },
    }
    assert payload["disabledAccountId"] == "xlb_1"
    assert payload["deletedAccountId"] == "xlb_1"
    assert "Internal ID: xlb_1" in str(payload["editDialogMessage"])
    assert "Trigger:" not in str(payload["editDialogMessage"])
    assert (
        payload["tokenFieldPlaceholder"] == "Personal token saved, re-enter to update"
    )
    assert (
        payload["tokenFieldDescription"]
        == "A personal token is saved. Leave the masked value as-is to keep it, or reveal and replace it to update."
    )
    assert payload["receiverFieldPlaceholder"] == "Group IDs, one per line"
    assert (
        payload["receiverFieldDescription"]
        == "Optional extra recipients. Use new lines, commas, or semicolons to enter multiple groups."
    )
    toast_calls = cast(list[dict[str, object]], payload["toastCalls"])
    assert (
        toast_calls[0]["message"]
        == "Saved. Send this in WeLink Xiaoluban to enter the local Relay Teams session: http://10.88.1.23:9009/xlb_1 g"
    )
    assert toast_calls[-1]["message"] == "Xiaoluban account deleted."


def test_project_view_configures_xiaoluban_im_forwarding(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openImFeatureView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

globalThis.__showFormDialogResult = {
    display_name: "Self Notify",
    token: "",
    notification_workspace_ids: ["workspace-1"],
    notification_receivers: "group-123",
    xiaoluban_im_workspace_id: "workspace-2",
};

initializeProjectView();
await openImFeatureView();
await flushTasks();
await flushTasks();

els.projectViewContent.querySelector('[data-feature-xiaoluban-edit]')?.onclick?.();
await flushTasks();
await flushTasks();

const dialogCall = globalThis.__showFormDialogCalls.at(-1) || {};
const fields = Array.isArray(dialogCall.fields) ? dialogCall.fields : [];

console.log(JSON.stringify({
    contentHtml: els.projectViewContent.innerHTML,
    updatedAccountPayload: globalThis.__updatedXiaolubanAccountPayload || null,
    updatedImPayload: globalThis.__updatedXiaolubanImPayload || null,
    forwardingAccountId: globalThis.__xiaolubanForwardingAccountId || null,
    dialogTitle: dialogCall.title || "",
    dialogMessage: dialogCall.message || "",
    fieldIds: fields.map(field => field.id),
    workspaceOptions: (fields.find(field => field.id === "xiaoluban_im_workspace_id") || {}).options || [],
    workspaceDescription: (fields.find(field => field.id === "xiaoluban_im_workspace_id") || {}).description || "",
    forwardingCommandValue: (fields.find(field => field.id === "forwarding_command") || {}).value || "",
    forwardingCommandDescription: (fields.find(field => field.id === "forwarding_command") || {}).description || "",
    toastCalls: globalThis.__toastCalls || [],
}));
""".strip(),
        mock_api_source="""
export async function fetchTriggers() {
    return [];
}

export async function fetchWorkspaces() {
    return [
        { workspace_id: "workspace-1", name: "Main Workspace" },
        { workspace_id: "workspace-2", name: "IM Workspace" },
    ];
}

export async function fetchXiaolubanGatewayAccounts() {
    return [
        {
            account_id: "xlb_1",
            display_name: "Self Notify",
            status: "enabled",
            derived_uid: "uid_self",
            notification_workspace_ids: ["workspace-1"],
            notification_receiver: "group-123",
            im_config: {
                workspace_id: "workspace-1",
            },
            secret_status: { token_configured: true },
        },
    ];
}

export async function fetchWeChatGatewayAccounts() {
    return [];
}

export async function fetchXiaolubanGatewayImForwardingCommand(accountId) {
    globalThis.__xiaolubanForwardingAccountId = accountId;
    return {
        account_id: accountId,
        forwarding_url: "http://10.88.1.23:9009/xlb_1?auth=secret-token",
        forwarding_command: "http://10.88.1.23:9009/xlb_1?auth=secret-token g",
        listener_running: true,
    };
}
""".strip(),
    )

    assert "IM: ready" in str(payload["contentHtml"])
    assert "IM plugin:" not in str(payload["contentHtml"])
    assert "data-feature-xiaoluban-im" not in str(payload["contentHtml"])
    assert payload["updatedAccountPayload"] == {
        "accountId": "xlb_1",
        "payload": {
            "display_name": "Self Notify",
            "notification_workspace_ids": ["workspace-1"],
            "notification_receivers": ["group-123"],
            "notify_self": True,
            "im_config": {
                "workspace_id": "workspace-2",
            },
        },
    }
    assert payload["forwardingAccountId"] == "xlb_1"
    assert payload["dialogTitle"] == "Xiaoluban Account"
    assert "Callback URL:" not in str(payload["dialogMessage"])
    assert "http://127.0.0.1" not in str(payload["dialogMessage"])
    assert "enter forwarding mode" not in str(payload["dialogMessage"])
    assert (
        payload["workspaceDescription"]
        == "Required. Inbound Xiaoluban messages will create tasks in this workspace."
    )
    assert payload["forwardingCommandValue"] == "http://10.88.1.23:9009/xlb_1 g"
    assert (
        payload["forwardingCommandDescription"]
        == "Send this command to WeLink Xiaoluban to enter the local session. Send q to exit."
    )
    assert payload["fieldIds"] == [
        "display_name",
        "token",
        "notification_workspace_ids",
        "notification_receivers",
        "xiaoluban_im_workspace_id",
        "forwarding_command",
    ]
    workspace_options = cast(list[dict[str, object]], payload["workspaceOptions"])
    assert [option["value"] for option in workspace_options] == [
        "workspace-1",
        "workspace-2",
    ]
    toast_calls = cast(list[dict[str, object]], payload["toastCalls"])
    assert (
        toast_calls[-1]["message"]
        == "Saved. Send this in WeLink Xiaoluban to enter the local Relay Teams session: http://10.88.1.23:9009/xlb_1 g"
    )


def test_project_view_saves_xiaoluban_im_when_forwarding_command_fetch_fails(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openImFeatureView,
} from "./projectView.mjs";
import { els, flushTasks } from "./mockDom.mjs";

globalThis.__showFormDialogResult = {
    display_name: "Self Notify",
    token: "",
    notification_workspace_ids: [],
    notification_receiver: "",
    xiaoluban_im_workspace_id: "workspace-1",
};

initializeProjectView();
await openImFeatureView();
await flushTasks();
await flushTasks();

els.projectViewContent.querySelector('[data-feature-xiaoluban-edit]')?.onclick?.();
await flushTasks();
await flushTasks();

console.log(JSON.stringify({
    forwardingAccountId: globalThis.__xiaolubanForwardingAccountId || null,
    toastCalls: globalThis.__toastCalls || [],
}));
""".strip(),
        mock_api_source="""
export async function fetchTriggers() {
    return [];
}

export async function fetchWorkspaces() {
    return [{ workspace_id: "workspace-1", name: "Main Workspace" }];
}

export async function fetchXiaolubanGatewayAccounts() {
    return [
        {
            account_id: "xlb_1",
            display_name: "Self Notify",
            status: "enabled",
            derived_uid: "uid_self",
            im_config: {
                workspace_id: "",
            },
            secret_status: { token_configured: true },
        },
    ];
}

export async function fetchWeChatGatewayAccounts() {
    return [];
}

export async function updateXiaolubanGatewayAccount(accountId, payload) {
    globalThis.__updatedXiaolubanAccountPayload = { accountId, payload };
    return {
        account_id: accountId,
        display_name: payload?.display_name || "Self Notify",
        status: "enabled",
        derived_uid: "uid_self",
        secret_status: { token_configured: true },
    };
}

export async function fetchXiaolubanGatewayImForwardingCommand(accountId) {
    globalThis.__xiaolubanForwardingAccountId = accountId;
    throw new Error("xiaoluban_im_listener_host_unavailable");
}
""".strip(),
    )

    assert payload["forwardingAccountId"] == "xlb_1"
    toast_calls = cast(list[dict[str, object]], payload["toastCalls"])
    assert toast_calls[-1]["message"] == "Xiaoluban account saved."


def test_project_view_maps_xiaoluban_submit_errors_to_inline_messages(
    tmp_path: Path,
) -> None:
    payload = _run_project_view_script(
        tmp_path=tmp_path,
        runner_source="""
import {
    initializeProjectView,
    openImFeatureView,
} from "./projectView.mjs";
import { flushTasks } from "./mockDom.mjs";

globalThis.__xiaolubanCreateErrors = [
    "token format is invalid",
    "token must be a personal Xiaoluban token",
    "something unexpected",
];

initializeProjectView();
await openImFeatureView();
await flushTasks();
await flushTasks();

document.querySelector("[data-feature-gateway-add-xiaoluban]")?.onclick?.();
await flushTasks();
await flushTasks();

const dialogCall = globalThis.__showFormDialogCalls.at(-1) || {};
const errors = [];

for (const formValues of [
    { display_name: "Xiaoluban", token: "bad", xiaoluban_im_workspace_id: "workspace-1" },
    { display_name: "Xiaoluban", token: "p_bad_token_value_1234567890abcdef", xiaoluban_im_workspace_id: "workspace-1" },
    { display_name: "Xiaoluban", token: "", xiaoluban_im_workspace_id: "workspace-1" },
    { display_name: "Xiaoluban", token: "uid_self_1234567890abcdef1234567890ab", xiaoluban_im_workspace_id: "workspace-1" },
]) {
    try {
        await dialogCall.submitHandler(formValues);
        errors.push({ message: "ok", fieldId: "" });
    } catch (error) {
        errors.push({
            message: String(error?.message || error || ""),
            fieldId: String(error?.fieldId || ""),
        });
    }
}

console.log(JSON.stringify({
    errors,
    toastCalls: globalThis.__toastCalls || [],
}));
""".strip(),
        mock_api_source="""
export async function fetchTriggers() {
    return [];
}

export async function fetchWorkspaces() {
    return [{ workspace_id: "workspace-1", name: "Main Workspace" }];
}

export async function fetchXiaolubanGatewayAccounts() {
    return [];
}

export async function fetchWeChatGatewayAccounts() {
    return [];
}

export async function createXiaolubanGatewayAccount() {
    const nextError = (globalThis.__xiaolubanCreateErrors || []).shift();
    if (typeof nextError === "string" && nextError) {
        throw new Error(nextError);
    }
    return { account_id: "xlb_new", display_name: "Xiaoluban", derived_uid: "uid_self" };
}
""".strip(),
    )

    assert payload["errors"] == [
        {
            "message": "Personal token format is invalid.",
            "fieldId": "token",
        },
        {
            "message": "Enter a personal token. Plugin tokens are not supported.",
            "fieldId": "token",
        },
        {
            "message": "Personal token is required.",
            "fieldId": "token",
        },
        {
            "message": "Unable to save the Xiaoluban account. Check the personal token and try again.",
            "fieldId": "",
        },
    ]
    assert payload["toastCalls"] == []


def _run_project_view_script(
    tmp_path: Path,
    runner_source: str,
    mock_api_source: str | None = None,
) -> dict[str, object]:
    repo_root = Path(__file__).resolve().parents[3]
    source_path = (
        repo_root / "frontend" / "dist" / "js" / "components" / "projectView.js"
    )

    module_under_test_path = tmp_path / "projectView.mjs"
    mock_dom_path = tmp_path / "mockDom.mjs"
    mock_api_path = tmp_path / "mockApi.mjs"
    mock_state_path = tmp_path / "mockState.mjs"
    mock_i18n_path = tmp_path / "mockI18n.mjs"
    mock_markdown_path = tmp_path / "mockMarkdown.mjs"
    mock_logger_path = tmp_path / "mockLogger.mjs"
    mock_feedback_path = tmp_path / "mockFeedback.mjs"
    mock_agent_panel_path = tmp_path / "mockAgentPanel.mjs"
    mock_new_session_draft_path = tmp_path / "mockNewSessionDraft.mjs"
    mock_navigator_path = tmp_path / "mockNavigator.mjs"
    mock_subagent_rail_path = tmp_path / "mockSubagentRail.mjs"
    mock_clawhub_settings_path = tmp_path / "settings" / "clawhubSettings.js"
    mock_github_settings_path = tmp_path / "settings" / "githubSettings.js"
    mock_connector_cards_path = tmp_path / "connectors" / "connectorCards.js"
    mock_board_todo_path = tmp_path / "boards" / "todoBoard.js"
    memory_view_module_path = tmp_path / "memoryView.mjs"
    runner_path = tmp_path / "runner.mjs"

    mock_dom_path.write_text(
        r"""
export const els = {};

function decodeHtmlAttribute(value) {
    return String(value)
        .replaceAll("&quot;", '"')
        .replaceAll("&#39;", "'")
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">")
        .replaceAll("&amp;", "&");
}

function createBasicElement() {
    const attributeStore = new Map();
    const classSet = new Set();
    const node = {
        id: "",
        className: "",
        style: {},
        textContent: "",
        innerHTML: "",
        onclick: null,
        onkeydown: null,
        closest() {
            return null;
        },
        classList: {
            add(name) {
                classSet.add(String(name));
            },
            remove() {
                for (const name of arguments) {
                    classSet.delete(String(name));
                }
            },
            contains(name) {
                return classSet.has(String(name));
            },
        },
        setAttribute(name, value) {
            attributeStore.set(name, String(value));
        },
        getAttribute(name) {
            return attributeStore.has(name) ? attributeStore.get(name) : null;
        },
    };
    return node;
}

function createTreeNode(attributes = {}) {
    const attributeStore = new Map(Object.entries(attributes));
    return {
        onclick: null,
        onkeydown: null,
        onchange: null,
        oninput: null,
        value: "",
        checked: false,
        selectionStart: 0,
        selectionEnd: 0,
        style: {},
        classList: {
            add() {
                return undefined;
            },
            remove() {
                return undefined;
            },
        },
        addEventListener(name, handler) {
            if (name === "click") {
                this.onclick = handler;
            }
            if (name === "keydown") {
                this.onkeydown = handler;
            }
            if (name === "change") {
                this.onchange = handler;
            }
            if (name === "input") {
                this.oninput = handler;
            }
        },
        focus() {
            globalThis.__activeElement = this;
        },
        setSelectionRange(start, end) {
            this.selectionStart = start;
            this.selectionEnd = end;
        },
        setAttribute(name, value) {
            attributeStore.set(name, String(value));
        },
        getAttribute(name) {
            return attributeStore.has(name) ? attributeStore.get(name) : null;
        },
    };
}

function parseNodes(source, selector) {
    const patterns = {
        ".workspace-tree-toggle": /class="workspace-tree-toggle"[\s\S]*?data-tree-toggle-path="([^"]+)"[\s\S]*?aria-expanded="([^"]+)"/g,
        ".workspace-tree-file": /class="([^"]*workspace-tree-file[^"]*)"[\s\S]*?data-tree-file-path="([^"]+)"[\s\S]*?aria-pressed="([^"]+)"/g,
        ".workspace-diff-card": /class="([^"]*workspace-diff-card[^"]*)"[\s\S]*?data-diff-path="([^"]*)"/g,
        "[data-automation-edit]": /data-automation-edit/g,
        "[data-automation-run]": /data-automation-run/g,
        "[data-automation-editor-save]": /data-automation-editor-save/g,
        "[data-automation-editor-cancel]": /data-automation-editor-cancel/g,
        "[data-automation-editor-close]": /data-automation-editor-close/g,
        "[data-automation-editor-schedule-kind]": /id="automation-editor-schedule-kind-input"[\s\S]*?data-automation-editor-schedule-kind/g,
        "[data-automation-editor-binding]": /id="automation-editor-delivery-binding-input"[\s\S]*?data-automation-editor-binding/g,
        "[data-feature-gateway-add-feishu]": /data-feature-gateway-add-feishu/g,
        "[data-feature-gateway-connect-wechat]": /data-feature-gateway-connect-wechat/g,
    };
    const pattern = patterns[selector];
    const results = [];
    if (!pattern) {
        const dataSelectorMatch = /^\[(data-[a-z0-9_-]+)(?:="([^"]*)")?\]$/i.exec(selector);
        if (dataSelectorMatch) {
            const attrName = dataSelectorMatch[1];
            const attrValue = dataSelectorMatch[2];
            const escapedAttrName = attrName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const escapedAttrValue = String(attrValue || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const dataPattern = attrValue === undefined
                ? new RegExp(`<[^>]*${escapedAttrName}(?:="([^"]*)")?[^>]*>`, "g")
                : new RegExp(`<[^>]*${escapedAttrName}="${escapedAttrValue}"[^>]*>`, "g");
            let dataMatch = dataPattern.exec(source);
            while (dataMatch) {
                const attributes = {};
                const valuePattern = new RegExp(`${escapedAttrName}="([^"]*)"`, "i");
                const valueMatch = valuePattern.exec(dataMatch[0]);
                attributes[attrName] = decodeHtmlAttribute(
                    attrValue === undefined ? (valueMatch ? valueMatch[1] : "") : attrValue,
                );
                const node = createTreeNode(attributes);
                const inputValueMatch = /value="([^"]*)"/i.exec(dataMatch[0]);
                node.value = decodeHtmlAttribute(inputValueMatch ? inputValueMatch[1] : "");
                results.push(node);
                dataMatch = dataPattern.exec(source);
            }
            return results;
        }
    }
    if (!pattern) {
        return results;
    }
    let match = pattern.exec(source);
    while (match) {
        if (selector === ".workspace-tree-toggle") {
            results.push(createTreeNode({
                class: "workspace-tree-toggle",
                "data-tree-toggle-path": decodeHtmlAttribute(match[1]),
                "aria-expanded": match[2],
            }));
        } else if (selector === ".workspace-tree-file") {
            results.push(createTreeNode({
                class: match[1],
                "data-tree-file-path": decodeHtmlAttribute(match[2]),
                "aria-pressed": match[3],
            }));
        } else if (selector === ".workspace-diff-card") {
            results.push(createTreeNode({
                class: match[1],
                "data-diff-path": decodeHtmlAttribute(match[2]),
            }));
        } else if (selector === "[data-automation-edit]") {
            results.push(createTreeNode({}));
        } else if (selector === "[data-automation-run]") {
            results.push(createTreeNode({}));
        } else if (selector === "[data-automation-editor-save]") {
            results.push(createTreeNode({}));
        } else if (selector === "[data-automation-editor-cancel]") {
            results.push(createTreeNode({}));
        } else if (selector === "[data-automation-editor-close]") {
            results.push(createTreeNode({}));
        } else if (selector === "[data-automation-editor-schedule-kind]") {
            const node = createTreeNode({});
            node.value = "daily";
            results.push(node);
        } else if (selector === "[data-automation-editor-binding]") {
            const node = createTreeNode({});
            node.value = "";
            results.push(node);
        } else if (selector === "[data-feature-gateway-add-feishu]") {
            results.push(createTreeNode({}));
        } else if (selector === "[data-feature-gateway-connect-wechat]") {
            results.push(createTreeNode({}));
        }
        match = pattern.exec(source);
    }
    return results;
}

function parseElementById(source, id) {
    const safeId = String(id || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const inputMatch = new RegExp(`<input[^>]*id="${safeId}"[^>]*>`, "i").exec(source);
    if (inputMatch) {
        const node = createTreeNode({ id });
        const markup = inputMatch[0];
        const valueMatch = /value="([^"]*)"/i.exec(markup);
        node.value = decodeHtmlAttribute(valueMatch ? valueMatch[1] : "");
        node.checked = /\schecked(?:\s|>)/i.test(markup);
        return node;
    }
    const textareaMatch = new RegExp(`<textarea[^>]*id="${safeId}"[^>]*>([\\s\\S]*?)<\\/textarea>`, "i").exec(source);
    if (textareaMatch) {
        const node = createTreeNode({ id });
        node.value = decodeHtmlAttribute(textareaMatch[1] || "");
        return node;
    }
    const selectMatch = new RegExp(`<select[^>]*id="${safeId}"[^>]*>([\\s\\S]*?)<\\/select>`, "i").exec(source);
    if (selectMatch) {
        const node = createTreeNode({ id });
        const selectedMatch = /<option[^>]*value="([^"]*)"[^>]*selected/i.exec(selectMatch[1]);
        const firstMatch = /<option[^>]*value="([^"]*)"/i.exec(selectMatch[1]);
        node.value = decodeHtmlAttribute((selectedMatch || firstMatch || [null, ""])[1] || "");
        return node;
    }
    return null;
}

function createHtmlElement() {
    let html = "";
    const cache = new Map();
    const idCache = new Map();
    const classSet = new Set();
    return {
        id: "",
        className: "",
        style: {},
        textContent: "",
        onclick: null,
        onkeydown: null,
        closest() {
            return null;
        },
        classList: {
            add(name) {
                classSet.add(String(name));
            },
            remove() {
                for (const name of arguments) {
                    classSet.delete(String(name));
                }
            },
            contains(name) {
                return classSet.has(String(name));
            },
        },
        get innerHTML() {
            return html;
        },
        set innerHTML(value) {
            html = String(value);
            cache.clear();
            idCache.clear();
        },
        querySelector(selector) {
            return this.querySelectorAll(selector)[0] || null;
        },
        querySelectorAll(selector) {
            if (selector.includes(",")) {
                return selector
                    .split(",")
                    .map(part => part.trim())
                    .flatMap(part => this.querySelectorAll(part));
            }
            if (!cache.has(selector)) {
                cache.set(selector, parseNodes(html, selector));
            }
            return cache.get(selector);
        },
        getElementById(id) {
            if (!idCache.has(id)) {
                idCache.set(id, parseElementById(html, id));
            }
            return idCache.get(id);
        },
    };
}

export function createDomEnvironment() {
    const toolbarElement = createBasicElement();
    const titleElement = createBasicElement();
    titleElement.closest = selector => selector === ".project-view-toolbar" ? toolbarElement : null;
    const documentListeners = new Map();
    const elements = new Map([
        ["project-view", createBasicElement()],
        ["project-view-toolbar", toolbarElement],
        ["project-view-title", titleElement],
        ["project-view-summary", createBasicElement()],
        ["project-view-toolbar-actions", createHtmlElement()],
        ["project-view-content", createHtmlElement()],
        ["project-view-reload", createBasicElement()],
        ["project-view-close", createBasicElement()],
        ["chat-container", createBasicElement()],
        ["observability-view", createBasicElement()],
        ["observability-btn", createBasicElement()],
    ]);
    const appendedChildren = [];
    globalThis.__bodyChildren = appendedChildren;

    return {
        body: {
            classList: {
                remove() {
                    return undefined;
                },
            },
            appendChild(node) {
                appendedChildren.push(node);
                if (node?.id) {
                    elements.set(node.id, node);
                }
                return node;
            },
        },
        addEventListener(name, handler) {
            const key = String(name || "");
            const handlers = documentListeners.get(key) || [];
            handlers.push(handler);
            documentListeners.set(key, handlers);
            return undefined;
        },
        dispatchEvent(event) {
            const eventType = String(event?.type || "");
            globalThis.__dispatchedEvents.push({
                type: eventType || null,
                detail: event?.detail || null,
            });
            for (const handler of documentListeners.get(eventType) || []) {
                handler(event);
            }
            return undefined;
        },
        querySelector(selector) {
            const toolbar = elements.get("project-view-toolbar-actions");
            const toolbarMatch = toolbar?.querySelector(selector);
            if (toolbarMatch) {
                return toolbarMatch;
            }
            const content = elements.get("project-view-content");
            const contentMatch = content?.querySelector(selector);
            if (contentMatch) {
                return contentMatch;
            }
            for (const child of appendedChildren) {
                const match = child?.querySelector?.(selector);
                if (match) {
                    return match;
                }
            }
            return null;
        },
        getElementById(id) {
            const element = elements.get(id);
            if (element) {
                return element;
            }
            const toolbar = elements.get("project-view-toolbar-actions");
            const toolbarMatch = toolbar?.getElementById?.(id);
            if (toolbarMatch) {
                return toolbarMatch;
            }
            const content = elements.get("project-view-content");
            const contentMatch = content?.getElementById?.(id);
            if (contentMatch) {
                return contentMatch;
            }
            for (const child of appendedChildren) {
                const match = child?.getElementById?.(id);
                if (match) {
                    return match;
                }
            }
            throw new Error(`Missing element: ${id}`);
        },
        createElement() {
            return createHtmlElement();
        },
    };
}

export function installGlobals(documentEnv) {
    globalThis.document = documentEnv;
    els.projectView = documentEnv.getElementById("project-view");
    els.projectViewTitle = documentEnv.getElementById("project-view-title");
    els.projectViewSummary = documentEnv.getElementById("project-view-summary");
    els.projectViewToolbarActions = documentEnv.getElementById("project-view-toolbar-actions");
    els.projectViewContent = documentEnv.getElementById("project-view-content");
    els.projectViewReloadBtn = documentEnv.getElementById("project-view-reload");
    els.projectViewCloseBtn = documentEnv.getElementById("project-view-close");
    els.chatContainer = documentEnv.getElementById("chat-container");
}

export async function flushTasks() {
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
    await Promise.resolve();
}
""".strip(),
        encoding="utf-8",
    )

    default_mock_api_source = """
export async function disableAutomationProject() {
    return { status: "disabled" };
}

export async function enableAutomationProject() {
    return { status: "enabled" };
}

export async function createAutomationProject() {
    return { automation_project_id: "aut_new" };
}

export async function deleteAutomationProject() {
    return { status: "ok" };
}

export async function fetchAutomationProject() {
    return null;
}

export async function fetchAutomationProjects() {
    if (globalThis.__deferredAutomationProjectsPromise) {
        return await globalThis.__deferredAutomationProjectsPromise;
    }
    return [];
}

export async function fetchAutomationFeishuBindings() {
    return [];
}

export async function fetchAutomationProjectSessions() {
    return [];
}

export async function fetchWorkspaces() {
    return [];
}

export async function fetchMemories() {
    return {
        total_count: 1,
        items: [
            {
                id: "mem_1",
                workspace_id: "alpha-project",
                content_title: "Memory entry",
                content_body_preview: "Remember the board state.",
                tier: "working",
                scope: "workspace",
                status: "active",
                tags: [],
                updated_at: "2026-05-10T08:00:00Z",
            },
        ],
    };
}

export async function searchMemories() {
    return await fetchMemories();
}

export async function getMemory() {
    return {
        id: "mem_1",
        workspace_id: "alpha-project",
        content_title: "Memory entry",
        content_body: "Remember the board state.",
        tier: "working",
        scope: "workspace",
        status: "active",
        tags: [],
        updated_at: "2026-05-10T08:00:00Z",
    };
}

export async function createMemoryEvolutionDraft() {
    return {
        draft_id: "mem-evo-1",
        workspace_id: "alpha-project",
        source_memory_ids: ["mem_1"],
        target: "sop_skill",
        status: "draft",
        skill_id: "memory-entry-sop",
        runtime_name: "memory-entry-sop",
        description: "Memory entry",
        instructions: "# memory-entry-sop",
        created_at: "2026-05-10T08:00:00Z",
        updated_at: "2026-05-10T08:00:00Z",
    };
}

export async function applyMemoryEvolutionDraft() {
    return {
        draft_id: "mem-evo-1",
        workspace_id: "alpha-project",
        source_memory_ids: ["mem_1"],
        target: "sop_skill",
        status: "applied",
        skill_id: "memory-entry-sop",
        runtime_name: "memory-entry-sop",
        description: "Memory entry",
        instructions: "# memory-entry-sop",
        applied_skill_ref: "memory-entry-sop",
        created_at: "2026-05-10T08:00:00Z",
        updated_at: "2026-05-10T08:00:00Z",
        applied_at: "2026-05-10T08:00:01Z",
    };
}

export async function fetchMemorySkillDrafts() {
    return { total_count: 0, items: [] };
}

export async function getMemorySkillDraft() {
    return null;
}

export async function generateMemorySkillDrafts() {
    return { source_memory_count: 0, items: [] };
}

export async function updateMemorySkillDraft() {
    return { id: "msd_1", status: "draft" };
}

export async function validateMemorySkillDraft() {
    return { id: "msd_1", status: "validated" };
}

export async function applyMemorySkillDraft() {
    return { skill_id: "workspace-memory", ref: "workspace-memory" };
}

export async function fetchConfigStatus() {
    if (globalThis.__deferredConfigStatusPromise) {
        return await globalThis.__deferredConfigStatusPromise;
    }
    return { skills: { skills: [] } };
}

export async function fetchOrchestrationConfig() {
    return { presets: [] };
}

export async function fetchRoleConfigOptions() {
    return { normal_mode_roles: [] };
}

export async function fetchTriggers() {
    return [];
}

export async function fetchWeChatGatewayAccounts() {
    return [];
}

export async function fetchXiaolubanGatewayAccounts() {
    return [];
}

export async function fetchWorkspaceSnapshot(workspaceId) {
    await new Promise(resolve => setTimeout(resolve, 0));
    globalThis.__snapshotRequests.push(workspaceId);
    return {
        workspace_id: "alpha-project",
        root_path: "/work/alpha-project",
        tree: {
            name: ".",
            path: ".",
            kind: "directory",
            has_children: true,
            children: [
                {
                    name: "src",
                    path: "src",
                    kind: "directory",
                    has_children: true,
                    children: [],
                },
                {
                    name: "docs",
                    path: "docs",
                    kind: "directory",
                    has_children: false,
                    children: [],
                },
            ],
        },
    };
}

export async function openWorkspaceRoot(workspaceId, mount = null) {
    globalThis.__openWorkspaceRootCalls.push({ workspaceId, mount });
    return { status: "ok" };
}

export async function fetchWorkspaceTree(workspaceId, path, mount = null) {
    globalThis.__treeRequests.push({ workspaceId, path, mount });
    return {
        workspace_id: workspaceId,
        mount_name: mount || "default",
        directory_path: path,
        children: [
            {
                name: "main.py",
                path: "src/main.py",
                kind: "file",
                has_children: false,
                children: [],
            },
        ],
    };
}

export async function fetchWorkspaceDiffs(workspaceId, mount = null) {
    await new Promise(resolve => setTimeout(resolve, 0));
    globalThis.__diffRequests.push({ workspaceId, mount });
    return {
        workspace_id: workspaceId,
        mount_name: mount || "default",
        root_path: "/work/alpha-project",
        is_git_repository: true,
        git_root_path: "/work/alpha-project",
        diff_message: null,
        diff_files: [
            {
                path: "src/main.py",
                change_type: "modified",
            },
        ],
    };
}

export async function fetchWorkspaceDiffFile(workspaceId, path, mount = null) {
    await new Promise(resolve => setTimeout(resolve, 0));
    globalThis.__diffFileRequests.push({ workspaceId, path, mount });
    return {
        workspace_id: workspaceId,
        mount_name: mount || "default",
        path,
        change_type: "modified",
        diff: "changed file",
        is_binary: false,
    };
}

export async function runAutomationProject() {
    return { status: "ok" };
}

export async function reloadSkillsConfig() {
    return { status: "ok" };
}

export async function createTrigger() {
    return { status: "ok" };
}

export async function updateTrigger() {
    return { status: "ok" };
}

export async function deleteTrigger() {
    return { status: "ok" };
}

export async function enableTrigger() {
    return { status: "ok" };
}

export async function disableTrigger() {
    return { status: "ok" };
}

export async function startWeChatGatewayLogin() {
    return { session_key: "wechat-login-1", qr_code_url: "https://example.test/qr.png" };
}

export async function waitWeChatGatewayLogin() {
    return { connected: true };
}

export async function updateWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function enableWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function disableWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function deleteWeChatGatewayAccount() {
    return { status: "ok" };
}

export async function updateAutomationProject() {
    return { status: "ok" };
}

export async function createGitHubTriggerAccount(payload) {
    globalThis.__createdGitHubAccountPayload = payload;
    return { account_id: "ghta_new", name: payload?.name || "github-main", display_name: payload?.display_name || "GitHub Main", status: payload?.enabled === false ? "disabled" : "enabled" };
}

export async function updateGitHubTriggerAccount(accountId, payload) {
    globalThis.__updatedGitHubAccountPayload = { accountId, payload };
    return { account_id: accountId, name: payload?.name || "github-main", display_name: payload?.display_name || "GitHub Main", status: payload?.enabled === false ? "disabled" : "enabled" };
}

export async function deleteGitHubTriggerAccount(accountId) {
    globalThis.__deletedGitHubAccountId = accountId;
    return { status: "ok" };
}

export async function enableGitHubTriggerAccount(accountId) {
    globalThis.__enabledGitHubAccountId = accountId;
    return { account_id: accountId, status: "enabled" };
}

export async function disableGitHubTriggerAccount(accountId) {
    globalThis.__disabledGitHubAccountId = accountId;
    return { account_id: accountId, status: "disabled" };
}

export async function createGitHubRepoSubscription(payload) {
    globalThis.__createdGitHubRepoPayload = payload;
    return { repo_subscription_id: "ghrs_new", account_id: payload?.account_id || "ghta_1", full_name: `${payload?.owner || "octocat"}/${payload?.repo_name || "Hello-World"}` };
}

export async function updateGitHubRepoSubscription(repoSubscriptionId, payload) {
    globalThis.__updatedGitHubRepoPayload = { repoSubscriptionId, payload };
    return { repo_subscription_id: repoSubscriptionId, account_id: "ghta_1", full_name: `${payload?.owner || "octocat"}/${payload?.repo_name || "Hello-World"}` };
}

export async function deleteGitHubRepoSubscription(repoSubscriptionId) {
    globalThis.__deletedGitHubRepoId = repoSubscriptionId;
    return { status: "ok" };
}

export async function enableGitHubRepoSubscription(repoSubscriptionId) {
    globalThis.__enabledGitHubRepoId = repoSubscriptionId;
    return { repo_subscription_id: repoSubscriptionId, enabled: true };
}

export async function disableGitHubRepoSubscription(repoSubscriptionId) {
    globalThis.__disabledGitHubRepoId = repoSubscriptionId;
    return { repo_subscription_id: repoSubscriptionId, enabled: false };
}

export async function createGitHubTriggerRule(payload) {
    globalThis.__createdGitHubRulePayload = payload;
    return {
        trigger_rule_id: "trg_new",
        provider: payload?.provider || "github",
        account_id: payload?.account_id || "ghta_1",
        repo_subscription_id: payload?.repo_subscription_id || "ghrs_1",
        name: payload?.name || "rule",
        enabled: payload?.enabled !== false,
        match_config: payload?.match_config || {},
        dispatch_config: payload?.dispatch_config || {},
    };
}

export async function updateGitHubTriggerRule(triggerRuleId, payload) {
    globalThis.__updatedGitHubRulePayload = { triggerRuleId, payload };
    return {
        trigger_rule_id: triggerRuleId,
        provider: "github",
        account_id: payload?.account_id || "ghta_1",
        repo_subscription_id: payload?.repo_subscription_id || "ghrs_1",
        name: payload?.name || "rule",
        enabled: payload?.enabled !== false,
        match_config: payload?.match_config || {},
        dispatch_config: payload?.dispatch_config || {},
    };
}

export async function deleteGitHubTriggerRule(triggerRuleId) {
    globalThis.__deletedGitHubRuleId = triggerRuleId;
    return { status: "ok" };
}

export async function enableGitHubTriggerRule(triggerRuleId) {
    globalThis.__enabledGitHubRuleId = triggerRuleId;
    return { trigger_rule_id: triggerRuleId, enabled: true };
}

export async function disableGitHubTriggerRule(triggerRuleId) {
    globalThis.__disabledGitHubRuleId = triggerRuleId;
    return { trigger_rule_id: triggerRuleId, enabled: false };
}
""".strip()
    resolved_mock_api_source = (
        _merge_mock_api_source(default_mock_api_source, mock_api_source)
        if mock_api_source
        else default_mock_api_source
    )
    required_api_fallbacks = {
        "fetchSshProfiles": """
export async function fetchSshProfiles() {
    return globalThis.__mockSshProfiles || [];
}
""".strip(),
        "updateWorkspace": """
export async function updateWorkspace(workspaceId, payload) {
    globalThis.__updatedWorkspacePayload = { workspaceId, payload };
    return {
        workspace_id: workspaceId,
        default_mount_name: payload?.default_mount_name || "default",
        mounts: Array.isArray(payload?.mounts) ? payload.mounts : [],
    };
}
""".strip(),
        "openWorkspaceRoot": """
export async function openWorkspaceRoot(workspaceId, mount = null) {
    globalThis.__openWorkspaceRootCalls = globalThis.__openWorkspaceRootCalls || [];
    globalThis.__openWorkspaceRootCalls.push({ workspaceId, mount });
    return { status: "ok" };
}
""".strip(),
        "fetchGitHubTriggerAccounts": """
export async function fetchGitHubTriggerAccounts() {
    return globalThis.__mockGitHubAccounts || [];
}
""".strip(),
        "fetchGitHubRepoSubscriptions": """
export async function fetchGitHubRepoSubscriptions() {
    return globalThis.__mockGitHubRepos || [];
}
""".strip(),
        "fetchGitHubAccountRepositories": """
export async function fetchGitHubAccountRepositories() {
    return globalThis.__mockGitHubAvailableRepos || [];
}
""".strip(),
        "fetchGitHubTriggerRules": """
export async function fetchGitHubTriggerRules() {
    return globalThis.__mockGitHubRules || [];
}
""".strip(),
        "fetchConnectors": """
export async function fetchConnectors() {
    return {
        summary: { connected: 0, needs_config: 4, disabled: 0, error: 0, total: 4 },
        items: [],
    };
}
""".strip(),
        "fetchRuntimeTools": """
export async function fetchRuntimeTools() {
    return { items: [] };
}
""".strip(),
        "startRuntimeToolDownload": """
export async function startRuntimeToolDownload(toolId) {
    globalThis.__runtimeToolDownloadRequests =
        globalThis.__runtimeToolDownloadRequests || [];
    globalThis.__runtimeToolDownloadRequests.push(toolId);
    return {
        job_id: `${toolId}-job`,
        tool_id: toolId,
        status: "running",
        progress_ratio: 0.5,
        downloaded_bytes: 50,
        total_bytes: 100,
        stage: "downloading",
        error: null,
    };
}
""".strip(),
        "fetchRuntimeToolDownload": """
export async function fetchRuntimeToolDownload(jobId) {
    globalThis.__runtimeToolDownloadPolls =
        globalThis.__runtimeToolDownloadPolls || [];
    globalThis.__runtimeToolDownloadPolls.push(jobId);
    return {
        job_id: jobId,
        tool_id: String(jobId).replace(/-job$/, ""),
        status: "succeeded",
        progress_ratio: 1,
        downloaded_bytes: 100,
        total_bytes: 100,
        stage: "complete",
        error: null,
    };
}
""".strip(),
        "addRuntimeToolsSystemPath": """
export async function addRuntimeToolsSystemPath() {
    globalThis.__runtimeToolsSystemPathRequests =
        (globalThis.__runtimeToolsSystemPathRequests || 0) + 1;
    return {
        status: "updated",
        bin_dir: "C:/Users/test/.relay-teams/bin",
        message: "Runtime tools bin directory has been added to the system PATH.",
        requires_terminal_restart: true,
    };
}
""".strip(),
        "searchClawHubSkillMarket": """
export async function searchClawHubSkillMarket(query, options = {}) {
    globalThis.__clawHubMarketSearchRequests =
        globalThis.__clawHubMarketSearchRequests || [];
    globalThis.__clawHubMarketSearchRequests.push({
        query,
        limit: options?.limit || null,
    });
    return globalThis.__clawHubMarketSearchResponse || {
        ok: true,
        query,
        items: [],
    };
}
""".strip(),
        "fetchClawHubSkillMarket": """
export async function fetchClawHubSkillMarket(options = {}) {
    globalThis.__clawHubMarketBrowseRequests =
        globalThis.__clawHubMarketBrowseRequests || [];
    globalThis.__clawHubMarketBrowseRequests.push({
        limit: options?.limit || null,
        cursor: options?.cursor || "",
        sort: options?.sort || "",
    });
    return globalThis.__clawHubMarketBrowseResponse || {
        ok: true,
        query: "",
        items: [],
        sort: "popular",
        next_cursor: null,
    };
}
""".strip(),
        "fetchClawHubSkillMarketDetail": """
export async function fetchClawHubSkillMarketDetail(slug, options = {}) {
    globalThis.__clawHubMarketDetailRequests =
        globalThis.__clawHubMarketDetailRequests || [];
    globalThis.__clawHubMarketDetailRequests.push({
        slug,
        version: options?.version || "",
    });
    return globalThis.__clawHubMarketDetailResponse || {
        ok: true,
        slug,
        title: slug,
        version: options?.version || "1.0.0",
        manifest_content: "# Skill Creator\\n\\n## Quick Start\\nUse this skill.",
        files: [{ path: "SKILL.md", size: 42 }],
    };
}
""".strip(),
        "installClawHubMarketSkill": """
export async function installClawHubMarketSkill(payload) {
    globalThis.__clawHubMarketInstallRequests =
        globalThis.__clawHubMarketInstallRequests || [];
    globalThis.__clawHubMarketInstallRequests.push(payload);
    return globalThis.__clawHubMarketInstallResponse || {
        ok: true,
        slug: payload?.slug || "",
        diagnostics: { skills_reloaded: true },
    };
}
""".strip(),
        "uninstallClawHubMarketSkill": """
export async function uninstallClawHubMarketSkill(slug) {
    globalThis.__clawHubMarketUninstallRequests =
        globalThis.__clawHubMarketUninstallRequests || [];
    globalThis.__clawHubMarketUninstallRequests.push(slug);
    return globalThis.__clawHubMarketUninstallResponse || {
        ok: true,
        slug,
        skills_reloaded: true,
    };
}
""".strip(),
        "uninstallRuntimeSkill": """
export async function uninstallRuntimeSkill(skillRef) {
    globalThis.__runtimeSkillUninstallRequests =
        globalThis.__runtimeSkillUninstallRequests || [];
    globalThis.__runtimeSkillUninstallRequests.push(skillRef);
    return globalThis.__runtimeSkillUninstallResponse || {
        ok: true,
        ref: skillRef,
        skills_reloaded: true,
    };
}
""".strip(),
        "fetchRuntimeSkillDetail": """
export async function fetchRuntimeSkillDetail(skillRef) {
    globalThis.__runtimeSkillDetailRequests =
        globalThis.__runtimeSkillDetailRequests || [];
    globalThis.__runtimeSkillDetailRequests.push(skillRef);
    return globalThis.__runtimeSkillDetailResponse || {
        ref: skillRef,
        name: skillRef,
        description: "Create skills.",
        source: "user_relay_teams",
        directory: "/skills/skill-creator",
        manifest_path: "/skills/skill-creator/SKILL.md",
        instructions: "## Quick Start\\nUse this skill.",
        manifest_content: "# Skill Creator\\n\\n## Quick Start\\nUse this skill.",
    };
}
""".strip(),
        "fetchW3Connector": """
export async function fetchW3Connector() {
    return null;
}
""".strip(),
        "saveW3Connector": """
export async function saveW3Connector(payload) {
    globalThis.__savedW3ConnectorPayload = payload;
    return { status: "saved" };
}
""".strip(),
        "testConnector": """
export async function testConnector(connectorId) {
    return { connector_id: connectorId, ok: true, checks: [] };
}
""".strip(),
        "fetchXiaolubanGatewayAccounts": """
export async function fetchXiaolubanGatewayAccounts() {
    return [];
}
""".strip(),
        "fetchDiscordGatewayAccounts": """
export async function fetchDiscordGatewayAccounts() {
    return [];
}
""".strip(),
        "createDiscordGatewayAccount": """
export async function createDiscordGatewayAccount(payload) {
    globalThis.__createdDiscordAccountPayload = payload;
    return { account_id: "discord_new", display_name: payload?.display_name || "Discord" };
}
""".strip(),
        "updateDiscordGatewayAccount": """
export async function updateDiscordGatewayAccount(accountId, payload) {
    globalThis.__updatedDiscordAccountPayload = { accountId, payload };
    return { account_id: accountId, display_name: payload?.display_name || "Discord" };
}
""".strip(),
        "enableDiscordGatewayAccount": """
export async function enableDiscordGatewayAccount(accountId) {
    globalThis.__enabledDiscordAccountId = accountId;
    return { account_id: accountId, status: "enabled" };
}
""".strip(),
        "disableDiscordGatewayAccount": """
export async function disableDiscordGatewayAccount(accountId) {
    globalThis.__disabledDiscordAccountId = accountId;
    return { account_id: accountId, status: "disabled" };
}
""".strip(),
        "deleteDiscordGatewayAccount": """
export async function deleteDiscordGatewayAccount(accountId) {
    globalThis.__deletedDiscordAccountId = accountId;
    return { status: "ok" };
}
""".strip(),
        "reloadDiscordGateway": """
export async function reloadDiscordGateway() {
    return { status: "ok" };
}
""".strip(),
        "createXiaolubanGatewayAccount": """
export async function createXiaolubanGatewayAccount(payload) {
    globalThis.__createdXiaolubanAccountPayload = payload;
    return { account_id: "xlb_new", display_name: payload?.display_name || "Xiaoluban", derived_uid: "uid_self" };
}
""".strip(),
        "updateXiaolubanGatewayAccount": """
export async function updateXiaolubanGatewayAccount(accountId, payload) {
    globalThis.__updatedXiaolubanAccountPayload = { accountId, payload };
    return { account_id: accountId, display_name: payload?.display_name || "Xiaoluban", derived_uid: "uid_self" };
}
""".strip(),
        "updateXiaolubanGatewayImConfig": """
export async function updateXiaolubanGatewayImConfig(accountId, payload) {
    globalThis.__updatedXiaolubanImPayload = { accountId, payload };
    return { account_id: accountId, display_name: "Xiaoluban", derived_uid: "uid_self", im_config: payload };
}
""".strip(),
        "fetchXiaolubanGatewayImForwardingCommand": """
export async function fetchXiaolubanGatewayImForwardingCommand(accountId) {
    globalThis.__xiaolubanForwardingAccountId = accountId;
    return {
        account_id: accountId,
        forwarding_url: `http://10.88.1.23:9009/${accountId}?auth=secret-token`,
        forwarding_command: `http://10.88.1.23:9009/${accountId}?auth=secret-token g`,
        listener_running: true,
    };
}
""".strip(),
        "enableXiaolubanGatewayAccount": """
export async function enableXiaolubanGatewayAccount(accountId) {
    globalThis.__enabledXiaolubanAccountId = accountId;
    return { account_id: accountId, status: "enabled" };
}
""".strip(),
        "disableXiaolubanGatewayAccount": """
export async function disableXiaolubanGatewayAccount(accountId) {
    globalThis.__disabledXiaolubanAccountId = accountId;
    return { account_id: accountId, status: "disabled" };
}
""".strip(),
        "deleteXiaolubanGatewayAccount": """
export async function deleteXiaolubanGatewayAccount(accountId) {
    globalThis.__deletedXiaolubanAccountId = accountId;
    return { status: "ok" };
}
""".strip(),
        "createGitHubTriggerAccount": """
export async function createGitHubTriggerAccount(payload) {
    globalThis.__createdGitHubAccountPayload = payload;
    return { account_id: "ghta_new", name: payload?.name || "github-main", display_name: payload?.display_name || "GitHub Main", status: payload?.enabled === false ? "disabled" : "enabled" };
}
""".strip(),
        "updateGitHubTriggerAccount": """
export async function updateGitHubTriggerAccount(accountId, payload) {
    globalThis.__updatedGitHubAccountPayload = { accountId, payload };
    return { account_id: accountId, name: payload?.name || "github-main", display_name: payload?.display_name || "GitHub Main", status: payload?.enabled === false ? "disabled" : "enabled" };
}
""".strip(),
        "deleteGitHubTriggerAccount": """
export async function deleteGitHubTriggerAccount(accountId) {
    globalThis.__deletedGitHubAccountId = accountId;
    return { status: "ok" };
}
""".strip(),
        "enableGitHubTriggerAccount": """
export async function enableGitHubTriggerAccount(accountId) {
    globalThis.__enabledGitHubAccountId = accountId;
    return { account_id: accountId, status: "enabled" };
}
""".strip(),
        "disableGitHubTriggerAccount": """
export async function disableGitHubTriggerAccount(accountId) {
    globalThis.__disabledGitHubAccountId = accountId;
    return { account_id: accountId, status: "disabled" };
}
""".strip(),
        "createGitHubRepoSubscription": """
export async function createGitHubRepoSubscription(payload) {
    globalThis.__createdGitHubRepoPayload = payload;
    return { repo_subscription_id: "ghrs_new", account_id: payload?.account_id || "ghta_1", full_name: `${payload?.owner || "octocat"}/${payload?.repo_name || "Hello-World"}` };
}
""".strip(),
        "updateGitHubRepoSubscription": """
export async function updateGitHubRepoSubscription(repoSubscriptionId, payload) {
    globalThis.__updatedGitHubRepoPayload = { repoSubscriptionId, payload };
    return { repo_subscription_id: repoSubscriptionId, account_id: "ghta_1", full_name: `${payload?.owner || "octocat"}/${payload?.repo_name || "Hello-World"}` };
}
""".strip(),
        "deleteGitHubRepoSubscription": """
export async function deleteGitHubRepoSubscription(repoSubscriptionId) {
    globalThis.__deletedGitHubRepoId = repoSubscriptionId;
    return { status: "ok" };
}
""".strip(),
        "enableGitHubRepoSubscription": """
export async function enableGitHubRepoSubscription(repoSubscriptionId) {
    globalThis.__enabledGitHubRepoId = repoSubscriptionId;
    return { repo_subscription_id: repoSubscriptionId, enabled: true };
}
""".strip(),
        "disableGitHubRepoSubscription": """
export async function disableGitHubRepoSubscription(repoSubscriptionId) {
    globalThis.__disabledGitHubRepoId = repoSubscriptionId;
    return { repo_subscription_id: repoSubscriptionId, enabled: false };
}
""".strip(),
        "createGitHubTriggerRule": """
export async function createGitHubTriggerRule(payload) {
    globalThis.__createdGitHubRulePayload = payload;
    return { trigger_rule_id: "trg_new", repo_subscription_id: payload?.repo_subscription_id || "ghrs_1", name: payload?.name || "rule" };
}
""".strip(),
        "updateGitHubTriggerRule": """
export async function updateGitHubTriggerRule(triggerRuleId, payload) {
    globalThis.__updatedGitHubRulePayload = { triggerRuleId, payload };
    return { trigger_rule_id: triggerRuleId, repo_subscription_id: "ghrs_1", name: payload?.name || "rule", enabled: payload?.enabled !== false };
}
""".strip(),
        "deleteGitHubTriggerRule": """
export async function deleteGitHubTriggerRule(triggerRuleId) {
    globalThis.__deletedGitHubRuleId = triggerRuleId;
    return { status: "ok" };
}
""".strip(),
        "enableGitHubTriggerRule": """
export async function enableGitHubTriggerRule(triggerRuleId) {
    globalThis.__enabledGitHubRuleId = triggerRuleId;
    return { trigger_rule_id: triggerRuleId, enabled: true };
}
""".strip(),
        "disableGitHubTriggerRule": """
export async function disableGitHubTriggerRule(triggerRuleId) {
    globalThis.__disabledGitHubRuleId = triggerRuleId;
    return { trigger_rule_id: triggerRuleId, enabled: false };
}
""".strip(),
    }
    for export_name, export_source in required_api_fallbacks.items():
        if f"export async function {export_name}" not in resolved_mock_api_source:
            resolved_mock_api_source = f"{resolved_mock_api_source}\n\n{export_source}"
    mock_api_path.write_text(
        resolved_mock_api_source,
        encoding="utf-8",
    )

    mock_state_path.write_text(
        """
export const state = {
    currentMainView: "session",
    currentProjectViewWorkspaceId: null,
    currentWorkspaceId: null,
    currentFeatureViewId: null,
};
""".strip(),
        encoding="utf-8",
    )

    mock_i18n_path.write_text(
        """
    const translations = {
        "workspace_view.title": "{workspace} Project",
        "workspace_view.bindings": "Bindings",
        "workspace_view.tree": "Files",
        "workspace_view.mounts": "Mounts",
        "workspace_view.mount_add": "Add Mount",
        "workspace_view.mount_edit": "Edit Mount",
        "workspace_view.mount_default": "Default",
        "workspace_view.mount_profile": "SSH profile",
        "workspace_view.mount_profiles": "SSH Profiles",
        "workspace_view.mount_profiles_unavailable": "Open Settings to manage reusable SSH profiles.",
        "workspace_view.mount_profiles_failed": "Failed to load SSH profiles",
        "workspace_view.mount_remove": "Remove Mount",
        "workspace_view.mount_remove_failed": "Failed to update mounts",
        "workspace_view.mount_remove_last": "At least one mount must remain configured.",
        "workspace_view.mount_remove_confirm": "Remove mount {mount}?",
        "workspace_view.mount_added_title": "Mount Added",
        "workspace_view.mount_added_detail": "Added mount {mount}.",
        "workspace_view.mount_updated_title": "Mount Updated",
        "workspace_view.mount_updated_detail": "Updated mount {mount}.",
        "workspace_view.mount_removed_title": "Mount Removed",
        "workspace_view.mount_removed_detail": "Removed mount {mount}.",
        "workspace_view.mount_dialog_add": "Choose the provider and root.",
        "workspace_view.mount_dialog_edit": "Update mount {mount}.",
        "workspace_view.mount_field_name": "Mount Name",
        "workspace_view.mount_field_name_placeholder": "e.g. app",
        "workspace_view.mount_field_provider": "Provider",
        "workspace_view.mount_field_local_root": "Local Root Path",
        "workspace_view.mount_field_local_root_placeholder": "/path/to/project",
        "workspace_view.mount_field_local_root_copy": "Used only when provider is Local.",
        "workspace_view.mount_field_ssh_profile": "SSH Profile",
        "workspace_view.mount_field_ssh_profile_copy": "Used only when provider is SSH.",
        "workspace_view.mount_field_remote_root": "Remote Root",
        "workspace_view.mount_field_remote_root_placeholder": "/srv/app",
        "workspace_view.mount_field_remote_root_copy": "Used only when provider is SSH.",
        "workspace_view.mount_field_default": "Set as default mount",
        "workspace_view.mount_field_default_copy": "Unprefixed workspace paths resolve to the default mount.",
        "workspace_view.mount_profile_select_placeholder": "Select an SSH profile",
        "workspace_view.mount_validation_name": "Mount name is required.",
        "workspace_view.mount_validation_duplicate": "Mount {mount} already exists.",
        "workspace_view.mount_validation_local_root": "Local root path is required.",
        "workspace_view.mount_validation_ssh_profile": "SSH profile is required.",
        "workspace_view.mount_validation_remote_root": "Remote root is required.",
        "workspace_view.mount_provider.local": "Local",
        "workspace_view.mount_provider.ssh": "SSH",
        "workspace_view.mount_provider.unknown": "Mount",
        "workspace_view.open_root": "Open project folder",
        "workspace_view.open_root_failed": "Failed to open project folder",
        "workspace_view.diffs": "Changes",
        "workspace_view.reload": "Reload",
        "workspace_view.back": "Back",
        "workspace_view.loading": "Loading project snapshot...",
    "workspace_view.loading_tree": "Loading files...",
    "workspace_view.loading_directory": "Loading folder...",
    "workspace_view.loading_diffs": "Loading changes...",
    "workspace_view.loading_diff": "Loading diff...",
    "workspace_view.load_failed": "Load failed",
    "workspace_view.empty_tree": "Empty tree",
    "workspace_view.no_diffs": "No diffs",
    "workspace_view.not_git_repository": "Not a git repository",
    "workspace_view.binary_diff": "Binary diff",
        "workspace_view.empty_diff": "Empty diff",
        "workspace_view.diff_summary": "{count} changed files",
        "workspace_view.change.modified": "Modified",
        "workspace_view.delivery_disabled": "Disabled",
        "workspace_view.delivery_events": "Delivery events",
        "workspace_view.delivery_provider": "Delivery provider",
        "workspace_view.delivery_target": "Delivery target",
        "workspace_view.feishu_trigger": "Feishu trigger",
        "workspace_view.feishu_chat": "Feishu chat",
        "workspace_view.chat_type": "Chat type",
        "workspace_view.delivery_help_feishu": "Automation updates will be pushed to the selected Feishu chat.",
        "settings.action.delete": "Delete",
        "settings.action.cancel": "Cancel",
        "settings.action.close": "Close",
        "settings.system.skills_reloaded": "Skills Reloaded",
        "settings.system.skills_reloaded_message": "Skills reloaded.",
        "settings.system.reload_failed": "Reload Failed",
        "settings.triggers.feishu_detail_copy": "Manage Feishu inbound accounts.",
        "settings.triggers.none": "No Feishu triggers",
        "settings.triggers.none_copy": "Add a Feishu trigger.",
        "settings.triggers.trigger_name": "Trigger Name",
        "settings.triggers.display_name": "Display Name",
        "settings.triggers.workspace": "Workspace ID",
        "settings.triggers.rule": "Trigger Rule",
        "settings.triggers.saved": "Saved",
        "settings.triggers.saved_message": "Feishu settings saved.",
        "settings.triggers.save_failed": "Save failed",
        "settings.triggers.bot_configuration": "Bot Configuration",
        "settings.triggers.session_configuration": "Session Configuration",
        "settings.triggers.feishu_app_name": "Feishu App Name",
        "settings.triggers.feishu_app_name_placeholder": "Agent Teams Bot",
        "settings.triggers.feishu_app_id": "Feishu App ID",
        "settings.triggers.feishu_app_id_placeholder": "cli_xxx",
        "settings.triggers.feishu_app_secret": "Feishu App Secret",
        "settings.triggers.feishu_app_secret_placeholder": "App secret",
        "settings.triggers.secret_keep_placeholder": "Configured. Leave blank to keep current value.",
        "settings.triggers.no_workspaces": "No workspaces",
        "settings.triggers.missing_name": "Trigger name is required.",
        "settings.triggers.missing_workspace": "Workspace ID is required.",
        "settings.triggers.missing_app_id": "App ID is required.",
        "settings.triggers.missing_app_name": "App name is required.",
        "settings.triggers.missing_app_secret": "App secret is required.",
        "settings.triggers.missing_orchestration_preset_id": "Preset is required in orchestration mode.",
        "settings.triggers.yolo": "YOLO",
        "settings.triggers.thinking_enabled": "Thinking Enabled",
        "settings.triggers.thinking_effort": "Thinking Effort",
        "settings.roles.edit": "Edit",
        "settings.triggers.delete_confirm_title": "Delete trigger",
        "settings.triggers.delete_confirm_message": "Delete trigger {name}?",
        "settings.triggers.deleted": "Deleted",
        "settings.triggers.deleted_message": "Trigger deleted.",
        "settings.gateway.connect_wechat": "Connect WeChat",
        "settings.gateway.wechat_none": "No WeChat accounts",
        "settings.gateway.wechat_none_copy": "Connect a WeChat account.",
        "settings.gateway.discord_none": "No Discord accounts",
        "settings.gateway.discord_none_copy": "Add a Discord bot account.",
        "settings.gateway.discord_account_editor": "Discord Account",
        "settings.gateway.discord_detail_copy": "Configure Discord.",
        "settings.gateway.discord_default_display_name": "Discord Bot",
        "settings.gateway.discord_bot_token": "Bot Token",
        "settings.gateway.discord_token_copy": "Paste the Discord bot token.",
        "settings.gateway.discord_token_source": "Token Source",
        "settings.gateway.discord_developer_portal": "Discord Developer Portal",
        "settings.gateway.discord_developer_portal_help": "Open Applications > Bot to copy the token.",
        "settings.gateway.discord_token_edit_placeholder": "Bot token saved, re-enter to update",
        "settings.gateway.discord_token_edit_copy": "A bot token is saved. Leave the masked value as-is to keep it.",
        "settings.gateway.discord_missing_token": "Bot token is required.",
        "settings.gateway.discord_application_id": "Application ID",
        "settings.gateway.discord_application_id_copy": "Optional Discord application ID.",
        "settings.gateway.discord_allowed_channels": "Allowed Channels",
        "settings.gateway.discord_allowed_channels_placeholder": "Channel IDs",
        "settings.gateway.discord_allowed_channels_copy": "Only these guild channels are accepted.",
        "settings.gateway.discord_allowed_channels_hint": "Line breaks or commas are accepted.",
        "settings.gateway.discord_allow_channel_messages": "Allow channel messages",
        "settings.gateway.discord_allow_channel_messages_copy": "Accept non-mention messages from allowlisted channels.",
        "settings.gateway.discord_allowed_channel_count": "{count} channels",
        "settings.gateway.discord_routing": "Discord Routing",
        "settings.gateway.xiaoluban_account_editor": "Xiaoluban Account",
        "settings.gateway.xiaoluban_title": "Xiaoluban",
        "settings.gateway.xiaoluban_none": "No Xiaoluban accounts",
        "settings.gateway.xiaoluban_none_copy": "Create an account to send automation updates to yourself.",
        "settings.gateway.xiaoluban_token": "Personal Token",
        "settings.gateway.xiaoluban_token_copy": "Paste the personal token used for outbound notifications.",
        "settings.gateway.xiaoluban_token_edit_placeholder": "Personal token saved, re-enter to update",
        "settings.gateway.xiaoluban_token_edit_copy": "A personal token is saved. Leave the masked value as-is to keep it, or reveal and replace it to update.",
        "settings.gateway.xiaoluban_token_keep": "Keep existing token",
        "settings.gateway.xiaoluban_missing_token": "Personal token is required.",
        "settings.gateway.xiaoluban_token_invalid": "Personal token format is invalid.",
        "settings.gateway.xiaoluban_personal_token_only": "Enter a personal token. Plugin tokens are not supported.",
        "settings.gateway.xiaoluban_uid": "Derived UID",
        "settings.gateway.xiaoluban_internal_id_copy": "Internal ID: {account_id}",
        "settings.gateway.xiaoluban_notification_workspaces": "Notification Workspaces",
        "settings.gateway.xiaoluban_notification_workspaces_none": "Do not notify",
        "settings.gateway.xiaoluban_notification_workspaces_all": "All workspaces",
        "settings.gateway.xiaoluban_notification_workspaces_placeholder": "No workspaces selected",
        "settings.gateway.xiaoluban_notification_workspaces_copy": "Run completion notifications are sent only for selected workspaces.",
        "settings.gateway.xiaoluban_notification_workspace_count": "{count} workspaces",
        "settings.gateway.xiaoluban_notification_receiver": "Notification Recipient",
        "settings.gateway.xiaoluban_notification_receiver_placeholder": "Optional extra group ID",
        "settings.gateway.xiaoluban_notification_receiver_copy": "Completion notifications always notify yourself. Group IDs are additional recipients.",
        "settings.gateway.xiaoluban_notification_receivers": "Notification Groups",
        "settings.gateway.xiaoluban_notification_receivers_placeholder": "Group IDs, one per line",
        "settings.gateway.xiaoluban_notification_receivers_copy": "Optional extra recipients. Use new lines, commas, or semicolons to enter multiple groups.",
        "settings.gateway.xiaoluban_notification_receiver_self": "self",
        "settings.gateway.xiaoluban_notification_receiver_none": "none",
        "settings.gateway.xiaoluban_notification_group_count": "{count} groups",
        "settings.gateway.xiaoluban_notification_receiver_summary": "Notify: {receiver}",
        "settings.gateway.xiaoluban_im_summary": "IM: {status}",
        "settings.gateway.xiaoluban_im_action": "IM",
        "settings.gateway.xiaoluban_im_editor": "Xiaoluban IM",
        "settings.gateway.xiaoluban_im_workspace": "IM workspace",
        "settings.gateway.xiaoluban_im_workspace_copy": "Required. Inbound Xiaoluban messages will create tasks in this workspace.",
        "settings.gateway.xiaoluban_im_access_copy": "Access: only current account owner {uid}.",
        "settings.gateway.xiaoluban_im_forwarding_copy": "Send this command to WeLink Xiaoluban to enter the local session. Send q to exit.",
        "settings.gateway.xiaoluban_im_forwarding_command": "Forwarding Command",
        "settings.gateway.xiaoluban_im_forwarding_after_save_copy": "Save to show the forwarding command.",
        "settings.gateway.xiaoluban_im_forwarding_saved_message": "Saved. Send this in WeLink Xiaoluban to enter the local Relay Teams session: {command}",
        "feature.connectors.runtime_tools.system_path_reset_title": "Reset system environment variables",
        "feature.connectors.runtime_tools.system_path_reset_message": "Runtime tools are already in the system PATH. Reapply the managed binary directory?",
        "feature.connectors.runtime_tools.system_path_reset_confirm": "Reset",
        "settings.gateway.xiaoluban_im_status_workspace_required": "workspace required",
        "settings.gateway.xiaoluban_im_status_ready": "ready",
        "settings.gateway.xiaoluban_im_missing_workspace_options": "Create a workspace before enabling Xiaoluban IM.",
        "settings.gateway.xiaoluban_im_workspace_required": "Select an IM workspace.",
        "settings.gateway.xiaoluban_im_saved_message": "Xiaoluban IM settings saved.",
        "settings.gateway.xiaoluban_im_callback_url_local": "Relay Teams could not detect a reachable machine IP. Connect to a network or set RELAY_TEAMS_XIAOLUBAN_IM_PUBLIC_HOST.",
        "settings.gateway.xiaoluban_im_workspace_unknown": "The selected IM workspace no longer exists. Choose another workspace and save again.",
        "settings.gateway.qr_title": "Scan To Connect",
        "settings.gateway.qr_copy": "Scan this QR code in WeChat.",
        "settings.gateway.login_waiting": "Waiting for QR scan confirmation...",
        "settings.gateway.login_failed": "WeChat login failed.",
        "settings.gateway.login_success": "WeChat connected.",
        "settings.gateway.status_running": "Running",
        "settings.gateway.enable_account": "Enable account",
        "settings.gateway.disable_account": "Disable account",
        "settings.gateway.delete_confirm_title": "Delete account",
        "settings.gateway.delete_confirm_message": "Delete account {name}?",
        "settings.gateway.saved": "Saved",
        "settings.gateway.saved_message": "WeChat account saved.",
        "settings.gateway.discord_saved_title": "Discord account saved",
        "settings.gateway.discord_saved_message": "Discord account saved.",
        "settings.gateway.xiaoluban_saved_title": "Xiaoluban account saved",
        "settings.gateway.xiaoluban_saved_message": "Xiaoluban account saved.",
        "settings.gateway.xiaoluban_save_failed_message": "Unable to save the Xiaoluban account. Check the personal token and try again.",
        "settings.gateway.save_failed": "Save failed",
        "settings.gateway.deleted": "Deleted",
        "settings.gateway.deleted_message": "WeChat account deleted.",
        "settings.gateway.discord_deleted_title": "Discord account deleted",
        "settings.gateway.discord_deleted_message": "Discord account deleted.",
        "settings.gateway.xiaoluban_deleted_message": "Xiaoluban account deleted.",
        "feature.skills.title": "Skills",
        "feature.skills.subtitle": "Search ClawHub skills and review loaded Agent Teams skills.",
        "feature.skills.loading": "Loading skills...",
        "feature.skills.directory_title": "Installed Skills",
        "feature.skills.summary": "{count} skills available",
        "feature.skills.installed_count": "{count} installed",
        "feature.skills.market_tab": "Skill Market",
        "feature.skills.installed_tab": "Installed",
        "feature.skills.search_placeholder": "Search skills",
        "feature.skills.add": "Add Skill",
        "feature.skills.installed": "Installed",
        "feature.skills.install": "Install",
        "feature.skills.installing": "Installing",
        "feature.skills.uninstall": "Uninstall",
        "feature.skills.uninstalling": "Uninstalling",
        "feature.skills.clawhub_settings": "ClawHub Settings",
        "feature.skills.clawhub_settings_title": "ClawHub Settings",
        "feature.skills.clawhub_settings_meta": "Token and connectivity for installing skills.",
        "feature.skills.market_clawhub_title": "ClawHub",
        "feature.skills.market_clawhub_meta": "Token and connectivity for skill installation",
        "feature.skills.market_idle": "Loading ClawHub skills",
        "feature.skills.market_idle_copy": "The market uses your saved ClawHub configuration.",
        "feature.skills.market_searching": "Searching skills",
        "feature.skills.market_searching_copy": "Searching ClawHub for {query}.",
        "feature.skills.market_error": "Search failed",
        "feature.skills.market_error_copy": "ClawHub search is unavailable.",
        "feature.skills.market_empty": "No matching skills",
        "feature.skills.market_empty_copy": "ClawHub did not return skills for this view.",
        "feature.skills.market_load_more": "Load more",
        "feature.skills.market_loading_more": "Loading more...",
        "feature.skills.market_version": "Version {version}",
        "feature.skills.market_installs": "{count} installs",
        "feature.skills.market_installs_short": "Installs",
        "feature.skills.market_stars": "{count} stars",
        "feature.skills.market_stars_short": "Stars",
        "feature.skills.market_downloads": "{count} downloads",
        "feature.skills.market_downloads_short": "Downloads",
        "feature.skills.market_score": "Score {score}",
        "feature.skills.market_result": "ClawHub result",
        "feature.skills.install_dialog_title": "Install ClawHub skill",
        "feature.skills.install_dialog_message": "Install a skill by ClawHub slug.",
        "feature.skills.install_slug": "Slug",
        "feature.skills.install_slug_placeholder": "skill-creator",
        "feature.skills.install_version": "Version",
        "feature.skills.install_version_placeholder": "Optional version",
        "feature.skills.install_force": "Force reinstall",
        "feature.skills.install_force_copy": "Reinstall even when the skill already exists.",
        "feature.skills.install_slug_required": "Skill slug is required.",
        "feature.skills.install_success": "Skill installed",
        "feature.skills.install_success_copy": "{skill} is ready.",
        "feature.skills.install_failed": "Install failed",
        "feature.skills.install_failed_copy": "ClawHub could not install this skill.",
        "feature.skills.uninstall_dialog_title": "Uninstall skill",
        "feature.skills.uninstall_dialog_message": "Uninstall {skill} and reload skills.",
        "feature.skills.uninstall_success": "Skill uninstalled",
        "feature.skills.uninstall_success_copy": "{skill} was removed.",
        "feature.skills.uninstall_failed": "Uninstall failed",
        "feature.skills.uninstall_failed_copy": "ClawHub could not uninstall this skill.",
        "feature.skills.detail_slug": "Slug",
        "feature.skills.detail_ref": "Reference",
        "feature.skills.detail_version": "Version",
        "feature.skills.detail_score": "Score",
        "feature.skills.detail_source": "Source",
        "feature.skills.detail_path": "Path",
        "feature.skills.detail_instruction_path": "Instructions",
        "feature.skills.detail_loading_markdown": "Loading SKILL.md...",
        "feature.skills.detail_no_markdown": "No SKILL.md preview is available.",
        "feature.skills.detail_markdown_failed": "Failed to load SKILL.md.",
        "feature.skills.empty": "No skills loaded",
        "feature.skills.empty_copy": "Reload after updating the configured skill directories.",
        "feature.skills.reload": "Reload Skills",
        "feature.skills.scope_builtin": "Built-in",
        "feature.skills.scope_app": "App",
        "feature.skills.scope_unknown": "Skill",
        "feature.automation.title": "Automation",
        "feature.automation.loading": "Loading automation...",
        "feature.automation.summary": "{count} schedules",
        "feature.automation.empty": "No automation projects",
        "feature.automation.empty_copy": "Create a scheduled project.",
        "feature.automation.create": "New Automation",
        "feature.automation.select": "Select an automation project from the list.",
        "feature.automation.create_first": "Create Automation",
        "feature.automation.section_schedules": "Schedules",
        "feature.automation.section_github": "GitHub",
        "feature.automation.github_summary": "{accounts} accounts · {repos} repos · {rules} rules",
        "feature.automation.github_access": "GitHub Access",
        "feature.automation.github_access_copy": "Shared token and connectivity checks for GitHub-triggered automation.",
        "feature.automation.github_access_status": "Shared",
        "feature.automation.github_access_detail_copy": "Shared token is reused when an account does not define its own override.",
        "feature.automation.github_shared_settings": "Shared Connection Settings",
        "feature.automation.github_shared_token": "Shared Token",
        "feature.automation.github_webhook_callback": "Webhook Callback",
        "feature.automation.github_trigger_title": "GitHub Event Automation",
        "feature.automation.github_trigger_copy": "When a pull request or issue event happens, start a task automatically in the workspace you choose.",
        "feature.automation.github_connection_status": "Connection status",
        "feature.automation.github_connection_status_copy": "GitHub accounts are managed in Connectors.",
        "feature.automation.github_connection_missing": "GitHub is not connected yet. Configure a GitHub account in Connectors first.",
        "feature.automation.github_open_connector": "Connect GitHub",
        "feature.automation.github_manage_connector": "Manage GitHub Connector",
        "feature.automation.github_step_account_title": "Connect an account",
        "feature.automation.github_step_account_copy": "Choose which GitHub identity receives events.",
        "feature.automation.github_step_repo_title": "Bind repositories",
        "feature.automation.github_step_repo_copy": "Pick the repositories that can trigger automation.",
        "feature.automation.github_step_repo_disabled": "Connect a GitHub account before binding repositories.",
        "feature.automation.github_step_rule_title": "Create trigger rules",
        "feature.automation.github_step_rule_copy": "Decide which PR or issue events start a task.",
        "feature.automation.github_step_rule_disabled": "Bind a repository before creating trigger rules.",
        "feature.automation.github_connect_account": "Connect GitHub Account",
        "feature.automation.github_bind_repo": "Bind Repository",
        "feature.automation.github_create_rule": "Create Rule",
        "feature.automation.github_advanced_settings": "Advanced Connection Settings",
        "feature.automation.github_advanced_settings_copy": "Shared token and webhook settings.",
        "feature.automation.github_repo_count": "{count} repositories",
        "feature.automation.github_rule_count": "{count} rules",
        "feature.automation.github_summary_accounts": "Accounts",
        "feature.automation.github_summary_repos": "Repositories",
        "feature.automation.github_summary_rules": "Rules",
        "feature.automation.github_new_account": "New Account",
        "feature.automation.github_new_repo": "New Repo",
        "feature.automation.github_new_rule": "New Rule",
        "feature.automation.github_repo_copy": "Choose a repository visible to this account token. The webhook callback URL is generated automatically.",
        "feature.automation.github_rule_name": "Rule Name",
        "feature.automation.github_account": "Account",
        "feature.automation.github_repo_name": "Repository",
        "feature.automation.github_repo_select_copy": "Repository choices are fetched with the effective GitHub token for this account.",
        "feature.automation.github_repo_select_placeholder": "Select a repository",
        "feature.automation.github_repo_section": "Repositories",
        "feature.automation.github_rule_section": "Rules",
        "feature.automation.github_event_subscription": "Subscribed Event",
        "feature.automation.github_event_copy": "Select the GitHub webhook event for this rule. The repository subscribed events are derived automatically from enabled rules.",
        "feature.automation.github_event_pull_request": "Pull Request",
        "feature.automation.github_event_issues": "Issues",
        "feature.automation.github_actions": "Actions",
        "feature.automation.github_actions_placeholder": "Select actions",
        "feature.automation.github_actions_copy": "Select one or more GitHub actions. Pull Request options include opened, reopened, edited, synchronize, and review_requested. Issues typically use opened, reopened, and edited.",
        "feature.automation.github_draft_pr": "Draft Pull Request",
        "feature.automation.github_draft_pr_any": "Any",
        "feature.automation.github_draft_pr_false": "Ready for review only",
        "feature.automation.github_draft_pr_true": "Draft only",
        "feature.automation.github_base_branches": "Base Branches",
        "feature.automation.github_base_branches_all": "All branches",
        "feature.automation.github_webhook_registered": "Registered",
        "feature.automation.github_webhook_unregistered": "Unregistered",
        "feature.automation.github_webhook_error": "Error",
        "feature.automation.github_no_accounts": "No GitHub accounts",
        "feature.automation.github_no_accounts_copy": "Create an account to start binding repositories.",
        "feature.automation.github_no_repos": "No repositories",
        "feature.automation.github_no_repos_copy": "Create a repository subscription under this account.",
        "feature.automation.github_no_rules": "No rules",
        "feature.automation.github_no_rules_copy": "Create a rule for this repository.",
        "feature.automation.github_open_webhooks": "Open Webhooks",
        "feature.automation.github_callback_url": "Callback URL",
        "feature.automation.github_webhook_status": "Webhook Status",
        "feature.automation.github_default_branch": "Default Branch",
        "feature.automation.github_events": "Subscribed Events",
        "feature.automation.github_account_token": "Account Token",
        "feature.automation.github_account_secret": "Webhook Secret",
        "feature.automation.github_configured": "Configured",
        "feature.automation.github_not_configured": "Not configured",
        "feature.automation.github_show_webhook_secret": "Show Webhook Secret",
        "feature.automation.github_hide_webhook_secret": "Hide Webhook Secret",
        "settings.github.show_token": "Show GitHub token",
        "settings.github.hide_token": "Hide GitHub token",
        "feature.automation.github_account_required": "Account name is required.",
        "feature.automation.github_repo_required": "Repository name is required.",
        "feature.automation.github_repo_options_empty": "No repositories are available for this account token.",
        "feature.automation.github_saved_title": "Saved",
        "feature.automation.github_failed_title": "Save failed",
        "feature.automation.github_deleted_title": "Deleted",
        "feature.gateway.title": "IM Gateway",
        "feature.gateway.loading": "Loading IM integrations...",
        "feature.gateway.summary": "{feishu} Feishu · {wechat} WeChat · {discord} Discord · {xiaoluban} Xiaoluban",
        "feature.gateway.add_feishu": "Add Robot",
        "feature.gateway.add_discord": "Add Discord",
        "feature.gateway.add_xiaoluban": "Add Xiaoluban",
        "feature.gateway.feishu_section": "Feishu",
        "feature.gateway.discord_section": "Discord",
        "feature.gateway.xiaoluban_section": "Xiaoluban",
        "feature.gateway.wechat_section": "WeChat",
        "feature.connectors.action.connect_feishu": "Connect Feishu",
        "feature.connectors.action.connect_discord": "Connect Discord",
        "feature.connectors.action.connect_wechat": "Connect WeChat",
        "feature.connectors.action.connect_xiaoluban": "Connect Xiaoluban",
        "feature.connectors.github.title": "GitHub Connector",
        "feature.connectors.github.copy": "Configure GitHub token, webhook, and trigger accounts for GitHub-driven automation.",
        "feature.connectors.github.connection_settings": "Connection settings",
        "feature.connectors.github.accounts": "GitHub accounts",
        "feature.connectors.github.account_empty": "No GitHub accounts yet.",
        "feature.connectors.github.load_failed": "GitHub connector failed to load",
        "feature.connectors.status.connected": "Connected",
        "feature.connectors.status.needs_config": "Unconnected",
        "feature.connectors.account_summary": "{enabled}/{total} accounts enabled",
        "feature.connectors.accounts.title": "Accounts",
        "feature.connectors.accounts.empty": "No accounts yet.",
        "feature.memory.title": "Memory",
        "feature.memory.loading": "Loading memory...",
        "feature.memory.loading_detail": "Loading entry...",
        "feature.memory.summary": "{count} entries",
        "feature.memory.empty": "No Memory Bank entries",
        "feature.memory.search_placeholder": "Search memory",
        "feature.memory.workspace": "Workspace",
        "feature.memory.all_workspaces": "All workspaces",
        "feature.memory.tier": "Tier",
        "feature.memory.scope": "Scope",
        "feature.memory.status": "Status",
        "feature.memory.any": "Any",
        "feature.memory.entries": "Entries",
        "feature.memory.select_entry": "Select an entry",
        "sidebar.delivery_none": "No delivery target",
        "sidebar.delivery_none_copy": "Do not send automation updates.",
        "sidebar.delivery_target": "Delivery target",
        "composer.no_roles": "No roles",
        "composer.no_presets": "No presets",
        "composer.mode_normal": "Normal Mode",
        "composer.mode_orchestration": "Orchestration",
        "automation.field.workspace": "Workspace",
        "automation.workspace.directory": "Workspace directory",
        "automation.workspace.missing": "Workspace missing",
        "automation.workspace.help": "Automation notifications are currently disabled.",
        "automation.status.enabled": "Enabled",
        "automation.status.disabled": "Disabled",
        "automation.action.edit": "Edit",
        "automation.action.run_now": "Run now",
        "automation.action.disable": "Disable",
        "automation.action.enable": "Enable",
        "automation.action.back_to_list": "Back to list",
        "automation.action.more": "More",
        "automation.action.quick_actions": "Quick actions",
        "automation.home.current": "Current",
        "automation.home.group_active": "Active",
        "automation.home.group_attention": "Needs attention",
        "automation.home.group_other": "Other",
        "automation.home.group_paused": "Paused",
        "automation.home.group_running": "Running",
        "automation.detail.configuration": "Configuration",
        "automation.detail.none": "None",
        "automation.detail.prompt": "Task Prompt",
        "automation.detail.overview_copy": "Review schedule and recent runs.",
        "automation.detail.schedule": "Schedule",
        "automation.detail.timezone": "Timezone",
        "automation.detail.next_run": "Next run",
        "automation.detail.last_run": "Last run",
        "automation.detail.updated_at": "Updated at",
        "automation.detail.recent_runs": "Recent runs",
        "automation.detail.no_runs": "No runs yet.",
        "automation.detail.not_scheduled": "Not scheduled",
        "automation.detail.never": "Never",
        "automation.delivery.xiaoluban_credentials_unusable": "The selected Xiaoluban account is unavailable. Check the personal token or account status.",
        "automation.delivery.xiaoluban_account_missing": "Select a valid Xiaoluban account.",
        "automation.delivery.save_failed": "Unable to save the automation settings. Check the delivery target and try again.",
        "automation.run_status.queued": "Queued",
        "automation.run_status.paused": "Paused",
        "automation.run_status.stopping": "Stopping",
        "automation.run_status.completed": "Completed",
        "automation.run_status.failed": "Failed",
        "sidebar.log.started_bound_session": "Started automation run in bound IM session: {session_id}",
        "sidebar.log.started_automation_run": "Started automation run: {session_id}",
    };

export function t(key) {
    return translations[key] || key;
}

export function formatMessage(key, values = {}) {
    let template = t(key);
    for (const [name, value] of Object.entries(values)) {
        template = template.replaceAll(`{${name}}`, String(value));
    }
    return template;
}
""".strip(),
        encoding="utf-8",
    )

    mock_logger_path.write_text(
        """
    export function sysLog() {
        globalThis.__logs.push(Array.from(arguments).map(value => String(value)).join(" "));
    }

    export function logWarn() {
        globalThis.__warnLogs = globalThis.__warnLogs || [];
        globalThis.__warnLogs.push(Array.from(arguments));
    }
    """.strip(),
        encoding="utf-8",
    )
    mock_markdown_path.write_text(
        """
export function renderMarkdownToHtml(source = "") {
    return String(source || "")
        .replace(/^# (.+)$/gm, "<h1>$1</h1>")
        .replace(/^## (.+)$/gm, "<h2>$1</h2>")
        .replace(/\\n\\n/g, "");
}

export function stripMarkdownFrontmatter(source = "") {
    const normalized = String(source || "").replace(/\\r\\n?/g, "\\n");
    if (!normalized.startsWith("---\\n")) {
        return normalized;
    }
    const endIndex = normalized.indexOf("\\n---\\n", 4);
    if (endIndex < 0) {
        return normalized;
    }
    return normalized.slice(endIndex + 5);
}

export function parseMarkdown(source = "") {
    return renderMarkdownToHtml(source);
}
""".strip(),
        encoding="utf-8",
    )
    mock_feedback_path.write_text(
        """
export async function showFormDialog(options = {}) {
    globalThis.__showFormDialogCalls.push(options);
    const result = globalThis.__showFormDialogResult ?? null;
    if (result && typeof options.submitHandler === "function") {
        return await options.submitHandler(result);
    }
    return result;
}

export async function showConfirmDialog(options = {}) {
    globalThis.__showConfirmDialogCalls = globalThis.__showConfirmDialogCalls || [];
    globalThis.__showConfirmDialogCalls.push(options);
    return globalThis.__showConfirmDialogResult ?? true;
}

export function showToast(payload = {}) {
    globalThis.__toastCalls = globalThis.__toastCalls || [];
    globalThis.__toastCalls.push(payload);
}
""".strip(),
        encoding="utf-8",
    )
    mock_agent_panel_path.write_text(
        """
export function clearAllPanels() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    mock_new_session_draft_path.write_text(
        """
export function clearNewSessionDraft() {
    globalThis.__clearNewSessionDraftCalls =
        (globalThis.__clearNewSessionDraftCalls || 0) + 1;
}
""".strip(),
        encoding="utf-8",
    )
    mock_navigator_path.write_text(
        """
export function hideRoundNavigator() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    mock_subagent_rail_path.write_text(
        """
export function setSubagentRailExpanded() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    mock_clawhub_settings_path.parent.mkdir(parents=True, exist_ok=True)
    mock_clawhub_settings_path.write_text(
        """
export function bindClawHubSettingsHandlers() {
    globalThis.__clawhubSettingsBindCalls =
        (globalThis.__clawhubSettingsBindCalls || 0) + 1;
}

export async function loadClawHubSettingsPanel() {
    globalThis.__clawhubSettingsLoadCalls =
        (globalThis.__clawhubSettingsLoadCalls || 0) + 1;
}
""".strip(),
        encoding="utf-8",
    )
    mock_github_settings_path.write_text(
        """
function resolveGitHubFieldIds(fieldIds = {}) {
    return {
        tokenInputId: fieldIds.tokenInputId || "feature-github-token",
        webhookBaseUrlInputId: fieldIds.webhookBaseUrlInputId || "feature-github-webhook-base-url",
    };
}

function githubSettingsDraft() {
    globalThis.__githubSettingsDraft = globalThis.__githubSettingsDraft || {
        token: "",
        tokenDirty: false,
        webhookBaseUrl: "",
        webhookDirty: false,
    };
    return globalThis.__githubSettingsDraft;
}

export function bindGitHubSettingsHandlers(fieldIds = {}, options = {}) {
    globalThis.__githubSettingsBindCalls =
        (globalThis.__githubSettingsBindCalls || 0) + 1;
    const ids = resolveGitHubFieldIds(fieldIds);
    globalThis.__githubSettingsSaveHandler = async () => {
        globalThis.__githubSettingsSaved = "token";
        if (typeof options?.onSaved === "function") {
            await options.onSaved({ kind: "token" });
        }
    };
    globalThis.__githubSettingsWebhookSaveHandler = async () => {
        globalThis.__githubSettingsSaved = "webhook";
        if (typeof options?.onSaved === "function") {
            await options.onSaved({ kind: "webhook" });
        }
    };
    let saveBtn = null;
    try {
        saveBtn = document.getElementById("feature-save-github-btn");
    } catch (_error) {
        saveBtn = null;
    }
    if (saveBtn) {
        saveBtn.onclick = globalThis.__githubSettingsSaveHandler;
    }
    let webhookSaveBtn = null;
    try {
        webhookSaveBtn = document.getElementById("feature-save-github-webhook-btn");
    } catch (_error) {
        webhookSaveBtn = null;
    }
    if (webhookSaveBtn) {
        webhookSaveBtn.onclick = globalThis.__githubSettingsWebhookSaveHandler;
    }
    const tokenInput = document.getElementById(ids.tokenInputId);
    if (tokenInput) {
        tokenInput.oninput = () => {
            const draft = githubSettingsDraft();
            draft.token = tokenInput.value || "";
            draft.tokenDirty = true;
        };
    }
    const webhookInput = document.getElementById(ids.webhookBaseUrlInputId);
    if (webhookInput) {
        webhookInput.oninput = () => {
            const draft = githubSettingsDraft();
            draft.webhookBaseUrl = webhookInput.value || "";
            draft.webhookDirty = true;
        };
    }
}

export async function loadGitHubSettingsPanel(fieldIds = {}, options = {}) {
    globalThis.__githubSettingsLoadCalls =
        (globalThis.__githubSettingsLoadCalls || 0) + 1;
    globalThis.__githubSettingsLoadOptions =
        globalThis.__githubSettingsLoadOptions || [];
    globalThis.__githubSettingsLoadOptions.push(options);
    const draft = githubSettingsDraft();
    if (!(options?.preserveDirty === true && draft.tokenDirty === true)) {
        draft.token = globalThis.__mockGitHubSettingsToken || "";
        draft.tokenDirty = false;
    }
    if (!(options?.preserveDirty === true && draft.webhookDirty === true)) {
        draft.webhookBaseUrl = globalThis.__mockGitHubSettingsWebhookBaseUrl || "";
        draft.webhookDirty = false;
    }
    restoreGitHubSettingsPanelState(fieldIds);
}

export function restoreGitHubSettingsPanelState(fieldIds = {}) {
    globalThis.__githubSettingsRestoreCalls =
        (globalThis.__githubSettingsRestoreCalls || 0) + 1;
    const ids = resolveGitHubFieldIds(fieldIds);
    const draft = githubSettingsDraft();
    const tokenInput = document.getElementById(ids.tokenInputId);
    if (tokenInput) {
        tokenInput.value = draft.token;
    }
    const webhookInput = document.getElementById(ids.webhookBaseUrlInputId);
    if (webhookInput) {
        webhookInput.value = draft.webhookBaseUrl;
    }
}

export function resetGitHubSettingsPanelState() {
    globalThis.__githubSettingsResetCalls =
        (globalThis.__githubSettingsResetCalls || 0) + 1;
    globalThis.__githubSettingsDraft = {
        token: "",
        tokenDirty: false,
        webhookBaseUrl: "",
        webhookDirty: false,
    };
}

export function renderGitHubAccessPanelMarkup() {
    return `
        <div class="proxy-editor-form" id="feature-github-access-panel">
            <section class="proxy-form-section settings-form-section">
                <div class="proxy-form-grid">
                    <div class="form-group proxy-inline-field">
                        <label for="feature-github-token">GitHub Token</label>
                        <div class="secure-input-row">
                            <input type="password" id="feature-github-token">
                            <button class="secure-input-btn" id="feature-toggle-github-token-btn" type="button">Show</button>
                        </div>
                    </div>
                    <div class="form-group proxy-inline-field proxy-inline-field-actions">
                        <div class="settings-inline-action-row">
                            <button id="feature-test-github-btn" type="button">Test</button>
                            <button id="feature-save-github-btn" type="button">Save</button>
                        </div>
                    </div>
                </div>
            </section>
            <section class="proxy-form-section settings-form-section">
                <div class="proxy-form-grid">
                    <div class="form-group proxy-inline-field">
                        <label for="feature-github-webhook-base-url">Webhook Base URL</label>
                        <input type="url" id="feature-github-webhook-base-url">
                    </div>
                    <div class="form-group proxy-inline-field proxy-inline-field-actions">
                        <div class="settings-inline-action-row">
                            <button id="feature-test-github-webhook-btn" type="button">Test webhook</button>
                            <button id="feature-save-github-webhook-btn" type="button">Save webhook</button>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    `;
}
""".strip(),
        encoding="utf-8",
    )
    mock_connector_cards_path.parent.mkdir(parents=True, exist_ok=True)
    mock_connector_cards_path.write_text(
        """
export function renderConnectorsCardPageMarkup({ connectorsResponse, connectorsError = "", runtimeToolsResponse, runtimeToolsError = "", runtimeToolJobs = {}, searchQuery = "" } = {}) {
    const items = Array.isArray(connectorsResponse?.items) && connectorsResponse.items.length > 0
        ? connectorsResponse.items
        : [{ provider: "feishu" }];
    const runtimeTools = Array.isArray(runtimeToolsResponse?.items)
        ? runtimeToolsResponse.items
        : [];
    const toolIds = ["rg", "gh", "clawhub", "relay-knowledge"];
    return `
        <div class="connectors-page">
            <input type="search" value="${searchQuery}" data-connectors-search>
            ${connectorsError ? `<div data-connectors-error>${connectorsError}<button data-connectors-retry>Retry</button></div>` : items.map(item => `<button data-connector-open="${item.provider || item.connector_id}">Open Connector</button><button data-connector-manage="${item.provider || item.connector_id}">Manage Connector</button>`).join("")}
            <section data-runtime-tools-group>
                <button data-runtime-tools-system-path-add>Path</button>
                ${runtimeToolsError ? `<div data-runtime-tools-error>${runtimeToolsError}<button data-runtime-tools-retry>Retry runtime tools</button></div>` : ""}
                ${toolIds.map(toolId => {
                    const tool = runtimeTools.find(item => item.tool_id === toolId);
                    const loaded = Boolean(tool) || Boolean(runtimeToolsError);
                    const status = tool?.status || "loading";
                    const job = runtimeToolJobs[tool?.download_job_id || `${toolId}-job`];
                    const showAction = loaded && !runtimeToolsError && (status !== "ready" || tool?.update_available === true);
                    return `<article data-runtime-tool-card="${toolId}">${status}${tool?.path ? `<button data-runtime-tool-copy-path="${toolId}">Copy binary path</button>` : ""}${showAction ? `<button data-runtime-tool-download="${toolId}">${job?.status || status}</button>` : ""}</article>`;
                }).join("")}
            </section>
            <button data-feature-gateway-add-feishu>Add Robot</button>
            <button data-feature-gateway-add-discord>Add Discord</button>
            <button data-feature-gateway-connect-wechat>Connect WeChat</button>
            <button data-feature-gateway-add-xiaoluban>Add Xiaoluban</button>
            <div>Xiaoluban</div>
            <div>Self Notify</div>
            <div>Internal ID: xlb_1</div>
            <div>Notify: self + 1 groups</div>
            <div>30 workspaces</div>
            <div>IM: ready</div>
            <button data-feature-xiaoluban-edit="xlb_1">Edit Xiaoluban</button>
            <button data-feature-xiaoluban-toggle="xlb_1">Toggle Xiaoluban</button>
            <button data-feature-xiaoluban-delete="xlb_1">Delete Xiaoluban</button>
        </div>
    `;
}

export function renderRuntimeToolsModalMarkup({ runtimeToolsResponse, runtimeToolJobs = {} } = {}) {
    const runtimeTools = Array.isArray(runtimeToolsResponse?.items)
        ? runtimeToolsResponse.items
        : [];
    return `
        <div data-runtime-tools-modal>
            <button data-runtime-tools-modal-close>Close</button>
            <button data-runtime-tools-system-path-add>Path</button>
            ${runtimeTools.map(tool => `<button data-runtime-tool-download="${tool.tool_id}">${runtimeToolJobs[tool.download_job_id || `${tool.tool_id}-job`]?.status || tool.status}</button>`).join("")}
        </div>
    `;
}

export function renderConnectorConfigModalMarkup({ item, accountManagementMarkup = "" } = {}) {
    const provider = item?.provider || item?.connector_id || "";
    const labels = {
        feishu: "Connect Feishu",
        discord: "Connect Discord",
        wechat: "Connect WeChat",
        xiaoluban: "Connect Xiaoluban",
    };
    return `<div data-connector-modal>${accountManagementMarkup}<button data-connector-configure="${provider}">${labels[provider] || "Configure Connector"}</button></div>`;
}
    """.strip(),
        encoding="utf-8",
    )
    mock_board_todo_path.parent.mkdir(parents=True, exist_ok=True)
    mock_board_todo_path.write_text(
        """
export function mountBoardTodoBoard(options = {}) {
    globalThis.__boardTodoMountCalls = globalThis.__boardTodoMountCalls || [];
    globalThis.__boardTodoMountCalls.push(options);
}

export function unmountBoardTodoBoard() {
    globalThis.__boardTodoUnmountCalls = (globalThis.__boardTodoUnmountCalls || 0) + 1;
}
""".strip(),
        encoding="utf-8",
    )

    source_text = (
        source_path.read_text(encoding="utf-8")
        .replace("../core/api.js", "./mockApi.mjs")
        .replace("../core/state.js", "./mockState.mjs")
        .replace("../utils/dom.js", "./mockDom.mjs")
        .replace("../utils/i18n.js", "./mockI18n.mjs")
        .replace("../utils/markdown.js", "./mockMarkdown.mjs")
        .replace("../utils/feedback.js", "./mockFeedback.mjs")
        .replace("../utils/logger.js", "./mockLogger.mjs")
        .replace("./agentPanel.js", "./mockAgentPanel.mjs")
        .replace("./newSessionDraft.js", "./mockNewSessionDraft.mjs")
        .replace("./rounds/navigator.js", "./mockNavigator.mjs")
        .replace("./subagentRail.js", "./mockSubagentRail.mjs")
        .replace("./settings/githubSettings.js", "./settings/githubSettings.js")
    )
    module_under_test_path.write_text(source_text, encoding="utf-8")
    memory_view_module_path.write_text(
        (repo_root / "frontend" / "dist" / "js" / "components" / "memoryView.js")
        .read_text(encoding="utf-8")
        .replace("../core/api.js", "./mockApi.mjs")
        .replace("../core/state.js", "./mockState.mjs")
        .replace("../utils/dom.js", "./mockDom.mjs")
        .replace("../utils/i18n.js", "./mockI18n.mjs")
        .replace("../utils/feedback.js", "./mockFeedback.mjs")
        .replace("../utils/logger.js", "./mockLogger.mjs")
        .replace("./agentPanel.js", "./mockAgentPanel.mjs")
        .replace("./newSessionDraft.js", "./mockNewSessionDraft.mjs")
        .replace("./projectView.js", "./projectView.mjs")
        .replace("./rounds/navigator.js", "./mockNavigator.mjs")
        .replace("./subagentRail.js", "./mockSubagentRail.mjs"),
        encoding="utf-8",
    )

    runner_path.write_text(
        f"""
import {{ createDomEnvironment, installGlobals }} from "./mockDom.mjs";

globalThis.__snapshotRequests = [];
globalThis.__diffRequests = [];
globalThis.__diffFileRequests = [];
globalThis.__treeRequests = [];
globalThis.__openWorkspaceRootCalls = [];
globalThis.__updatedWorkspacePayload = null;
globalThis.__mockSshProfiles = [];
globalThis.__showFormDialogResult = null;
globalThis.__showFormDialogCalls = [];
globalThis.__dispatchedEvents = [];
globalThis.__logs = [];
globalThis.__toastCalls = [];
globalThis.__clearNewSessionDraftCalls = 0;
globalThis.__boardTodoUnmountCalls = 0;
globalThis.CustomEvent = class CustomEvent {{
    constructor(type, init = {{}}) {{
        this.type = type;
        this.detail = init.detail;
    }}
}};
installGlobals(createDomEnvironment());

{runner_source}
""".strip(),
        encoding="utf-8",
    )

    completed = subprocess.run(
        ["node", str(runner_path)],
        capture_output=True,
        check=False,
        cwd=str(repo_root),
        encoding="utf-8",
        text=True,
        timeout=30,
    )

    if completed.returncode != 0:
        raise AssertionError(
            "Node runner failed:\n"
            f"STDOUT:\n{completed.stdout}\n"
            f"STDERR:\n{completed.stderr}"
        )

    return json.loads(completed.stdout)
