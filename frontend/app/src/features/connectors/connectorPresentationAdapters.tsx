import {
  Bot,
  Github,
  KeyRound,
  MessageCircle,
  MessagesSquare,
  Webhook,
} from "lucide-react";
import type { ReactNode } from "react";

import type { ConnectorItem } from "../../api/contracts";
import type { SystemSettingsPage } from "../settings/settingsNavigation";
import type { GatewayConnectorProvider } from "./GatewayConnectorEditor";

export type ConnectorAction = "configure" | "open";
export type ConnectorEditorKind = "gateway" | "settings" | "w3";

export interface ConnectorPresentationAdapter {
  action: ConnectorAction;
  actionLabel: "appSettings" | "connectorsConfigure";
  editorKind: ConnectorEditorKind;
  gatewayProvider?: GatewayConnectorProvider;
  icon: ReactNode;
  settingsPage?: SystemSettingsPage;
}

const CONNECTOR_PRESENTATION_ADAPTERS: Readonly<Record<string, ConnectorPresentationAdapter>> = {
  discord: {
    action: "configure",
    actionLabel: "appSettings",
    editorKind: "gateway",
    gatewayProvider: "discord",
    icon: <MessageCircle size={17} />,
  },
  feishu: {
    action: "configure",
    actionLabel: "appSettings",
    editorKind: "settings",
    icon: <MessagesSquare size={17} />,
    settingsPage: "triggers",
  },
  github: {
    action: "configure",
    actionLabel: "appSettings",
    editorKind: "settings",
    icon: <Github size={17} />,
    settingsPage: "github",
  },
  w3: {
    action: "configure",
    actionLabel: "connectorsConfigure",
    editorKind: "w3",
    icon: <KeyRound size={17} />,
  },
  wechat: {
    action: "configure",
    actionLabel: "appSettings",
    editorKind: "settings",
    icon: <MessagesSquare size={17} />,
    settingsPage: "triggers",
  },
  xiaoluban: {
    action: "configure",
    actionLabel: "appSettings",
    editorKind: "gateway",
    gatewayProvider: "xiaoluban",
    icon: <MessageCircle size={17} />,
  },
};

export function connectorPresentationAdapter(
  item: ConnectorItem,
): ConnectorPresentationAdapter | null {
  return CONNECTOR_PRESENTATION_ADAPTERS[item.provider] ?? null;
}

export function connectorFallbackIcon(item: ConnectorItem): ReactNode {
  if (item.auth_type === "webhook") {
    return <Webhook size={17} />;
  }
  if (item.category === "im") {
    return <MessageCircle size={17} />;
  }
  return <Bot size={17} />;
}
