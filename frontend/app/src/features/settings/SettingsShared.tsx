import { Alert, Skeleton, Typography } from "antd";
import type { ReactNode } from "react";

import { useTranslations } from "../../i18n";

export function SettingsSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <div className="at-settings-section">
      <div className="at-settings-section-header">
        <Typography.Title level={3}>{title}</Typography.Title>
      </div>
      <div className="at-settings-section-body">{children}</div>
    </div>
  );
}

export function SettingsQueryState({
  error,
  loading,
}: {
  error: Error | null;
  loading: boolean;
}) {
  const t = useTranslations();
  if (loading) {
    return <Skeleton active paragraph={{ rows: 6 }} />;
  }
  if (error !== null) {
    return (
      <Alert
        message={error.message || t("settingsLoadFailed")}
        showIcon
        type="error"
      />
    );
  }
  return null;
}
