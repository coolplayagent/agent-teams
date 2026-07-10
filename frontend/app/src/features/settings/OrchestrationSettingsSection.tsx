import {
  App,
  Button,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Typography,
} from "antd";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { saveOrchestrationConfig } from "../../api/client";
import type {
  JsonValue,
  OrchestrationConfig,
  OrchestrationPolicy,
  OrchestrationPreset,
  RoleConfigOptions,
  RoleOption,
} from "../../api/contracts";
import { useTranslations } from "../../i18n";
import { SettingsQueryState, SettingsSection } from "./SettingsShared";

interface OrchestrationSettingsSectionProps {
  config: OrchestrationConfig | undefined;
  error: Error | null;
  loading: boolean;
  onRetry: () => void;
  onRoleOptionsRetry: () => void;
  roleOptionsError: Error | null;
  roleOptionsLoading: boolean;
  roles: RoleConfigOptions | undefined;
}

interface OrchestrationPresetForm {
  description?: string;
  graph?: string;
  max_orchestration_cycles?: number | null;
  max_parallel_delegated_tasks?: number | null;
  name?: string;
  orchestration_prompt?: string;
  preset_id?: string;
  role_ids?: string[];
}

export function OrchestrationSettingsSection({
  config,
  error,
  loading,
  onRetry,
  onRoleOptionsRetry,
  roleOptionsError,
  roleOptionsLoading,
  roles,
}: OrchestrationSettingsSectionProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [creatingPresetDocument, setCreatingPresetDocument] =
    useState<OrchestrationPreset | null>(null);
  const creatingPreset = creatingPresetDocument !== null;
  const presets = config?.presets ?? [];
  const selectedPreset =
    selectedPresetId !== null
      ? presets.find((preset) => preset.preset_id === selectedPresetId)
      : undefined;
  useEffect(() => {
    if (
      !creatingPreset
      && selectedPresetId !== null
      && config !== undefined
      && selectedPreset === undefined
    ) {
      setSelectedPresetId(null);
    }
  }, [config, creatingPreset, selectedPreset, selectedPresetId]);

  const saveMutation = useMutation({
    mutationFn: async ({
      nextConfig,
    }: {
      nextConfig: OrchestrationConfig;
      nextSelectedPresetId: string | null;
      successMessage: string;
    }) => {
      const result = await saveOrchestrationConfig(nextConfig);
      return { nextConfig, result };
    },
    onSuccess: ({ nextConfig }, variables) => {
      queryClient.setQueryData(["settings", "orchestration"], nextConfig);
      setCreatingPresetDocument(null);
      setSelectedPresetId(variables.nextSelectedPresetId);
      void message.success(variables.successMessage);
      void queryClient.invalidateQueries({ queryKey: ["settings", "orchestration"] });
    },
    onError: (mutationError) => {
      void message.error(
        mutationError instanceof Error ? mutationError.message : t("settingsSaveFailed"),
      );
    },
  });

  const requestSave = (sourcePresetId: string | null, values: OrchestrationPresetForm) => {
    if (config === undefined) {
      return;
    }
    try {
      const sourcePreset =
        sourcePresetId !== null
          ? config.presets?.find((preset) => preset.preset_id === sourcePresetId)
          : undefined;
      const nextPreset = orchestrationPresetFromForm(values, sourcePreset, {
        graphInvalid: t("settingsOrchestrationGraphInvalid"),
        graphObjectRequired: t("settingsOrchestrationGraphObjectRequired"),
      });
      const nextConfig = upsertOrchestrationPreset(config, sourcePresetId, nextPreset);
      saveMutation.mutate({
        nextConfig,
        nextSelectedPresetId: nextPreset.preset_id,
        successMessage: t("settingsSaved"),
      });
    } catch (saveError) {
      void message.error(saveError instanceof Error ? saveError.message : t("settingsSaveFailed"));
    }
  };

  const requestDelete = (presetId: string) => {
    if (config === undefined) {
      return;
    }
    const nextConfig = deleteOrchestrationPreset(config, presetId);
    if (nextConfig === null) {
      void message.warning(t("settingsOrchestrationMustKeepOne"));
      return;
    }
    saveMutation.mutate({
      nextConfig,
      nextSelectedPresetId: null,
      successMessage: t("settingsOrchestrationDeleted"),
    });
  };

  const requestSetDefault = (presetId: string) => {
    if (config === undefined || presetId === config.default_orchestration_preset_id) {
      return;
    }
    saveMutation.mutate({
      nextConfig: {
        ...config,
        default_orchestration_preset_id: presetId,
        presets: (config.presets ?? []).map(serializeOrchestrationPreset),
      },
      nextSelectedPresetId: selectedPresetId,
      successMessage: t("settingsOrchestrationDefaultSaved", { name: presetId }),
    });
  };

  return (
    <SettingsSection title={t("settingsOrchestration")}>
      <SettingsQueryState error={error} loading={loading} onRetry={onRetry} />
      {!loading && roleOptionsLoading ? (
        <Typography.Text className="at-settings-help">
          {t("settingsOrchestrationRolesLoading")}
        </Typography.Text>
      ) : null}
      {!loading ? (
        <SettingsQueryState
          error={roleOptionsError}
          loading={false}
          onRetry={onRoleOptionsRetry}
        />
      ) : null}
      {!loading && error === null && config !== undefined ? (
        creatingPresetDocument !== null ? (
          <OrchestrationPresetDetail
            config={config}
            creating
            defaultPresetId={config.default_orchestration_preset_id}
            onBack={() => setCreatingPresetDocument(null)}
            onDelete={() => undefined}
            onSave={(values) => requestSave(null, values)}
            onSetDefault={() => undefined}
            preset={creatingPresetDocument}
            roleOptions={orchestrationRoleOptions(roles)}
            saving={saveMutation.isPending}
          />
        ) : selectedPreset !== undefined ? (
          <OrchestrationPresetDetail
            config={config}
            defaultPresetId={config.default_orchestration_preset_id}
            onBack={() => setSelectedPresetId(null)}
            onDelete={() => requestDelete(selectedPreset.preset_id)}
            onSave={(values) => requestSave(selectedPreset.preset_id, values)}
            onSetDefault={() => requestSetDefault(selectedPreset.preset_id)}
            preset={selectedPreset}
            roleOptions={orchestrationRoleOptions(roles, selectedPreset.role_ids ?? [])}
            saving={saveMutation.isPending}
          />
        ) : (
          <>
            <div className="at-settings-facts">
              <Fact
                label={t("settingsDefaultPreset")}
                value={config.default_orchestration_preset_id ?? "-"}
              />
              <Fact label={t("settingsPresetCount")} value={String(presets.length)} />
            </div>
            <div className="at-settings-section-actions">
              <Button
                disabled={roleOptionsLoading || roleOptionsError !== null}
                onClick={() => {
                  setCreatingPresetDocument(
                    newOrchestrationPresetDraft(config, roles),
                  );
                }}
                type="primary"
              >
                {t("settingsOrchestrationNew")}
              </Button>
            </div>
            <OrchestrationPresetList
              defaultPresetId={config.default_orchestration_preset_id}
              emptyText={t("settingsNoOrchestrationPresets")}
              onEdit={setSelectedPresetId}
              onSetDefault={requestSetDefault}
              presets={presets}
              settingDefault={saveMutation.isPending}
            />
          </>
        )
      ) : null}
    </SettingsSection>
  );
}

