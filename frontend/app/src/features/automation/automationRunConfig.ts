import type {
  AutomationRunConfig,
  SessionMode,
  ThinkingEffort,
} from "../../api/contracts";

export const DEFAULT_RUNTIME_TARGET = "";

export interface AutomationRuntimeEditorValues {
  executionMode: "ai" | "manual";
  normalRootRoleId: string;
  orchestrationPresetId: string;
  sessionMode: SessionMode;
  thinkingEffort: ThinkingEffort | null;
  thinkingEnabled: boolean;
  yolo: boolean;
}

export interface EffectiveAutomationRunConfig {
  execution_mode: "ai" | "manual";
  normal_root_role_id: string | null;
  orchestration_preset_id: string | null;
  session_mode: SessionMode;
  thinking: {
    effort: ThinkingEffort | null;
    enabled: boolean;
  };
  yolo: boolean;
}

export function defaultAutomationRuntimeEditorValues({
  normalRootRoleId,
  orchestrationPresetId,
  thinking,
}: {
  normalRootRoleId: string | null;
  orchestrationPresetId: string | null;
  thinking: { enabled: boolean; effort: ThinkingEffort | null };
}): AutomationRuntimeEditorValues {
  return {
    executionMode: "ai",
    normalRootRoleId: normalRootRoleId ?? DEFAULT_RUNTIME_TARGET,
    orchestrationPresetId:
      orchestrationPresetId ?? DEFAULT_RUNTIME_TARGET,
    sessionMode: "normal",
    thinkingEffort: thinking.effort,
    thinkingEnabled: thinking.enabled,
    yolo: true,
  };
}

export function automationRunConfigFromEditor(
  values: AutomationRuntimeEditorValues,
): AutomationRunConfig {
  return {
    execution_mode: values.executionMode,
    normal_root_role_id:
      values.sessionMode === "normal"
        ? runtimeTargetFromEditor(values.normalRootRoleId)
        : null,
    orchestration_preset_id:
      values.sessionMode === "orchestration"
        ? runtimeTargetFromEditor(values.orchestrationPresetId)
        : null,
    session_mode: values.sessionMode,
    thinking: {
      effort: values.thinkingEffort,
      enabled: values.thinkingEnabled,
    },
    yolo: values.yolo,
  };
}

export function effectiveAutomationRunConfig(
  config: AutomationRunConfig,
): EffectiveAutomationRunConfig {
  const sessionMode = config.session_mode ?? "normal";
  return {
    execution_mode: config.execution_mode ?? "ai",
    normal_root_role_id:
      sessionMode === "normal" ? (config.normal_root_role_id ?? null) : null,
    orchestration_preset_id:
      sessionMode === "orchestration"
        ? (config.orchestration_preset_id ?? null)
        : null,
    session_mode: sessionMode,
    thinking: {
      effort: config.thinking?.effort ?? null,
      enabled: config.thinking?.enabled ?? false,
    },
    yolo: config.yolo ?? true,
  };
}

export function automationRunConfigsEqual(
  left: AutomationRunConfig | undefined,
  right: AutomationRunConfig,
): boolean {
  if (left === undefined) {
    return false;
  }
  const normalizedLeft = effectiveAutomationRunConfig(left);
  const normalizedRight = effectiveAutomationRunConfig(right);
  return (
    normalizedLeft.execution_mode === normalizedRight.execution_mode &&
    normalizedLeft.normal_root_role_id === normalizedRight.normal_root_role_id &&
    normalizedLeft.orchestration_preset_id ===
      normalizedRight.orchestration_preset_id &&
    normalizedLeft.session_mode === normalizedRight.session_mode &&
    normalizedLeft.thinking.effort === normalizedRight.thinking.effort &&
    normalizedLeft.thinking.enabled === normalizedRight.thinking.enabled &&
    normalizedLeft.yolo === normalizedRight.yolo
  );
}

export function automationRuntimeEditorValuesFromConfig(
  config: AutomationRunConfig,
): AutomationRuntimeEditorValues {
  const effective = effectiveAutomationRunConfig(config);
  return {
    executionMode: effective.execution_mode,
    normalRootRoleId:
      effective.normal_root_role_id ?? DEFAULT_RUNTIME_TARGET,
    orchestrationPresetId:
      effective.orchestration_preset_id ?? DEFAULT_RUNTIME_TARGET,
    sessionMode: effective.session_mode,
    thinkingEffort: effective.thinking.effort,
    thinkingEnabled: effective.thinking.enabled,
    yolo: effective.yolo,
  };
}

function runtimeTargetFromEditor(value: string): string | null {
  const normalized = value.trim();
  return normalized && normalized !== DEFAULT_RUNTIME_TARGET ? normalized : null;
}
