import { expect, test } from "@playwright/test";

import {
  ensureScreenshotDir,
  expectNoDocumentScroll,
  expectNoUnhandledApiRoutes,
  installShellState,
  mockShellApi,
  screenshotPath,
  serveFrontendDist,
  waitForV2Shell,
  type MockApiRouteContext,
} from "./support/frontend-app";

const SCREENSHOT_FOLDER = "frontend-v2-ts-skills";

interface SkillsViewState {
  failDetailSlugs: Set<string>;
  failInstallSlugs: Set<string>;
  failInstalledStatus: boolean;
  failProbe: boolean;
  includeMarketFailureItems: boolean;
  installPayloads: Record<string, unknown>[];
  marketUninstallRequests: string[];
  probePayloads: Record<string, unknown>[];
  releaseMarketRequests: Array<() => void>;
  reloadCount: number;
  runtimeUninstallRequests: string[];
  savePayloads: Record<string, unknown>[];
  searchQueries: string[];
  slowInitialMarket: boolean;
}

test("manages market and installed skills from the Skills surface", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = skillsViewState();
  try {
    await installShellState(page);
    const unhandledApiRoutes: string[] = [];
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleSkillsApi(context, state),
      sessionTitle: "TS skills view",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    await page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("button", { name: "Skills" })
      .click();

    const skillsView = page.getByTestId("skills-view");
    await expect(skillsView).toBeVisible();
    await expect(skillsView.getByText("2 installed")).toBeVisible();
    await expect(
      skillsView.getByRole("button", { name: "Open skill Writer" }),
    ).toBeVisible();
    await expect(skillsView.getByText("Installs: 7")).toBeVisible();
    await page.screenshot({
      path: screenshotPath("v2-skills-market.png", SCREENSHOT_FOLDER),
    });

    await skillsView.getByRole("searchbox", { name: "Search skills" }).fill(
      "writer",
    );
    await expect
      .poll(() => state.searchQueries)
      .toEqual(["writer"]);
    await skillsView.getByRole("button", { name: "Open skill Writer" }).click();
    const marketDetail = page.getByRole("dialog", { name: "Skill detail" });
    await expect(marketDetail).toBeVisible();
    await expect(
      marketDetail.getByRole("heading", { level: 3, name: "Writer" }),
    ).toBeVisible();
    await expect(marketDetail.getByText("Draft project updates.").first())
      .toBeVisible();
    await page.keyboard.press("Escape");
    await expect(marketDetail).toBeHidden();

    await skillsView.getByRole("button", { name: "Install" }).click();
    await expect
      .poll(() => state.installPayloads)
      .toContainEqual({ force: false, slug: "writer", version: "1.0.0" });
    await expect(page.getByText("Skill installed.")).toBeVisible();

    await skillsView.getByRole("searchbox", { name: "Search skills" }).fill("");
    await skillsView.getByText("Installed", { exact: true }).click();
    await expect(
      skillsView.getByRole("button", { name: "Open skill skill-creator" }),
    ).toBeVisible();
    await expect(
      skillsView.getByRole("button", { name: "Open skill runbook-writer" }),
    ).toBeVisible();

    await skillsView
      .getByRole("button", { name: "Open skill skill-creator" })
      .click();
    const installedDetail = page.getByRole("dialog", {
      name: "Skill detail",
    });
    await expect(
      installedDetail.getByRole("heading", { level: 3, name: "skill-creator" }),
    ).toBeVisible();
    await expect(installedDetail.getByText("C:/skills/skill-creator/SKILL.md"))
      .toBeVisible();
    await installedDetail.screenshot({
      path: screenshotPath("v2-skills-installed-detail.png", SCREENSHOT_FOLDER),
    });
    await page.keyboard.press("Escape");
    await expect(installedDetail).toBeHidden();

    await skillsView
      .getByRole("button", { name: "Uninstall" })
      .filter({ hasText: "Uninstall" })
      .first()
      .click();
    await page.getByRole("button", { name: "Uninstall" }).last().click();
    await expect
      .poll(() => state.runtimeUninstallRequests)
      .toEqual(["runbook-writer"]);
    await expect(page.getByText("Skill uninstalled.")).toBeVisible();

    await skillsView.getByRole("button", { name: "Refresh skills" }).click();
    await expect.poll(() => state.reloadCount).toBe(1);
    await expect(page.getByText("Skills reloaded.")).toBeVisible();

    await skillsView.getByRole("button", { name: "ClawHub settings" }).click();
    const settings = page.getByRole("dialog", {
      name: "ClawHub settings",
    });
    await expect(settings).toBeVisible();
    const tokenInput = settings.getByPlaceholder("************");
    await expect(tokenInput).toBeVisible();
    await tokenInput.fill("new-token");
    await settings.getByRole("button", { name: "Test connection" }).click();
    await expect
      .poll(() => state.probePayloads)
      .toEqual([{ token: "new-token" }]);
    await expect(
      settings.getByText("Connected with clawhub 1.1.0 in 12 ms."),
    ).toBeVisible();
    await settings.getByRole("button", { name: "Save" }).click();
    await expect
      .poll(() => state.savePayloads)
      .toEqual([{ token: "new-token" }]);
    await expect(page.getByText("ClawHub settings saved.")).toBeVisible();
    await page.screenshot({
      path: screenshotPath("v2-skills-clawhub-settings.png", SCREENSHOT_FOLDER),
    });

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "v2 skills market, detail, install, uninstall, and settings should stay framed",
    );
  } finally {
    await appServer.close();
  }
});

