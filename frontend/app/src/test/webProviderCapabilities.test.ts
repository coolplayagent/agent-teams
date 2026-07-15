import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { WebConfig } from "../api/contracts";
import {
  defaultWebFallbackProvider,
  webFallbackProviderDescriptor,
  webFallbackProviderOptions,
  webProviderDescriptor,
} from "../features/settings/webProviderCapabilities";

const config: WebConfig = {
  exa_api_key_configured: false,
  fallback_provider: "private-fallback",
  fallback_provider_options: [
    {
      display_name: "Private fallback",
      provider: "private-fallback",
      uses_instance_url: true,
    },
  ],
  provider: "private-primary",
  provider_options: [
    {
      display_name: "Private primary",
      provider: "private-primary",
      website_url: "https://provider.example",
    },
  ],
};

describe("web provider capabilities", () => {
  it("derives provider presentation and behavior from backend metadata", () => {
    expect(webProviderDescriptor(config)?.display_name).toBe("Private primary");
    expect(webFallbackProviderOptions(config)).toEqual([
      { label: "Private fallback", value: "private-fallback" },
    ]);
    expect(defaultWebFallbackProvider(config)).toBe("private-fallback");
    expect(
      webFallbackProviderDescriptor(config, "private-fallback")?.uses_instance_url,
    ).toBe(true);
  });

  it("keeps concrete provider registries out of the settings view", () => {
    const settingsSource = readFileSync(
      resolve(process.cwd(), "src/features/settings/WebSettingsSection.tsx"),
      "utf8",
    );

    expect(settingsSource).not.toMatch(/provider:\s*"[^\"]+"/);
    expect(settingsSource).not.toMatch(/options=\{\[/);
    expect(settingsSource).not.toMatch(/href="https?:\/\//);
  });
});