function OrchestrationPresetList({
  defaultPresetId,
  emptyText,
  onEdit,
  onSetDefault,
  presets,
  settingDefault,
}: {
  defaultPresetId: string | undefined;
  emptyText: string;
  onEdit: (presetId: string) => void;
  onSetDefault: (presetId: string) => void;
  presets: OrchestrationPreset[];
  settingDefault: boolean;
}) {
  const t = useTranslations();
  if (presets.length === 0) {
    return <div className="at-settings-empty">{emptyText}</div>;
  }
  return (
    <div className="at-settings-list">
      {presets.map((preset) => {
        const isDefault = preset.preset_id === defaultPresetId;
        return (
          <div
            className="at-settings-list-row at-orchestration-list-row"
            key={preset.preset_id}
          >
            <button
              className="at-settings-list-button at-settings-list-main"
              onClick={() => onEdit(preset.preset_id)}
              type="button"
            >
              <span>{preset.name ?? preset.preset_id}</span>
              <Typography.Text ellipsis title={orchestrationPresetDetail(preset)}>
                {orchestrationPresetDetail(preset)}
              </Typography.Text>
            </button>
            <Typography.Text className="at-settings-list-meta" ellipsis title={preset.preset_id}>
              {isDefault ? t("settingsOrchestrationDefaultBadge") : preset.preset_id}
            </Typography.Text>
            <Button
              disabled={isDefault}
              loading={settingDefault}
              onClick={() => onSetDefault(preset.preset_id)}
              size="small"
            >
              {t("settingsOrchestrationSetDefault")}
            </Button>
            <Button onClick={() => onEdit(preset.preset_id)} size="small">
              {t("settingsEdit")}
            </Button>
          </div>
        );
      })}
    </div>
  );
}

