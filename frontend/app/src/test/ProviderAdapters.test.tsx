import { describe, expect, it } from "vitest";

import type { ConnectorItem } from "../api/contracts";
import { deliveryProviderAdapter } from "../features/automation/deliveryProviderAdapters";
import {
  connectorFallbackIcon,
  connectorPresentationAdapter,
} from "../features/connectors/connectorPresentationAdapters";

describe("provider adapter registries", () => {
  it("keeps automation delivery behavior behind the provider registry", () => {
    const adapter = deliveryProviderAdapter("feishu");
    expect(adapter).not.toBeNull();
    expect(deliveryProviderAdapter("renamed-feishu")).toBeNull();
  });

  it("falls back safely when a connector provider is unknown or renamed", () => {
    const connector = connectorItem("renamed-github");
    expect(connectorPresentationAdapter(connector)).toBeNull();
    expect(connectorFallbackIcon(connector)).not.toBeNull();
  });

  it("looks up connector behavior independently of display names", () => {
    const connector = connectorItem("github");
    connector.display_name = "代码托管";
    expect(connectorPresentationAdapter(connector)?.configuration).toEqual({
      kind: "github",
    });
  });
});

function connectorItem(provider: string): ConnectorItem {
  return {
    account_count: 0,
    auth_type: "oauth",
    capabilities: [],
    category: "development",
    connector_id: provider,
    description: "",
    display_name: provider,
    enabled_count: 0,
    provider: provider as ConnectorItem["provider"],
    status: "needs_config",
  };
}
