import { App, Button, Checkbox, Form, Switch, Typography } from "antd";
import type { FormInstance } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { getNotificationConfig, saveNotificationConfig } from "../../api/client";
import type {
  NotificationChannel,
  NotificationConfig,
  NotificationRule,
  NotificationTypeId,
} from "../../api/contracts";
import { useTranslations } from "../../i18n";
import { SettingsQueryState, SettingsSection } from "./SettingsShared";

type EditableNotificationTypeId = Exclude<NotificationTypeId, "monitor_triggered">;

interface NotificationRuleFormValues {
  browser: boolean;
  enabled: boolean;
  toast: boolean;
}

type NotificationFormValues = Record<
  EditableNotificationTypeId,
  NotificationRuleFormValues
>;

const EDITABLE_NOTIFICATION_TYPES: EditableNotificationTypeId[] = [
  "tool_approval_requested",
  "run_completed",
  "run_failed",
  "run_stopped",
];

const DIRECT_CHANNELS: NotificationChannel[] = ["browser", "toast"];

export function NotificationSettingsSection() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [form] = Form.useForm<NotificationFormValues>();
  const notificationQuery = useQuery({
    queryKey: ["settings", "notifications"],
    queryFn: getNotificationConfig,
  });
  const saveMutation = useMutation({
    mutationFn: (config: NotificationConfig) => saveNotificationConfig(config),
    onSuccess: () => {
      void message.success(t("settingsNotificationsSaved"));
      void queryClient.invalidateQueries({ queryKey: ["settings", "notifications"] });
    },
    onError: (error) => {
      void message.error(error instanceof Error ? error.message : t("settingsSaveFailed"));
    },
  });

  useEffect(() => {
    if (notificationQuery.data === undefined) {
      return;
    }
    form.setFieldsValue(toNotificationFormValues(notificationQuery.data));
  }, [form, notificationQuery.data]);

  function submit(values: NotificationFormValues) {
    if (notificationQuery.data === undefined) {
      return;
    }
    saveMutation.mutate(mergeNotificationForm(notificationQuery.data, values));
  }

  function resetForm() {
    if (notificationQuery.data === undefined) {
      return;
    }
    form.setFieldsValue(toNotificationFormValues(notificationQuery.data));
  }

  return (
    <SettingsSection title={t("settingsNotifications")}>
      <SettingsQueryState
        error={notificationQuery.error}
        loading={notificationQuery.isLoading}
      />
      {!notificationQuery.isLoading && notificationQuery.data !== undefined ? (
        <Form
          className="at-settings-form at-settings-wide-form"
          form={form}
          layout="vertical"
          onFinish={submit}
        >
          <Typography.Text className="at-settings-help">
            {t("settingsNotificationsHelp")}
          </Typography.Text>
          <div className="at-notification-list">
            {EDITABLE_NOTIFICATION_TYPES.map((typeId) => (
              <NotificationRuleRow
                form={form}
                key={typeId}
                rule={notificationQuery.data[typeId]}
                typeId={typeId}
              />
            ))}
          </div>
          <div className="at-settings-section-actions">
            <Button disabled={saveMutation.isPending} onClick={resetForm}>
              {t("settingsReset")}
            </Button>
            <Button htmlType="submit" loading={saveMutation.isPending} type="primary">
              {t("settingsSave")}
            </Button>
          </div>
        </Form>
      ) : null}
    </SettingsSection>
  );
}

