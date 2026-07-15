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
import type { GatewayConnectorProvider } from "./GatewayConnectorEditor";

export type ConnectorAction = "configure" | "open";
export type TriggerConnectorProvider = "feishu" | "wechat";
export type ConnectorConfiguration =
  | { kind: "gateway"; provider: GatewayConnectorProvider }
  | { kind: "github" }
  | { kind: "trigger"; provider: TriggerConnectorProvider }
  | { kind: "w3" };

export interface ConnectorPresentationAdapter {
  action: ConnectorAction;
  actionLabel: "appSettings" | "connectorsConfigure";
  configuration: ConnectorConfiguration;
  icon: ReactNode;
}

const CONNECTOR_PRESENTATION_ADAPTERS: Readonly<
  Record<string, ConnectorPresentationAdapter>
> = {
  discord: {
    action: "configure",
    actionLabel: "connectorsConfigure",
    configuration: { kind: "gateway", provider: "discord" },
    icon: <MessageCircle size={17} />,
  },
  feishu: {
    action: "configure",
    actionLabel: "connectorsConfigure",
    configuration: { kind: "trigger", provider: "feishu" },
    icon: <MessagesSquare size={17} />,
  },
  github: {
    action: "configure",
    actionLabel: "connectorsConfigure",
    configuration: { kind: "github" },
    icon: <Github size={17} />,
  },
  w3: {
    action: "configure",
    actionLabel: "connectorsConfigure",
    configuration: { kind: "w3" },
    icon: <KeyRound size={17} />,
  },
  wechat: {
    action: "configure",
    actionLabel: "connectorsConfigure",
    configuration: { kind: "trigger", provider: "wechat" },
    icon: <MessagesSquare size={17} />,
  },
  xiaoluban: {
    action: "configure",
    actionLabel: "connectorsConfigure",
    configuration: { kind: "gateway", provider: "xiaoluban" },
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
