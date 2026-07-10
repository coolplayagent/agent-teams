import { ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import {
  getAgentRuntime,
  getAgentRuntimes,
  getEnvironmentVariables,
  saveAgentRuntime,
  startAgentRuntimeTestJob,
} from "../api/client";
import type {
  AgentRuntimeConfig,
  AgentRuntimeSummary,
  AgentRuntimeTestJob,
  EnvironmentVariableCatalog,
} from "../api/contracts";
import { AgentRuntimeSettingsSection } from "../features/settings/RuntimeSettingsSections";

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
  deleteAgentRuntime: vi.fn(),
  deletePlugin: vi.fn(),
  disablePlugin: vi.fn(),
  enablePlugin: vi.fn(),
  getAgentRuntime: vi.fn(),
  getAgentRuntimeRegistry: vi.fn(),
  getAgentRuntimes: vi.fn(),
  getAgentRuntimeTestJob: vi.fn(),
  getEnvironmentVariables: vi.fn(),
  getHookRuntimeView: vi.fn(),
  getHooksConfig: vi.fn(),
  getPluginsConfig: vi.fn(),
  getPluginsRuntime: vi.fn(),
  installAgentRuntimeFromRegistry: vi.fn(),
  refreshAgentRuntimeRegistry: vi.fn(),
  saveAgentRuntime: vi.fn(),
  saveHooksConfig: vi.fn(),
  startAgentRuntimeTestJob: vi.fn(),
  updatePlugin: vi.fn(),
  validateHooksConfig: vi.fn(),
}));

const getAgentRuntimeMock = vi.mocked(getAgentRuntime);
const getAgentRuntimesMock = vi.mocked(getAgentRuntimes);
const getEnvironmentVariablesMock = vi.mocked(getEnvironmentVariables);
const saveAgentRuntimeMock = vi.mocked(saveAgentRuntime);
const startAgentRuntimeTestJobMock = vi.mocked(startAgentRuntimeTestJob);

let runtimes: AgentRuntimeSummary[];
let runtimeConfigs: Record<string, AgentRuntimeConfig>;

describe("AgentRuntimeSettingsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtimeConfigs = {
      codex_local: stdioRuntimeConfig(),
      registry_secret_runtime: registrySecretRuntimeConfig(),
    };
    runtimes = Object.values(runtimeConfigs).map(runtimeSummary);
    getAgentRuntimesMock.mockImplementation(async () => runtimes);
    getAgentRuntimeMock.mockImplementation(async (agentId) => runtimeConfigs[agentId]);
    getEnvironmentVariablesMock.mockResolvedValue(environmentCatalog());
    saveAgentRuntimeMock.mockImplementation(async (_agentId, payload) => {
      runtimeConfigs[payload.agent_id] = payload;
      runtimes = Object.values(runtimeConfigs).map(runtimeSummary);
      return payload;
    });
    const testJob = succeededTestJob("codex_local");
    startAgentRuntimeTestJobMock.mockResolvedValue(testJob);
  });

  afterEach(() => {
    cleanup();
  });

  it("saves and tests stdio runtimes with Settings environment bindings", async () => {
    runtimes = [runtimeSummary(runtimeConfigs.codex_local)];
    renderSection();

    fireEvent.click((await screen.findByText("Codex Local")).closest("button") as HTMLElement);
    expect(await screen.findByDisplayValue("codex_local")).toBeVisible();
    expect(getEnvironmentVariablesMock).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Codex Local Updated" },
    });
    fireEvent.change(screen.getByLabelText("Command"), {
      target: { value: "codex --serve" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add environment" }));
    await chooseSelectOption("Name", "OPENAI_API_KEY · App");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveAgentRuntimeMock).toHaveBeenCalledTimes(1));
    expect(saveAgentRuntimeMock.mock.calls[0]?.[0]).toBe("codex_local");
    expect(saveAgentRuntimeMock.mock.calls[0]?.[1]).toMatchObject({
      agent_id: "codex_local",
      name: "Codex Local Updated",
      protocol: "acp",
      transport: {
        args: ["--serve"],
        command: "codex --serve",
        env: [
          {
            configured: false,
            name: "OPENAI_API_KEY",
            secret: false,
            value: "sk-live",
          },
        ],
        transport: "stdio",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Test" }));
    await waitFor(() =>
      expect(startAgentRuntimeTestJobMock).toHaveBeenCalledWith("codex_local"),
    );
    expect(antdMocks.message.success).toHaveBeenLastCalledWith("Connected");
  }, 15000);

  it("preserves configured registry secrets and registry snapshots on save", async () => {
    runtimes = [runtimeSummary(runtimeConfigs.registry_secret_runtime)];
    renderSection();

    fireEvent.click(
      (await screen.findByText("Registry Secret Runtime")).closest("button") as HTMLElement,
    );
    expect(await screen.findByDisplayValue("registry_secret_runtime")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveAgentRuntimeMock).toHaveBeenCalledTimes(1));
    expect(saveAgentRuntimeMock.mock.calls[0]?.[0]).toBe("registry_secret_runtime");
    expect(saveAgentRuntimeMock.mock.calls[0]?.[1]).toMatchObject({
      agent_id: "registry_secret_runtime",
      transport: {
        env: [
          {
            configured: true,
            name: "OPENAI_API_KEY",
            secret: true,
            value: "",
          },
        ],
        registry_entry: {
          distribution: {
            npx: {
              args: ["--stdio"],
              env: {},
              package: "@vendor/runtime@2.0.0",
            },
          },
          id: "vendor/runtime",
          name: "Vendor Runtime",
          version: "2.0.0",
        },
        registry_id: "vendor/runtime",
        registry_version: "2.0.0",
        transport: "registry",
      },
    });
  }, 15000);

  it("creates registry runtimes with selected Settings environment variables", async () => {
    runtimes = [runtimeSummary(runtimeConfigs.codex_local)];
    renderSection();

    expect(await screen.findByText("Codex Local")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "New runtime" }));
    expect(await screen.findByText("Unsaved runtime")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Agent ID"), {
      target: { value: "registry_runtime" },
    });
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Registry Runtime" },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Runs from ACP registry." },
    });
    await chooseSelectOption("Transport", "registry");
    fireEvent.change(await screen.findByLabelText("Registry ID"), {
      target: { value: "vendor/runtime" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add environment" }));
    await chooseSelectOption("Name", "OPENAI_API_KEY · App");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveAgentRuntimeMock).toHaveBeenCalledTimes(1));
    expect(saveAgentRuntimeMock.mock.calls[0]?.[0]).toBe("registry_runtime");
    expect(saveAgentRuntimeMock.mock.calls[0]?.[1]).toMatchObject({
      agent_id: "registry_runtime",
      description: "Runs from ACP registry.",
      name: "Registry Runtime",
      protocol: "acp",
      transport: {
        distribution: "auto",
        env: [
          {
            configured: false,
            name: "OPENAI_API_KEY",
            secret: false,
            value: "sk-live",
          },
        ],
        registry_entry: null,
        registry_id: "vendor/runtime",
        registry_version: "",
        transport: "registry",
      },
    });
  }, 15000);
});

