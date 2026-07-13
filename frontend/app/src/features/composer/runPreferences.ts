import type {
  GeneralConfig,
  RunThinkingConfig,
  ThinkingEffort,
} from "../../api/contracts";

export const GENERAL_RUN_PREFERENCES_QUERY_KEY = [
  "settings",
  "general",
] as const;

const THINKING_MODE_STORAGE_KEY = "agent_teams_thinking_enabled";
const THINKING_EFFORT_STORAGE_KEY = "agent_teams_thinking_effort";
export const DEFAULT_THINKING_EFFORT: ThinkingEffort = "medium";

export function readSavedThinkingState(): RunThinkingConfig {
  try {
    const storage = globalThis.localStorage;
    return normalizeThinkingState({
      enabled: storage.getItem(THINKING_MODE_STORAGE_KEY) === "true",
      effort: storage.getItem(THINKING_EFFORT_STORAGE_KEY),
    });
  } catch (_error) {
    return {
      enabled: false,
      effort: DEFAULT_THINKING_EFFORT,
    };
  }
}

export function persistThinkingState(state: RunThinkingConfig): void {
  try {
    const storage = globalThis.localStorage;
    const normalized = normalizeThinkingState(state);
    storage.setItem(
      THINKING_MODE_STORAGE_KEY,
      normalized.enabled ? "true" : "false",
    );
    storage.setItem(
      THINKING_EFFORT_STORAGE_KEY,
      normalized.effort ?? DEFAULT_THINKING_EFFORT,
    );
  } catch (_error) {
    return;
  }
}

export function updateThinkingState(
  current: RunThinkingConfig,
  patch: Partial<RunThinkingConfig>,
): RunThinkingConfig {
  return normalizeThinkingState({
    enabled: patch.enabled ?? current.enabled,
    effort: patch.effort ?? current.effort ?? DEFAULT_THINKING_EFFORT,
  });
}

export function shellSafetyPolicyPreference(config: GeneralConfig): boolean {
  return config.shell_safety_policy_enabled !== false;
}

function normalizeThinkingState(state: {
  enabled: boolean;
  effort: string | null | undefined;
}): RunThinkingConfig {
  return {
    enabled: state.enabled,
    effort: normalizeThinkingEffort(state.effort),
  };
}

function normalizeThinkingEffort(
  value: string | null | undefined,
): ThinkingEffort {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (
    normalized === "minimal" ||
    normalized === "low" ||
    normalized === "high"
  ) {
    return normalized;
  }
  return DEFAULT_THINKING_EFFORT;
}
