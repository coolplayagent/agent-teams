import { Alert, App, Button, Form, Input, InputNumber, Typography } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import {
  getProxyConfig,
  probeWebConnectivity,
  reloadProxyConfig,
  saveProxyConfig,
} from "../../api/client";
import type {
  ProxyConfig,
  WebConnectivityProbeRequest,
  WebConnectivityProbeResult,
} from "../../api/contracts";
import { useTranslations } from "../../i18n";
import { SettingsQueryState, SettingsSection } from "./SettingsShared";

type ProxySslVerifyValue = "" | "false" | "true";

interface ProxyFormValues {
  all_proxy: string;
  http_proxy: string;
  https_proxy: string;
  no_proxy: string;
  probe_timeout_ms: number;
  probe_url: string;
  proxy_password: string;
  proxy_username: string;
  ssl_verify: ProxySslVerifyValue;
}

const MASKED_PASSWORD_PLACEHOLDER = "************";
const DEFAULT_PROBE_URL = "https://example.com";
const DEFAULT_PROBE_TIMEOUT_MS = 5000;

export function ProxySettingsSection() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [form] = Form.useForm<ProxyFormValues>();
  const [savedPassword, setSavedPassword] = useState<string | null>(null);
  const [passwordDirty, setPasswordDirty] = useState(false);
  const [probeResult, setProbeResult] =
    useState<WebConnectivityProbeResult | null>(null);

  const proxyQuery = useQuery({
    queryKey: ["settings", "proxy"],
    queryFn: getProxyConfig,
  });
  const saveMutation = useMutation({
    mutationFn: async (config: ProxyConfig) => {
      await saveProxyConfig(config);
      return reloadProxyConfig();
    },
    onSuccess: async () => {
      void message.success(t("settingsProxySaved"));
      void queryClient.invalidateQueries({ queryKey: ["settings", "proxy"] });
    },
    onError: (error) => {
      void message.error(error instanceof Error ? error.message : t("settingsSaveFailed"));
    },
  });
  const probeMutation = useMutation({
    mutationFn: (request: WebConnectivityProbeRequest) => probeWebConnectivity(request),
    onSuccess: (result) => setProbeResult(result),
    onError: (error) => {
      void message.error(
        error instanceof Error ? error.message : t("settingsProxyProbeFailed"),
      );
    },
  });

  useEffect(() => {
    if (proxyQuery.data === undefined) {
      return;
    }
    setSavedPassword(normalizeOptionalString(proxyQuery.data.proxy_password));
    setPasswordDirty(false);
    setProbeResult(null);
    form.setFieldsValue({
      all_proxy: proxyQuery.data.all_proxy ?? "",
      http_proxy: proxyQuery.data.http_proxy ?? "",
      https_proxy: proxyQuery.data.https_proxy ?? "",
      no_proxy: proxyQuery.data.no_proxy ?? "",
      probe_timeout_ms:
        form.getFieldValue("probe_timeout_ms") ?? DEFAULT_PROBE_TIMEOUT_MS,
      probe_url: form.getFieldValue("probe_url") || DEFAULT_PROBE_URL,
      proxy_password: "",
      proxy_username: proxyQuery.data.proxy_username ?? "",
      ssl_verify: serializeSslVerify(proxyQuery.data.ssl_verify),
    });
  }, [form, proxyQuery.data]);

  function submit(values: ProxyFormValues) {
    saveMutation.mutate(buildProxyConfig(values, savedPassword, passwordDirty));
  }

  async function testConnectivity() {
    try {
      const values = await form.validateFields(["probe_url", "probe_timeout_ms"]);
      const allValues = {
        ...form.getFieldsValue(),
        ...values,
      } as ProxyFormValues;
      const url = allValues.probe_url.trim();
      if (!url) {
        void message.warning(t("settingsProxyProbeUrlRequired"));
        return;
      }
      probeMutation.mutate({
        proxy_override: buildProxyConfig(allValues, savedPassword, passwordDirty),
        timeout_ms: allValues.probe_timeout_ms,
        url,
      });
    } catch {
      return;
    }
  }

  return (
    <SettingsSection title={t("settingsProxy")}>
      <SettingsQueryState error={proxyQuery.error} loading={proxyQuery.isLoading} />
      {!proxyQuery.isLoading && proxyQuery.data !== undefined ? (
        <Form
          className="at-settings-form at-settings-wide-form"
          form={form}
          layout="vertical"
          onFinish={submit}
        >
          <div className="at-settings-card-list">
            <div className="at-settings-form-card">
              <Typography.Text strong>{t("settingsProxySection")}</Typography.Text>
              <Form.Item label={t("settingsProxyHttp")} name="http_proxy">
                <Input
                  autoComplete="off"
                  placeholder="http://127.0.0.1:7890"
                />
              </Form.Item>
              <Form.Item label={t("settingsProxyHttps")} name="https_proxy">
                <Input
                  autoComplete="off"
                  placeholder="http://127.0.0.1:7890"
                />
              </Form.Item>
              <Form.Item label={t("settingsProxyAll")} name="all_proxy">
                <Input
                  autoComplete="off"
                  placeholder="socks5://127.0.0.1:7890"
                />
              </Form.Item>
              <Form.Item label={t("settingsProxyNoProxy")} name="no_proxy">
                <Input
                  autoComplete="off"
                  placeholder="localhost;127.*;192.168.*;<local>"
                />
              </Form.Item>
            </div>
            <div className="at-settings-form-card">
              <Typography.Text strong>{t("settingsProxyAuthSection")}</Typography.Text>
              <Form.Item label={t("settingsProxyUsername")} name="proxy_username">
                <Input autoComplete="username" />
              </Form.Item>
              <Form.Item label={t("settingsProxyPassword")} name="proxy_password">
                <Input.Password
                  autoComplete="new-password"
                  onChange={() => setPasswordDirty(true)}
                  placeholder={
                    savedPassword && !passwordDirty
                      ? MASKED_PASSWORD_PLACEHOLDER
                      : t("settingsProxyPasswordPlaceholder")
                  }
                />
              </Form.Item>
              {savedPassword && !passwordDirty ? (
                <Typography.Text className="at-settings-help">
                  {t("settingsProxyPasswordPreserved")}
                </Typography.Text>
              ) : null}
              <Form.Item label={t("settingsProxySslVerify")} name="ssl_verify">
                <select
                  className="at-settings-native-select"
                  id="ssl_verify"
                  name="ssl_verify"
                >
                  <option value="">{t("settingsProxySslInherit")}</option>
                  <option value="true">{t("settingsProxySslVerifyOption")}</option>
                  <option value="false">{t("settingsProxySslSkipOption")}</option>
                </select>
              </Form.Item>
            </div>
            <div className="at-settings-form-card">
              <Typography.Text strong>{t("settingsProxyConnectivity")}</Typography.Text>
              <div className="at-settings-proxy-test-row">
                <Form.Item
                  label={t("settingsProxyTargetUrl")}
                  name="probe_url"
                  rules={[
                    {
                      validator: (_, value: string | undefined) => {
                        if (!value?.trim()) {
                          return Promise.resolve();
                        }
                        try {
                          const parsed = new URL(value.trim());
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
                  <Input autoComplete="url" placeholder={DEFAULT_PROBE_URL} />
                </Form.Item>
                <Form.Item
                  label={t("settingsProxyTimeout")}
                  name="probe_timeout_ms"
                  rules={[
                    {
                      max: 300000,
                      message: t("settingsProxyTimeoutValidation"),
                      min: 1000,
                      type: "number",
                    },
                  ]}
                >
                  <InputNumber min={1000} step={500} />
                </Form.Item>
                <Button
                  loading={probeMutation.isPending}
                  onClick={() => void testConnectivity()}
                >
                  {t("settingsProxyTestUrl")}
                </Button>
              </div>
              <ProbeResult result={probeResult} />
            </div>
          </div>
          <Button htmlType="submit" loading={saveMutation.isPending} type="primary">
            {t("settingsSave")}
          </Button>
        </Form>
      ) : null}
    </SettingsSection>
  );
}

function ProbeResult({ result }: { result: WebConnectivityProbeResult | null }) {
  const t = useTranslations();
  if (result === null) {
    return null;
  }
  const statusCode = result.status_code ?? "-";
  const baseMessage = result.ok
    ? t("settingsProxyProbeSuccess", {
        latency: result.latency_ms,
        method: result.used_method,
        status: statusCode,
      })
    : result.error_message ??
      result.error_code ??
      t("settingsProxyProbeFailed");
  const proxyText = result.diagnostics.used_proxy
    ? t("settingsProxyProbeUsedProxy")
    : t("settingsProxyProbeNoProxy");
  return (
    <Alert
      message={baseMessage}
      showIcon
      type={result.ok ? "success" : "error"}
      description={proxyText}
    />
  );
}

function buildProxyConfig(
  values: ProxyFormValues,
  savedPassword: string | null,
  passwordDirty: boolean,
): ProxyConfig {
  return {
    all_proxy: normalizeOptionalString(values.all_proxy),
    http_proxy: normalizeOptionalString(values.http_proxy),
    https_proxy: normalizeOptionalString(values.https_proxy),
    no_proxy: normalizeOptionalString(values.no_proxy),
    proxy_password: passwordDirty
      ? normalizeOptionalString(values.proxy_password)
      : savedPassword,
    proxy_username: normalizeOptionalString(values.proxy_username),
    ssl_verify: parseSslVerify(values.ssl_verify),
  };
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function serializeSslVerify(value: boolean | null | undefined): ProxySslVerifyValue {
  if (value === true) {
    return "true";
  }
  if (value === null || value === undefined) {
    return "false";
  }
  return "false";
}

function parseSslVerify(value: ProxySslVerifyValue): boolean | null {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return null;
}
