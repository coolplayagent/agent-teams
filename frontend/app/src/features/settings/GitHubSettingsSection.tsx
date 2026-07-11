import { Alert, App, Button, Form, Input, Typography } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Play, RefreshCw, Save, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  getGitHubConfig,
  getGitHubWebhookTunnelStatus,
  probeGitHubConnectivity,
  probeGitHubWebhookConnectivity,
  revealGitHubToken,
  saveGitHubConfig,
  startGitHubWebhookTunnel,
  stopGitHubWebhookTunnel,
} from "../../api/client";
import type {
  GitHubConnectivityProbeResult,
  GitHubConnectivityProbeRequest,
  GitHubConfigUpdate,
  GitHubWebhookConnectivityProbeResult,
  LocalhostRunTunnelStatus,
} from "../../api/contracts";
import { useTranslations, type Translate } from "../../i18n";
import { SettingsQueryState, SettingsSection } from "./SettingsShared";

interface GitHubFormValues {
  token: string;
  webhook_base_url: string;
}

interface Notice {
  kind: "error" | "info" | "success" | "warning";
  message: string;
}

const MASKED_TOKEN_PLACEHOLDER = "************";
const GITHUB_CALLBACK_PATH = "/api/triggers/github/deliveries";
const GITHUB_CONFIG_QUERY_KEY = ["settings", "github"] as const;
const GITHUB_TUNNEL_QUERY_KEY = [
  "settings",
  "github",
  "webhook",
  "tunnel",
] as const;

