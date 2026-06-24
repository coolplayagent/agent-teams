import { App as AntApp, ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  browseClawHubSkillMarket,
  getClawHubSkillMarketDetail,
  getConfigStatus,
  getRuntimeSkillDetail,
  installClawHubMarketSkill,
  reloadSkillsConfig,
  searchClawHubSkillMarket,
  uninstallClawHubMarketSkill,
  uninstallRuntimeSkill,
} from "../api/client";
import { SkillsView } from "../features/skills/SkillsView";
import { useUiStore } from "../runtime/uiStore";

vi.mock("../api/client", () => ({
  browseClawHubSkillMarket: vi.fn(),
  getClawHubSkillMarketDetail: vi.fn(),
  getConfigStatus: vi.fn(),
  getRuntimeSkillDetail: vi.fn(),
  installClawHubMarketSkill: vi.fn(),
  reloadSkillsConfig: vi.fn(),
  searchClawHubSkillMarket: vi.fn(),
  uninstallClawHubMarketSkill: vi.fn(),
  uninstallRuntimeSkill: vi.fn(),
}));

const browseClawHubSkillMarketMock = vi.mocked(browseClawHubSkillMarket);
const getClawHubSkillMarketDetailMock = vi.mocked(getClawHubSkillMarketDetail);
const getConfigStatusMock = vi.mocked(getConfigStatus);
const getRuntimeSkillDetailMock = vi.mocked(getRuntimeSkillDetail);
const installClawHubMarketSkillMock = vi.mocked(installClawHubMarketSkill);
const reloadSkillsConfigMock = vi.mocked(reloadSkillsConfig);
const searchClawHubSkillMarketMock = vi.mocked(searchClawHubSkillMarket);
const uninstallClawHubMarketSkillMock = vi.mocked(uninstallClawHubMarketSkill);
const uninstallRuntimeSkillMock = vi.mocked(uninstallRuntimeSkill);

beforeEach(() => {
  useUiStore.setState({ language: "en" });
  getConfigStatusMock.mockResolvedValue({
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
  browseClawHubSkillMarketMock.mockResolvedValue({
    items: [
      {
        installed: false,
        slug: "writer",
        stats: { downloads: 12, installs_current: 7, stars: 3 },
        summary: "Draft project updates.",
        title: "Writer",
        version: "1.0.0",
      },
    ],
    ok: true,
    query: "",
    sort: "popular",
  });
  searchClawHubSkillMarketMock.mockResolvedValue({
    items: [
      {
        installed: false,
        slug: "writer",
        stats: { downloads: 12, installs_current: 7, stars: 3 },
        summary: "Draft project updates.",
        title: "Writer",
        version: "1.0.0",
      },
    ],
    ok: true,
    query: "writer",
  });
  getRuntimeSkillDetailMock.mockResolvedValue({
    description: "Create reusable skills.",
    directory: "C:/skills/skill-creator",
    instructions: "Use this skill to create a new skill.",
    manifest_content: "# Skill Creator\n\nCreate reusable skills.",
    manifest_path: "C:/skills/skill-creator/SKILL.md",
    name: "skill-creator",
    ref: "skill-creator",
    source: "builtin",
  });
  getClawHubSkillMarketDetailMock.mockResolvedValue({
    files: [],
    manifest_content: "# Writer\n\nDraft project updates.",
    ok: true,
    slug: "writer",
    summary: "Draft project updates.",
    title: "Writer",
    version: "1.0.0",
  });
  installClawHubMarketSkillMock.mockResolvedValue({
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
  uninstallClawHubMarketSkillMock.mockResolvedValue({
    ok: true,
    skills_reloaded: true,
    slug: "writer",
  });
  uninstallRuntimeSkillMock.mockResolvedValue({
    ok: true,
    ref: "runbook-writer",
    skills_reloaded: true,
  });
  reloadSkillsConfigMock.mockResolvedValue({ status: "ok" });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SkillsView", () => {
  it("renders market skills and installed skill counts from real endpoints", async () => {
    renderSkills();

    expect(await screen.findByText("Writer")).toBeVisible();
    expect(screen.getByText("2 installed")).toBeVisible();
    expect(browseClawHubSkillMarketMock).toHaveBeenCalledWith({
      limit: 24,
      sort: "popular",
    });

    fireEvent.click(screen.getByText("Installed"));

    expect((await screen.findAllByText("skill-creator"))[0]).toBeVisible();
    expect(screen.getAllByText("runbook-writer")[0]).toBeVisible();
  });

  it("searches the ClawHub market when the market query changes", async () => {
    renderSkills();

    expect(await screen.findByText("Writer")).toBeVisible();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search skills" }), {
      target: { value: "writer" },
    });

    await waitFor(() =>
      expect(searchClawHubSkillMarketMock).toHaveBeenCalledWith("writer", 24),
    );
  });

  it("installs a market skill through the install endpoint", async () => {
    renderSkills();

    expect(await screen.findByText("Writer")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Install" }));

    await waitFor(() =>
      expect(installClawHubMarketSkillMock).toHaveBeenCalledWith({
        force: false,
        slug: "writer",
        version: "1.0.0",
      }),
    );
  });

  it("opens installed skill detail with manifest content", async () => {
    renderSkills();

    fireEvent.click(await screen.findByText("Installed"));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Open skill skill-creator",
      }),
    );

    expect(await screen.findByText("Skill Creator")).toBeVisible();
    expect(
      screen
        .getAllByText("Create reusable skills.")
        .some((element) => element.tagName.toLowerCase() === "p"),
    ).toBe(true);
    expect(getRuntimeSkillDetailMock).toHaveBeenCalledWith("skill-creator");
  });
});

function renderSkills() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <ConfigProvider>
      <AntApp>
        <QueryClientProvider client={queryClient}>
          <SkillsView />
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>,
  );
}