function NotificationRuleRow({
  form,
  rule,
  typeId,
}: {
  form: FormInstance<NotificationFormValues>;
  rule: NotificationRule;
  typeId: EditableNotificationTypeId;
}) {
  const t = useTranslations();
  const hiddenChannels = rule.channels.filter(
    (channel) => !DIRECT_CHANNELS.includes(channel),
  );

  return (
    <div className="at-notification-row">
      <div className="at-notification-copy">
        <Typography.Text strong>{notificationTitle(typeId, t)}</Typography.Text>
        <Typography.Text>{notificationDescription(typeId, t)}</Typography.Text>
        {hiddenChannels.length > 0 ? (
          <Typography.Text className="at-settings-help">
            {t("settingsNotificationsHiddenChannels", {
              count: hiddenChannels.length,
            })}
          </Typography.Text>
        ) : null}
      </div>
      <div className="at-notification-controls">
        <Form.Item
          label={t("settingsEnabled")}
          name={[typeId, "enabled"]}
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>
        <Form.Item noStyle shouldUpdate>
          {() => {
            const enabled = isNotificationEnabled(form, typeId);
            return (
              <div className="at-settings-inline-controls">
                <Form.Item
                  name={[typeId, "browser"]}
                  valuePropName="checked"
                >
                  <Checkbox disabled={!enabled}>{t("settingsChannelBrowser")}</Checkbox>
                </Form.Item>
                <Form.Item name={[typeId, "toast"]} valuePropName="checked">
                  <Checkbox disabled={!enabled}>{t("settingsChannelToast")}</Checkbox>
                </Form.Item>
              </div>
            );
          }}
        </Form.Item>
      </div>
    </div>
  );
}

function isNotificationEnabled(
  form: FormInstance<NotificationFormValues>,
  typeId: EditableNotificationTypeId,
): boolean {
  return form.getFieldValue([typeId, "enabled"]) !== false;
}

function toNotificationFormValues(
  config: NotificationConfig,
): NotificationFormValues {
  return {
    tool_approval_requested: toRuleFormValues(config.tool_approval_requested),
    run_completed: toRuleFormValues(config.run_completed),
    run_failed: toRuleFormValues(config.run_failed),
    run_stopped: toRuleFormValues(config.run_stopped),
  };
}

function toRuleFormValues(rule: NotificationRule): NotificationRuleFormValues {
  return {
    browser: rule.channels.includes("browser"),
    enabled: rule.enabled,
    toast: rule.channels.includes("toast"),
  };
}

function mergeNotificationForm(
  current: NotificationConfig,
  values: NotificationFormValues,
): NotificationConfig {
  return {
    monitor_triggered: cloneRule(current.monitor_triggered),
    run_completed: mergeRule(current.run_completed, values.run_completed),
    run_failed: mergeRule(current.run_failed, values.run_failed),
    run_stopped: mergeRule(current.run_stopped, values.run_stopped),
    tool_approval_requested: mergeRule(
      current.tool_approval_requested,
      values.tool_approval_requested,
    ),
  };
}

function cloneRule(rule: NotificationRule): NotificationRule {
  return {
    ...rule,
    channels: [...rule.channels],
  };
}

function mergeRule(
  current: NotificationRule,
  values: NotificationRuleFormValues,
): NotificationRule {
  const channels = current.channels.filter(
    (channel) => !DIRECT_CHANNELS.includes(channel),
  );
  if (values.browser) {
    channels.push("browser");
  }
  if (values.toast) {
    channels.push("toast");
  }
  if (values.enabled && channels.length === 0) {
    channels.push("toast");
  }
  return {
    ...current,
    channels,
    enabled: values.enabled,
  };
}

function notificationTitle(
  typeId: EditableNotificationTypeId,
  t: ReturnType<typeof useTranslations>,
): string {
  const titleKey = {
    run_completed: "settingsNotificationRunCompleted",
    run_failed: "settingsNotificationRunFailed",
    run_stopped: "settingsNotificationRunStopped",
    tool_approval_requested: "settingsNotificationToolApproval",
  } satisfies Record<EditableNotificationTypeId, ReturnType<typeof useTranslations> extends (key: infer K) => string ? K : never>;
  return t(titleKey[typeId]);
}

function notificationDescription(
  typeId: EditableNotificationTypeId,
  t: ReturnType<typeof useTranslations>,
): string {
  const descriptionKey = {
    run_completed: "settingsNotificationRunCompletedCopy",
    run_failed: "settingsNotificationRunFailedCopy",
    run_stopped: "settingsNotificationRunStoppedCopy",
    tool_approval_requested: "settingsNotificationToolApprovalCopy",
  } satisfies Record<EditableNotificationTypeId, ReturnType<typeof useTranslations> extends (key: infer K) => string ? K : never>;
  return t(descriptionKey[typeId]);
}