export function GitHubSettingsSection() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [form] = Form.useForm<GitHubFormValues>();
  const [tokenDirty, setTokenDirty] = useState(false);
  const tokenFocusedRef = useRef(false);
  const [tokenNotice, setTokenNotice] = useState<Notice | null>(null);
  const [webhookNotice, setWebhookNotice] = useState<Notice | null>(null);
  const watchedToken = Form.useWatch("token", form);
  const watchedWebhookBaseUrl = Form.useWatch("webhook_base_url", form);

  const configQuery = useQuery({
    queryKey: GITHUB_CONFIG_QUERY_KEY,
    queryFn: getGitHubConfig,
  });
  const tunnelQuery = useQuery({
    queryKey: GITHUB_TUNNEL_QUERY_KEY,
    queryFn: getGitHubWebhookTunnelStatus,
  });

  const hasSavedToken = configQuery.data?.token_configured === true;
  const draftToken = normalizeOptionalString(watchedToken);
  const webhookBaseUrl = normalizeOptionalString(watchedWebhookBaseUrl);
  const callbackUrl = buildGitHubCallbackUrl(webhookBaseUrl);

  useEffect(() => {
    if (configQuery.data === undefined) {
      return;
    }
    const nextValues: Partial<GitHubFormValues> = {};
    if (!form.isFieldTouched("token")) {
      nextValues.token = "";
      setTokenDirty(false);
      tokenFocusedRef.current = false;
    }
    if (!form.isFieldTouched("webhook_base_url")) {
      nextValues.webhook_base_url = configQuery.data.webhook_base_url ?? "";
    }
    form.setFieldsValue(nextValues);
  }, [configQuery.data, form]);

  function invalidateGitHubQueries() {
    void queryClient.invalidateQueries({ queryKey: GITHUB_CONFIG_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: GITHUB_TUNNEL_QUERY_KEY });
  }

  const saveTokenMutation = useMutation({
    mutationFn: () =>
      saveGitHubConfig(githubTokenUpdate(tokenDirty, draftToken)),
    onSuccess: () => {
      form.setFields([{ name: "token", touched: false, value: "" }]);
      setTokenDirty(false);
      tokenFocusedRef.current = false;
      setTokenNotice({ kind: "success", message: t("settingsGitHubTokenSaved") });
      void message.success(t("settingsGitHubSaved"));
      invalidateGitHubQueries();
    },
    onError: (error) => {
      const fallback = t("settingsSaveFailed");
      void message.error(error instanceof Error ? error.message : fallback);
    },
  });

  const revealTokenMutation = useMutation({
    mutationFn: revealGitHubToken,
    onSuccess: (result) => {
      const token = normalizeOptionalString(result.token);
      if (token === null) {
        setTokenNotice({
          kind: "warning",
          message: t("settingsGitHubTokenMissing"),
        });
        return;
      }
      form.setFieldsValue({ token });
      setTokenDirty(false);
      tokenFocusedRef.current = false;
      setTokenNotice({
        kind: "info",
        message: t("settingsGitHubTokenRevealed"),
      });
    },
    onError: (error) => {
      setTokenNotice({
        kind: "error",
        message:
          error instanceof Error ? error.message : t("settingsGitHubRevealFailed"),
      });
    },
  });

  const probeTokenMutation = useMutation({
    mutationFn: () =>
      probeGitHubConnectivity(githubTokenProbeRequest(tokenDirty, draftToken)),
    onSuccess: (result) => {
      setTokenNotice(githubProbeNotice(result, t));
    },
    onError: (error) => {
      setTokenNotice({
        kind: "error",
        message:
          error instanceof Error ? error.message : t("settingsGitHubProbeFailed"),
      });
    },
  });

  const saveWebhookMutation = useMutation({
    mutationFn: () => saveGitHubConfig({ webhook_base_url: webhookBaseUrl }),
    onSuccess: () => {
      setWebhookNotice({
        kind: "success",
        message: t("settingsGitHubWebhookSaved"),
      });
      void message.success(t("settingsGitHubSaved"));
      invalidateGitHubQueries();
    },
    onError: (error) => {
      const fallback = t("settingsSaveFailed");
      void message.error(error instanceof Error ? error.message : fallback);
    },
  });

  const probeWebhookMutation = useMutation({
    mutationFn: () =>
      probeGitHubWebhookConnectivity({ webhook_base_url: webhookBaseUrl }),
    onSuccess: (result) => {
      setWebhookNotice(githubWebhookProbeNotice(result, t));
    },
    onError: (error) => {
      setWebhookNotice({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : t("settingsGitHubWebhookProbeFailed"),
      });
    },
  });

  const startTunnelMutation = useMutation({
    mutationFn: () =>
      startGitHubWebhookTunnel({ auto_save_webhook_base_url: true }),
    onSuccess: async (status) => {
      const nextStatus = await resolveStartedTunnelStatus(status);
      queryClient.setQueryData(GITHUB_TUNNEL_QUERY_KEY, nextStatus);
      if (nextStatus.public_url) {
        form.setFieldsValue({ webhook_base_url: nextStatus.public_url });
        if (!status.public_url) {
          await saveGitHubConfig({ webhook_base_url: nextStatus.public_url });
        }
      }
      setWebhookNotice({
        kind: nextStatus.status === "active" ? "success" : "info",
        message: tunnelNotice(nextStatus, t),
      });
      invalidateGitHubQueries();
    },
    onError: (error) => {
      setWebhookNotice({
        kind: "error",
        message:
          error instanceof Error ? error.message : t("settingsGitHubTunnelFailed"),
      });
    },
  });

  const stopTunnelMutation = useMutation({
    mutationFn: () =>
      stopGitHubWebhookTunnel({ clear_webhook_base_url_if_matching: true }),
    onSuccess: (status) => {
      const previousPublicUrl = tunnelQuery.data?.public_url ?? null;
      const publicUrl = status.public_url ?? previousPublicUrl;
      const currentWebhookBaseUrl = normalizeOptionalString(
        form.getFieldValue("webhook_base_url"),
      );
      queryClient.setQueryData(GITHUB_TUNNEL_QUERY_KEY, status);
      if (publicUrl !== null && currentWebhookBaseUrl === publicUrl) {
        form.setFieldsValue({ webhook_base_url: "" });
      }
      setWebhookNotice({ kind: "info", message: tunnelNotice(status, t) });
      invalidateGitHubQueries();
    },
    onError: (error) => {
      setWebhookNotice({
        kind: "error",
        message:
          error instanceof Error ? error.message : t("settingsGitHubTunnelFailed"),
      });
    },
  });

  function testGitHubCli() {
    if (!hasEffectiveGitHubToken(hasSavedToken, tokenDirty, draftToken)) {
      setTokenNotice({
        kind: "error",
        message: t("settingsGitHubTokenRequired"),
      });
      return;
    }
    probeTokenMutation.mutate();
  }

  function testWebhook() {
    if (webhookBaseUrl === null) {
      setWebhookNotice({
        kind: "error",
        message: t("settingsGitHubWebhookRequired"),
      });
      return;
    }
    probeWebhookMutation.mutate();
  }

  const loading = configQuery.isLoading || tunnelQuery.isLoading;
  const error = configQuery.error ?? tunnelQuery.error;

  return (
    <SettingsSection title={t("settingsGitHub")}>
      <SettingsQueryState error={error} loading={loading} />
      {!loading && configQuery.data !== undefined && tunnelQuery.data !== undefined ? (
        <>
          <div className="at-settings-facts">
            <Fact
              label={t("settingsGitHubTokenStatus")}
              value={
                hasSavedToken
                  ? t("settingsGitHubTokenConfigured")
                  : t("settingsGitHubTokenMissing")
              }
            />
            <Fact
              label={t("settingsGitHubWebhookStatus")}
              value={configQuery.data.webhook_base_url ?? "-"}
            />
            <Fact
              label={t("settingsGitHubTunnelStatus")}
              value={tunnelStatusLabel(tunnelQuery.data)}
            />
          </div>
          <Form
            className="at-settings-form at-settings-wide-form"
            form={form}
            layout="vertical"
          >
            <div className="at-settings-form-layout">
            <div className="at-settings-form-card-layout">
                <Typography.Text strong>{t("settingsGitHubCli")}</Typography.Text>
                <Form.Item label={t("settingsGitHubToken")} name="token">
                  <Input.Password
                    allowClear
                    autoComplete="new-password"
                    onChange={() => {
                      if (!tokenFocusedRef.current && hasSavedToken && !tokenDirty) {
                        queueMicrotask(() => form.setFieldValue("token", ""));
                        setTokenNotice(null);
                        return;
                      }
                      setTokenDirty(true);
                      setTokenNotice(null);
                    }}
                    onFocus={() => {
                      tokenFocusedRef.current = true;
                    }}
                    placeholder={
                      hasSavedToken && !tokenDirty
                        ? MASKED_TOKEN_PLACEHOLDER
                        : t("settingsGitHubTokenPlaceholder")
                    }
                  />
                </Form.Item>
                <Typography.Text className="at-settings-help">
                  {hasSavedToken && !tokenDirty
                    ? t("settingsGitHubTokenPreserved")
                    : t("settingsGitHubTokenInputHelp")}
                </Typography.Text>
                <a
                  className="at-settings-provider-link"
                  href="https://github.com/settings/tokens"
                  rel="noreferrer"
                  target="_blank"
                >
                  <strong>{t("settingsGitHubTokenLink")}</strong>
                  <span>https://github.com/settings/tokens</span>
                </a>
                {tokenNotice ? (
                  <Alert
                    className="at-settings-probe"
                    message={tokenNotice.message}
                    showIcon
                    type={tokenNotice.kind}
                  />
                ) : null}
                <div className="at-settings-section-actions">
                  <Button
                    icon={<Eye size={15} />}
                    loading={revealTokenMutation.isPending}
                    onClick={() => revealTokenMutation.mutate()}
                  >
                    {t("settingsGitHubRevealToken")}
                  </Button>
                  <Button
                    icon={<Play size={15} />}
                    loading={probeTokenMutation.isPending}
                    onClick={testGitHubCli}
                  >
                    {t("settingsGitHubTestCli")}
                  </Button>
                  <Button
                    icon={<Save size={15} />}
                    loading={saveTokenMutation.isPending}
                    onClick={() => saveTokenMutation.mutate()}
                    type="primary"
                  >
                    {t("settingsGitHubSaveToken")}
                  </Button>
                </div>
              </div>
            <div className="at-settings-form-card-layout">
                <Typography.Text strong>{t("settingsGitHubWebhook")}</Typography.Text>
                <Form.Item
                  label={t("settingsGitHubWebhookBaseUrl")}
                  name="webhook_base_url"
                  rules={[
                    {
                      validator: (_, value: string | undefined) => {
                        const normalized = normalizeOptionalString(value);
                        if (normalized === null) {
                          return Promise.resolve();
                        }
                        try {
                          const parsed = new URL(normalized);
                          if (
                            parsed.protocol !== "http:" &&
                            parsed.protocol !== "https:"
                          ) {
                            return Promise.reject(
                              new Error(t("settingsWebUrlValidation")),
                            );
                          }
                        } catch {
                          return Promise.reject(
                            new Error(t("settingsWebUrlValidation")),
                          );
                        }
                        return Promise.resolve();
                      },
                    },
                  ]}
                >
                  <Input
                    autoComplete="off"
                    onChange={() => setWebhookNotice(null)}
                    placeholder="https://example.ngrok.app"
                  />
                </Form.Item>
                <div className="at-settings-list at-github-callback-list">
                  <PropertyRow
                    label={t("settingsGitHubCallbackUrl")}
                    value={callbackUrl ?? "-"}
                  />
                  <PropertyRow
                    label={t("settingsGitHubTunnelProvider")}
                    value={tunnelQuery.data.provider}
                  />
                  <PropertyRow
                    label={t("settingsGitHubTunnelUrl")}
                    value={tunnelQuery.data.public_url ?? "-"}
                  />
                </div>
                {webhookNotice ? (
                  <Alert
                    className="at-settings-probe"
                    message={webhookNotice.message}
                    showIcon
                    type={webhookNotice.kind}
                  />
                ) : null}
                <div className="at-settings-section-actions">
                  <Button
                    icon={<Play size={15} />}
                    loading={probeWebhookMutation.isPending}
                    onClick={testWebhook}
                  >
                    {t("settingsGitHubTestWebhook")}
                  </Button>
                  <Button
                    icon={<RefreshCw size={15} />}
                    loading={startTunnelMutation.isPending}
                    onClick={() => startTunnelMutation.mutate()}
                  >
                    {t("settingsGitHubStartTunnel")}
                  </Button>
                  <Button
                    disabled={tunnelQuery.data.status !== "active"}
                    icon={<Square size={15} />}
                    loading={stopTunnelMutation.isPending}
                    onClick={() => stopTunnelMutation.mutate()}
                  >
                    {t("settingsGitHubStopTunnel")}
                  </Button>
                  <Button
                    icon={<Save size={15} />}
                    loading={saveWebhookMutation.isPending}
                    onClick={() => {
                      void form
                        .validateFields(["webhook_base_url"])
                        .then(() => {
                          saveWebhookMutation.mutate();
                        })
                        .catch(() => undefined);
                    }}
                    type="primary"
                  >
                    {t("settingsGitHubSaveWebhook")}
                  </Button>
                </div>
              </div>
            </div>
          </Form>
        </>
      ) : null}
    </SettingsSection>
  );

  async function resolveStartedTunnelStatus(
    status: LocalhostRunTunnelStatus,
  ): Promise<LocalhostRunTunnelStatus> {
    if (status.public_url || status.status !== "starting") {
      return status;
    }
    const cachedStatus = queryClient.getQueryData<LocalhostRunTunnelStatus>(
      GITHUB_TUNNEL_QUERY_KEY,
    );
    if (cachedStatus?.public_url) {
      return cachedStatus;
    }
    try {
      return await getGitHubWebhookTunnelStatus();
    } catch {
      return status;
    }
  }
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="at-settings-list-row">
      <Typography.Text className="at-settings-list-meta">{label}</Typography.Text>
      <Typography.Text ellipsis title={value}>
        {value}
      </Typography.Text>
    </div>
  );
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function githubTokenUpdate(
  tokenDirty: boolean,
  token: string | null,
): GitHubConfigUpdate {
  return tokenDirty ? { token } : {};
}

