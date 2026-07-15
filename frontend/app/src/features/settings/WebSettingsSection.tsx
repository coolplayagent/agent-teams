import { Alert, App, Button, Form, Input, Select, Typography } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { getWebConfig, saveWebConfig } from "../../api/client";
import type { WebConfigSaveRequest, WebFallbackProvider } from "../../api/contracts";
import { useTranslations } from "../../i18n";
import { SettingsQueryState, SettingsSection } from "./SettingsShared";
import {
  defaultWebFallbackProvider,
  webFallbackProviderDescriptor,
  webFallbackProviderOptions,
  webProviderDescriptor,
} from "./webProviderCapabilities";

interface WebFormValues {
  exa_api_key: string;
  fallback_provider: WebFallbackProvider;
  searxng_instance_url: string;
}

export function WebSettingsSection() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [form] = Form.useForm<WebFormValues>();
  const [apiKeyDirty, setApiKeyDirty] = useState(false);
  const webQuery = useQuery({
    queryKey: ["settings", "web"],
    queryFn: getWebConfig,
  });
  const saveMutation = useMutation({
    mutationFn: (values: WebConfigSaveRequest) => saveWebConfig(values),
    onSuccess: () => {
      void message.success(t("settingsWebSaved"));
      void queryClient.invalidateQueries({ queryKey: ["settings", "web"] });
    },
    onError: (error) => {
      void message.error(error instanceof Error ? error.message : t("settingsSaveFailed"));
    },
  });

  useEffect(() => {
    if (webQuery.data === undefined) {
      return;
    }
    form.setFieldsValue({
      exa_api_key: "",
      fallback_provider: defaultWebFallbackProvider(webQuery.data),
      searxng_instance_url:
        webQuery.data.searxng_instance_url ??
        webQuery.data.searxng_instance_seeds?.[0] ??
        "",
    });
    setApiKeyDirty(false);
  }, [form, webQuery.data]);

  const seeds = webQuery.data?.searxng_instance_seeds ?? [];
  const hasSavedApiKey = webQuery.data?.exa_api_key_configured === true;
  const preservingSavedApiKey = hasSavedApiKey && !apiKeyDirty;
  const provider =
    webQuery.data === undefined ? undefined : webProviderDescriptor(webQuery.data);
  const fallbackOptions =
    webQuery.data === undefined ? [] : webFallbackProviderOptions(webQuery.data);
  let saveError: string | null = null;
  if (saveMutation.error instanceof Error) {
    saveError = saveMutation.error.message;
  } else if (saveMutation.error !== null) {
    saveError = t("settingsSaveFailed");
  }

  function submit(values: WebFormValues) {
    if (webQuery.data === undefined) {
      return;
    }
    const typedApiKey = values.exa_api_key.trim();
    const effectiveApiKey = apiKeyDirty ? typedApiKey || null : null;
    const searxngInstanceUrl = (
      values.searxng_instance_url ??
      form.getFieldValue("searxng_instance_url") ??
      ""
    ).trim();
    saveMutation.mutate({
      provider: webQuery.data.provider,
      exa_api_key: effectiveApiKey,
      preserve_exa_api_key: hasSavedApiKey && !apiKeyDirty,
      fallback_provider: values.fallback_provider,
      searxng_instance_url: searxngInstanceUrl || null,
    });
  }

  function clearApiKey() {
    form.setFieldValue("exa_api_key", "");
    setApiKeyDirty(true);
  }

  return (
    <SettingsSection title={t("settingsWeb")}>
      <SettingsQueryState
        error={webQuery.error}
        loading={webQuery.isLoading}
        onRetry={() => void webQuery.refetch()}
      />
      {!webQuery.isLoading && webQuery.data !== undefined ? (
        <Form
          className="at-settings-form at-settings-wide-form"
          form={form}
          layout="vertical"
          onFinish={submit}
        >
          {saveError !== null ? (
            <Alert message={saveError} showIcon type="error" />
          ) : null}
          <div className="at-settings-form-layout">
            <div className="at-settings-form-card-layout">
              <Form.Item label={t("settingsWebProvider")}>
                <Input readOnly value={provider?.display_name ?? webQuery.data.provider} />
              </Form.Item>
              <Form.Item label={t("settingsWebExaApiKey")} name="exa_api_key">
                <Input.Password
                  autoComplete="new-password"
                  onChange={() => setApiKeyDirty(true)}
                  placeholder={
                    preservingSavedApiKey
                      ? "************"
                      : t("settingsWebApiKeyPlaceholder")
                  }
                />
              </Form.Item>
              <Typography.Text className="at-settings-help">
                {preservingSavedApiKey
                  ? t("settingsWebApiKeyPreserved")
                  : t("settingsWebApiKeyOptional")}
              </Typography.Text>
              {hasSavedApiKey ? (
                <Button onClick={clearApiKey}>{t("settingsWebClearApiKey")}</Button>
              ) : null}
            </div>
            <div className="at-settings-form-card-layout">
              <Form.Item label={t("settingsWebFallbackProvider")} name="fallback_provider">
                <Select
                  options={fallbackOptions}
                />
              </Form.Item>
              <Form.Item
                noStyle
                shouldUpdate={(previous: WebFormValues, current: WebFormValues) =>
                  previous.fallback_provider !== current.fallback_provider
                }
              >
                {({ getFieldValue }) => {
                  const currentFallback = getFieldValue(
                    "fallback_provider",
                  ) as WebFallbackProvider | undefined;
                  const fallback = webFallbackProviderDescriptor(
                    webQuery.data,
                    currentFallback,
                  );
                  if (fallback?.uses_instance_url !== true) {
                    return null;
                  }
                  return (
                    <>
                      <Form.Item
                        label={t("settingsWebSearxngUrl")}
                        name="searxng_instance_url"
                        preserve
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
                        <Input />
                      </Form.Item>
                      {seeds.length > 0 ? (
                        <div
                          aria-label={t("settingsWebBuiltinInstances")}
                          className="at-settings-seed-list"
                        >
                          <Typography.Text>{t("settingsWebBuiltinInstances")}</Typography.Text>
                          {seeds.map((seed) => (
                            <code key={seed}>{seed}</code>
                          ))}
                        </div>
                      ) : null}
                    </>
                  );
                }}
              </Form.Item>
            </div>
            {provider?.website_url ? (
              <a
                className="at-settings-provider-link"
                href={provider.website_url}
                rel="noreferrer"
                target="_blank"
              >
                <span>{t("settingsWebProviderSite")}</span>
                <strong>{provider.website_url}</strong>
              </a>
            ) : null}
          </div>
          <Button htmlType="submit" loading={saveMutation.isPending} type="primary">
            {t("settingsSave")}
          </Button>
        </Form>
      ) : null}
    </SettingsSection>
  );
}
