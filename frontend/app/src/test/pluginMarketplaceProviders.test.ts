import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { PluginMarketplaceProviderCatalog } from "../api/contracts";
import {
  defaultPluginMarketplaceProvider,
  pluginMarketplaceFormDefaults,
  pluginMarketplaceProvider,
  pluginMarketplaceProviderOptions,
} from "../features/settings/pluginMarketplaceProviders";

const catalog: PluginMarketplaceProviderCatalog = {
  default_provider: "clawhub",
  providers: [
    {
      defaults: {
        allow_missing_digest: true,
        marketplace: "market",
        marketplace_ref: "stable",
        marketplace_source: "https://market.example",
      },
      display_name: "Backend market",
      include_details: true,
      provider: "clawhub",
    },
  ],
};

describe("plugin marketplace provider catalog", () => {
  it("derives choices and defaults entirely from backend metadata", () => {
    const provider = defaultPluginMarketplaceProvider(catalog);

    expect(pluginMarketplaceProviderOptions(catalog)).toEqual([
      { label: "Backend market", value: "clawhub" },
    ]);
    expect(provider).toBeDefined();
    if (provider === undefined) {
      throw new Error("Expected backend default provider.");
    }
    expect(pluginMarketplaceFormDefaults(provider)).toEqual({
      allow_missing_digest: true,
      marketplace: "market",
      marketplace_provider: "clawhub",
      marketplace_ref: "stable",
      marketplace_source: "https://market.example",
      source: "",
      version: "",
    });
  });

  it("does not invent an adapter for an unadvertised provider", () => {
    expect(pluginMarketplaceProvider(catalog, "unavailable")).toBeUndefined();
    expect(defaultPluginMarketplaceProvider(undefined)).toBeUndefined();
  });

  it("keeps provider identities and defaults out of the settings view", () => {
    const settingsSource = readFileSync(
      resolve(
        process.cwd(),
        "src/features/settings/RuntimeSettingsSections.tsx",
      ),
      "utf8",
    );

    expect(settingsSource).toContain("getPluginMarketplaceProviders");
    expect(settingsSource).not.toContain("PLUGIN_MARKETPLACE_ADAPTERS");
    expect(settingsSource).not.toMatch(/marketplace_provider:\s*"[^\"]+"/);
  });
});