function githubTokenProbeRequest(
  tokenDirty: boolean,
  token: string | null,
): GitHubConnectivityProbeRequest {
  return tokenDirty ? { token } : {};
}

function hasEffectiveGitHubToken(
  hasSavedToken: boolean,
  tokenDirty: boolean,
  token: string | null,
): boolean {
  return tokenDirty ? token !== null : hasSavedToken;
}

function buildGitHubCallbackUrl(baseUrl: string | null): string | null {
  if (baseUrl === null) {
    return null;
  }
  return `${baseUrl.replace(/\/+$/, "")}${GITHUB_CALLBACK_PATH}`;
}

function githubProbeNotice(
  result: GitHubConnectivityProbeResult,
  t: Translate,
): Notice {
  if (result.ok) {
    return {
      kind: "success",
      message: t("settingsGitHubProbeSuccess", {
        latency: formatLatency(result.latency_ms),
        username: result.username || "github",
      }),
    };
  }
  return {
    kind: result.retryable ? "warning" : "error",
    message: t("settingsGitHubProbeReason", {
      reason: result.error_message || result.error_code || t("settingsUnknown"),
    }),
  };
}

function githubWebhookProbeNotice(
  result: GitHubWebhookConnectivityProbeResult,
  t: Translate,
): Notice {
  if (result.ok) {
    return {
      kind: "success",
      message: t("settingsGitHubWebhookProbeSuccess", {
        latency: formatLatency(result.latency_ms),
        status: String(result.status_code ?? 200),
      }),
    };
  }
  return {
    kind: result.retryable ? "warning" : "error",
    message: t("settingsGitHubWebhookProbeReason", {
      reason: result.error_message || result.error_code || t("settingsUnknown"),
    }),
  };
}

function tunnelNotice(status: LocalhostRunTunnelStatus, t: Translate): string {
  if (status.status === "active" && status.public_url) {
    return t("settingsGitHubTunnelStarted", { url: status.public_url });
  }
  if (status.status === "stopped" || status.status === "idle") {
    return t("settingsGitHubTunnelStopped");
  }
  return status.error_message || status.last_message || status.status;
}

function tunnelStatusLabel(status: LocalhostRunTunnelStatus): string {
  return status.public_url ? `${status.status} · ${status.public_url}` : status.status;
}

function formatLatency(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  }).format(value);
}
