import {
  createDiscordGatewayAccount,
  createXiaolubanGatewayAccount,
  deleteDiscordGatewayAccount,
  deleteXiaolubanGatewayAccount,
  disableDiscordGatewayAccount,
  disableXiaolubanGatewayAccount,
  enableDiscordGatewayAccount,
  enableXiaolubanGatewayAccount,
  listDiscordGatewayAccounts,
  listXiaolubanGatewayAccounts,
  updateDiscordGatewayAccount,
  updateXiaolubanGatewayAccount,
} from "../../api/client";
import type {
  DiscordGatewayAccountRecord,
  WorkspaceRecord,
  XiaolubanGatewayAccountRecord,
} from "../../api/contracts";

export type GatewayConnectorProvider = "discord" | "xiaoluban";
export type GatewayAccountRecord = DiscordGatewayAccountRecord | XiaolubanGatewayAccountRecord;

export interface GatewayAccountFormValues {
  allowChannelMessages: boolean;
  allowedChannelIds: string;
  applicationId: string;
  baseUrl: string;
  displayName: string;
  enabled: boolean;
  token: string;
  workspaceId: string;
}

export interface GatewayConnectorAdapter {
  defaultDisplayName: string;
  fields: "discord" | "xiaoluban";
  list: () => Promise<GatewayAccountRecord[]>;
  remove: (accountId: string) => Promise<{ status: string }>;
  save: (
    account: GatewayAccountRecord | null,
    values: GatewayAccountFormValues,
  ) => Promise<GatewayAccountRecord>;
  toggle: (account: GatewayAccountRecord) => Promise<GatewayAccountRecord>;
}

const GATEWAY_CONNECTOR_ADAPTERS: Readonly<Record<GatewayConnectorProvider, GatewayConnectorAdapter>> = {
  discord: {
    defaultDisplayName: "Discord",
    fields: "discord",
    list: listDiscordGatewayAccounts,
    remove: deleteDiscordGatewayAccount,
    save: async (account, values) => {
      const body = {
        allow_channel_messages: values.allowChannelMessages,
        allowed_channel_ids: splitIdentifiers(values.allowedChannelIds),
        application_id: values.applicationId.trim() || null,
        display_name: values.displayName.trim(),
        enabled: values.enabled,
        workspace_id: values.workspaceId,
      };
      const token = values.token.trim();
      return account === null
        ? createDiscordGatewayAccount({ ...body, bot_token: token })
        : updateDiscordGatewayAccount(account.account_id, { ...body, bot_token: token || null });
    },
    toggle: (account) =>
      account.status === "enabled"
        ? disableDiscordGatewayAccount(account.account_id)
        : enableDiscordGatewayAccount(account.account_id),
  },
  xiaoluban: {
    defaultDisplayName: "Xiaoluban",
    fields: "xiaoluban",
    list: listXiaolubanGatewayAccounts,
    remove: deleteXiaolubanGatewayAccount,
    save: async (account, values) => {
      const baseUrl = values.baseUrl.trim();
      const body = {
        ...(baseUrl ? { base_url: baseUrl } : {}),
        display_name: values.displayName.trim(),
        enabled: values.enabled,
        im_config: { workspace_id: values.workspaceId },
      };
      const token = values.token.trim();
      return account === null
        ? createXiaolubanGatewayAccount({ ...body, token })
        : updateXiaolubanGatewayAccount(account.account_id, { ...body, token: token || null });
    },
    toggle: (account) =>
      account.status === "enabled"
        ? disableXiaolubanGatewayAccount(account.account_id)
        : enableXiaolubanGatewayAccount(account.account_id),
  },
};

export function gatewayConnectorAdapter(provider: GatewayConnectorProvider): GatewayConnectorAdapter {
  return GATEWAY_CONNECTOR_ADAPTERS[provider];
}

export function gatewayAccountFormValues(
  adapter: GatewayConnectorAdapter,
  account: GatewayAccountRecord | null,
  workspaces: WorkspaceRecord[],
): GatewayAccountFormValues {
  const workspaceId =
    (account !== null && "workspace_id" in account ? account.workspace_id : account?.im_config.workspace_id)
    ?? workspaces[0]?.workspace_id
    ?? "";
  return {
    allowChannelMessages:
      account !== null && "allow_channel_messages" in account ? account.allow_channel_messages : false,
    allowedChannelIds:
      account !== null && "allowed_channel_ids" in account ? account.allowed_channel_ids.join(", ") : "",
    applicationId:
      account !== null && "application_id" in account ? account.application_id ?? "" : "",
    baseUrl: account !== null && "base_url" in account ? account.base_url : "",
    displayName: account?.display_name ?? adapter.defaultDisplayName,
    enabled: account?.status !== "disabled",
    token: "",
    workspaceId,
  };
}

function splitIdentifiers(value: string): string[] {
  return value.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);
}