function OrchestrationPresetDetail({
  config,
  creating = false,
  defaultPresetId,
  onBack,
  onDelete,
  onSave,
  onSetDefault,
  preset,
  roleOptions,
  saving,
}: {
  config: OrchestrationConfig;
  creating?: boolean;
  defaultPresetId: string | undefined;
  onBack: () => void;
  onDelete: () => void;
  onSave: (values: OrchestrationPresetForm) => void;
  onSetDefault: () => void;
  preset: OrchestrationPreset;
  roleOptions: RoleOption[];
  saving: boolean;
}) {
  const t = useTranslations();
  const [form] = Form.useForm<OrchestrationPresetForm>();
  const formId = "at-orchestration-preset-form";
  const roleIds = preset.role_ids?.map((roleId) => roleId.trim()).filter(Boolean) ?? [];
  const policyRows = orchestrationPolicyRows(preset.policy);
  const isDefault = preset.preset_id === defaultPresetId;
  const canDelete = !creating && (config.presets?.length ?? 0) > 1;
  const checkboxOptions = orchestrationRoleCheckboxOptions(roleOptions, roleIds);

  useEffect(() => {
    form.setFieldsValue(orchestrationPresetFormValues(preset));
  }, [form, preset]);

  return (
    <div className="at-settings-detail-page at-orchestration-preset-detail">
      <div className="at-settings-detail-header">
        <div className="at-settings-list-main">
          <span>{preset.name ?? preset.preset_id}</span>
          <Typography.Text>{orchestrationPresetDetail(preset)}</Typography.Text>
        </div>
        <div className="at-settings-detail-actions">
          {!creating && !isDefault ? (
            <Button disabled={saving} onClick={onSetDefault}>
              {t("settingsOrchestrationSetDefault")}
            </Button>
          ) : null}
          {!creating ? (
            <Popconfirm
              disabled={!canDelete}
              okText={t("settingsConfirm")}
              onConfirm={onDelete}
              title={t("settingsOrchestrationDeleteConfirm", { name: preset.preset_id })}
            >
              <Button danger disabled={!canDelete || saving}>
                {t("settingsDelete")}
              </Button>
            </Popconfirm>
          ) : null}
          <Button form={formId} htmlType="submit" loading={saving} type="primary">
            {t("settingsSave")}
          </Button>
          <Button onClick={onBack}>{t("settingsBack")}</Button>
        </div>
      </div>
      <div className="at-settings-facts at-settings-workspace-facts">
        <Fact label={t("settingsOrchestrationPresetId")} value={preset.preset_id} />
        <Fact
          label={t("settingsModelDefault")}
          value={isDefault ? t("settingsEnabled") : t("settingsDisabled")}
        />
        <Fact label={t("settingsOrchestrationRoles")} value={String(roleIds.length)} />
      </div>
      <Form
        className="at-settings-form at-orchestration-preset-form"
        form={form}
        id={formId}
        layout="vertical"
        onFinish={(values) => {
          onSave(values);
        }}
      >
        <Form.Item
          label={t("settingsOrchestrationPresetId")}
          name="preset_id"
          rules={[{ required: true, message: t("settingsOrchestrationPresetIdRequired") }]}
        >
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item label={t("settingsPresetName")} name="name">
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item label={t("settingsRoleDescription")} name="description">
          <Input autoComplete="off" />
        </Form.Item>
        <div className="at-settings-form-grid">
          <Form.Item
            label={t("settingsOrchestrationMaxCycles")}
            name="max_orchestration_cycles"
            rules={[{ required: true, message: t("settingsOrchestrationMaxCyclesRequired") }]}
          >
            <InputNumber max={64} min={0} />
          </Form.Item>
          <Form.Item
            label={t("settingsOrchestrationMaxParallel")}
            name="max_parallel_delegated_tasks"
            rules={[{ required: true, message: t("settingsOrchestrationMaxParallelRequired") }]}
          >
            <InputNumber max={16} min={0} />
          </Form.Item>
        </div>
        <Form.Item
          label={t("settingsOrchestrationRoles")}
          name="role_ids"
          rules={[{ required: true, message: t("settingsOrchestrationRoleRequired") }]}
        >
          <Checkbox.Group options={checkboxOptions} />
        </Form.Item>
        <Form.Item
          label={t("settingsOrchestrationPrompt")}
          name="orchestration_prompt"
          rules={[{ required: true, message: t("settingsOrchestrationPromptRequired") }]}
        >
          <Input.TextArea autoSize={{ minRows: 4, maxRows: 10 }} />
        </Form.Item>
        <Form.Item
          label={t("settingsOrchestrationGraph")}
          name="graph"
          rules={[
            {
              validator: (_rule, value: string | undefined) => {
                try {
                  parseOptionalGraph(value, {
                    graphInvalid: t("settingsOrchestrationGraphInvalid"),
                    graphObjectRequired: t("settingsOrchestrationGraphObjectRequired"),
                  });
                  return Promise.resolve();
                } catch (validationError) {
                  return Promise.reject(
                    validationError instanceof Error
                      ? validationError
                      : new Error(t("settingsOrchestrationGraphInvalid")),
                  );
                }
              },
            },
          ]}
        >
          <Input.TextArea
            autoSize={{ minRows: 3, maxRows: 8 }}
            placeholder='{"nodes":[]}'
          />
        </Form.Item>
      </Form>
      <div className="at-settings-list at-orchestration-preset-properties">
        {policyRows.map((row) => (
          <PropertyRow key={row.label} label={row.label} value={row.value} />
        ))}
      </div>
    </div>
  );
}