test("shows Skills loading, paging, and failure states inside the fixed shell", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = skillsViewState();
  state.failInstalledStatus = true;
  state.includeMarketFailureItems = true;
  state.slowInitialMarket = true;
  state.failInstallSlugs.add("broken-installer");
  state.failDetailSlugs.add("broken-detail");
  const unhandledApiRoutes: string[] = [];
  try {
    await installShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleSkillsApi(context, state),
      sessionTitle: "TS skills states",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    await page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("button", { name: "Skills" })
      .click();

    const skillsView = page.getByTestId("skills-view");
    await expect(skillsView).toBeVisible();
    await expect(skillsView.locator(".ant-skeleton")).toHaveCount(1);
    await page.screenshot({
      path: screenshotPath("v2-skills-market-loading.png", SCREENSHOT_FOLDER),
    });
    releasePendingMarketRequests(state);

    await expect(
      skillsView.getByRole("button", { name: "Open skill Writer" }),
    ).toBeVisible();
    await expect(
      skillsView.getByRole("button", { name: "Open skill Broken Detail" }),
    ).toBeVisible();
    await expect(
      skillsView.getByRole("button", { name: "Load more" }),
    ).toBeVisible();

    await skillsView.getByRole("button", { name: "Load more" }).click();
    await expect(
      skillsView.getByRole("button", { name: "Open skill Second Page Skill" }),
    ).toBeVisible();
    await expect(
      skillsView.getByRole("button", { name: "Load more" }),
    ).toHaveCount(0);
    await page.screenshot({
      path: screenshotPath("v2-skills-market-paged.png", SCREENSHOT_FOLDER),
    });

    await skillsView
      .locator(".at-skills-card", { hasText: "Broken Installer" })
      .getByRole("button", { exact: true, name: "Install" })
      .click();
    await expect(page.getByText("Installer rejected by ClawHub.")).toBeVisible();

    await skillsView
      .getByRole("button", { name: "Open skill Broken Detail" })
      .click();
    const detailDrawer = page.getByRole("dialog", { name: "Skill detail" });
    await expect(detailDrawer).toBeVisible();
    await expect(
      detailDrawer.getByText("Could not load skill detail."),
    ).toBeVisible();
    await detailDrawer.screenshot({
      path: screenshotPath("v2-skills-detail-error.png", SCREENSHOT_FOLDER),
    });
    await page.keyboard.press("Escape");
    await expect(detailDrawer).toBeHidden();
    await expect(page.locator(".ant-message-notice")).toHaveCount(0, {
      timeout: 5_000,
    });

    await skillsView.getByText("Installed", { exact: true }).click();
    await expect(
      skillsView.getByText("Could not load installed skills."),
    ).toBeVisible();
    await page.screenshot({
      path: screenshotPath("v2-skills-installed-error.png", SCREENSHOT_FOLDER),
    });

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "v2 skills loading, pagination, and error states should stay framed",
    );
  } finally {
    releasePendingMarketRequests(state);
    await appServer.close();
  }
});

