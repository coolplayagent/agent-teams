import { describe, expect, it } from "vitest";

import { workspaceDisplayLabel, workspaceFallbackLabel } from "../features/workspaces/workspaceLabels";

describe("workspace labels", () => {
  it("preserves a custom workspace whose id and name are default", () => {
    expect(
      workspaceDisplayLabel({
        display_name: "default",
        root_path: "C:/projects/custom-workspace",
        system_workspace: false,
        workspace_id: "default",
      }),
    ).toBe("default");
  });

  it("does not relabel a custom default id as the product workspace", () => {
    expect(workspaceFallbackLabel("default")).toBe("default");
  });

  it("uses the backend display name for the system workspace", () => {
    expect(
      workspaceDisplayLabel({
        display_name: "Agent Teams",
        root_path: "C:/projects/agent-teams",
        system_workspace: true,
        workspace_id: "runtime-home",
      }),
    ).toBe("Agent Teams");
  });
});
