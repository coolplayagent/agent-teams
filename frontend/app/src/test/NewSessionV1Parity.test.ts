import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/features/sessions/NewSessionView.tsx"),
  "utf8",
);

// V1 reference: 38ec642cb, newSessionDraft.js / newSessionDraftView.js.
// These assertions protect the useful pre-create Composer contract restored by the current UI.
describe("NewSessionView V1 parity contract", () => {
  it.each([
    ["workspace", "createSession"],
    ["model profile", "normal_model_profile"],
    ["normal role", "normal_root_role_id"],
    ["orchestration preset", "orchestration_preset_id"],
    ["initial prompt", "createRun"],
    ["target role", "target_role_id"],
    ["thinking", "thinking:"],
    ["shell safety", "shell_safety_policy_enabled"],
    ["YOLO", "yolo"],
  ])("keeps the V1 %s capability", (_capability, contractToken) => {
    expect(source).toContain(contractToken);
  });

  it("labels the optional session title as a name instead of a rename action", () => {
    expect(source).toContain('t("newSessionNameOptional")');
    expect(source).not.toContain('t("sidebarRenameSession")');
  });

  it("keeps run-only controls out of the session topology payload", () => {
    const topologyStart = source.indexOf("const session = sessionMode");
    const firstRunStart = source.indexOf("const normalizedPrompt");
    const topologySection = source.slice(topologyStart, firstRunStart);
    expect(topologySection).toContain("updateSessionTopology");
    expect(topologySection).not.toContain("target_role_id");
    expect(topologySection).not.toContain("shell_safety_policy_enabled");
    expect(topologySection).not.toContain("yolo");
  });
});
