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
  deleteSshProfile,
  listSshProfiles,
  probeSshProfileConnection,
  revealSshProfilePassword,
  saveSshProfile,
} from "../api/client";
import type {
  SshProfileConfig,
  SshProfileConnectivityProbeResult,
  SshProfileRecord,
} from "../api/contracts";
import { WorkspaceSettingsSection } from "../features/settings/WorkspaceSettingsSection";

type ConfirmConfig = {
  onOk?: () => Promise<unknown> | unknown;
};

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
  deleteSshProfile: vi.fn(),
  listSshProfiles: vi.fn(),
  probeSshProfileConnection: vi.fn(),
  revealSshProfilePassword: vi.fn(),
  saveSshProfile: vi.fn(),
}));

const deleteSshProfileMock = vi.mocked(deleteSshProfile);
const listSshProfilesMock = vi.mocked(listSshProfiles);
const probeSshProfileConnectionMock = vi.mocked(probeSshProfileConnection);
const revealSshProfilePasswordMock = vi.mocked(revealSshProfilePassword);
const saveSshProfileMock = vi.mocked(saveSshProfile);

let profiles: SshProfileRecord[];

describe("WorkspaceSettingsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    profiles = [savedProfile()];
    listSshProfilesMock.mockImplementation(async () => profiles);
    saveSshProfileMock.mockImplementation(async (sshProfileId, config) => {
      const existing =
        profiles.find((profile) => profile.ssh_profile_id === sshProfileId) ?? null;
      const record = recordFromConfig(sshProfileId, config, existing);
      profiles = [
        ...profiles.filter((profile) => profile.ssh_profile_id !== sshProfileId),
        record,
      ];
      return record;
    });
    deleteSshProfileMock.mockImplementation(async (sshProfileId) => {
      profiles = profiles.filter((profile) => profile.ssh_profile_id !== sshProfileId);
      return { status: "ok" };
    });
    probeSshProfileConnectionMock.mockImplementation(async (request) =>
      probeResult({
        host: request.override?.host ?? "prod-alias",
        latency_ms: request.ssh_profile_id === "prod" ? 42 : 64,
        port: request.override?.port ?? 22,
        ssh_profile_id: request.ssh_profile_id ?? null,
        username: request.override?.username ?? "deploy",
      }),
    );
    revealSshProfilePasswordMock.mockResolvedValue({ password: "saved-secret" });
    antdMocks.modal.confirm.mockImplementation((config: ConfirmConfig) => {
      const result = config.onOk?.();
      if (result instanceof Promise) {
        result.catch(() => undefined);
      }
      return {
        destroy: vi.fn(),
        update: vi.fn(),
      };
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("creates SSH profiles and refreshes the persisted profile list", async () => {
    profiles = [];
    renderSection();

    expect(await screen.findByText("No SSH profiles.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "New SSH profile" }));

    fireEvent.change(await screen.findByLabelText("Profile ID"), {
      target: { value: "prod" },
    });
    fireEvent.change(screen.getByLabelText("Host"), {
      target: { value: "prod-alias" },
    });
    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "deploy" },
    });
    fireEvent.change(screen.getByLabelText("Port"), {
      target: { value: 22 },
    });
    fireEvent.change(screen.getByLabelText("Connect timeout (s)"), {
      target: { value: 15 },
    });
    fireEvent.change(screen.getByLabelText("Remote shell"), {
      target: { value: "/bin/bash" },
    });
    fireEvent.focus(screen.getByLabelText("Password"));
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "secret" },
    });
    fireEvent.change(screen.getByLabelText("Private key name"), {
      target: { value: "id_ed25519" },
    });
    fireEvent.change(screen.getByLabelText("Private key"), {
      target: { value: "-----BEGIN KEY-----\ncontent\n-----END KEY-----" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(saveSshProfileMock).toHaveBeenCalledWith("prod", {
        connect_timeout_seconds: 15,
        host: "prod-alias",
        password: "secret",
        port: 22,
        private_key: "-----BEGIN KEY-----\ncontent\n-----END KEY-----",
        private_key_name: "id_ed25519",
        remote_shell: "/bin/bash",
        username: "deploy",
      }),
    );
    expect((await screen.findAllByText("prod")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("prod-alias · deploy · 22").length).toBeGreaterThan(0);
    expect(antdMocks.message.success).toHaveBeenCalledWith("Saved SSH profile prod.");
  });

  it("probes saved and draft SSH profiles with V1-compatible payloads", async () => {
    renderSection();

    expect((await screen.findAllByText("prod")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Test" }));
    await waitFor(() =>
      expect(probeSshProfileConnectionMock).toHaveBeenCalledWith({
        ssh_profile_id: "prod",
        timeout_ms: 12000,
      }),
    );
    expect(await screen.findByText("prod connected in 42ms.")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "New SSH profile" }));
    fireEvent.change(await screen.findByLabelText("Profile ID"), {
      target: { value: "staging" },
    });
    fireEvent.change(screen.getByLabelText("Host"), {
      target: { value: "staging-alias" },
    });
    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "ops" },
    });
    fireEvent.change(screen.getByLabelText("Port"), {
      target: { value: 2222 },
    });
    fireEvent.change(screen.getByLabelText("Connect timeout (s)"), {
      target: { value: 9 },
    });
    fireEvent.change(screen.getByLabelText("Remote shell"), {
      target: { value: "/bin/bash" },
    });
    fireEvent.focus(screen.getByLabelText("Password"));
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "secret" },
    });
    fireEvent.change(screen.getByLabelText("Private key name"), {
      target: { value: "id_ed25519" },
    });
    fireEvent.change(screen.getByLabelText("Private key"), {
      target: { value: "-----BEGIN KEY-----\ncontent\n-----END KEY-----" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Test draft" }));

    await waitFor(() =>
      expect(probeSshProfileConnectionMock).toHaveBeenLastCalledWith({
        override: {
          connect_timeout_seconds: 9,
          host: "staging-alias",
          password: "secret",
          port: 2222,
          private_key: "-----BEGIN KEY-----\ncontent\n-----END KEY-----",
          private_key_name: "id_ed25519",
          remote_shell: "/bin/bash",
          username: "ops",
        },
        ssh_profile_id: null,
        timeout_ms: 9000,
      }),
    );
  });

  it("edits, reveals, preserves, replaces, and deletes saved SSH profiles", async () => {
    renderSection();

    expect((await screen.findAllByText("prod")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    const profileIdInput = await screen.findByLabelText("Profile ID");
    const passwordInput = screen.getByLabelText("Password");
    const privateKeyInput = screen.getByLabelText("Private key");
    expect(profileIdInput).toBeDisabled();
    expect(passwordInput).toHaveAttribute("placeholder", "************");
    expect(privateKeyInput).toHaveAttribute(
      "placeholder",
      "Leave blank to keep the saved private key.",
    );

    fireEvent.change(screen.getByLabelText("Host"), {
      target: { value: "prod-edited" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Test draft" }));
    await waitFor(() =>
      expect(probeSshProfileConnectionMock).toHaveBeenLastCalledWith({
        override: {
          connect_timeout_seconds: 12,
          host: "prod-edited",
          password: null,
          port: 22,
          private_key: null,
          private_key_name: "id_ed25519",
          remote_shell: "/bin/bash",
          username: "deploy",
        },
        ssh_profile_id: "prod",
        timeout_ms: 12000,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Reveal saved password" }));
    await waitFor(() => expect(revealSshProfilePasswordMock).toHaveBeenCalled());
    expect(revealSshProfilePasswordMock.mock.calls[0]?.[0]).toBe("prod");
    expect(await screen.findByDisplayValue("saved-secret")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(saveSshProfileMock).toHaveBeenLastCalledWith("prod", {
        connect_timeout_seconds: 12,
        host: "prod-edited",
        password: null,
        port: 22,
        private_key: null,
        private_key_name: "id_ed25519",
        remote_shell: "/bin/bash",
        username: "deploy",
      }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.focus(await screen.findByLabelText("Password"));
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "replacement-secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(saveSshProfileMock).toHaveBeenLastCalledWith(
        "prod",
        expect.objectContaining({
          password: "replacement-secret",
        }),
      ),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteSshProfileMock).toHaveBeenCalled());
    expect(deleteSshProfileMock.mock.calls[0]?.[0]).toBe("prod");
    expect(antdMocks.modal.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Delete SSH profile "prod"?',
      }),
    );
  }, 30000);

  it("keeps invalid draft saves and probes inside the editor", async () => {
    renderSection();

    fireEvent.click(await screen.findByRole("button", { name: "New SSH profile" }));
    fireEvent.change(await screen.findByLabelText("Profile ID"), {
      target: { value: "prod" },
    });
    fireEvent.change(screen.getByLabelText("Host"), {
      target: { value: "prod-alias" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Enter a username.")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Test draft" }));
    expect(await screen.findByText("Enter a username.")).toBeVisible();
    expect(saveSshProfileMock).not.toHaveBeenCalled();
    expect(probeSshProfileConnectionMock).not.toHaveBeenCalled();
  }, 30000);
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
        {renderWithStrictModeBoundary(<WorkspaceSettingsSection />)}
      </ConfigProvider>
    </QueryClientProvider>,
  );
}

function renderWithStrictModeBoundary(children: ReactNode) {
  return children;
}

function savedProfile(): SshProfileRecord {
  return {
    connect_timeout_seconds: 12,
    has_password: true,
    has_private_key: true,
    host: "prod-alias",
    port: 22,
    private_key_name: "id_ed25519",
    remote_shell: "/bin/bash",
    ssh_profile_id: "prod",
    username: "deploy",
  };
}

function recordFromConfig(
  sshProfileId: string,
  config: SshProfileConfig,
  existing: SshProfileRecord | null,
): SshProfileRecord {
  return {
    connect_timeout_seconds: config.connect_timeout_seconds ?? null,
    has_password:
      config.password !== null && config.password !== undefined
        ? config.password.trim().length > 0
        : existing?.has_password ?? false,
    has_private_key:
      config.private_key !== null && config.private_key !== undefined
        ? config.private_key.trim().length > 0
        : existing?.has_private_key ?? false,
    host: config.host,
    port: config.port ?? null,
    private_key_name:
      config.private_key !== null && config.private_key !== undefined
        ? config.private_key_name ?? null
        : existing?.private_key_name ?? config.private_key_name ?? null,
    remote_shell: config.remote_shell ?? null,
    ssh_profile_id: sshProfileId,
    username: config.username,
  };
}

function probeResult(
  overrides: Partial<SshProfileConnectivityProbeResult>,
): SshProfileConnectivityProbeResult {
  return {
    checked_at: "2026-06-30T00:00:00Z",
    diagnostics: {
      binary_available: true,
      exit_code: 0,
      host_reachable: true,
      used_password: false,
      used_private_key: false,
      used_system_config: false,
    },
    error_code: null,
    error_message: null,
    host: "prod-alias",
    latency_ms: 42,
    ok: true,
    port: 22,
    retryable: false,
    ssh_profile_id: null,
    username: "deploy",
    ...overrides,
  };
}