function orchestrationPresetDetail(preset: OrchestrationPreset): string {
  const roleCount = preset.role_ids?.length ?? 0;
  return [
    roleCount > 0 ? `${roleCount} roles` : "",
    preset.description?.trim() || "",
  ].filter(Boolean).join(" · ") || "-";
}

function orchestrationPresetFormValues(
  preset: OrchestrationPreset,
): OrchestrationPresetForm {
  const policy = normalizeOrchestrationPolicy(preset.policy);
  return {
    description: preset.description ?? "",
    graph: graphToEditorText(preset.graph),
    max_orchestration_cycles: policy.max_orchestration_cycles ?? 8,
    max_parallel_delegated_tasks: policy.max_parallel_delegated_tasks ?? 4,
    name: preset.name ?? "",
    orchestration_prompt: preset.orchestration_prompt ?? "",
    preset_id: preset.preset_id,
    role_ids: uniqueRoleIds(preset.role_ids ?? []),
  };
}

function upsertOrchestrationPreset(
  config: OrchestrationConfig,
  sourcePresetId: string | null,
  nextPreset: OrchestrationPreset,
): OrchestrationConfig {
  const nextPresets = (config.presets ?? [])
    .filter((preset) => preset.preset_id !== sourcePresetId)
    .map(serializeOrchestrationPreset);
  nextPresets.push(serializeOrchestrationPreset(nextPreset));
  if (hasDuplicateOrchestrationIds(nextPresets)) {
    throw new Error("Orchestration preset IDs must be unique.");
  }
  const defaultPresetId = resolveDefaultOrchestrationPresetId(
    config.default_orchestration_preset_id,
    sourcePresetId,
    nextPreset.preset_id,
    nextPresets,
  );
  return {
    default_orchestration_preset_id: defaultPresetId,
    presets: nextPresets,
  };
}

function deleteOrchestrationPreset(
  config: OrchestrationConfig,
  presetId: string,
): OrchestrationConfig | null {
  const nextPresets = (config.presets ?? [])
    .filter((preset) => preset.preset_id !== presetId)
    .map(serializeOrchestrationPreset);
  if (nextPresets.length === 0) {
    return null;
  }
  const currentDefaultId = config.default_orchestration_preset_id?.trim() ?? "";
  const nextDefaultId =
    currentDefaultId && currentDefaultId !== presetId
      ? currentDefaultId
      : nextPresets[0]?.preset_id ?? "";
  return {
    default_orchestration_preset_id: nextDefaultId,
    presets: nextPresets,
  };
}

