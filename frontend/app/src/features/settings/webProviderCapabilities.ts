import type {
  WebConfig,
  WebFallbackProvider,
  WebFallbackProviderDescriptor,
  WebProviderDescriptor,
} from "../../api/contracts";

export function webProviderDescriptor(
  config: WebConfig,
): WebProviderDescriptor | undefined {
  return (config.provider_options ?? []).find(
    (candidate) => candidate.provider === config.provider,
  );
}

export function webFallbackProviderOptions(
  config: WebConfig,
): Array<{ label: string; value: WebFallbackProvider }> {
  return (config.fallback_provider_options ?? []).map((provider) => ({
    label: provider.display_name,
    value: provider.provider,
  }));
}

export function defaultWebFallbackProvider(
  config: WebConfig,
): WebFallbackProvider | undefined {
  return config.fallback_provider ?? config.fallback_provider_options?.[0]?.provider;
}

export function webFallbackProviderDescriptor(
  config: WebConfig,
  provider: WebFallbackProvider | undefined,
): WebFallbackProviderDescriptor | undefined {
  return (config.fallback_provider_options ?? []).find(
    (candidate) => candidate.provider === provider,
  );
}
