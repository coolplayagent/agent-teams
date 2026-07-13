import type {
  PluginMarketplaceProviderCatalog,
  PluginMarketplaceProviderDescriptor,
  PluginMarketplaceProviderKind,
} from "../../api/contracts";

export interface PluginMarketplaceFormDefaults {
  allow_missing_digest: boolean;
  marketplace: string;
  marketplace_provider: PluginMarketplaceProviderKind;
  marketplace_ref: string;
  marketplace_source: string;
  source: string;
  version: string;
}

export function pluginMarketplaceProviderOptions(
  catalog: PluginMarketplaceProviderCatalog | undefined,
): Array<{ label: string; value: PluginMarketplaceProviderKind }> {
  return (catalog?.providers ?? []).map((provider) => ({
    label: provider.display_name,
    value: provider.provider,
  }));
}

export function defaultPluginMarketplaceProvider(
  catalog: PluginMarketplaceProviderCatalog | undefined,
): PluginMarketplaceProviderDescriptor | undefined {
  if (catalog === undefined) {
    return undefined;
  }
  return (
    pluginMarketplaceProvider(catalog, catalog.default_provider) ??
    catalog.providers[0]
  );
}

export function pluginMarketplaceProvider(
  catalog: PluginMarketplaceProviderCatalog | undefined,
  provider: string | null | undefined,
): PluginMarketplaceProviderDescriptor | undefined {
  const normalizedProvider = provider?.trim() ?? "";
  if (normalizedProvider.length === 0) {
    return undefined;
  }
  return catalog?.providers.find(
    (candidate) => candidate.provider === normalizedProvider,
  );
}

export function pluginMarketplaceFormDefaults(
  provider: PluginMarketplaceProviderDescriptor,
): PluginMarketplaceFormDefaults {
  return {
    allow_missing_digest: provider.defaults.allow_missing_digest,
    marketplace: provider.defaults.marketplace,
    marketplace_provider: provider.provider,
    marketplace_ref: provider.defaults.marketplace_ref,
    marketplace_source: provider.defaults.marketplace_source,
    source: "",
    version: "",
  };
}
