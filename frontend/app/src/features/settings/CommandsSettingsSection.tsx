import {
  App,
  Button,
  Form,
  Input,
  Tag,
  Typography,
} from "antd";
import { Copy, Pencil, Plus, RefreshCw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import {
  createCommand,
  getCommandCatalog,
  updateCommand,
} from "../../api/client";
import type {
  CommandCatalogResponse,
  CommandCatalogWorkspace,
  CommandCreateRequest,
  CommandCreateSource,
  CommandDetail,
  CommandUpdateRequest,
} from "../../api/contracts";
import { useTranslations, type Translate, type TranslationKey } from "../../i18n";
import { SettingsQueryState, SettingsSection } from "./SettingsShared";

type CommandEditorMode = "create" | "edit";

interface CommandGroup {
  commands: CommandDetail[];
  emptyText: string;
  key: string;
  subtitle: string;
  title: string;
}

interface CommandFormValues {
  aliases: string;
  allowed_modes: string;
  argument_hint: string;
  description: string;
  name: string;
  relative_path: string;
  scope: "project" | "global";
  source: CommandCreateSource;
  template: string;
  workspace_id: string;
}

interface CommandEditorState {
  command: CommandDetail | null;
  mode: CommandEditorMode;
}

const projectSources: Array<{
  labelKey: TranslationKey;
  value: CommandCreateSource;
}> = [
  { value: "relay_teams", labelKey: "settingsCommandsSourceRelayTeams" },
  { value: "claude", labelKey: "settingsCommandsSourceClaude" },
  { value: "codex", labelKey: "settingsCommandsSourceCodex" },
  { value: "opencode", labelKey: "settingsCommandsSourceOpenCode" },
];
const emptyCommandCatalog: CommandCatalogResponse = {};

export function CommandsSettingsSection() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [form] = Form.useForm<CommandFormValues>();
  const [editor, setEditor] = useState<CommandEditorState | null>(null);
  const [pathTouched, setPathTouched] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const catalogQuery = useQuery({
    queryKey: ["settings", "commands", "catalog"],
    queryFn: getCommandCatalog,
  });
  const catalog = catalogQuery.data ?? emptyCommandCatalog;
  const groups = useMemo(() => buildCommandGroups(catalog, t), [catalog, t]);
  const filteredGroups = useMemo(
    () => filterCommandGroups(groups, searchQuery),
    [groups, searchQuery],
  );
  const totalCommands = groups.reduce(
    (count, group) => count + group.commands.length,
    0,
  );
  const writableWorkspaces = useMemo(() => writableWorkspaceOptions(catalog), [catalog]);
  const scope = Form.useWatch("scope", form);

  useEffect(() => {
    if (editor === null) {
      form.resetFields();
      setPathTouched(false);
      setPreviewVisible(false);
      return;
    }
    form.setFieldsValue(valuesFromEditor(editor, writableWorkspaces));
    setPathTouched(editor.mode === "edit");
    setPreviewVisible(false);
  }, [editor, form, writableWorkspaces]);

  const saveMutation = useMutation({
    mutationFn: (values: CommandFormValues) =>
      editor?.mode === "edit" && editor.command !== null
        ? updateCommand(buildUpdateRequest(editor.command, values))
        : createCommand(buildCreateRequest(values)),
    onSuccess: (_, values) => {
      void message.success(
        editor?.mode === "edit"
          ? t("settingsCommandsUpdated")
          : t("settingsCommandsCreated"),
      );
      setEditor(null);
      dispatchCommandsUpdated();
      void queryClient.invalidateQueries({
        queryKey: ["settings", "commands", "catalog"],
      });
      if (values.name.trim()) {
        setSearchQuery(values.name.trim());
      }
    },
    onError: (error) => {
      void message.error(
        error instanceof Error ? error.message : t("settingsCommandsSaveFailed"),
      );
    },
  });

  function openCreateEditor() {
    setEditor({ command: null, mode: "create" });
  }

  function openEditEditor(command: CommandDetail) {
    setEditor({ command, mode: "edit" });
  }

  function submit(values: CommandFormValues) {
    if (editor?.mode !== "edit" && values.scope === "project" && !values.workspace_id) {
      void message.error(t("settingsCommandsWorkspaceRequired"));
      return;
    }
    saveMutation.mutate(values);
  }

  async function copyCommandPath(command: CommandDetail) {
    const path = command.source_path.trim();
    try {
      await navigator.clipboard.writeText(path);
      void message.success(t("settingsCommandsPathCopied"));
    } catch {
      void message.error(t("settingsCommandsPathCopyFailed"));
    }
  }

  return (
    <SettingsSection title={t("settingsCommands")}>
      <SettingsQueryState error={catalogQuery.error} loading={catalogQuery.isLoading} />
      {!catalogQuery.isLoading && catalogQuery.data !== undefined ? (
        editor === null ? (
          <>
            <div className="at-settings-facts">
              <Fact label={t("settingsCommandsTotal")} value={String(totalCommands)} />
              <Fact
                label={t("settingsCommandsWorkspaceCount")}
                value={String(catalog.workspaces?.length ?? 0)}
              />
              <Fact
                label={t("settingsCommandsGlobalCount")}
                value={String(catalog.app_commands?.length ?? 0)}
              />
            </div>
            <div className="at-settings-section-actions at-commands-toolbar">
              <Input.Search
                allowClear
                aria-label={t("settingsCommandsSearch")}
                className="at-commands-search"
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t("settingsCommandsSearch")}
                value={searchQuery}
              />
              <Button
                icon={<RefreshCw size={15} />}
                loading={catalogQuery.isFetching}
                onClick={() => void catalogQuery.refetch()}
              >
                {t("settingsCommandsRefresh")}
              </Button>
              <Button icon={<Plus size={15} />} onClick={openCreateEditor} type="primary">
                {t("settingsCommandsAdd")}
              </Button>
            </div>
            {totalCommands === 0 ? (
              <div className="at-settings-empty">{t("settingsCommandsEmpty")}</div>
            ) : (
              <div className="at-commands-groups">
                {filteredGroups.length > 0 ? (
                  filteredGroups.map((group) => (
                    <CommandGroupView
                      group={group}
                      key={group.key}
                      onCopy={copyCommandPath}
                      onEdit={openEditEditor}
                      t={t}
                    />
                  ))
                ) : (
                  <div className="at-settings-empty">{t("settingsCommandsNoMatches")}</div>
                )}
              </div>
            )}
          </>
        ) : (
          <Form
            className="at-settings-form at-settings-wide-form at-commands-editor"
            form={form}
            layout="vertical"
            onFinish={submit}
          >
            <div className="at-settings-form-card">
              <div className="at-commands-editor-head">
                <Typography.Text strong>
                  {editor.mode === "edit"
                    ? t("settingsCommandsEditorEdit")
                    : t("settingsCommandsEditorCreate")}
                </Typography.Text>
                <Typography.Text className="at-settings-help">
                  {editor.mode === "edit"
                    ? t("settingsCommandsEditorEditHelp")
                    : t("settingsCommandsEditorCreateHelp")}
                </Typography.Text>
              </div>
              <div className="at-commands-editor-grid">
                {editor.mode === "create" ? (
                  <>
                    <Form.Item label={t("settingsCommandsScope")} name="scope">
                      <select className="at-settings-native-select">
                        <option value="project">{t("settingsCommandsScopeProject")}</option>
                        <option value="global">{t("settingsCommandsScopeGlobal")}</option>
                      </select>
                    </Form.Item>
                    {scope !== "global" ? (
                      <>
                        <Form.Item
                          label={t("settingsCommandsWorkspace")}
                          name="workspace_id"
                        >
                          <select className="at-settings-native-select">
                            {writableWorkspaces.length > 0 ? (
                              writableWorkspaces.map((workspace) => (
                                <option
                                  key={workspace.workspace_id}
                                  value={workspace.workspace_id}
                                >
                                  {workspaceLabel(workspace)}
                                </option>
                              ))
                            ) : (
                              <option value="">
                                {t("settingsCommandsNoWorkspaces")}
                              </option>
                            )}
                          </select>
                        </Form.Item>
                        <Form.Item label={t("settingsCommandsSource")} name="source">
                          <select className="at-settings-native-select">
                            {projectSources.map((source) => (
                              <option key={source.value} value={source.value}>
                                {t(source.labelKey)}
                              </option>
                            ))}
                          </select>
                        </Form.Item>
                      </>
                    ) : null}
                    <Form.Item
                      label={t("settingsCommandsPath")}
                      name="relative_path"
                      rules={[{ required: true, message: t("settingsCommandsPathRequired") }]}
                    >
                      <Input
                        autoComplete="off"
                        onChange={() => setPathTouched(true)}
                        spellCheck={false}
                      />
                    </Form.Item>
                  </>
                ) : (
                  <div className="at-commands-source-path">
                    <Typography.Text type="secondary">
                      {t("settingsCommandsSourcePath")}
                    </Typography.Text>
                    <code>{editor.command?.source_path}</code>
                  </div>
                )}
                <CommandTextFields
                  onNameChange={(value) => {
                    if (editor.mode === "create" && !pathTouched) {
                      form.setFieldValue("relative_path", suggestedCommandPath(value));
                    }
                  }}
                  t={t}
                />
              </div>
              {previewVisible ? (
                <pre className="at-commands-preview">{commandPreview(form.getFieldsValue())}</pre>
              ) : null}
            </div>
            <div className="at-settings-section-actions">
              <Button onClick={() => setEditor(null)}>{t("sidebarRenameCancel")}</Button>
              <Button onClick={() => setPreviewVisible((visible) => !visible)}>
                {t("settingsCommandsPreview")}
              </Button>
              <Button htmlType="submit" loading={saveMutation.isPending} type="primary">
                {t("settingsSave")}
              </Button>
            </div>
          </Form>
        )
      ) : null}
    </SettingsSection>
  );
}