function orchestrationPresetFromForm(
  values: OrchestrationPresetForm,
  sourcePreset: OrchestrationPreset | undefined,
  graphMessages: GraphParseMessages,
): OrchestrationPreset {
  const policy = normalizeOrchestrationPolicy(sourcePreset?.policy);
  return serializeOrchestrationPreset({
    ...sourcePreset,
    description: textValue(values.description),
    graph: parseOptionalGraph(values.graph, graphMessages),
    name: textValue(values.name),
    orchestration_prompt: textValue(values.orchestration_prompt),
    policy: {
      ...policy,
      max_orchestration_cycles: normalizeInteger(
        values.max_orchestration_cycles,
        policy.max_orchestration_cycles ?? 8,
        64,
      ),
      max_parallel_delegated_tasks: normalizeInteger(
        values.max_parallel_delegated_tasks,
        policy.max_parallel_delegated_tasks ?? 4,
        16,
      ),
    },
    preset_id: textValue(values.preset_id),
    role_ids: uniqueRoleIds(values.role_ids ?? []),
  });
}

function serializeOrchestrationPreset(preset: OrchestrationPreset): OrchestrationPreset {
  const serialized: OrchestrationPreset = {
    description: textValue(preset.description),
    name: textValue(preset.name),
    orchestration_prompt: textValue(preset.orchestration_prompt),
    policy: normalizeOrchestrationPolicy(preset.policy),
    preset_id: textValue(preset.preset_id),
    role_ids: uniqueRoleIds(preset.role_ids ?? []),
  };
  if (isJsonRecord(preset.graph)) {
    serialized.graph = preset.graph;
  }
  return serialized;
}

function resolveDefaultOrchestrationPresetId(
  currentDefaultId: string | undefined,
  sourcePresetId: string | null,
  nextPresetId: string,
  presets: OrchestrationPreset[],
): string {
  const trimmedDefaultId = currentDefaultId?.trim() ?? "";
  if (
    trimmedDefaultId
    && trimmedDefaultId !== sourcePresetId
    && presets.some((preset) => preset.preset_id === trimmedDefaultId)
  ) {
    return trimmedDefaultId;
  }
  if (nextPresetId && presets.some((preset) => preset.preset_id === nextPresetId)) {
    return nextPresetId;
  }
  return presets[0]?.preset_id ?? "";
}

function hasDuplicateOrchestrationIds(presets: OrchestrationPreset[]): boolean {
  const ids = presets.map((preset) => preset.preset_id).filter(Boolean);
  return ids.length !== new Set(ids).size;
}

interface GraphParseMessages {
  graphInvalid: string;
  graphObjectRequired: string;
}

function parseOptionalGraph(
  value: string | undefined,
  messages: GraphParseMessages,
): JsonValue | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!isJsonRecord(parsed)) {
      throw new Error(messages.graphObjectRequired);
    }
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.message === messages.graphObjectRequired) {
      throw error;
    }
    throw new Error(messages.graphInvalid);
  }
}

function graphToEditorText(graph: JsonValue | null | undefined): string {
  return isJsonRecord(graph) ? JSON.stringify(graph, null, 2) : "";
}

