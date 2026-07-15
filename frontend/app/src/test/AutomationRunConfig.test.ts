import { describe, expect, it } from "vitest";

import {
  automationRunConfigFromEditor,
  automationRunConfigsEqual,
  automationRuntimeEditorValuesFromConfig,
} from "../features/automation/automationRunConfig";

describe("automation run configuration", () => {
  it("treats omitted backend defaults as unchanged during unrelated PATCH edits", () => {
    expect(
      automationRunConfigsEqual(
        {
          execution_mode: "ai",
          normal_root_role_id: null,
          orchestration_preset_id: null,
          session_mode: "normal",
          thinking: { effort: null, enabled: false },
          yolo: true,
        },
        { session_mode: "normal" },
      ),
    ).toBe(true);
  });

  it("keeps the selected runtime preferences through editor readback", () => {
    const stored = {
      execution_mode: "manual" as const,
      normal_root_role_id: null,
      orchestration_preset_id: "release-workflow",
      session_mode: "orchestration" as const,
      thinking: { effort: "high" as const, enabled: true },
      yolo: false,
    };

    expect(
      automationRunConfigFromEditor(
        automationRuntimeEditorValuesFromConfig(stored),
      ),
    ).toEqual(stored);
  });

  it("removes the inactive topology target without changing user choices", () => {
    expect(
      automationRunConfigFromEditor({
        executionMode: "ai",
        normalRootRoleId: "Writer",
        orchestrationPresetId: "release-workflow",
        sessionMode: "normal",
        thinkingEffort: "minimal",
        thinkingEnabled: false,
        yolo: false,
      }),
    ).toEqual({
      execution_mode: "ai",
      normal_root_role_id: "Writer",
      orchestration_preset_id: null,
      session_mode: "normal",
      thinking: { effort: "minimal", enabled: false },
      yolo: false,
    });
  });
});
