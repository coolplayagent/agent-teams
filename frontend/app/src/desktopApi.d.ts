import type { DesktopBackendStatus } from "./desktop/backendPlan";

export interface AgentTeamsDesktopApi {
  copyText: (text: string) => Promise<void>;
  getBackendStatus: () => Promise<DesktopBackendStatus>;
  getVersion: () => Promise<string>;
  onBackendStatus: (listener: (status: DesktopBackendStatus) => void) => () => void;
  openExternal: (url: string) => Promise<void>;
  retryStartup: () => Promise<void>;
}

declare global {
  interface Window {
    agentTeamsDesktop?: AgentTeamsDesktopApi;
  }
}
