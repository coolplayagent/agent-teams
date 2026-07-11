import { Modal } from "antd";

import { SettingsCenter } from "../settings/SettingsCenter";
import type { SystemSettingsPage } from "../settings/settingsNavigation";
import { useTranslations } from "../../i18n";
import "./SettingsModal.css";

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  initialSystemPage?: SystemSettingsPage | null;
}

export function SettingsDrawer({
  initialSystemPage = null,
  open,
  onClose,
}: SettingsDrawerProps) {
  const t = useTranslations();

  return (
    <Modal
      centered
      className="at-settings-modal"
      classNames={{ body: "at-scroll-region" }}
      destroyOnHidden
      footer={null}
      maskClosable={false}
      onCancel={onClose}
      open={open}
      styles={{ body: { padding: 0 } }}
      title={t("settingsTitle")}
      width={1120}
    >
      <SettingsCenter initialSystemPage={initialSystemPage} open={open} />
    </Modal>
  );
}
