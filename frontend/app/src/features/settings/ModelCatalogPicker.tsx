import { Button, Select, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";

import type {
  ModelCatalogModel,
  ModelCatalogProvider,
  ModelCatalogResult,
} from "../../api/contracts";
import { useTranslations } from "../../i18n";
import "./ModelCatalogPicker.css";

interface ModelCatalogPickerProps {
  catalog: ModelCatalogResult | undefined;
  error: Error | null;
  loading: boolean;
  onRefresh: () => void;
  onSelect: (provider: ModelCatalogProvider, model: ModelCatalogModel) => void;
  selectedModelId: string;
  selectedProviderId: string;
}

export function ModelCatalogPicker({
  catalog,
  error,
  loading,
  onRefresh,
  onSelect,
  selectedModelId,
  selectedProviderId,
}: ModelCatalogPickerProps) {
  const t = useTranslations();
  const providers = catalog?.providers ?? [];
  const initialProviderId =
    providers.some((provider) => provider.id === selectedProviderId)
      ? selectedProviderId
      : providers[0]?.id;
  const [activeProviderId, setActiveProviderId] = useState(initialProviderId);

  useEffect(() => {
    if (selectedProviderId && providers.some((item) => item.id === selectedProviderId)) {
      setActiveProviderId(selectedProviderId);
      return;
    }
    setActiveProviderId((current) =>
      current && providers.some((item) => item.id === current)
        ? current
        : providers[0]?.id,
    );
  }, [providers, selectedProviderId]);

  const activeProvider = providers.find((provider) => provider.id === activeProviderId);
  const providerOptions = useMemo(
    () =>
      providers.map((provider) => ({
        label: `${provider.name} · ${provider.runtime_provider ?? provider.id}`,
        searchText: `${provider.name} ${provider.id} ${provider.runtime_provider ?? ""}`,
        value: provider.id,
      })),
    [providers],
  );
  const modelOptions = useMemo(
    () =>
      (activeProvider?.models ?? []).map((model) => ({
        label: (
          <div className="at-model-catalog-model-option">
            <span>{model.name}</span>
            <small>{modelCatalogModelMeta(model)}</small>
          </div>
        ),
        searchText: `${model.name} ${model.id} ${model.family ?? ""} ${modelCatalogModelMeta(model)}`,
        value: model.id,
      })),
    [activeProvider],
  );

  return (
    <section className="at-model-catalog-panel">
      <div className="at-model-catalog-header">
        <div>
          <Typography.Text strong>{t("settingsModelCatalogTitle")}</Typography.Text>
          <Typography.Text className="at-model-catalog-status">
            {error !== null
              ? t("settingsModelCatalogFailed")
              : catalogStatusText(catalog, t)}
          </Typography.Text>
        </div>
        <Button loading={loading} onClick={onRefresh} size="small">
          {t("settingsRefresh")}
        </Button>
      </div>
      <div className="at-model-catalog-controls">
        <Select
          aria-label={t("settingsModelCatalogProviderSearch")}
          filterOption={catalogFilterOption}
          loading={loading}
          optionFilterProp="searchText"
          options={providerOptions}
          placeholder={t("settingsModelCatalogProviderSearch")}
          popupMatchSelectWidth
          showSearch
          value={activeProviderId}
          virtual
          onChange={setActiveProviderId}
        />
        <Select
          aria-label={t("settingsModelCatalogModelSearch")}
          disabled={activeProvider === undefined}
          filterOption={catalogFilterOption}
          listHeight={320}
          optionFilterProp="searchText"
          options={modelOptions}
          optionLabelProp="value"
          placeholder={
            activeProvider === undefined
              ? t("settingsModelCatalogSelectProvider")
              : t("settingsModelCatalogModelSearch")
          }
          popupMatchSelectWidth
          showSearch
          value={
            activeProvider?.models?.some((model) => model.id === selectedModelId)
              ? selectedModelId
              : undefined
          }
          virtual
          onChange={(modelId) => {
            const model = activeProvider?.models?.find((item) => item.id === modelId);
            if (activeProvider !== undefined && model !== undefined) {
              onSelect(activeProvider, model);
            }
          }}
        />
      </div>
    </section>
  );
}

function catalogFilterOption(
  input: string,
  option: { searchText?: string } | undefined,
): boolean {
  return (option?.searchText ?? "").toLocaleLowerCase().includes(input.toLocaleLowerCase());
}

function catalogStatusText(
  catalog: ModelCatalogResult | undefined,
  t: ReturnType<typeof useTranslations>,
): string {
  if (catalog === undefined) {
    return t("settingsModelCatalogLoading");
  }
  if (!catalog.ok) {
    return catalog.error_message ?? t("settingsModelCatalogFailed");
  }
  const providers = catalog.providers ?? [];
  const modelCount = providers.reduce(
    (total, provider) => total + (provider.models?.length ?? 0),
    0,
  );
  return t("settingsModelCatalogLoaded", {
    models: String(modelCount),
    providers: String(providers.length),
  });
}

function modelCatalogModelMeta(model: ModelCatalogModel): string {
  const parts: string[] = [];
  if (typeof model.context_window === "number") {
    parts.push(`${model.context_window} ctx`);
  }
  if (typeof model.output_limit === "number") {
    parts.push(`${model.output_limit} out`);
  }
  if (model.tool_call === true) {
    parts.push("tools");
  }
  const modalities = model.input_modalities ?? [];
  if (modalities.some((modality) => modality !== "text")) {
    parts.push(modalities.join("+"));
  }
  return parts.join(" · ") || model.id;
}
