import { expect, test } from "@playwright/test";

import {
  ensureScreenshotDir,
  expectNoDocumentScroll,
  expectNoUnhandledApiRoutes,
  installShellState,
  mockShellApi,
  screenshotPath,
  serveFrontendDist,
  SESSION_ID,
  waitForV2Shell,
  WORKSPACE_ID,
  type MockApiRouteContext,
} from "./support/frontend-app";

const SCREENSHOT_FOLDER = "frontend-v2-ts-project-view";

test("opens reloads and closes the workspace project view", async ({ page }) => {
  const appServer = await serveFrontendDist();
  const requestedUrls: string[] = [];
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleProjectViewApi(context, requestedUrls),
      sessionTitle: "TS project view",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);

    await page
      .getByRole("button", { name: "Open workspace view for Agent Teams Project" })
      .click();

    const projectView = page.locator("section.at-project-view");
    await expect(projectView).toBeVisible();
    await expect(projectView.getByRole("heading", { name: "Agent Teams Project" }))
      .toBeVisible();
    await expect(projectView.getByText("C:/work/agent-teams")).toBeVisible();
    await expect(projectView.getByRole("tab", { name: "Changes 1" }))
      .toHaveAttribute("aria-selected", "true");
    await expect(
      projectView.getByRole("button", { name: "modified frontend/app/src/App.tsx" }),
    ).toBeVisible();
    await expect(projectView.getByText("+return <ProjectView />;")).toBeVisible();

    await projectView.getByRole("tab", { name: "Files" }).click();
    await expect(projectView.getByText("README.md")).toBeVisible();
    await projectView.getByRole("button", { name: "Open file README.md" }).click();
    await expect(projectView.getByText("# Agent Teams Project")).toBeVisible();
    await expect(projectView.getByText("Browser-backed project view content."))
      .toBeVisible();

    const snapshotsBeforeReload = countRequestedPath(
      requestedUrls,
      `/workspaces/${WORKSPACE_ID}/snapshot`,
    );
    await projectView.getByRole("button", { name: "Reload workspace view" }).click();
    await expect
      .poll(() =>
        countRequestedPath(requestedUrls, `/workspaces/${WORKSPACE_ID}/snapshot`),
      )
      .toBeGreaterThan(snapshotsBeforeReload);

    for (const requestedPath of [
      `/workspaces/${WORKSPACE_ID}/snapshot`,
      `/workspaces/${WORKSPACE_ID}/diffs?mount=default`,
      `/workspaces/${WORKSPACE_ID}/tree?path=.&mount=default`,
      `/workspaces/${WORKSPACE_ID}/diff?path=frontend%2Fapp%2Fsrc%2FApp.tsx&mount=default`,
      `/workspaces/${WORKSPACE_ID}/file?path=README.md&mount=default`,
    ]) {
      expect(requestedUrls).toContain(requestedPath);
    }
    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "workspace project view should stay inside the fixed V2 shell",
    );
    await page.mouse.move(720, 520);
    await expect(page.locator(".ant-tooltip:visible")).toHaveCount(0);
    await page.screenshot({
      path: screenshotPath("v2-project-view-files.png", SCREENSHOT_FOLDER),
    });

    await projectView.getByRole("button", { name: "Back to chat" }).click();
    await expect(page.locator(".at-chat-view")).toBeVisible();
    await expect(page.locator("section.at-project-view")).toHaveCount(0);
  } finally {
    await appServer.close();
  }
});

