import { ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import {
  createCommand,
  getCommandCatalog,
  updateCommand,
} from "../api/client";
import type { CommandCatalogResponse } from "../api/contracts";
import { CommandsSettingsSection } from "../features/settings/CommandsSettingsSection";

const antdMocks = vi.hoisted(() => ({
  message: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
  modal: {
    confirm: vi.fn(),
  },
}));

vi.mock("antd", async () => {
  const actual = await vi.importActual<typeof import("antd")>("antd");
  return {
    ...actual,
    App: {
      ...actual.App,
      useApp: () => ({
        message: antdMocks.message,
        modal: antdMocks.modal,
      }),
    },
  };
});

vi.mock("../api/client", () => ({
  createCommand: vi.fn(),
  getCommandCatalog: vi.fn(),
  updateCommand: vi.fn(),
}));

const createCommandMock = vi.mocked(createCommand);
const getCommandCatalogMock = vi.mocked(getCommandCatalog);
const updateCommandMock = vi.mocked(updateCommand);
const clipboardWriteMock = vi.fn();

describe("CommandsSettingsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: clipboardWriteMock,
      },
    });
    clipboardWriteMock.mockResolvedValue(undefined);
    getCommandCatalogMock.mockResolvedValue(commandCatalogFixture());
    createCommandMock.mockResolvedValue({
      command: {
        aliases: [],
        allowed_modes: ["normal"],
        argument_hint: "",
        description: "Created command",
        discovery_source: "project_relay_teams",
        name: "opsx:review",
        scope: "project",
        source_path: "C:/repo/.relay-teams/commands/opsx/review.md",
        template: "Review {{args}}",
      },
      workspace_id: "workspace-1",
    });
    updateCommandMock.mockResolvedValue({
      command: commandCatalogFixture().workspaces?.[0]?.commands?.[0] ?? {
        aliases: [],
        allowed_modes: ["normal"],
        argument_hint: "",
        description: "Updated command",
        discovery_source: "project_claude",
        name: "opsx:propose",
        scope: "project",
        source_path: "C:/repo/.claude/commands/opsx/propose.md",
        template: "Updated {{args}}",
      },
      workspace_id: "workspace-1",
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("filters the catalog, copies paths, and only offers writable workspaces", async () => {
    renderSection();

    expect(await screen.findByText("/global")).toBeVisible();
    expect(screen.getByText("/opsx:propose")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Copy path for /opsx:propose" }));
    await waitFor(() =>
      expect(clipboardWriteMock).toHaveBeenCalledWith(
        "C:/repo/.claude/commands/opsx/propose.md",
      ),
    );
    expect(antdMocks.message.success).toHaveBeenCalledWith("Path copied.");

    fireEvent.change(screen.getByLabelText("Search command or workspace"), {
      target: { value: "opsx/propose" },
    });
    expect(screen.getByText("/opsx:propose")).toBeVisible();
    expect(screen.queryByText("/global")).toBeNull();

    fireEvent.change(screen.getByLabelText("Search command or workspace"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Command" }));

    const workspaceSelect = await screen.findByLabelText("Workspace");
    fireEvent.mouseDown(workspaceSelect);
    expect(await screen.findByRole("option", { name: /workspace-1/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /workspace-2/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /read-only/ })).toBeNull();
    expect(screen.queryByRole("option", { name: /remote-only/ })).toBeNull();

    fireEvent.change(screen.getByLabelText("Command name"), {
      target: { value: "opsx:review" },
    });
    await waitFor(() => expect(screen.getByLabelText("File path")).toHaveValue("opsx/review.md"));

    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Created command" },
    });
    fireEvent.change(screen.getByLabelText("Prompt template"), {
      target: { value: "Review {{args}}" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    const preview = document.querySelector(".at-commands-preview");
    expect(preview).toHaveTextContent("name: opsx:review");
    expect(preview).toHaveTextContent("Review {{args}}");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(createCommandMock).toHaveBeenCalledWith({
        aliases: [],
        allowed_modes: ["normal"],
        argument_hint: "",
        description: "Created command",
        name: "opsx:review",
        relative_path: "opsx/review.md",
        scope: "project",
        source: "relay_teams",
        template: "Review {{args}}",
        workspace_id: "workspace-1",
      }),
    );
  });

  it("keeps the current command catalog visible when a later refresh fails", async () => {
    getCommandCatalogMock
      .mockResolvedValueOnce(commandCatalogFixture())
      .mockRejectedValueOnce(new Error("refresh failed"));
    renderSection();

    expect(await screen.findByText("/opsx:propose")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(getCommandCatalogMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("refresh failed")).toBeVisible();
    expect(screen.getByText("/opsx:propose")).toBeVisible();
  });

  it("reports a refresh failure after a successful command save", async () => {
    getCommandCatalogMock
      .mockResolvedValueOnce(commandCatalogFixture())
      .mockRejectedValueOnce(new Error("refresh failed"));
    const commandsUpdatedListener = vi.fn();
    document.addEventListener("agent-teams-commands-updated", commandsUpdatedListener);

    try {
      renderSection();

      await screen.findByText("/opsx:propose");
      fireEvent.click(screen.getByRole("button", { name: "Add Command" }));
      fireEvent.change(await screen.findByLabelText("Command name"), {
        target: { value: "opsx:review" },
      });
      fireEvent.change(screen.getByLabelText("Prompt template"), {
        target: { value: "Review {{args}}" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(createCommandMock).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(antdMocks.message.warning).toHaveBeenCalledWith("refresh failed"),
      );
      expect(antdMocks.message.success).toHaveBeenCalledWith("Command created.");
      expect(commandsUpdatedListener).toHaveBeenCalledTimes(1);
    } finally {
      document.removeEventListener("agent-teams-commands-updated", commandsUpdatedListener);
    }
  });
});

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: {
        retry: false,
      },
      queries: {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
      },
    },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider button={{ autoInsertSpace: false }}>
        {renderWithStrictModeBoundary(<CommandsSettingsSection />)}
      </ConfigProvider>
    </QueryClientProvider>,
  );
}

function renderWithStrictModeBoundary(children: ReactNode) {
  return children;
}

function commandCatalogFixture(): CommandCatalogResponse {
  return {
    app_commands: [
      {
        aliases: ["g"],
        allowed_modes: ["normal"],
        argument_hint: "",
        description: "Global command",
        discovery_source: "app",
        name: "global",
        scope: "app",
        source_path: "C:/config/commands/global.md",
        template: "Global {{args}}",
      },
    ],
    workspaces: [
      {
        can_create_commands: true,
        commands: [
          {
            aliases: ["opsx/propose"],
            allowed_modes: ["normal"],
            argument_hint: "<change-id>",
            description: "Create an OpenSpec proposal",
            discovery_source: "project_claude",
            name: "opsx:propose",
            scope: "project",
            source_path: "C:/repo/.claude/commands/opsx/propose.md",
            template: "Propose {{args}}",
          },
        ],
        root_path: "C:/repo",
        workspace_id: "workspace-1",
      },
      {
        commands: [],
        root_path: "C:/other",
        workspace_id: "workspace-2",
      },
      {
        can_create_commands: false,
        commands: [],
        root_path: "C:/readonly",
        workspace_id: "read-only",
      },
      {
        commands: [],
        root_path: "",
        workspace_id: "remote-only",
      },
    ],
  };
}