function CommandTextFields({
  onNameChange,
  t,
}: {
  onNameChange: (value: string) => void;
  t: Translate;
}) {
  return (
    <>
      <Form.Item
        label={t("settingsCommandsName")}
        name="name"
        rules={[{ required: true, message: t("settingsCommandsNameRequired") }]}
    >
        <Input
          autoComplete="off"
          onChange={(event) => onNameChange(event.target.value)}
          spellCheck={false}
        />
      </Form.Item>
      <Form.Item label={t("settingsCommandsAliases")} name="aliases">
        <Input autoComplete="off" spellCheck={false} />
      </Form.Item>
      <Form.Item label={t("settingsCommandsDescription")} name="description">
        <Input autoComplete="off" spellCheck={false} />
      </Form.Item>
      <Form.Item label={t("settingsCommandsArgumentHint")} name="argument_hint">
        <Input autoComplete="off" spellCheck={false} />
      </Form.Item>
      <Form.Item label={t("settingsCommandsAllowedModes")} name="allowed_modes">
        <Input autoComplete="off" spellCheck={false} />
      </Form.Item>
      <Form.Item
        className="at-commands-template-field"
        label={t("settingsCommandsTemplate")}
        name="template"
        rules={[{ required: true, message: t("settingsCommandsTemplateRequired") }]}
      >
        <Input.TextArea autoSize={{ minRows: 8 }} spellCheck={false} />
      </Form.Item>
    </>
  );
}

