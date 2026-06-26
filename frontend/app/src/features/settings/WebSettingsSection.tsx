import { Alert, App, Button, Form, Input, Typography } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { getWebConfig, saveWebConfig } from "../../api/client";
import type { WebConfig, WebFallbackProvider } from "../../api/contracts";
import { useTranslations } from "../../i18n";
import { SettingsQueryState, SettingsSection } from "./SettingsShared";

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
  const webQuery = useQuery({
    queryKey: ["settings", "web"],
    queryFn: getWebConfig,
  });
  const saveMutation = useMutation({
    mutationFn: (values: WebConfig) => saveWebConfig(values),
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
      fallback_provider: webQuery.data.fallback_provider ?? "searxng",
      searxng_instance_url:
        webQuery.data.searxng_instance_url ??
        webQuery.data.searxng_instance_seeds?.[0] ??
        "",
    });
  }, [form, webQuery.data]);

  const fallbackProvider = Form.useWatch("fallback_provider", form) as
    | WebFallbackProvider
    | undefined;
  const seeds = webQuery.data?.searxng_instance_seeds ?? [];
  const hasSavedApiKey = Boolean(webQuery.data?.exa_api_key?.trim());
  let saveError: string | null = null;
  if (saveMutation.error instanceof Error) {
    saveError = saveMutation.error.message;
  } else if (saveMutation.error !== null) {
    saveError = t("settingsSaveFailed");
  }

  function submit(values: WebFormValues) {
    const typedApiKey = values.exa_api_key.trim();
    const savedApiKey = webQuery.data?.exa_api_key?.trim() ?? "";
    saveMutation.mutate({
      provider: "exa",
      exa_api_key: typedApiKey || savedApiKey || null,
      fallback_provider: values.fallback_provider,
      searxng_instance_url: values.searxng_instance_url.trim() || null,
    });
  }

  return (
    <SettingsSection title={t("settingsWeb")}>
      <SettingsQueryState error={webQuery.error} loading={webQuery.isLoading} />
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
          <div className="at-settings-card-list">
            <div className="at-settings-form-card">
              <Form.Item label={t("settingsWebProvider")}>
                <Input readOnly value="Exa" />
              </Form.Item>
              <Form.Item label={t("settingsWebExaApiKey")} name="exa_api_key">
                <Input.Password
                  autoComplete="off"
                  placeholder={
                    hasSavedApiKey
                      ? "************"
                      : t("settingsWebApiKeyPlaceholder")
                  }
                />
              </Form.Item>
              <Typography.Text className="at-settings-help">
                {hasSavedApiKey
                  ? t("settingsWebApiKeyPreserved")
                  : t("settingsWebApiKeyOptional")}
              </Typography.Text>
            </div>
            <div className="at-settings-form-card">
              <Form.Item label={t("settingsWebFallbackProvider")} name="fallback_provider">
                <select className="at-settings-native-select">
                  <option value="searxng">SearXNG</option>
                  <option value="disabled">{t("settingsDisabled")}</option>
                </select>
              </Form.Item>
              <Form.Item
                label={t("settingsWebSearxngUrl")}
                name="searxng_instance_url"
                rules={[
                  {
                    validator: (_, value: string | undefined) => {
                      if (fallbackProvider === "disabled" || !value?.trim()) {
                        return Promise.resolve();
                      }
                      try {
                        const parsed = new URL(value.trim());
                        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
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
                <Input disabled={fallbackProvider === "disabled"} />
              </Form.Item>
              {seeds.length > 0 ? (
                <div className="at-settings-seed-list" aria-label={t("settingsWebBuiltinInstances")}>
                  <Typography.Text>{t("settingsWebBuiltinInstances")}</Typography.Text>
                  {seeds.map((seed) => (
                    <code key={seed}>{seed}</code>
                  ))}
                </div>
              ) : null}
            </div>
            <a
              className="at-settings-provider-link"
              href="https://exa.ai"
              rel="noreferrer"
              target="_blank"
            >
              <span>{t("settingsWebProviderSite")}</span>
              <strong>https://exa.ai</strong>
            </a>
          </div>
          <Button htmlType="submit" loading={saveMutation.isPending} type="primary">
            {t("settingsSave")}
          </Button>
        </Form>
      ) : null}
    </SettingsSection>
  );
}