test("shows ClawHub probe failures without breaking narrow Skills layout", async ({
  page,
}) => {
  const appServer = await serveFrontendDist();
  const state = skillsViewState();
  state.failProbe = true;
  const unhandledApiRoutes: string[] = [];
  try {
    await page.setViewportSize({ height: 720, width: 760 });
    await installShellState(page);
    await mockShellApi(page, appServer.url, unhandledApiRoutes, {
      handleRequest: (context) => handleSkillsApi(context, state),
      sessionTitle: "TS skills narrow probe",
    });
    await ensureScreenshotDir(SCREENSHOT_FOLDER);

    await page.goto(`${appServer.url}/app/`);
    await waitForV2Shell(page);
    await page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("button", { name: "Skills" })
      .click();

    const skillsView = page.getByTestId("skills-view");
    await expect(skillsView).toBeVisible();
    await expect(
      skillsView.getByRole("button", { name: "Open skill Writer" }),
    ).toBeVisible();

    await skillsView.getByRole("button", { name: "ClawHub settings" }).click();
    const settings = page.getByRole("dialog", {
      name: "ClawHub settings",
    });
    await expect(settings).toBeVisible();
    const tokenInput = settings.getByPlaceholder("************");
    await tokenInput.fill("expired-token");
    await settings.getByRole("button", { name: "Test connection" }).click();
    await expect
      .poll(() => state.probePayloads)
      .toEqual([{ token: "expired-token" }]);
    await expect(
      settings.getByText("ClawHub test failed: ClawHub token rejected."),
    ).toBeVisible();

    const layoutMetrics = await page.evaluate(() => {
      const skills = document.querySelector<HTMLElement>(
        '[data-testid="skills-view"]',
      );
      const toolbar = document.querySelector<HTMLElement>(".at-skills-toolbar");
      return {
        documentOverflowsX:
          document.documentElement.scrollWidth > window.innerWidth + 1,
        skillsOverflowsX: skills
          ? skills.scrollWidth > skills.clientWidth + 1
          : true,
        toolbarOverflowsX: toolbar
          ? toolbar.scrollWidth > toolbar.clientWidth + 1
          : true,
      };
    });
    expect(layoutMetrics).toEqual({
      documentOverflowsX: false,
      skillsOverflowsX: false,
      toolbarOverflowsX: false,
    });
    await page.screenshot({
      path: screenshotPath(
        "v2-skills-clawhub-probe-failed-narrow.png",
        SCREENSHOT_FOLDER,
      ),
    });

    expectNoUnhandledApiRoutes(unhandledApiRoutes);
    await expectNoDocumentScroll(
      page,
      "v2 skills ClawHub probe failure should remain framed at narrow width",
    );
  } finally {
    await appServer.close();
  }
});

function skillsViewState(): SkillsViewState {
  return {
    failDetailSlugs: new Set(),
    failInstallSlugs: new Set(),
    failInstalledStatus: false,
    failProbe: false,
    includeMarketFailureItems: false,
    installPayloads: [],
    marketUninstallRequests: [],
    probePayloads: [],
    releaseMarketRequests: [],
    reloadCount: 0,
    runtimeUninstallRequests: [],
    savePayloads: [],
    searchQueries: [],
    slowInitialMarket: false,
  };
}

