import { Segmented, Select } from "antd";

import type {
  RunThinkingConfig,
  SessionMode,
  ThinkingEffort,
} from "../../api/contracts";
import { ChoiceControl } from "../../components/ChoiceControl";
import { useTranslations } from "../../i18n";
import { DEFAULT_THINKING_EFFORT } from "./runPreferences";

export interface ComposerRunControlOption {
  label: string;
  value: string;
}

interface ComposerRunControlsProps {
  className?: string;
  modelDisabled?: boolean;
  modelLoading?: boolean;
  modelOptions: ComposerRunControlOption[];
  modelValue: string | null;
  mode: SessionMode;
  modeDisabled?: boolean;
  onModelChange: (value: string | null) => void;
  onModeChange: (value: SessionMode) => void;
  onPresetChange: (value: string | null) => void;
  onRoleChange: (value: string | null) => void;
  onShellSafetyChange: (value: boolean) => void;
  onTargetRoleChange: (value: string | null) => void;
  onThinkingChange: (patch: Partial<RunThinkingConfig>) => void;
  onYoloChange: (value: boolean) => void;
  presetDisabled?: boolean;
  presetLoading?: boolean;
  presetOptions: ComposerRunControlOption[];
  presetValue: string | null;
  roleDisabled?: boolean;
  roleLoading?: boolean;
  roleOptions: ComposerRunControlOption[];
  roleValue: string | null;
  shellSafetyDisabled?: boolean;
  shellSafetyEnabled: boolean;
  targetRoleDisabled?: boolean;
  targetRoleLoading?: boolean;
  targetRoleOptions: ComposerRunControlOption[];
  targetRoleValue: string | null;
  thinking: RunThinkingConfig;
  thinkingDisabled?: boolean;
  yolo: boolean;
  yoloDisabled?: boolean;
}

export function ComposerRunControls({
  className,
  modelDisabled = false,
  modelLoading = false,
  modelOptions,
  modelValue,
  mode,
  modeDisabled = false,
  onModelChange,
  onModeChange,
  onPresetChange,
  onRoleChange,
  onShellSafetyChange,
  onTargetRoleChange,
  onThinkingChange,
  onYoloChange,
  presetDisabled = false,
  presetLoading = false,
  presetOptions,
  presetValue,
  roleDisabled = false,
  roleLoading = false,
  roleOptions,
  roleValue,
  shellSafetyDisabled = false,
  shellSafetyEnabled,
  targetRoleDisabled = false,
  targetRoleLoading = false,
  targetRoleOptions,
  targetRoleValue,
  thinking,
  thinkingDisabled = false,
  yolo,
  yoloDisabled = false,
}: ComposerRunControlsProps) {
  const t = useTranslations();

  return (
    <div
      aria-label={t("composerRunSettings")}
      className={["at-composer-run-controls", className]
        .filter(Boolean)
        .join(" ")}
      role="group"
    >
      <div className="at-composer-topology-controls">
        <Segmented<SessionMode>
          aria-label={t("composerSessionMode")}
          className="at-session-mode-control"
          disabled={modeDisabled}
          onChange={onModeChange}
          options={[
            { label: t("composerNormal"), value: "normal" },
            {
              disabled: presetOptions.length === 0,
              label: t("composerOrchestration"),
              value: "orchestration",
            },
          ]}
          size="small"
          value={mode}
        />

        {mode === "normal" ? (
          <Select
            aria-label={t("composerRootRole")}
            className="at-composer-role-select"
            disabled={roleDisabled || roleOptions.length === 0}
            loading={roleLoading}
            onChange={(value) => onRoleChange(value ?? null)}
            optionFilterProp="label"
            options={roleOptions}
            placeholder={t("composerRole")}
            popupMatchSelectWidth={false}
            key="normal-role"
            showSearch
            size="small"
            value={roleValue ?? undefined}
          />
        ) : (
          <Select
            aria-label={t("composerOrchestrationPreset")}
            className="at-composer-preset-select"
            disabled={presetDisabled || presetOptions.length === 0}
            loading={presetLoading}
            onChange={(value) => onPresetChange(value ?? null)}
            optionFilterProp="label"
            options={presetOptions}
            placeholder={t("composerPreset")}
            popupMatchSelectWidth={false}
            key="orchestration-preset"
            showSearch
            size="small"
            value={presetValue ?? undefined}
          />
        )}

        {mode === "orchestration" ? (
          <Select
            allowClear
            aria-label={t("composerTargetRole")}
            className="at-composer-target-select"
            disabled={targetRoleDisabled}
            loading={targetRoleLoading}
            onChange={(value) => onTargetRoleChange(value ?? null)}
            optionFilterProp="label"
            options={targetRoleOptions}
            placeholder={t("composerTarget")}
            popupMatchSelectWidth={false}
            showSearch
            size="small"
            value={targetRoleValue ?? undefined}
          />
        ) : null}

        <Select
          allowClear
          aria-label={t("composerModelProfile")}
          className="at-composer-model-select"
          disabled={modelDisabled}
          loading={modelLoading}
          onChange={(value) => onModelChange(value ?? null)}
          optionFilterProp="label"
          options={modelOptions}
          placeholder={t("composerModel")}
          popupMatchSelectWidth={false}
          showSearch
          size="small"
          value={modelValue ?? undefined}
        />
      </div>

      <div className="at-composer-execution-controls">
        <ChoiceControl
          ariaLabel={t("composerThinking")}
          checked={thinking.enabled}
          disabled={thinkingDisabled}
          kind="switch"
          label={t("composerThinking")}
          onChange={(enabled) => onThinkingChange({ enabled })}
        />
        {thinking.enabled ? (
          <Select
            aria-label={t("composerThinkingEffort")}
            className="at-composer-thinking-select"
            disabled={thinkingDisabled}
            onChange={(effort: ThinkingEffort) => onThinkingChange({ effort })}
            options={thinkingEffortOptions(t)}
            popupMatchSelectWidth={false}
            size="small"
            value={thinking.effort ?? DEFAULT_THINKING_EFFORT}
          />
        ) : null}
        <ChoiceControl
          ariaLabel={t("composerShellSafetyPolicy")}
          checked={shellSafetyEnabled}
          disabled={shellSafetyDisabled}
          label={t("composerShellSafetyShort")}
          onChange={onShellSafetyChange}
        />
        <ChoiceControl
          checked={yolo}
          disabled={yoloDisabled}
          label={t("composerYolo")}
          onChange={onYoloChange}
        />
      </div>
    </div>
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
