import { useQuery } from "@tanstack/react-query";
import { Typography } from "antd";

import {
  getAgentRuntimes,
  getHookRuntimeView,
  getHooksConfig,
  getPluginsRuntime,
} from "../../api/client";
import type {
  AgentRuntimeSummary,
  HooksConfigPayload,
  JsonValue,
  LoadedHookRecord,
  PluginRuntimeDiagnostics,
  PluginRuntimeRecord,
} from "../../api/contracts";
import { useTranslations } from "../../i18n";
import { SettingsQueryState, SettingsSection } from "./SettingsShared";

export function PluginsSettingsSection() {
  const t = useTranslations();
  const query = useQuery({
    queryKey: ["settings", "plugins", "runtime"],
    queryFn: getPluginsRuntime,
  });
  const plugins = query.data?.plugins ?? [];
  const diagnostics = query.data?.diagnostics ?? [];
  return (
    <SettingsSection title={t("settingsPlugins")}>
      <SettingsQueryState error={query.error} loading={query.isLoading} />
      {!query.isLoading && query.data !== undefined ? (
        <>
          <div className="at-settings-facts">
            <Fact label={t("settingsPluginsTotal")} value={String(plugins.length)} />
            <Fact
              label={t("settingsPluginsDiagnostics")}
              value={String(diagnostics.length)}
            />
          </div>
          <PluginRuntimeList plugins={plugins} />
          <PluginDiagnosticsList diagnostics={diagnostics} />
        </>
      ) : null}
    </SettingsSection>
  );
}

export function HooksSettingsSection() {
  const t = useTranslations();
  const hooksQuery = useQuery({
    queryKey: ["settings", "hooks", "config"],
    queryFn: getHooksConfig,
  });
  const runtimeQuery = useQuery({
    queryKey: ["settings", "hooks", "runtime"],
    queryFn: getHookRuntimeView,
  });
  const configuredGroups = hookGroups(hooksQuery.data);
  const loadedHooks = runtimeQuery.data?.loaded_hooks ?? [];
  const sources = runtimeQuery.data?.sources ?? [];
  const loading = hooksQuery.isLoading || runtimeQuery.isLoading;
  const error = hooksQuery.error ?? runtimeQuery.error;
  return (
    <SettingsSection title={t("settingsHooks")}>
      <SettingsQueryState error={error} loading={loading} />
      {!loading && error === null ? (
        <>
          <div className="at-settings-facts">
            <Fact
              label={t("settingsHooksConfigured")}
              value={String(configuredGroups.length)}
            />
            <Fact
              label={t("settingsHooksLoaded")}
              value={String(loadedHooks.length)}
            />
            <Fact label={t("settingsHooksSources")} value={String(sources.length)} />
          </div>
          <HookRuntimeList hooks={loadedHooks} />
        </>
      ) : null}
    </SettingsSection>
  );
}

export function AgentRuntimeSettingsSection() {
  const t = useTranslations();
  const query = useQuery({
    queryKey: ["settings", "agent-runtimes"],
    queryFn: getAgentRuntimes,
  });
  const runtimes = query.data ?? [];
  return (
    <SettingsSection title={t("settingsAgentRuntime")}>
      <SettingsQueryState error={query.error} loading={query.isLoading} />
      {!query.isLoading && query.data !== undefined ? (
        <>
          <div className="at-settings-facts">
            <Fact
              label={t("settingsAgentRuntimeTotal")}
              value={String(runtimes.length)}
            />
          </div>
          <AgentRuntimeList runtimes={runtimes} />
        </>
      ) : null}
    </SettingsSection>
  );
}

function PluginRuntimeList({ plugins }: { plugins: PluginRuntimeRecord[] }) {
  const t = useTranslations();
  if (plugins.length === 0) {
    return <div className="at-settings-empty">{t("settingsPluginsEmpty")}</div>;
  }
  return (
    <div className="at-settings-list at-runtime-settings-list">
      {plugins.map((plugin) => {
        const title = pluginTitle(plugin, t("settingsPluginsUnnamed"));
        return (
          <div className="at-settings-list-row" key={pluginKey(plugin, title)}>
            <div className="at-settings-list-main">
              <span>{title}</span>
              <Typography.Text ellipsis title={pluginDetail(plugin, t)}>
                {pluginDetail(plugin, t)}
              </Typography.Text>
            </div>
            <Typography.Text
              className="at-settings-list-meta"
              ellipsis
              title={pluginStatus(plugin, t)}
            >
              {pluginStatus(plugin, t)}
            </Typography.Text>
          </div>
        );
      })}
    </div>
  );
}

