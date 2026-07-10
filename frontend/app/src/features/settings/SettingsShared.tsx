import { Alert, Button, Skeleton, Typography } from "antd";
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
  onRetry,
}: {
  error: Error | null;
  loading: boolean;
  onRetry?: () => void;
}) {
  const t = useTranslations();
  if (loading) {
    return <Skeleton active paragraph={{ rows: 6 }} />;
  }
  if (error !== null) {
    return (
      <Alert
        action={
          onRetry === undefined ? null : (
            <Button onClick={onRetry} size="small">
              {t("settingsRetry")}
            </Button>
          )
        }
        message={error.message || t("settingsLoadFailed")}
        showIcon
        type="error"
      />
    );
  }
  return null;
}