async function handleSkillsApi(
  context: MockApiRouteContext,
  state: SkillsViewState,
): Promise<boolean> {
  if (context.method === "GET" && context.path === "/system/configs") {
    if (state.failInstalledStatus) {
      await context.fulfillJson({ detail: "skills unavailable" }, 500);
      return true;
    }
    await context.fulfillJson({
      skills: {
        loaded: true,
        skills: [
          {
            description: "Create reusable skills.",
            name: "skill-creator",
            ref: "skill-creator",
            source: "builtin",
          },
          {
            description: "Draft project-specific runbooks.",
            name: "runbook-writer",
            ref: "runbook-writer",
            source: "user_codex",
          },
        ],
      },
    });
    return true;
  }
  if (
    context.method === "GET"
    && context.path === "/system/skills/market/clawhub"
  ) {
    const cursor = context.url.searchParams.get("cursor") ?? "";
    if (state.slowInitialMarket && cursor.length === 0) {
      state.slowInitialMarket = false;
      await new Promise<void>((resolve) => {
        state.releaseMarketRequests.push(resolve);
      });
    }
    await context.fulfillJson(skillsMarketResponse({
      cursor,
      includeFailureItems: state.includeMarketFailureItems,
    }));
    return true;
  }
  if (
    context.method === "GET"
    && context.path === "/system/skills/market/clawhub/search"
  ) {
    state.searchQueries.push(context.url.searchParams.get("query") ?? "");
    await context.fulfillJson(skillsMarketResponse({ query: "writer" }));
    return true;
  }
  if (
    context.method === "GET"
    && context.path === "/system/skills/market/clawhub/writer"
  ) {
    await context.fulfillJson({
      files: [{ path: "SKILL.md", size: 128 }],
      manifest_content: "# Writer\n\nDraft project updates.",
      ok: true,
      slug: "writer",
      stats: { downloads: 12, installs_current: 7, stars: 3 },
      summary: "Draft project updates.",
      title: "Writer",
      version: "1.0.0",
    });
    return true;
  }
  if (
    context.method === "GET"
    && context.path === "/system/skills/market/clawhub/broken-detail"
  ) {
    if (state.failDetailSlugs.has("broken-detail")) {
      await context.fulfillJson({ detail: "detail unavailable" }, 500);
      return true;
    }
    await context.fulfillJson({
      files: [{ path: "SKILL.md", size: 96 }],
      manifest_content: "# Broken Detail\n\nNormally loads detail.",
      ok: true,
      slug: "broken-detail",
      stats: { downloads: 2, installs_current: 1, stars: 0 },
      summary: "Normally loads detail.",
      title: "Broken Detail",
      version: "0.1.0",
    });
    return true;
  }
  if (
    context.method === "POST"
    && context.path === "/system/skills/market/clawhub/install"
  ) {
    const payload = readRecordPayload(context);
    state.installPayloads.push(payload);
    const slug = typeof payload.slug === "string" ? payload.slug : "";
    if (state.failInstallSlugs.has(slug)) {
      await context.fulfillJson({
        diagnostics: {
          binary_available: true,
          endpoint_fallback_used: false,
          installation_attempted: true,
          installed_during_install: false,
          skills_reloaded: false,
          token_configured: true,
        },
        error_message: "Installer rejected by ClawHub.",
        ok: false,
        retryable: false,
        slug,
      });
      return true;
    }
    await context.fulfillJson({
      diagnostics: {
        binary_available: true,
        endpoint_fallback_used: false,
        installation_attempted: true,
        installed_during_install: true,
        skills_reloaded: true,
        token_configured: true,
      },
      latency_ms: 4,
      ok: true,
      retryable: false,
      slug: "writer",
    });
    return true;
  }
  if (
    context.method === "DELETE"
    && context.path === "/system/skills/market/clawhub/writer"
  ) {
    state.marketUninstallRequests.push("writer");
    await context.fulfillJson({
      ok: true,
      skills_reloaded: true,
      slug: "writer",
    });
    return true;
  }
  if (
    context.method === "GET"
    && context.path === "/system/skills/skill-creator"
  ) {
    await context.fulfillJson({
      description: "Create reusable skills.",
      directory: "C:/skills/skill-creator",
      instructions: "Use this skill to create a new skill.",
      manifest_content: "# Skill Creator\n\nCreate reusable skills.",
      manifest_path: "C:/skills/skill-creator/SKILL.md",
      name: "skill-creator",
      ref: "skill-creator",
      source: "builtin",
    });
    return true;
  }
  if (
    context.method === "DELETE"
    && context.path === "/system/skills/runbook-writer"
  ) {
    state.runtimeUninstallRequests.push("runbook-writer");
    await context.fulfillJson({
      ok: true,
      ref: "runbook-writer",
      skills_reloaded: true,
    });
    return true;
  }
  if (context.method === "POST" && context.path === "/system/configs/skills:reload") {
    state.reloadCount += 1;
    await context.fulfillJson({ status: "ok" });
    return true;
  }
  if (context.method === "GET" && context.path === "/system/configs/clawhub") {
    await context.fulfillJson({ token: "saved-token" });
    return true;
  }
  if (context.method === "POST" && context.path === "/system/configs/clawhub:probe") {
    state.probePayloads.push(readRecordPayload(context));
    if (state.failProbe) {
      await context.fulfillJson({
        checked_at: "2026-06-24T00:00:00Z",
        clawhub_path: null,
        clawhub_version: null,
        diagnostics: {
          binary_available: true,
          endpoint_fallback_used: false,
          installation_attempted: false,
          installed_during_probe: false,
          token_configured: true,
        },
        error_message: "ClawHub token rejected.",
        latency_ms: 18,
        ok: false,
        retryable: true,
      });
      return true;
    }
    await context.fulfillJson({
      checked_at: "2026-06-24T00:00:00Z",
      clawhub_path: "C:/bin/clawhub.exe",
      clawhub_version: "clawhub 1.1.0",
      diagnostics: {
        binary_available: true,
        endpoint_fallback_used: false,
        installation_attempted: false,
        installed_during_probe: false,
        token_configured: true,
      },
      latency_ms: 12,
      ok: true,
      retryable: false,
    });
    return true;
  }
  if (context.method === "PUT" && context.path === "/system/configs/clawhub") {
    state.savePayloads.push(readRecordPayload(context));
    await context.fulfillJson({ status: "ok" });
    return true;
  }
  return false;
}