function PluginDiagnosticsList({
  diagnostics,
}: {
  diagnostics: PluginRuntimeDiagnostics[];
}) {
  const t = useTranslations();
  if (diagnostics.length === 0) {
    return null;
  }
  return (
    <div className="at-settings-list at-runtime-settings-list">
      {diagnostics.map((diagnostic, index) => (
        <div className="at-settings-list-row" key={`${diagnostic.plugin ?? "plugin"}-${index}`}>
          <div className="at-settings-list-main">
            <span>{diagnostic.plugin ?? t("settingsPluginsDiagnostic")}</span>
            <Typography.Text ellipsis title={diagnostic.message ?? ""}>
              {diagnostic.message ?? "-"}
            </Typography.Text>
          </div>
          <Typography.Text className="at-settings-list-meta" ellipsis>
            {diagnostic.level ?? diagnostic.code ?? "-"}
          </Typography.Text>
        </div>
      ))}
    </div>
  );
}

function HookRuntimeList({ hooks }: { hooks: LoadedHookRecord[] }) {
  const t = useTranslations();
  if (hooks.length === 0) {
    return <div className="at-settings-empty">{t("settingsHooksEmpty")}</div>;
  }
  return (
    <div className="at-settings-list at-runtime-settings-list">
      {hooks.map((hook, index) => (
        <div className="at-settings-list-row" key={`${hook.name ?? hook.event ?? "hook"}-${index}`}>
          <div className="at-settings-list-main">
            <span>{hook.name ?? hook.event ?? t("settingsHooksUnnamed")}</span>
            <Typography.Text ellipsis title={hookDetail(hook)}>
              {hookDetail(hook)}
            </Typography.Text>
          </div>
          <Typography.Text
            className="at-settings-list-meta"
            ellipsis
            title={hook.source ?? "-"}
          >
            {hook.source ?? "-"}
          </Typography.Text>
        </div>
      ))}
    </div>
  );
}

function AgentRuntimeList({ runtimes }: { runtimes: AgentRuntimeSummary[] }) {
  const t = useTranslations();
  if (runtimes.length === 0) {
    return <div className="at-settings-empty">{t("settingsAgentRuntimeEmpty")}</div>;
  }
  return (
    <div className="at-settings-list at-runtime-settings-list">
      {runtimes.map((runtime) => (
        <div className="at-settings-list-row" key={runtime.agent_id}>
          <div className="at-settings-list-main">
            <span>{runtime.name?.trim() || runtime.agent_id}</span>
            <Typography.Text ellipsis title={runtime.description ?? ""}>
              {runtime.description ?? "-"}
            </Typography.Text>
          </div>
          <Typography.Text
            className="at-settings-list-meta"
            ellipsis
            title={agentRuntimeDetail(runtime)}
          >
            {agentRuntimeDetail(runtime)}
          </Typography.Text>
        </div>
      ))}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function hookGroups(config: HooksConfigPayload | undefined): Array<[string, JsonValue]> {
  return Object.entries(config?.hooks ?? {});
}

function hookDetail(hook: LoadedHookRecord): string {
  return [hook.event, hook.matcher, hook.handler]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean)
    .join(" · ") || "-";
}

function pluginTitle(plugin: PluginRuntimeRecord, fallback: string): string {
  return plugin.name?.trim() || plugin.plugin_id?.trim() || plugin.source?.trim() || fallback;
}

function pluginKey(plugin: PluginRuntimeRecord, title: string): string {
  return plugin.manifest_path?.trim() || plugin.plugin_id?.trim() || plugin.name?.trim() || title;
}

function pluginDetail(plugin: PluginRuntimeRecord, t: ReturnType<typeof useTranslations>): string {
  const componentCount = [
    plugin.skill_sources,
    plugin.role_sources,
    plugin.command_sources,
    plugin.hook_sources,
    plugin.mcp_sources,
    plugin.settings_sources,
  ].reduce((total, sources) => total + (sources?.length ?? 0), 0);
  if (componentCount > 0) {
    return t("settingsPluginsComponents", { count: componentCount });
  }
  return plugin.description?.trim() || plugin.manifest_path?.trim() || t("settingsNoComponents");
}

function pluginStatus(plugin: PluginRuntimeRecord, t: ReturnType<typeof useTranslations>): string {
  if (plugin.valid === false) {
    return t("settingsInvalid");
  }
  if (plugin.enabled === false) {
    return t("settingsDisabled");
  }
  return t("settingsEnabled");
}

function agentRuntimeDetail(runtime: AgentRuntimeSummary): string {
  return [runtime.protocol, runtime.transport]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean)
    .join(" · ") || "-";
}
