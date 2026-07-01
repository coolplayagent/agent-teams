import {
  App,
  Button,
  Form,
  Input,
  Switch,
  Tag,
  Typography,
} from "antd";
import type { FormInstance } from "antd";
import {
  Copy,
  Pencil,
  Play,
  Plus,
  Power,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  addMcpServer,
  deleteMcpServer,
  getMcpServer,
  getMcpServerTools,
  listMcpServers,
  refreshMcpServerTools,
  reloadMcpConfig,
  setMcpServerEnabled,
  testMcpServerConnection,
  updateMcpServer,
} from "../../api/client";
import type {
  JsonValue,
  McpDiscoveryStatus,
  McpServerAddResult,
  McpServerConfigResult,
  McpServerSummary,
  McpServerToolsSummary,
} from "../../api/contracts";
import { useTranslations, type Translate } from "../../i18n";
import { SettingsQueryState, SettingsSection } from "./SettingsShared";

type McpEditorMode = "create" | "edit";

interface McpEditorState {
  config: Record<string, JsonValue>;
  mode: McpEditorMode;
  name: string;
}

interface McpFormValues {
  args: string;
  command: string;
  extra: string;
  name: string;
  overwrite: boolean;
  transport: string;
  url: string;
}

interface ToolState {
  error: string | null;
  loading: boolean;
  summary: McpServerToolsSummary | null;
}

interface TestState {
  error: string | null;
  loading: boolean;
  ok: boolean | null;
  toolCount: number;
}

const mcpQueryKey = ["settings", "mcp", "servers"] as const;
const transportOptions = ["stdio", "http", "sse", "streamable-http"] as const;