async function handleProjectViewApi(
  context: MockApiRouteContext,
  requestedUrls: string[],
): Promise<boolean> {
  if (context.method !== "GET") {
    return false;
  }
  const requestKey = `${context.path}${context.url.search}`;
  if (context.path === "/workspaces") {
    requestedUrls.push(requestKey);
    await context.fulfillJson([projectWorkspace()]);
    return true;
  }
  if (context.path === `/workspaces/${WORKSPACE_ID}/snapshot`) {
    requestedUrls.push(requestKey);
    await context.fulfillJson(projectSnapshot());
    return true;
  }
  if (context.path === `/workspaces/${WORKSPACE_ID}/diffs`) {
    requestedUrls.push(requestKey);
    await context.fulfillJson(projectDiffs());
    return true;
  }
  if (context.path === `/workspaces/${WORKSPACE_ID}/diff`) {
    requestedUrls.push(requestKey);
    await context.fulfillJson(projectDiffFile());
    return true;
  }
  if (context.path === `/workspaces/${WORKSPACE_ID}/tree`) {
    requestedUrls.push(requestKey);
    await context.fulfillJson(projectTree(context.url.searchParams.get("path")));
    return true;
  }
  if (context.path === `/workspaces/${WORKSPACE_ID}/file`) {
    requestedUrls.push(requestKey);
    await context.fulfillJson(projectFileContent());
    return true;
  }
  return false;
}

function projectWorkspace(): Record<string, unknown> {
  return {
    created_at: "2026-06-25T08:00:00Z",
    default_mount_name: "default",
    display_name: "Agent Teams Project",
    last_session_id: SESSION_ID,
    mounts: [
      {
        mount_name: "default",
        provider: "local",
        provider_config: {
          root_path: "C:/work/agent-teams",
        },
        readable_paths: ["."],
        working_directory: ".",
        writable_paths: ["."],
      },
    ],
    name: "agent-teams-project",
    root_path: "C:/work/agent-teams",
    updated_at: "2026-06-25T08:30:00Z",
    workspace_id: WORKSPACE_ID,
  };
}

function projectSnapshot(): Record<string, unknown> {
  return {
    default_mount_name: "default",
    default_mount_root: "C:/work/agent-teams",
    root_path: "C:/work/agent-teams",
    tree: {
      children: [
        {
          has_children: true,
          kind: "directory",
          name: "frontend",
          path: "frontend",
        },
        {
          kind: "file",
          name: "README.md",
          path: "README.md",
        },
      ],
      kind: "directory",
      name: ".",
      path: ".",
    },
    workspace_id: WORKSPACE_ID,
  };
}

function projectDiffs(): Record<string, unknown> {
  return {
    diff_files: [
      {
        change_type: "modified",
        path: "frontend/app/src/App.tsx",
      },
    ],
    is_git_repository: true,
    mount_name: "default",
    root_path: "C:/work/agent-teams",
    workspace_id: WORKSPACE_ID,
  };
}

function projectDiffFile(): Record<string, unknown> {
  return {
    change_type: "modified",
    diff: [
      "--- a/frontend/app/src/App.tsx",
      "+++ b/frontend/app/src/App.tsx",
      "@@ -1 +1 @@",
      "-return <LegacyProjectView />;",
      "+return <ProjectView />;",
    ].join("\n"),
    is_binary: false,
    mount_name: "default",
    path: "frontend/app/src/App.tsx",
  };
}

function projectTree(path: string | null): Record<string, unknown> {
  if (path === "frontend") {
    return {
      children: [
        {
          has_children: false,
          kind: "directory",
          name: "app",
          path: "frontend/app",
        },
      ],
      directory_path: "frontend",
      mount_name: "default",
      workspace_id: WORKSPACE_ID,
    };
  }
  return {
    children: [
      {
        has_children: true,
        kind: "directory",
        name: "frontend",
        path: "frontend",
      },
      {
        kind: "file",
        name: "README.md",
        path: "README.md",
      },
    ],
    directory_path: ".",
    mount_name: "default",
    workspace_id: WORKSPACE_ID,
  };
}

function projectFileContent(): Record<string, unknown> {
  return {
    content: "# Agent Teams Project\n\nBrowser-backed project view content.",
    encoding: "utf-8",
    is_binary: false,
    mount_name: "default",
    path: "README.md",
    size_bytes: 58,
    truncated: false,
    workspace_id: WORKSPACE_ID,
  };
}

function countRequestedPath(requestedUrls: string[], requestedPath: string): number {
  return requestedUrls.filter((url) => url === requestedPath).length;
}