function CommandGroupView({
  group,
  onCopy,
  onEdit,
  t,
}: {
  group: CommandGroup;
  onCopy: (command: CommandDetail) => void;
  onEdit: (command: CommandDetail) => void;
  t: Translate;
}) {
  return (
    <section className="at-commands-group" aria-label={group.title}>
      <div className="at-commands-group-head">
        <div>
          <Typography.Text strong>{group.title}</Typography.Text>
          {group.subtitle ? (
            <Typography.Text className="at-settings-list-meta">
              {group.subtitle}
            </Typography.Text>
          ) : null}
        </div>
        <Tag>{String(group.commands.length)}</Tag>
      </div>
      {group.commands.length > 0 ? (
        <div className="at-settings-list at-commands-list">
          {group.commands.map((command) => (
            <div className="at-settings-list-row at-commands-row" key={command.source_path}>
              <div className="at-settings-list-main">
                <span>{formatCommandName(command.name)}</span>
                <Typography.Text>
                  {command.description?.trim() || t("settingsCommandsNoDescription")}
                </Typography.Text>
                <Typography.Text className="at-settings-list-meta">
                  {commandMeta(command, t)}
                </Typography.Text>
                <code className="at-commands-path" title={command.source_path}>
                  {compactPath(command.source_path)}
                </code>
              </div>
              <div className="at-commands-row-actions">
                <Button
                  aria-label={t("settingsCommandsCopyPathFor", {
                    name: formatCommandName(command.name),
                  })}
                  icon={<Copy size={15} />}
                  onClick={() => onCopy(command)}
                />
                <Button
                  aria-label={t("settingsCommandsEditFor", {
                    name: formatCommandName(command.name),
                  })}
                  icon={<Pencil size={15} />}
                  onClick={() => onEdit(command)}
                >
                  {t("settingsCommandsEdit")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="at-settings-empty">{group.emptyText}</div>
      )}
    </section>
  );
}

function buildCommandGroups(
  catalog: CommandCatalogResponse,
  t: Translate,
): CommandGroup[] {
  const groups: CommandGroup[] = [
    {
      commands: catalog.app_commands ?? [],
      emptyText: t("settingsCommandsGlobalEmpty"),
      key: "app",
      subtitle: "",
      title: t("settingsCommandsGlobalGroup"),
    },
  ];
  for (const workspace of catalog.workspaces ?? []) {
    groups.push({
      commands: workspace.commands ?? [],
      emptyText: workspace.root_path
        ? t("settingsCommandsWorkspaceEmpty")
        : t("settingsCommandsWorkspaceNoRoot"),
      key: `workspace:${workspace.workspace_id}`,
      subtitle: workspace.root_path ?? "",
      title: `${t("settingsCommandsWorkspaceGroup")} ${workspace.workspace_id}`,
    });
  }
  return groups;
}

function filterCommandGroups(groups: CommandGroup[], query: string): CommandGroup[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return groups;
  }
  return groups
    .map((group) => {
      const groupMatches = `${group.title} ${group.subtitle}`
        .toLowerCase()
        .includes(normalizedQuery);
      const commands = groupMatches
        ? group.commands
        : group.commands.filter((command) => commandMatches(command, normalizedQuery));
      return { ...group, commands };
    })
    .filter((group) => group.commands.length > 0);
}

function commandMatches(command: CommandDetail, query: string): boolean {
  return [
    command.name,
    command.description,
    command.argument_hint,
    command.source_path,
    ...(command.aliases ?? []),
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function writableWorkspaceOptions(
  catalog: CommandCatalogResponse,
): CommandCatalogWorkspace[] {
  return (catalog.workspaces ?? []).filter(
    (workspace) =>
      Boolean(workspace.root_path?.trim()) && workspace.can_create_commands !== false,
  );
}

function valuesFromEditor(
  editor: CommandEditorState,
  workspaces: CommandCatalogWorkspace[],
): CommandFormValues {
  if (editor.mode === "edit" && editor.command !== null) {
    return {
      aliases: (editor.command.aliases ?? []).join(", "),
      allowed_modes: (editor.command.allowed_modes ?? ["normal"]).join(", "),
      argument_hint: editor.command.argument_hint ?? "",
      description: editor.command.description ?? "",
      name: editor.command.name,
      relative_path: "",
      scope: "project",
      source: "relay_teams",
      template: editor.command.template,
      workspace_id: "",
    };
  }
  return {
    aliases: "",
    allowed_modes: "normal",
    argument_hint: "",
    description: "",
    name: "",
    relative_path: "new-command.md",
    scope: workspaces.length > 0 ? "project" : "global",
    source: "relay_teams",
    template: "",
    workspace_id: workspaces[0]?.workspace_id ?? "",
  };
}

function buildCreateRequest(values: CommandFormValues): CommandCreateRequest {
  const scope = values.scope === "global" ? "global" : "project";
  return {
    aliases: parseCommaList(values.aliases),
    allowed_modes: parseCommaList(values.allowed_modes, ["normal"]),
    argument_hint: values.argument_hint.trim(),
    description: values.description.trim(),
    name: values.name.trim().replace(/^\/+/, ""),
    relative_path: normalizeCommandPath(values.relative_path),
    scope,
    source: scope === "project" ? values.source : null,
    template: values.template,
    workspace_id: scope === "project" ? values.workspace_id : null,
  };
}

function buildUpdateRequest(
  command: CommandDetail,
  values: CommandFormValues,
): CommandUpdateRequest {
  return {
    aliases: parseCommaList(values.aliases),
    allowed_modes: parseCommaList(values.allowed_modes, ["normal"]),
    argument_hint: values.argument_hint.trim(),
    description: values.description.trim(),
    name: values.name.trim().replace(/^\/+/, ""),
    source_path: command.source_path,
    template: values.template,
  };
}

function parseCommaList(value: string, fallback: string[] = []): string[] {
  const items = value
    .split(",")
    .map((item) => item.trim().replace(/^\/+/, ""))
    .filter(Boolean);
  return items.length > 0 ? items : fallback;
}

function normalizeCommandPath(value: string): string {
  const normalized = value.trim().replaceAll("\\", "/");
  if (!normalized || normalized.toLowerCase().endsWith(".md")) {
    return normalized;
  }
  return `${normalized}.md`;
}

function suggestedCommandPath(name: string | undefined): string {
  const safeName = (name ?? "")
    .trim()
    .replace(/^\/+/, "")
    .replaceAll(":", "/")
    .replace(/[^A-Za-z0-9._/-]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/^-+|-+$/g, "");
  return `${safeName || "new-command"}.md`;
}

function formatCommandName(name: string): string {
  const normalized = name.trim().replace(/^\/+/, "");
  return normalized ? `/${normalized}` : "/";
}

function compactPath(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  if (normalized.length <= 72) {
    return normalized;
  }
  return `...${normalized.slice(-69)}`;
}

function commandMeta(command: CommandDetail, t: Translate): string {
  const aliases = command.aliases?.length
    ? `${t("settingsCommandsAliasesShort")} ${command.aliases
        .map(formatCommandName)
        .join(", ")}`
    : t("settingsCommandsNoAliases");
  const modes = (command.allowed_modes ?? ["normal"]).join(", ");
  return `${aliases} / ${command.argument_hint || "-"} / ${modes}`;
}

function workspaceLabel(workspace: CommandCatalogWorkspace): string {
  return workspace.root_path
    ? `${workspace.workspace_id} - ${workspace.root_path}`
    : workspace.workspace_id;
}

function commandPreview(values: Partial<CommandFormValues>): string {
  return [
    `name: ${values.name ?? ""}`,
    `aliases: ${parseCommaList(values.aliases ?? "").join(", ") || "-"}`,
    `allowed_modes: ${parseCommaList(values.allowed_modes ?? "", ["normal"]).join(", ")}`,
    "",
    values.template ?? "",
  ].join("\n");
}

function dispatchCommandsUpdated() {
  document.dispatchEvent(new CustomEvent("agent-teams-commands-updated"));
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