async function chooseSelectOption(label: string, optionText: string) {
  fireEvent.mouseDown(await screen.findByRole("combobox", { name: label }));
  const matches = await screen.findAllByText(optionText);
  fireEvent.click(matches[matches.length - 1] as HTMLElement);
}

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
        {renderWithStrictModeBoundary(<AgentRuntimeSettingsSection />)}
      </ConfigProvider>
    </QueryClientProvider>,
  );
}

function renderWithStrictModeBoundary(children: ReactNode) {
  return children;
}

function runtimeSummary(config: AgentRuntimeConfig): AgentRuntimeSummary {
  return {
    agent_id: config.agent_id,
    description: config.description,
    name: config.name,
    protocol: config.protocol,
    transport: config.transport.transport,
  };
}

function stdioRuntimeConfig(): AgentRuntimeConfig {
  return {
    agent_id: "codex_local",
    description: "Runs Codex locally.",
    name: "Codex Local",
    native_config_enabled: false,
    native_config_provider: "",
    protocol: "acp",
    skill_bridge_enabled: false,
    skill_bridge_mode: "inline",
    skill_bridge_skills: [],
    transport: {
      args: ["--serve"],
      command: "codex",
      env: [],
      transport: "stdio",
    },
  };
}

function registrySecretRuntimeConfig(): AgentRuntimeConfig {
  return {
    agent_id: "registry_secret_runtime",
    description: "Keeps registry secrets.",
    name: "Registry Secret Runtime",
    native_config_enabled: false,
    native_config_provider: "",
    protocol: "acp",
    skill_bridge_enabled: false,
    skill_bridge_mode: "inline",
    skill_bridge_skills: [],
    transport: {
      distribution: "auto",
      env: [
        {
          configured: true,
          name: "OPENAI_API_KEY",
          secret: true,
          value: "",
        },
      ],
      registry_entry: {
        description: "Runs from ACP registry.",
        distribution: {
          npx: {
            args: ["--stdio"],
            env: {},
            package: "@vendor/runtime@2.0.0",
          },
        },
        id: "vendor/runtime",
        name: "Vendor Runtime",
        version: "2.0.0",
      },
      registry_id: "vendor/runtime",
      registry_version: "2.0.0",
      transport: "registry",
    },
  };
}

function environmentCatalog(): EnvironmentVariableCatalog {
  return {
    app: [
      {
        key: "OPENAI_API_KEY",
        masked: true,
        scope: "app",
        value: "sk-live",
        value_kind: "string",
      },
      {
        key: "HTTP_PROXY",
        masked: false,
        scope: "app",
        value: "http://hidden.proxy",
        value_kind: "string",
      },
    ],
    system: [
      {
        key: "PATH",
        masked: false,
        scope: "system",
        value: "/usr/bin",
        value_kind: "string",
      },
    ],
  };
}

function succeededTestJob(agentId: string): AgentRuntimeTestJob {
  return {
    agent_id: agentId,
    job_id: "job-1",
    message: "Connected",
    phase: "completed",
    progress_percent: 100,
    result: {
      message: "Connected",
      ok: true,
      protocol: "acp",
    },
    status: "succeeded",
  };
}
