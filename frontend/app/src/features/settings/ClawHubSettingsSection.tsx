import { Alert, App, Button, Form, Input, Typography } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import {
  getClawHubConfig,
  probeClawHubConnectivity,
  saveClawHubConfig,
} from "../../api/client";
import type { ClawHubConnectivityProbeResult } from "../../api/contracts";
import { useTranslations, type Translate } from "../../i18n";
import { SettingsQueryState, SettingsSection } from "./SettingsShared";

interface ClawHubFormValues {
  token: string;
}

interface ProbeNotice {
  kind: "error" | "info" | "success" | "warning";
  message: string;
}

const MASKED_TOKEN_PLACEHOLDER = "************";

export function ClawHubSettingsSection() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [form] = Form.useForm<ClawHubFormValues>();
  const [probeNotice, setProbeNotice] = useState<ProbeNotice | null>(null);
  const [tokenDirty, setTokenDirty] = useState(false);

  const configQuery = useQuery({
    queryKey: ["settings", "clawhub"],
    queryFn: getClawHubConfig,
  });
  const savedToken = normalizeOptionalString(configQuery.data?.token);
  const draftToken = normalizeOptionalString(form.getFieldValue("token"));
  const effectiveToken = tokenDirty ? draftToken : savedToken;
  const hasSavedToken = savedToken !== null;

  useEffect(() => {
    if (configQuery.data === undefined) {
      return;
    }
    form.setFieldsValue({ token: "" });
    setProbeNotice(null);
    setTokenDirty(false);
  }, [configQuery.data, form]);

  const saveMutation = useMutation({
    mutationFn: () => saveClawHubConfig({ token: effectiveToken }),
    onSuccess: () => {
      void message.success(t("settingsClawHubSaved"));
      void queryClient.invalidateQueries({ queryKey: ["settings", "clawhub"] });
      void queryClient.invalidateQueries({ queryKey: ["skills", "clawhub-config"] });
    },
    onError: (error) => {
      void message.error(
        error instanceof Error ? error.message : t("settingsClawHubSaveFailed"),
      );
    },
  });
  const probeMutation = useMutation({
    mutationFn: () => probeClawHubConnectivity({ token: effectiveToken }),
    onSuccess: (result) => {
      setProbeNotice(probeNoticeFromResult(result, t));
    },
    onError: (error) => {
      setProbeNotice({
        kind: "error",
        message:
          error instanceof Error ? error.message : t("settingsClawHubProbeFailed"),
      });
    },
  });

  function runProbe() {
    if (effectiveToken === null) {
      setProbeNotice({
        kind: "error",
        message: t("settingsClawHubTokenRequired"),
      });
      return;
    }
    probeMutation.mutate();
  }

  function clearToken() {
    form.setFieldsValue({ token: "" });
    setTokenDirty(true);
    setProbeNotice(null);
  }

  return (
    <SettingsSection title={t("settingsClawHub")}>
      <SettingsQueryState error={configQuery.error} loading={configQuery.isLoading} />
      {!configQuery.isLoading && configQuery.data !== undefined ? (
        <>
          <div className="at-settings-facts">
            <Fact
              label={t("settingsClawHubTokenStatus")}
              value={
                hasSavedToken && !tokenDirty
                  ? t("settingsClawHubTokenSaved")
                  : t("settingsClawHubTokenUnsaved")
              }
            />
            <Fact label={t("settingsClawHubRegistry")} value="clawhub.ai" />
          </div>
          <Form
            className="at-settings-form at-settings-wide-form"
            form={form}
            layout="vertical"
          >
            <div className="at-settings-card-list">
              <div className="at-settings-form-card">
                <Typography.Text strong>{t("settingsClawHubCredential")}</Typography.Text>
                <Form.Item label={t("settingsClawHubToken")} name="token">
                  <Input.Password
                    allowClear
                    autoComplete="new-password"
                    onChange={() => setTokenDirty(true)}
                    placeholder={
                      hasSavedToken && !tokenDirty
                        ? MASKED_TOKEN_PLACEHOLDER
                        : t("settingsClawHubTokenPlaceholder")
                    }
                  />
                </Form.Item>
                <a
                  className="at-settings-provider-link"
                  href="https://clawhub.ai/settings"
                  rel="noreferrer"
                  target="_blank"
                >
                  <strong>{t("settingsClawHubAccount")}</strong>
                  <span>https://clawhub.ai/settings</span>
                </a>
                {probeNotice ? (
                  <Alert
                    className="at-settings-probe"
                    message={probeNotice.message}
                    showIcon
                    type={probeNotice.kind}
                  />
                ) : null}
              </div>
            </div>
            <div className="at-settings-section-actions">
              <Button onClick={clearToken}>{t("settingsClawHubClearToken")}</Button>
              <Button loading={probeMutation.isPending} onClick={runProbe}>
                {probeMutation.isPending
                  ? t("settingsClawHubTesting")
                  : t("settingsClawHubTest")}
              </Button>
              <Button
                loading={saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
                type="primary"
              >
                {t("settingsSave")}
              </Button>
            </div>
          </Form>
        </>
      ) : null}
    </SettingsSection>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function probeNoticeFromResult(
  result: ClawHubConnectivityProbeResult,
  t: Translate,
): ProbeNotice {
  if (result.ok) {
    return {
      kind: "success",
      message: t("settingsClawHubProbeSuccess", {
        latency: formatLatency(result.latency_ms),
        version: result.clawhub_version || "clawhub",
      }),
    };
  }
  return {
    kind: result.retryable ? "warning" : "error",
    message: t("settingsClawHubProbeReason", {
      reason: result.error_message || result.error_code || t("settingsUnknown"),
    }),
  };
}

function formatLatency(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  }).format(value);
}
