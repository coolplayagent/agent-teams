import { Checkbox, Form, Select } from "antd";

import type { OrchestrationPreset, RoleOption } from "../../api/contracts";
import type { Translate } from "../../i18n";
import { DEFAULT_RUNTIME_TARGET } from "./automationRunConfig";

export function AutomationRuntimeFields({
  normalModeRoles,
  orchestrationPresets,
  runtimeOptionsLoading,
  t,
}: {
  normalModeRoles: RoleOption[];
  orchestrationPresets: OrchestrationPreset[];
  runtimeOptionsLoading: boolean;
  t: Translate;
}) {
  return (
    <section className="at-automation-form-section">
      <h4>{t("automationRuntime")}</h4>
      <div className="at-automation-form-grid">
        <Form.Item
          label={t("composerSessionMode")}
          name="sessionMode"
          rules={[{ required: true }]}
        >
          <Select
            options={[
              { label: t("composerNormal"), value: "normal" },
              {
                label: t("composerOrchestration"),
                value: "orchestration",
              },
            ]}
          />
        </Form.Item>
        <Form.Item
          noStyle
          shouldUpdate={(previous, current) =>
            previous.sessionMode !== current.sessionMode
          }
        >
          {({ getFieldValue }) =>
            getFieldValue("sessionMode") === "orchestration" ? (
              <Form.Item
                label={t("composerOrchestrationPreset")}
                name="orchestrationPresetId"
                rules={[
                  {
                    required: true,
                    validator: (_rule, value: string) =>
                      value && value !== DEFAULT_RUNTIME_TARGET
                        ? Promise.resolve()
                        : Promise.reject(
                            new Error(t("automationPresetRequired")),
                          ),
                  },
                ]}
              >
                <Select
                  loading={runtimeOptionsLoading}
                  notFoundContent={t("automationNoRuntimeOptions")}
                  options={orchestrationPresets.map((preset) => ({
                    label: preset.name?.trim() || preset.preset_id,
                    value: preset.preset_id,
                  }))}
                />
              </Form.Item>
            ) : (
              <Form.Item
                label={t("composerRootRole")}
                name="normalRootRoleId"
              >
                <Select
                  loading={runtimeOptionsLoading}
                  options={[
                    {
                      label: t("automationRuntimeSystemDefault"),
                      value: DEFAULT_RUNTIME_TARGET,
                    },
                    ...normalModeRoles.map((role) => ({
                      label: role.name?.trim() || role.role_id,
                      value: role.role_id,
                    })),
                  ]}
                />
              </Form.Item>
            )
          }
        </Form.Item>
        <Form.Item
          label={t("automationExecutionMode")}
          name="executionMode"
          rules={[{ required: true }]}
        >
          <Select
            options={[
              { label: t("automationExecutionAi"), value: "ai" },
              { label: t("automationExecutionManual"), value: "manual" },
            ]}
          />
        </Form.Item>
        <Form.Item label={t("composerThinkingEffort")} name="thinkingEffort">
          <Select
            allowClear
            options={(["minimal", "low", "medium", "high"] as const).map(
              (effort) => ({ label: effort, value: effort }),
            )}
            placeholder={t("automationRuntimeSystemDefault")}
          />
        </Form.Item>
      </div>
      <div className="at-automation-runtime-toggles">
        <Form.Item name="thinkingEnabled" valuePropName="checked">
          <Checkbox>{t("composerThinking")}</Checkbox>
        </Form.Item>
        <Form.Item name="yolo" valuePropName="checked">
          <Checkbox>{t("composerYolo")}</Checkbox>
        </Form.Item>
      </div>
    </section>
  );
}
