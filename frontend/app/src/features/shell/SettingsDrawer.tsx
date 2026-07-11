import { Drawer } from "antd";

import { SettingsCenter } from "../settings/SettingsCenter";
import type { SystemSettingsPage } from "../settings/settingsNavigation";
import { useTranslations } from "../../i18n";

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
    <Drawer
      className="at-settings-drawer"
      destroyOnClose
      maskClosable={false}
      onClose={onClose}
      open={open}
      styles={{ body: { padding: 0 } }}
      title={t("settingsTitle")}
      width="min(960px, 96vw)"
    >
      <SettingsCenter initialSystemPage={initialSystemPage} open={open} />
    </Drawer>
  );
}
