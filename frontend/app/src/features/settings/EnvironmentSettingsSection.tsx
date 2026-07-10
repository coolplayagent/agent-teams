import {
  App,
  Button,
  Form,
  Input,
  Modal,
  Typography,
} from "antd";
import type { FormInstance } from "antd";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import {
  deleteEnvironmentVariable,
  getEnvironmentVariables,
  saveEnvironmentVariable,
} from "../../api/client";
import type { EnvironmentVariableRecord } from "../../api/contracts";
import { useTranslations, type Translate } from "../../i18n";
import { SettingsQueryState, SettingsSection } from "./SettingsShared";

interface EnvironmentVariableEditorState {
  record: EnvironmentVariableRecord | null;
}

interface EnvironmentVariableFormValues {
  key: string;
  value: string;
}

const HIDDEN_APP_ENV_KEYS = new Set([
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "SSL_VERIFY",
]);
const MASKED_ENVIRONMENT_VALUE = "************";

export function EnvironmentSettingsSection() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [editor, setEditor] = useState<EnvironmentVariableEditorState | null>(null);
  const [valueDirty, setValueDirty] = useState(false);
  const [systemExpanded, setSystemExpanded] = useState(false);
  const [form] = Form.useForm<EnvironmentVariableFormValues>();

  const environmentQuery = useQuery({
    queryKey: ["settings", "environment-variables"],
    queryFn: getEnvironmentVariables,
  });
  const appRecords = useMemo(
    () =>
      sortEnvironmentRecords(environmentQuery.data?.app ?? []).filter(
        (record) => !isHiddenAppEnvKey(record.key),
      ),
    [environmentQuery.data?.app],
  );
  const systemRecords = useMemo(
    () => sortEnvironmentRecords(environmentQuery.data?.system ?? []),
    [environmentQuery.data?.system],
  );

  useEffect(() => {
    if (editor === null) {
      form.resetFields();
      return;
    }
    form.setFieldsValue({
      key: editor.record?.key ?? "",
      value: editor.record?.masked === true ? "" : editor.record?.value ?? "",
    });
  }, [editor, form]);

  const saveMutation = useMutation({
    mutationFn: ({
      key,
      preserveExisting,
      sourceKey,
      value,
    }: {
      key: string;
      preserveExisting: boolean;
      sourceKey: string | null;
      value: string;
    }) =>
      saveEnvironmentVariable("app", key, {
        preserve_existing: preserveExisting,
        source_key: sourceKey,
        value,
      }),
    onSuccess: (record) => {
      void message.success(
        t("settingsEnvironmentSaved", { key: record.key }),
      );
      setEditor(null);
      void queryClient.invalidateQueries({
        queryKey: ["settings", "environment-variables"],
      });
    },
    onError: (error) => {
      void message.error(
        error instanceof Error ? error.message : t("settingsEnvironmentSaveFailed"),
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (record: EnvironmentVariableRecord) =>
      deleteEnvironmentVariable(record.scope, record.key),
    onSuccess: (_, record) => {
      void message.success(
        t("settingsEnvironmentDeleted", { key: record.key }),
      );
      void queryClient.invalidateQueries({
        queryKey: ["settings", "environment-variables"],
      });
    },
    onError: (error) => {
      void message.error(
        error instanceof Error ? error.message : t("settingsEnvironmentDeleteFailed"),
      );
    },
  });

  function openCreateEditor() {
    setValueDirty(false);
    setEditor({ record: null });
  }

  function openEditEditor(record: EnvironmentVariableRecord) {
    setValueDirty(false);
    setEditor({ record });
  }

  function submit(values: EnvironmentVariableFormValues) {
    const key = values.key.trim();
    if (!key) {
      void message.error(t("settingsEnvironmentKeyRequired"));
      return;
    }
    saveMutation.mutate({
      key,
      preserveExisting:
        editor?.record?.masked === true && valueDirty === false,
      sourceKey: editor?.record?.key ?? null,
      value: values.value ?? "",
    });
  }

  function confirmDelete(record: EnvironmentVariableRecord) {
    modal.confirm({
      title: t("settingsEnvironmentDeleteConfirm", { key: record.key }),
      okText: t("settingsEnvironmentDelete"),
      okButtonProps: { danger: true },
      cancelText: t("sidebarDeleteCancel"),
      onOk: () => deleteMutation.mutateAsync(record),
    });
  }

  return (
    <SettingsSection title={t("settingsEnvironment")}>
      <SettingsQueryState
        error={environmentQuery.error}
        loading={environmentQuery.isLoading}
        onRetry={() => void environmentQuery.refetch()}
      />
      {!environmentQuery.isLoading && environmentQuery.data !== undefined ? (
        <>
          <div className="at-settings-facts">
            <Fact label={t("settingsEnvironmentApp")} value={String(appRecords.length)} />
            <Fact
              label={t("settingsEnvironmentSystem")}
              value={String(systemRecords.length)}
            />
          </div>
          <div className="at-settings-section-actions">
            <Button icon={<Plus size={15} />} onClick={openCreateEditor} type="primary">
              {t("settingsEnvironmentAdd")}
            </Button>
          </div>
          <EnvironmentRecordGroup
            emptyText={t("settingsEnvironmentNoApp")}
            onDelete={confirmDelete}
            onEdit={openEditEditor}
            records={appRecords}
            t={t}
            title={t("settingsEnvironmentApp")}
          />
          <div className="at-settings-env-system">
            <button
              aria-expanded={systemExpanded}
              className="at-settings-env-system-toggle"
              onClick={() => setSystemExpanded((expanded) => !expanded)}
              type="button"
            >
              {systemExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              <span>{t("settingsEnvironmentSystem")}</span>
              <Typography.Text>{String(systemRecords.length)}</Typography.Text>
            </button>
            {systemExpanded ? (
              <EnvironmentRecordGroup
                emptyText={t("settingsEnvironmentNoSystem")}
                records={systemRecords}
                t={t}
                title={t("settingsEnvironmentSystem")}
              />
            ) : null}
          </div>
        </>
      ) : null}
      <EnvironmentVariableEditorModal
        editor={editor}
        form={form}
        onCancel={() => setEditor(null)}
        onSubmit={submit}
        onValueChange={() => setValueDirty(true)}
        saving={saveMutation.isPending}
        t={t}
        valueDirty={valueDirty}
      />
    </SettingsSection>
  );
}

function EnvironmentRecordGroup({
  emptyText,
  onDelete,
  onEdit,
  records,
  t,
  title,
}: {
  emptyText: string;
  onDelete?: (record: EnvironmentVariableRecord) => void;
  onEdit?: (record: EnvironmentVariableRecord) => void;
  records: EnvironmentVariableRecord[];
  t: Translate;
  title: string;
}) {
  return (
    <section className="at-settings-env-group" aria-label={title}>
      {records.length === 0 ? (
        <div className="at-settings-empty">{emptyText}</div>
      ) : (
        <div className="at-settings-list at-settings-env-list">
          {records.map((record) => (
            <EnvironmentRecordRow
              key={`${record.scope}:${record.key}`}
              onDelete={onDelete}
              onEdit={onEdit}
              record={record}
              t={t}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function EnvironmentRecordRow({
  onDelete,
  onEdit,
  record,
  t,
}: {
  onDelete?: (record: EnvironmentVariableRecord) => void;
  onEdit?: (record: EnvironmentVariableRecord) => void;
  record: EnvironmentVariableRecord;
  t: Translate;
}) {
  const editable = record.scope === "app" && onDelete !== undefined && onEdit !== undefined;
  return (
    <div className="at-settings-list-row at-settings-env-row">
      <div className="at-settings-list-main">
        <span title={record.key}>{record.key}</span>
        <Typography.Text
          ellipsis
          title={record.masked ? MASKED_ENVIRONMENT_VALUE : record.value}
        >
          {record.masked ? MASKED_ENVIRONMENT_VALUE : record.value || "-"}
        </Typography.Text>
      </div>
      <div className="at-settings-env-meta">
        <span>{valueKindLabel(record.value_kind, t)}</span>
        {editable ? (
          <div className="at-settings-env-actions">
            <Button
              icon={<Pencil size={15} />}
              onClick={() => onEdit(record)}
              size="small"
            >
              {t("settingsEnvironmentEdit")}
            </Button>
            <Button
              danger
              icon={<Trash2 size={15} />}
              onClick={() => onDelete(record)}
              size="small"
            >
              {t("settingsEnvironmentDelete")}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EnvironmentVariableEditorModal({
  editor,
  form,
  onCancel,
  onSubmit,
  onValueChange,
  saving,
  t,
  valueDirty,
}: {
  editor: EnvironmentVariableEditorState | null;
  form: FormInstance<EnvironmentVariableFormValues>;
  onCancel: () => void;
  onSubmit: (values: EnvironmentVariableFormValues) => void;
  onValueChange: () => void;
  saving: boolean;
  t: Translate;
  valueDirty: boolean;
}) {
  return (
    <Modal
      cancelText={t("sidebarDeleteCancel")}
      destroyOnHidden
      okButtonProps={{ loading: saving }}
      okText={t("settingsSave")}
      onCancel={onCancel}
      onOk={() => form.submit()}
      open={editor !== null}
      title={
        editor?.record === null
          ? t("settingsEnvironmentAdd")
          : t("settingsEnvironmentEditVariable")
      }
      width={620}
    >
      <Form
        className="at-settings-form at-settings-wide-form"
        form={form}
        layout="vertical"
        onFinish={onSubmit}
      >
        <div className="at-settings-form-card">
          <Form.Item
            label={t("settingsEnvironmentKey")}
            name="key"
            rules={[
              { required: true, message: t("settingsEnvironmentKeyRequired") },
              {
                validator: (_, value: string | undefined) =>
                  value?.includes("=")
                    ? Promise.reject(new Error(t("settingsEnvironmentKeyNoEquals")))
                    : Promise.resolve(),
              },
            ]}
          >
            <Input autoComplete="off" placeholder="OPENAI_API_KEY" />
          </Form.Item>
          <Form.Item label={t("settingsEnvironmentValue")} name="value">
            {editor?.record?.masked === true ? (
              <Input.Password
                autoComplete="new-password"
                onChange={onValueChange}
                placeholder={MASKED_ENVIRONMENT_VALUE}
              />
            ) : (
              <Input.TextArea
                autoSize={{ minRows: 5, maxRows: 12 }}
                onChange={onValueChange}
                spellCheck={false}
              />
            )}
          </Form.Item>
          {editor?.record?.masked === true && !valueDirty ? (
            <Typography.Text className="at-settings-help">
              {t("settingsEnvironmentSecretPreserved")}
            </Typography.Text>
          ) : null}
        </div>
      </Form>
    </Modal>
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

function sortEnvironmentRecords(
  records: EnvironmentVariableRecord[],
): EnvironmentVariableRecord[] {
  return [...records]
    .filter((record) => record.key.trim())
    .sort((left, right) => left.key.localeCompare(right.key, undefined, {
      sensitivity: "base",
    }));
}

function isHiddenAppEnvKey(key: string): boolean {
  return HIDDEN_APP_ENV_KEYS.has(key.toUpperCase());
}

function valueKindLabel(
  valueKind: EnvironmentVariableRecord["value_kind"],
  t: Translate,
): string {
  return valueKind === "expandable"
    ? t("settingsEnvironmentExpandable")
    : t("settingsEnvironmentString");
}
