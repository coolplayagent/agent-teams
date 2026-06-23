import { App, Button, Drawer, Form, Skeleton, Switch } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { getGeneralConfig, saveGeneralConfig } from "../../api/client";
import type { GeneralConfig } from "../../api/contracts";

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsDrawer({ open, onClose }: SettingsDrawerProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<GeneralConfig>();
  const configQuery = useQuery({
    queryKey: ["settings", "general"],
    queryFn: getGeneralConfig,
    enabled: open,
  });
  const saveMutation = useMutation({
    mutationFn: saveGeneralConfig,
    onSuccess: () => {
      void message.success("Settings saved.");
      void queryClient.invalidateQueries({ queryKey: ["settings", "general"] });
    },
    onError: (error) => {
      void message.error(error instanceof Error ? error.message : "Settings save failed.");
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
      title="Settings"
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
            label="Shell safety policy"
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
            Save
          </Button>
        </Form>
      ) : null}
    </Drawer>
  );
}