function skillsMarketResponse({
  cursor = "",
  includeFailureItems = false,
  query = "",
}: {
  cursor?: string;
  includeFailureItems?: boolean;
  query?: string;
} = {}): Record<string, unknown> {
  if (cursor === "page-2") {
    return {
      items: [
        {
          installed: false,
          slug: "second-page-skill",
          stats: { downloads: 4, installs_current: 2, stars: 1 },
          summary: "Loaded from the second ClawHub page.",
          title: "Second Page Skill",
          version: "2.0.0",
        },
      ],
      next_cursor: null,
      ok: true,
      query,
      sort: "popular",
    };
  }
  const items: Record<string, unknown>[] = [
      {
        installed: false,
        slug: "writer",
        stats: { downloads: 12, installs_current: 7, stars: 3 },
        summary: "Draft project updates.",
        title: "Writer",
        version: "1.0.0",
      },
    ];
  if (includeFailureItems) {
    items.push(
      {
        installed: false,
        slug: "broken-installer",
        stats: { downloads: 3, installs_current: 1, stars: 0 },
        summary: "Fails installation for browser error coverage.",
        title: "Broken Installer",
        version: "0.1.0",
      },
      {
        installed: false,
        slug: "broken-detail",
        stats: { downloads: 2, installs_current: 1, stars: 0 },
        summary: "Fails detail loading for drawer error coverage.",
        title: "Broken Detail",
        version: "0.1.0",
      },
    );
  }
  return {
    items,
    next_cursor: query ? null : "page-2",
    ok: true,
    query,
    sort: "popular",
  };
}

function releasePendingMarketRequests(state: SkillsViewState): void {
  const releases = state.releaseMarketRequests.splice(0);
  for (const release of releases) {
    release();
  }
}

function readRecordPayload(context: MockApiRouteContext): Record<string, unknown> {
  const postData = context.route.request().postData();
  if (!postData) {
    return {};
  }
  const parsed: unknown = JSON.parse(postData);
  return isRecord(parsed) ? parsed : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