export function McpSettingsSection() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [form] = Form.useForm<McpFormValues>();
  const [editor, setEditor] = useState<McpEditorState | null>(null);
  const editorRef = useRef<McpEditorState | null>(null);
  const [toolStates, setToolStates] = useState<Record<string, ToolState>>({});
  const [testStates, setTestStates] = useState<Record<string, TestState>>({});

  const serversQuery = useQuery({
    queryKey: mcpQueryKey,
    queryFn: listMcpServers,
  });
  const servers = serversQuery.data ?? [];
  const transport = Form.useWatch("transport", form) ?? "stdio";

  const loadTools = useCallback(async (serverName: string) => {
    setToolStates((current) => ({
      ...current,
      [serverName]: {
        error: null,
        loading: true,
        summary: current[serverName]?.summary ?? null,
      },
    }));
    try {
      const summary = await getMcpServerTools(serverName);
      setToolStates((current) => ({
        ...current,
        [serverName]: {
          error: null,
          loading: false,
          summary,
        },
      }));
    } catch (error) {
      setToolStates((current) => ({
        ...current,
        [serverName]: {
          error: errorMessage(error),
          loading: false,
          summary: null,
        },
      }));
    }
  }, []);

  useEffect(() => {
    if (serversQuery.data === undefined) {
      return;
    }
    const nextToolStates: Record<string, ToolState> = {};
    for (const server of serversQuery.data) {
      nextToolStates[server.name] = {
        error: null,
        loading: server.enabled !== false,
        summary: null,
      };
    }
    setToolStates(nextToolStates);
    for (const server of serversQuery.data) {
      if (server.enabled !== false) {
        void loadTools(server.name);
      }
    }
  }, [loadTools, serversQuery.data]);

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (editor === null) {
      form.resetFields();
      return;
    }
    form.setFieldsValue(formValuesFromEditor(editor));
  }, [editor, form]);

  const totals = useMemo(() => {
    const enabled = servers.filter((server) => server.enabled !== false).length;
    const tools = servers.reduce(
      (count, server) =>
        count
        + (toolStates[server.name]?.summary?.tools?.length
          ?? server.tool_count
          ?? 0),
      0,
    );
    return { enabled, servers: servers.length, tools };
  }, [servers, toolStates]);

  const loadConfigMutation = useMutation({
    mutationFn: (serverName: string) => getMcpServer(serverName),
    onError: (error) => {
      void message.error(errorMessage(error));
    },
    onSuccess: (result: McpServerConfigResult) => {
      setEditor({
        config: result.config,
        mode: "edit",
        name: result.server.name,
      });
    },
  });

  const saveMutation = useMutation({
    mutationFn: (
      values: McpFormValues,
    ): Promise<McpServerAddResult | McpServerConfigResult> => {
      const currentEditor = editorRef.current;
      if (currentEditor?.mode === "edit") {
        return updateMcpServer(currentEditor.name, {
          config: buildMcpConfig(values, currentEditor.config, t),
        });
      }
      return addMcpServer({
        config: buildMcpConfig(values, currentEditor?.config ?? {}, t),
        name: values.name.trim(),
        overwrite: values.overwrite === true,
      });
    },
    onError: (error) => {
      void message.error(errorMessage(error));
    },
    onSuccess: () => {
      void message.success(t("settingsMcpSaved"));
      setEditor(null);
      void queryClient.invalidateQueries({ queryKey: mcpQueryKey });
    },
  });

  const reloadMutation = useMutation({
    mutationFn: reloadMcpConfig,
    onError: (error) => {
      void message.error(errorMessage(error));
    },
    onSuccess: () => {
      void message.success(t("settingsMcpReloaded"));
      void queryClient.invalidateQueries({ queryKey: mcpQueryKey });
    },
  });

  const refreshToolsMutation = useMutation({
    mutationFn: (serverName: string) => refreshMcpServerTools(serverName),
    onError: (error) => {
      void message.error(errorMessage(error));
    },
    onSuccess: (summary, serverName) => {
      setToolStates((current) => ({
        ...current,
        [serverName]: {
          error: summary.error ?? null,
          loading: false,
          summary,
        },
      }));
      void message.success(t("settingsMcpToolsRefreshed"));
      void queryClient.invalidateQueries({ queryKey: mcpQueryKey });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ enabled, name }: { enabled: boolean; name: string }) =>
      setMcpServerEnabled(name, enabled),
    onError: (error) => {
      void message.error(errorMessage(error));
    },
    onSuccess: (server) => {
      setTestStates((current) => omitKey(current, server.name));
      void message.success(
        server.enabled === false
          ? t("settingsMcpDisabled")
          : t("settingsMcpEnabled"),
      );
      void queryClient.invalidateQueries({ queryKey: mcpQueryKey });
    },
  });

  const testMutation = useMutation({
    mutationFn: (serverName: string) => testMcpServerConnection(serverName),
    onError: (error, serverName) => {
      setTestStates((current) => ({
        ...current,
        [serverName]: {
          error: errorMessage(error),
          loading: false,
          ok: false,
          toolCount: 0,
        },
      }));
    },
    onMutate: (serverName) => {
      setTestStates((current) => ({
        ...current,
        [serverName]: {
          error: null,
          loading: true,
          ok: null,
          toolCount: 0,
        },
      }));
    },
    onSuccess: (result) => {
      setTestStates((current) => ({
        ...current,
        [result.server]: {
          error: result.error ?? null,
          loading: false,
          ok: result.ok,
          toolCount: result.tool_count ?? result.tools?.length ?? 0,
        },
      }));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (serverName: string) => deleteMcpServer(serverName),
    onError: (error) => {
      void message.error(errorMessage(error));
    },
    onSuccess: (server) => {
      void message.success(t("settingsMcpDeleted", { name: server.name }));
      void queryClient.invalidateQueries({ queryKey: mcpQueryKey });
    },
  });

  function openCreateEditor() {
    setEditor({
      config: { transport: "stdio" },
      mode: "create",
      name: "",
    });
  }

  function confirmDelete(server: McpServerSummary) {
    modal.confirm({
      cancelText: t("sidebarDeleteCancel"),
      content: t("settingsMcpDeleteConfirm", { name: server.name }),
      okButtonProps: { danger: true },
      okText: t("sidebarDeleteConfirm"),
      onOk: () => deleteMutation.mutateAsync(server.name),
      title: t("settingsMcpDeleteTitle"),
    });
  }

  async function copyPreview(values: McpFormValues) {
    try {
      await navigator.clipboard.writeText(
        serializeMcpPayload(values, editorRef.current?.config ?? {}),
      );
      void message.success(t("settingsMcpCopied"));
    } catch {
      void message.error(t("settingsMcpCopyFailed"));
    }
  }

  function importMcpJson(source: string): boolean {
    if (editor === null) {
      return false;
    }
    try {
      const imported = parseMcpImportJson(source, t);
      const nextEditor = {
        config: imported.config,
        mode: editor.mode,
        name: editor.mode === "edit" ? editor.name : imported.name,
      };
      editorRef.current = nextEditor;
      setEditor(nextEditor);
      void message.success(t("settingsMcpJsonImported"));
      return true;
    } catch (error) {
      void message.error(errorMessage(error));
      return false;
    }
  }

  return (
    <SettingsSection title={t("settingsMcp")}>
      <SettingsQueryState error={serversQuery.error} loading={serversQuery.isLoading} />
      {!serversQuery.isLoading && serversQuery.data !== undefined ? (
        editor === null ? (
          <>
            <div className="at-settings-facts at-mcp-facts">
              <Fact label={t("settingsMcpServers")} value={String(totals.servers)} />
              <Fact label={t("settingsMcpEnabledCount")} value={String(totals.enabled)} />
              <Fact label={t("settingsMcpToolCount")} value={String(totals.tools)} />
            </div>
            <div className="at-settings-section-actions at-mcp-toolbar">
              <Button
                icon={<RefreshCw size={15} />}
                loading={serversQuery.isFetching}
                onClick={() => void serversQuery.refetch()}
              >
                {t("settingsMcpRefresh")}
              </Button>
              <Button
                icon={<RefreshCw size={15} />}
                loading={reloadMutation.isPending}
                onClick={() => reloadMutation.mutate()}
              >
                {t("settingsMcpReload")}
              </Button>
              <Button icon={<Plus size={15} />} onClick={openCreateEditor} type="primary">
                {t("settingsMcpAdd")}
              </Button>
            </div>
            {servers.length === 0 ? (
              <div className="at-settings-empty">{t("settingsMcpEmpty")}</div>
            ) : (
              <div className="at-mcp-server-list">
                {servers.map((server) => (
                  <McpServerCard
                    key={server.name}
                    loadingConfig={loadConfigMutation.isPending}
                    onDelete={confirmDelete}
                    onEdit={(name) => loadConfigMutation.mutate(name)}
                    onRefreshTools={(name) => refreshToolsMutation.mutate(name)}
                    onTest={(name) => testMutation.mutate(name)}
                    onToggle={(name, enabled) =>
                      toggleMutation.mutate({ enabled, name })}
                    server={server}
                    t={t}
                    testState={testStates[server.name]}
                    toolState={toolStates[server.name]}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <McpEditor
            editor={editor}
            form={form}
            onCancel={() => setEditor(null)}
            onCopy={copyPreview}
            onImport={importMcpJson}
            onSubmit={(values) => saveMutation.mutate(values)}
            saving={saveMutation.isPending}
            t={t}
            transport={transport}
          />
        )
      ) : null}
    </SettingsSection>
  );
}

function McpServerCard({
  loadingConfig,
  onDelete,
  onEdit,
  onRefreshTools,
  onTest,
  onToggle,
  server,
  t,
  testState,
  toolState,
}: {
  loadingConfig: boolean;
  onDelete: (server: McpServerSummary) => void;
  onEdit: (serverName: string) => void;
  onRefreshTools: (serverName: string) => void;
  onTest: (serverName: string) => void;
  onToggle: (serverName: string, enabled: boolean) => void;
  server: McpServerSummary;
  t: Translate;
  testState: TestState | undefined;
  toolState: ToolState | undefined;
}) {
  const enabled = server.enabled !== false;
  const summary = toolState?.summary;
  const state = summary?.status ?? server.discovery_status ?? "pending";
  const canDelete = server.source === "app";
  const statusLabel = stateLabel(state, t);
  const toolCount = summary?.tools?.length ?? server.tool_count ?? 0;

  return (
    <section className="at-mcp-server-card">
      <div className="at-settings-detail-header at-mcp-server-head">
        <div className="at-mcp-server-title">
          <Typography.Text strong>{server.name}</Typography.Text>
          <Typography.Text className="at-settings-list-meta">
            {server.source} / {server.transport || t("settingsUnknown")}
          </Typography.Text>
        </div>
        <div className="at-settings-detail-actions at-mcp-actions">
          <Tag className="at-mcp-state">{statusLabel}</Tag>
          <Button
            aria-label={t("settingsMcpEditServer", { name: server.name })}
            disabled={loadingConfig}
            icon={<Pencil size={15} />}
            onClick={() => onEdit(server.name)}
          >
            {t("settingsMcpEdit")}
          </Button>
          <Button
            aria-label={t("settingsMcpTestServer", { name: server.name })}
            disabled={!enabled || testState?.loading === true}
            icon={<Play size={15} />}
            loading={testState?.loading === true}
            onClick={() => onTest(server.name)}
          >
            {t("settingsMcpTest")}
          </Button>
          <Button
            aria-label={t("settingsMcpRefreshToolsFor", { name: server.name })}
            disabled={!enabled || toolState?.loading === true}
            icon={<RefreshCw size={15} />}
            loading={toolState?.loading === true}
            onClick={() => onRefreshTools(server.name)}
          >
            {t("settingsMcpRefreshTools")}
          </Button>
          <Button
            aria-label={
              enabled
                ? t("settingsMcpDisableServer", { name: server.name })
                : t("settingsMcpEnableServer", { name: server.name })
            }
            icon={<Power size={15} />}
            onClick={() => onToggle(server.name, !enabled)}
          >
            {enabled ? t("settingsMcpDisable") : t("settingsMcpEnable")}
          </Button>
          {canDelete ? (
            <Button
              aria-label={t("settingsMcpDeleteServer", { name: server.name })}
              danger
              icon={<Trash2 size={15} />}
              onClick={() => onDelete(server)}
            />
          ) : null}
        </div>
      </div>
      <div className="at-mcp-server-meta">
        <span>{t("settingsMcpToolsSummary", { count: String(toolCount) })}</span>
        <span>{lastCheckedLabel(server.last_checked_at ?? summary?.last_checked_at, t)}</span>
      </div>
      {testState !== undefined && testState.loading === false ? (
        <div
          className={
            testState.ok === true
              ? "at-mcp-test is-success"
              : "at-mcp-test is-danger"
          }
        >
          {testState.ok === true
            ? t("settingsMcpTestOk", {
                count: String(testState.toolCount),
                name: server.name,
              })
            : testState.error ?? t("settingsMcpTestFailed")}
        </div>
      ) : null}
      <McpToolsView enabled={enabled} server={server} t={t} toolState={toolState} />
    </section>
  );
}

function McpToolsView({
  enabled,
  server,
  t,
  toolState,
}: {
  enabled: boolean;
  server: McpServerSummary;
  t: Translate;
  toolState: ToolState | undefined;
}) {
  if (!enabled) {
    return <div className="at-settings-empty at-mcp-tools-empty">{t("settingsMcpDisabledState")}</div>;
  }
  if (toolState?.loading === true) {
    return <div className="at-settings-empty at-mcp-tools-empty">{t("settingsMcpLoadingTools")}</div>;
  }
  const summary = toolState?.summary;
  const error = toolState?.error ?? summary?.error ?? server.error ?? null;
  if (error) {
    return <div className="at-settings-empty at-mcp-tools-empty is-danger">{error}</div>;
  }
  const tools = summary?.tools ?? [];
  if (tools.length === 0) {
    return <div className="at-settings-empty at-mcp-tools-empty">{t("settingsMcpNoTools")}</div>;
  }
  return (
    <div className="at-mcp-tools">
      {tools.map((tool) => (
        <div className="at-mcp-tool-row" key={tool.name}>
          <Typography.Text strong>{tool.name}</Typography.Text>
          <Typography.Text className="at-settings-list-meta">
            {tool.description || t("settingsMcpNoDescription")}
          </Typography.Text>
        </div>
      ))}
    </div>
  );
}

function McpEditor({
  editor,
  form,
  onCancel,
  onCopy,
  onImport,
  onSubmit,
  saving,
  t,
  transport,
}: {
  editor: McpEditorState;
  form: FormInstance<McpFormValues>;
  onCancel: () => void;
  onCopy: (values: McpFormValues) => void;
  onImport: (source: string) => boolean;
  onSubmit: (values: McpFormValues) => void;
  saving: boolean;
  t: Translate;
  transport: string;
}) {
  const values = Form.useWatch([], form) ?? formValuesFromEditor(editor);
  const [jsonImportSource, setJsonImportSource] = useState("");
  const isStdio = transport === "stdio";
  const preview = serializeMcpPayload(values, editor.config);
  useEffect(() => {
    setJsonImportSource("");
  }, [editor]);

  function applyJsonImport() {
    if (onImport(jsonImportSource)) {
      setJsonImportSource("");
    }
  }

  return (
    <Form
      className="at-settings-form at-settings-wide-form at-mcp-editor"
      form={form}
      layout="vertical"
      onFinish={onSubmit}
    >
      <div className="at-settings-form-card">
        <div className="at-mcp-editor-head">
          <Typography.Text strong>
            {editor.mode === "edit" ? t("settingsMcpEditorEdit") : t("settingsMcpEditorCreate")}
          </Typography.Text>
          <Typography.Text className="at-settings-help">
            {editor.mode === "edit"
              ? t("settingsMcpEditorEditHelp")
              : t("settingsMcpEditorCreateHelp")}
          </Typography.Text>
        </div>
        <div className="at-mcp-editor-grid">
          <Form.Item
            label={t("settingsMcpName")}
            name="name"
            rules={[{ required: true, message: t("settingsMcpNameRequired") }]}
          >
            <Input autoComplete="off" disabled={editor.mode === "edit"} spellCheck={false} />
          </Form.Item>
          <Form.Item label={t("settingsMcpTransport")} name="transport">
            <select className="at-settings-native-select">
              {transportOptions.map((option) => (
                <option key={option} value={option}>
                  {transportLabel(option, t)}
                </option>
              ))}
            </select>
          </Form.Item>
          {isStdio ? (
            <>
              <Form.Item
                className="at-mcp-span"
                label={t("settingsMcpCommand")}
                name="command"
                rules={[{ required: true, message: t("settingsMcpCommandRequired") }]}
              >
                <Input autoComplete="off" spellCheck={false} />
              </Form.Item>
              <Form.Item className="at-mcp-span" label={t("settingsMcpArgs")} name="args">
                <Input.TextArea autoSize={{ minRows: 3 }} spellCheck={false} />
              </Form.Item>
            </>
          ) : (
            <Form.Item
              className="at-mcp-span"
              label={t("settingsMcpUrl")}
              name="url"
              rules={[{ required: true, message: t("settingsMcpUrlRequired") }]}
            >
              <Input autoComplete="off" spellCheck={false} />
            </Form.Item>
          )}
          <Form.Item
            className="at-mcp-span"
            label={isStdio ? t("settingsMcpEnv") : t("settingsMcpHeaders")}
            name="extra"
          >
            <Input.TextArea
              autoSize={{ minRows: 3 }}
              placeholder={t("settingsMcpExtraPlaceholder")}
              spellCheck={false}
            />
          </Form.Item>
          {editor.mode === "create" ? (
            <Form.Item
              className="at-mcp-overwrite"
              label={t("settingsMcpOverwrite")}
              name="overwrite"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          ) : null}
        </div>
      </div>
      <div className="at-settings-form-card at-mcp-json-import">
        <div className="at-mcp-editor-head">
          <div>
            <Typography.Text strong>{t("settingsMcpJsonImport")}</Typography.Text>
            <Typography.Text className="at-settings-help">
              {t("settingsMcpJsonImportHelp")}
            </Typography.Text>
          </div>
          <Button htmlType="button" onClick={applyJsonImport}>
            {t("settingsMcpApplyJson")}
          </Button>
        </div>
        <Input.TextArea
          aria-label={t("settingsMcpJsonImport")}
          autoSize={{ maxRows: 8, minRows: 4 }}
          onChange={(event) => setJsonImportSource(event.target.value)}
          placeholder={t("settingsMcpJsonImportPlaceholder")}
          spellCheck={false}
          value={jsonImportSource}
        />
      </div>
      <div className="at-settings-form-card at-mcp-json-preview">
        <div className="at-mcp-editor-head">
          <Typography.Text strong>{t("settingsMcpJsonPreview")}</Typography.Text>
          <Button
            htmlType="button"
            icon={<Copy size={15} />}
            onClick={() => onCopy(form.getFieldsValue())}
          >
            {t("settingsMcpCopyJson")}
          </Button>
        </div>
        <pre>{preview}</pre>
      </div>
      <div className="at-settings-section-actions">
        <Button onClick={onCancel}>{t("sidebarRenameCancel")}</Button>
        <Button htmlType="submit" loading={saving} type="primary">
          {t("settingsSave")}
        </Button>
      </div>
    </Form>
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

function buildMcpConfig(
  values: McpFormValues,
  originalConfig: Record<string, JsonValue>,
  t: Translate,
): Record<string, JsonValue> {
  const transport = values.transport || "stdio";
  const config: Record<string, JsonValue> = { ...originalConfig, transport };
  if (transport === "stdio") {
    const command = values.command.trim();
    if (!command) {
      throw new Error(t("settingsMcpCommandRequired"));
    }
    config.command = command;
    const args = parseLineList(values.args);
    if (args.length > 0) {
      config.args = args;
    } else {
      delete config.args;
    }
    const env = parseKeyValueLines(values.extra, t);
    if (Object.keys(env).length > 0) {
      config.env = env;
    } else {
      delete config.env;
    }
    delete config.url;
    delete config.headers;
    return config;
  }
  const url = values.url.trim();
  if (!url) {
    throw new Error(t("settingsMcpUrlRequired"));
  }
  config.url = url;
  const headers = parseKeyValueLines(values.extra, t);
  if (Object.keys(headers).length > 0) {
    config.headers = headers;
  } else {
    delete config.headers;
  }
  delete config.command;
  delete config.args;
  delete config.env;
  return config;
}

function formValuesFromEditor(editor: McpEditorState): McpFormValues {
  const transport = stringValue(editor.config.transport) || "stdio";
  const isStdio = transport === "stdio";
  return {
    args: isStdio ? formatLineList(editor.config.args) : "",
    command: isStdio ? stringValue(editor.config.command) : "",
    extra: isStdio
      ? formatKeyValueLines(editor.config.env)
      : formatKeyValueLines(editor.config.headers),
    name: editor.name,
    overwrite: false,
    transport,
    url: isStdio ? "" : stringValue(editor.config.url),
  };
}

function parseMcpImportJson(source: string, t: Translate): McpEditorState {
  const text = source.trim();
  if (!text) {
    throw new Error(t("settingsMcpJsonInvalid"));
  }
  const parsed = JSON.parse(text) as JsonValue;
  const root = recordValue(parsed);
  if (root === null) {
    throw new Error(t("settingsMcpJsonInvalid"));
  }

  const previewName = stringValue(root.name);
  const previewConfig = recordValue(root.config);
  if (previewName && previewConfig !== null) {
    return {
      config: normalizeImportedMcpConfig(previewConfig),
      mode: "create",
      name: previewName,
    };
  }

  const servers = recordValue(root.mcpServers);
  if (servers === null) {
    throw new Error(t("settingsMcpJsonInvalid"));
  }
  const entries = Object.entries(servers);
  if (entries.length !== 1) {
    throw new Error(t("settingsMcpJsonInvalid"));
  }
  const [name, configValue] = entries[0] ?? ["", null];
  const config = recordValue(configValue);
  if (!name || config === null) {
    throw new Error(t("settingsMcpJsonInvalid"));
  }
  return {
    config: normalizeImportedMcpConfig(config),
    mode: "create",
    name,
  };
}

function serializeMcpPayload(
  values: McpFormValues,
  originalConfig: Record<string, JsonValue>,
): string {
  const config = buildMcpConfigPreview(values, originalConfig);
  return JSON.stringify(
    {
      name: values.name?.trim() ?? "",
      config,
      overwrite: values.overwrite === true,
    },
    null,
    2,
  );
}

function buildMcpConfigPreview(
  values: McpFormValues,
  originalConfig: Record<string, JsonValue>,
): Record<string, JsonValue> {
  const transport = values.transport || "stdio";
  const config: Record<string, JsonValue> = { ...originalConfig, transport };
  if (transport === "stdio") {
    config.command = values.command?.trim() ?? "";
    const args = parseLineList(values.args ?? "");
    if (args.length > 0) {
      config.args = args;
    } else {
      delete config.args;
    }
    const env = parseKeyValueLinesLenient(values.extra ?? "");
    if (Object.keys(env).length > 0) {
      config.env = env;
    } else {
      delete config.env;
    }
    delete config.url;
    delete config.headers;
    return config;
  }
  config.url = values.url?.trim() ?? "";
  const headers = parseKeyValueLinesLenient(values.extra ?? "");
  if (Object.keys(headers).length > 0) {
    config.headers = headers;
  } else {
    delete config.headers;
  }
  delete config.command;
  delete config.args;
  delete config.env;
  return config;
}

function normalizeImportedMcpConfig(
  config: Record<string, JsonValue>,
): Record<string, JsonValue> {
  const normalized: Record<string, JsonValue> = { ...config };
  normalized.transport = normalizeImportedTransport(
    stringValue(normalized.transport) || stringValue(normalized.type),
  );
  delete normalized.type;

  if (Array.isArray(normalized.command)) {
    const commandParts = normalized.command
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
    const command = commandParts[0];
    if (command !== undefined) {
      normalized.command = command;
      const args = commandParts.slice(1);
      if (args.length > 0) {
        normalized.args = args;
      } else {
        delete normalized.args;
      }
    } else {
      delete normalized.command;
    }
  }

  return normalized;
}

function normalizeImportedTransport(value: string): string {
  const transport = value.trim().toLowerCase();
  if (transport === "local") {
    return "stdio";
  }
  if (transport === "remote") {
    return "sse";
  }
  if (transport === "streamablehttp" || transport === "streamable_http") {
    return "streamable-http";
  }
  if (transportOptions.some((option) => option === transport)) {
    return transport;
  }
  return "stdio";
}

function parseLineList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseKeyValueLines(
  value: string,
  t: Translate,
): Record<string, JsonValue> {
  const result: Record<string, JsonValue> = {};
  for (const line of parseLineList(value)) {
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      throw new Error(t("settingsMcpKeyValueInvalid"));
    }
    const key = line.slice(0, separatorIndex).trim();
    const entryValue = line.slice(separatorIndex + 1).trim();
    if (!key) {
      throw new Error(t("settingsMcpKeyValueInvalid"));
    }
    result[key] = entryValue;
  }
  return result;
}

function parseKeyValueLinesLenient(value: string): Record<string, JsonValue> {
  const result: Record<string, JsonValue> = {};
  for (const line of parseLineList(value)) {
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    if (key) {
      result[key] = line.slice(separatorIndex + 1).trim();
    }
  }
  return result;
}

function recordValue(value: JsonValue | undefined): Record<string, JsonValue> | null {
  if (value === undefined || value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value;
}

function formatLineList(value: JsonValue | undefined): string {
  if (!Array.isArray(value)) {
    return "";
  }
  return value
    .map((item) => (typeof item === "string" ? item : ""))
    .filter(Boolean)
    .join("\n");
}

function formatKeyValueLines(value: JsonValue | undefined): string {
  if (value === undefined || value === null || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }
  return Object.entries(value)
    .map(([key, entryValue]) => `${key}=${stringValue(entryValue)}`)
    .join("\n");
}

function stringValue(value: JsonValue | undefined): string {
  return typeof value === "string" ? value : "";
}

function transportLabel(transport: string, t: Translate): string {
  if (transport === "stdio") {
    return t("settingsMcpTransportStdio");
  }
  if (transport === "streamable-http") {
    return t("settingsMcpTransportStreamableHttp");
  }
  return transport.toUpperCase();
}

function stateLabel(status: McpDiscoveryStatus, t: Translate): string {
  if (status === "ready") {
    return t("settingsMcpStateReady");
  }
  if (status === "failed") {
    return t("settingsMcpStateFailed");
  }
  if (status === "loading") {
    return t("settingsMcpStateLoading");
  }
  if (status === "disabled") {
    return t("settingsMcpStateDisabled");
  }
  return t("settingsMcpStatePending");
}

function lastCheckedLabel(value: string | null | undefined, t: Translate): string {
  if (!value) {
    return t("settingsMcpNeverChecked");
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return value;
  }
  return t("settingsMcpLastChecked", {
    value: date.toLocaleString(undefined, {
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      month: "2-digit",
    }),
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed";
}

function omitKey<TValue>(
  record: Record<string, TValue>,
  key: string,
): Record<string, TValue> {
  const next: Record<string, TValue> = {};
  for (const [entryKey, value] of Object.entries(record)) {
    if (entryKey !== key) {
      next[entryKey] = value;
    }
  }
  return next;
}
