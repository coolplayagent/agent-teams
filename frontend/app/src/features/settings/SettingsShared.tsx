import { Alert, Button, Skeleton, Typography } from "antd";
import type { ReactNode } from "react";

import { useTranslations } from "../../i18n";
import "./SettingsFormLayout.css";

export function SettingsFormLayout({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={settingsClassName("at-settings-form-layout", className)}>
      {children}
    </div>
  );
}

export function SettingsFormCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={settingsClassName("at-settings-form-card-layout", className)}
    >
      {children}
    </section>
  );
}

export function SettingsFormGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={settingsClassName("at-settings-form-grid-layout", className)}
    >
      {children}
    </div>
  );
}

export function SettingsFormActions({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={settingsClassName(
        "at-settings-form-actions-layout",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SettingsSection({
  children,
  className,
  embedded = false,
  title,
}: {
  children: ReactNode;
  className?: string;
  embedded?: boolean;
  title: string;
}) {
  return (
    <div
      className={settingsClassName(
        embedded ? "at-settings-section is-embedded" : "at-settings-section",
        className,
      )}
    >
      {!embedded ? (
        <div className="at-settings-section-header">
          <Typography.Title level={3}>{title}</Typography.Title>
        </div>
      ) : null}
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

function settingsClassName(baseClassName: string, className?: string): string {
  return className === undefined || className.trim() === ""
    ? baseClassName
    : `${baseClassName} ${className}`;
}
