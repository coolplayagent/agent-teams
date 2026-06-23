import { App, Button, Drawer, Form, Skeleton, Switch } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { getGeneralConfig, saveGeneralConfig } from "../../api/client";
import type { GeneralConfig } from "../../api/contracts";
import { useTranslations } from "../../i18n";

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsDrawer({ open, onClose }: SettingsDrawerProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [form] = Form.useForm<GeneralConfig>();
  const configQuery = useQuery({
    queryKey: ["settings", "general"],
    queryFn: getGeneralConfig,
    enabled: open,
  });
  const saveMutation = useMutation({
    mutationFn: saveGeneralConfig,
    onSuccess: () => {
      void message.success(t("settingsSaved"));
      void queryClient.invalidateQueries({ queryKey: ["settings", "general"] });
    },
    onError: (error) => {
      void message.error(error instanceof Error ? error.message : t("settingsSaveFailed"));
    },
  });

  useEffect(() => {
    if (configQuery.data !== undefined) {
      form.setFieldsValue(configQuery.data);
    }
  }, [configQuery.data, form]);

  return (
    <Drawer
      destroyOnClose
      onClose={onClose}
      open={open}
      title={t("settingsTitle")}
      width={420}
    >
      {configQuery.isLoading ? <Skeleton active paragraph={{ rows: 4 }} /> : null}
      {!configQuery.isLoading ? (
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => saveMutation.mutate(values)}
        >
          <Form.Item
            label={t("settingsShellSafetyPolicy")}
            name="shell_safety_policy_enabled"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Button
            htmlType="submit"
            loading={saveMutation.isPending}
            type="primary"
          >
            {t("settingsSave")}
          </Button>
        </Form>
      ) : null}
    </Drawer>
  );
}
