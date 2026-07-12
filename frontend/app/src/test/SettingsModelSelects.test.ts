/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/features/settings/SettingsCenter.tsx",
  "utf8",
);

describe("model settings finite controls", () => {
  it("uses Select controls for finite authentication and capability values", () => {
    expect(source).not.toContain("<select");
    expect(source).toMatch(
      /name="codeagent_auth_method"[\s\S]*?<Select[\s\S]*?value: "sso"[\s\S]*?value: "password"/,
    );
    expect(source).toMatch(
      /name="image_capability"[\s\S]*?<Select[\s\S]*?value: "follow"[\s\S]*?value: "supported"[\s\S]*?value: "unsupported"/,
    );
    expect(source).toMatch(
      /name="ssl_verify"[\s\S]*?<Select[\s\S]*?value: ""[\s\S]*?value: "true"[\s\S]*?value: "false"/,
    );
    expect(source).toMatch(
      /name="provider"[\s\S]*?<Select[\s\S]*?options=\{providerOptions\}/,
    );
    expect(source).toContain('"openai_compatible"');
    expect(source).toContain('"codeagent"');
    expect(source).toMatch(
      /name="fallback_policy_id"[\s\S]*?<Select[\s\S]*?options=\{fallbackPolicyOptions\}/,
    );
    expect(source).toContain("getModelFallbackConfig");
  });
});