function isJsonRecord(value: unknown): value is { [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeOrchestrationPolicy(
  policy: OrchestrationPolicy | undefined,
): OrchestrationPolicy {
  return {
    ...policy,
    max_orchestration_cycles: normalizeInteger(
      policy?.max_orchestration_cycles,
      8,
      64,
    ),
    max_parallel_delegated_tasks: normalizeInteger(
      policy?.max_parallel_delegated_tasks,
      4,
      16,
    ),
  };
}

function normalizeInteger(
  value: number | null | undefined,
  fallback: number,
  maxValue: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(Math.max(Math.trunc(value), 0), maxValue);
}

function uniqueRoleIds(value: string[]): string[] {
  const seen = new Set<string>();
  const roleIds: string[] = [];
  for (const part of value) {
    const roleId = part.trim();
    if (!roleId || seen.has(roleId)) {
      continue;
    }
    seen.add(roleId);
    roleIds.push(roleId);
  }
  return roleIds;
}

function newOrchestrationPresetDraft(
  config: OrchestrationConfig,
  roles: RoleConfigOptions | undefined,
): OrchestrationPreset {
  const roleOptions = orchestrationRoleOptions(roles);
  const preferredRole = (roles?.subagent_roles ?? [])
    .map((role) => roleOptions.find((option) => option.role_id === role.role_id))
    .find((role): role is RoleOption => role !== undefined);
  const initialRole = preferredRole ?? roleOptions[0];
  return {
    description: "",
    name: "New Orchestration",
    orchestration_prompt: "",
    policy: {
      max_orchestration_cycles: 8,
      max_parallel_delegated_tasks: 4,
    },
    preset_id: nextOrchestrationPresetId(config),
    role_ids: initialRole !== undefined ? [initialRole.role_id] : [],
  };
}

function nextOrchestrationPresetId(config: OrchestrationConfig): string {
  const existingIds = new Set((config.presets ?? []).map((preset) => preset.preset_id));
  let suffix = (config.presets?.length ?? 0) + 1;
  let candidate = `orchestration_${suffix}`;
  while (existingIds.has(candidate)) {
    suffix += 1;
    candidate = `orchestration_${suffix}`;
  }
  return candidate;
}

function orchestrationRoleOptions(
  roles: RoleConfigOptions | undefined,
  includeRoleIds: string[] = [],
): RoleOption[] {
  const excludedRoleIds = new Set(
    [
      roles?.coordinator_role_id,
      roles?.coordinator_role?.role_id,
      roles?.main_agent_role_id,
      roles?.main_agent_role?.role_id,
    ]
      .map((roleId) => roleId?.trim())
      .filter((roleId): roleId is string => roleId !== undefined && roleId !== ""),
  );
  const byId = new Map<string, RoleOption>();
  for (const role of [
    ...(roles?.normal_mode_roles ?? []),
    ...(roles?.subagent_roles ?? []),
  ]) {
    const roleId = role.role_id.trim();
    if (!roleId || excludedRoleIds.has(roleId) || byId.has(roleId)) {
      continue;
    }
    byId.set(roleId, role);
  }
  for (const roleId of includeRoleIds) {
    const trimmedRoleId = roleId.trim();
    if (trimmedRoleId && !byId.has(trimmedRoleId)) {
      byId.set(trimmedRoleId, { name: trimmedRoleId, role_id: trimmedRoleId });
    }
  }
  return [...byId.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function orchestrationRoleCheckboxOptions(
  roles: RoleOption[],
  selectedRoleIds: string[],
): Array<{ label: string; value: string }> {
  const selectedOptions = orchestrationRoleOptions(undefined, selectedRoleIds);
  const byId = new Map<string, RoleOption>();
  for (const role of roles) {
    byId.set(role.role_id, role);
  }
  for (const role of selectedOptions) {
    if (!byId.has(role.role_id)) {
      byId.set(role.role_id, role);
    }
  }
  return [...byId.values()].map((role) => ({
    label: role.name === role.role_id ? role.role_id : `${role.name} (${role.role_id})`,
    value: role.role_id,
  }));
}

function orchestrationPolicyRows(
  policy: OrchestrationPolicy | undefined,
): Array<{ label: string; value: string }> {
  if (policy === undefined) {
    return [];
  }
  return [
    ["max_orchestration_cycles", policy.max_orchestration_cycles],
    ["max_parallel_delegated_tasks", policy.max_parallel_delegated_tasks],
    ["auto_plan_long_tasks", policy.auto_plan_long_tasks],
    ["planner_role_id", policy.planner_role_id],
    ["coordinator_inline_budget_steps", policy.coordinator_inline_budget_steps],
    ["max_temporary_roles_per_run", policy.max_temporary_roles_per_run],
    [
      "prefer_temporary_roles_for_long_tasks",
      policy.prefer_temporary_roles_for_long_tasks,
    ],
  ]
    .map(([label, value]) => ({
      label: String(label),
      value: policyValue(value),
    }))
    .filter((row) => row.value !== "");
}

function textValue(value: string | undefined): string {
  return value?.trim() ?? "";
}

function policyValue(value: boolean | number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  return String(value);
}

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="at-settings-property-row">
      <Typography.Text className="at-settings-list-meta">{label}</Typography.Text>
      <Typography.Text ellipsis title={value}>
        {value}
      </Typography.Text>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <dl>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </dl>
  );
}
