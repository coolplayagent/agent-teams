import { Input, Segmented, Select, Typography } from "antd";

import { ChoiceControl } from "../../components/ChoiceControl";
import type {
  RunThinkingConfig,
  ThinkingEffort,
} from "../../api/contracts";
import { useTranslations } from "../../i18n";
import { ComposerRunSettingsPopover } from "../composer/ComposerSurface";

export type NewSessionMode = "normal" | "orchestration";

interface SelectOption {
  label: string;
  value: string;
}

interface NewSessionRunSettingsProps {
  generalConfigReady: boolean;
  modelProfile: string | null;
  onModelProfileChange: (value: string | null) => void;
  onOrchestrationPresetChange: (value: string | null) => void;
  onRoleChange: (value: string | null) => void;
  onSessionModeChange: (value: NewSessionMode) => void;
  onShellSafetyPolicyChange: (value: boolean) => void;
  onTargetRoleChange: (value: string | null) => void;
  onThinkingChange: (patch: Partial<RunThinkingConfig>) => void;
  onTitleChange: (value: string) => void;
  onYoloChange: (value: boolean) => void;
  orchestrationLoading: boolean;
  orchestrationOptions: SelectOption[];
  orchestrationPresetId: string | null;
  profileOptions: SelectOption[];
  profilesLoading: boolean;
  roleId: string | null;
  roleOptions: SelectOption[];
  rolesLoading: boolean;
  runSettingsSummary: string;
  selectedModeLabel: string;
  sessionMode: NewSessionMode;
  shellSafetyPolicyEnabled: boolean | null;
  targetRoleId: string | null;
  targetRoleOptions: SelectOption[];
  thinking: RunThinkingConfig;
  title: string;
  yolo: boolean;
}

export function NewSessionRunSettings({
  generalConfigReady,
  modelProfile,
  onModelProfileChange,
  onOrchestrationPresetChange,
  onRoleChange,
  onSessionModeChange,
  onShellSafetyPolicyChange,
  onTargetRoleChange,
  onThinkingChange,
  onTitleChange,
  onYoloChange,
  orchestrationLoading,
  orchestrationOptions,
  orchestrationPresetId,
  profileOptions,
  profilesLoading,
  roleId,
  roleOptions,
  rolesLoading,
  runSettingsSummary,
  selectedModeLabel,
  sessionMode,
  shellSafetyPolicyEnabled,
  targetRoleId,
  targetRoleOptions,
  thinking,
  title,
  yolo,
}: NewSessionRunSettingsProps) {
  const t = useTranslations();
  return (
    <ComposerRunSettingsPopover
      compactSummary={selectedModeLabel}
      heading={t("composerRunSettings")}
      summary={runSettingsSummary}
    >
      <Typography.Text className="at-composer-section-label" type="secondary">
        {t("composerConversationSettings")}
      </Typography.Text>
      <div className="at-composer-control-set">
        <div className="at-composer-field at-composer-mode-field">
          <Typography.Text className="at-composer-field-label">
            {t("composerMode")}
          </Typography.Text>
          <Segmented<NewSessionMode>
            aria-label={t("composerSessionMode")}
            className="at-session-mode-control"
            onChange={onSessionModeChange}
            options={[
              { label: t("composerNormal"), value: "normal" },
              {
                disabled: orchestrationOptions.length === 0,
                label: t("composerOrchestration"),
                value: "orchestration",
              },
            ]}
            size="small"
            value={sessionMode}
          />
        </div>
        <div className="at-composer-field at-composer-role-field">
          <Typography.Text className="at-composer-field-label">
            {sessionMode === "normal" ? t("composerRole") : t("composerPreset")}
          </Typography.Text>
          {sessionMode === "normal" ? (
            <Select
              allowClear
              aria-label={t("settingsRoles")}
              className="at-normal-root-role-select"
              loading={rolesLoading}
              onChange={(value) => onRoleChange(value ?? null)}
              optionFilterProp="label"
              options={roleOptions}
              popupMatchSelectWidth={false}
              showSearch
              size="small"
              value={roleId ?? undefined}
            />
          ) : (
            <Select
              allowClear
              aria-label={t("composerOrchestrationPreset")}
              className="at-orchestration-preset-select"
              loading={orchestrationLoading}
              onChange={(value) => onOrchestrationPresetChange(value ?? null)}
              optionFilterProp="label"
              options={orchestrationOptions}
              popupMatchSelectWidth={false}
              showSearch
              size="small"
              value={orchestrationPresetId ?? undefined}
            />
          )}
        </div>
        <div className="at-composer-field at-composer-model-field">
          <Typography.Text className="at-composer-field-label">
            {t("composerModel")}
          </Typography.Text>
          <Select
            allowClear
            aria-label={t("composerModelProfile")}
            className="at-model-profile-select"
            loading={profilesLoading}
            onChange={(value) => onModelProfileChange(value ?? null)}
            optionFilterProp="label"
            options={profileOptions}
            popupMatchSelectWidth={false}
            showSearch
            size="small"
            value={modelProfile ?? undefined}
          />
        </div>
        <div className="at-composer-field at-composer-target-field">
          <Typography.Text className="at-composer-field-label">
            {t("composerTarget")}
          </Typography.Text>
          <Select
            allowClear
            aria-label={t("composerTargetRole")}
            className="at-role-select"
            loading={rolesLoading}
            onChange={(value) => onTargetRoleChange(value ?? null)}
            optionFilterProp="label"
            options={targetRoleOptions}
            popupMatchSelectWidth={false}
            showSearch
            size="small"
            value={targetRoleId ?? undefined}
          />
        </div>
        <div className="at-composer-field at-new-session-title-field">
          <Typography.Text className="at-composer-field-label">
            {t("newSessionNameOptional")}
          </Typography.Text>
          <Input
            aria-label={t("newSessionNameOptional")}
            onChange={(event) => onTitleChange(event.target.value)}
            size="small"
            value={title}
          />
        </div>
        <Typography.Text
          className="at-composer-section-label at-composer-execution-section-label"
          type="secondary"
        >
          {t("composerExecutionSettings")}
        </Typography.Text>
        <div className="at-composer-toggles">
          <ChoiceControl
            ariaLabel={t("composerThinking")}
            checked={thinking.enabled}
            kind="switch"
            label={t("composerThinking")}
            onChange={(enabled) => onThinkingChange({ enabled })}
          />
          {thinking.enabled ? (
            <Select
              aria-label={t("composerThinkingEffort")}
              className="at-thinking-effort-select"
              onChange={(effort: ThinkingEffort) =>
                onThinkingChange({ effort })
              }
              options={thinkingEffortOptions(t)}
              popupMatchSelectWidth={false}
              size="small"
              value={thinking.effort}
            />
          ) : null}
          <ChoiceControl
            ariaLabel={t("composerShellSafetyPolicy")}
            checked={shellSafetyPolicyEnabled === true}
            disabled={!generalConfigReady}
            label={t("composerShellSafetyShort")}
            onChange={onShellSafetyPolicyChange}
          />
          <ChoiceControl checked={yolo} label={t("composerYolo")} onChange={onYoloChange} />
        </div>
      </div>
    </ComposerRunSettingsPopover>
  );
}

function thinkingEffortOptions(
  t: ReturnType<typeof useTranslations>,
): Array<{ label: string; value: ThinkingEffort }> {
  return [
    { label: t("composerMinimal"), value: "minimal" },
    { label: t("composerLow"), value: "low" },
    { label: t("composerMedium"), value: "medium" },
    { label: t("composerHigh"), value: "high" },
  ];
}
