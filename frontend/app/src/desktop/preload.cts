import { contextBridge, ipcRenderer } from "electron";

import type { DesktopBackendStatus } from "./backendPlan.js";

export interface AgentTeamsDesktopApi {
  copyText: (text: string) => Promise<void>;
  getBackendStatus: () => Promise<DesktopBackendStatus>;
  getVersion: () => Promise<string>;
  onBackendStatus: (listener: (status: DesktopBackendStatus) => void) => () => void;
  openExternal: (url: string) => Promise<void>;
  retryStartup: () => Promise<void>;
}

const api: AgentTeamsDesktopApi = {
  copyText: (text) => ipcRenderer.invoke("agent-teams:copy-text", text) as Promise<void>,
  getBackendStatus: () =>
    ipcRenderer.invoke("agent-teams:get-backend-status") as Promise<DesktopBackendStatus>,
  getVersion: () => ipcRenderer.invoke("agent-teams:get-version") as Promise<string>,
  onBackendStatus: (listener) => {
    const channelListener = (_event: Electron.IpcRendererEvent, status: DesktopBackendStatus) => {
      listener(status);
    };
    ipcRenderer.on("agent-teams:backend-status", channelListener);
    return () => ipcRenderer.removeListener("agent-teams:backend-status", channelListener);
  },
  openExternal: (url) =>
    ipcRenderer.invoke("agent-teams:open-external", url) as Promise<void>,
  retryStartup: () => ipcRenderer.invoke("agent-teams:retry-startup") as Promise<void>,
};

contextBridge.exposeInMainWorld("agentTeamsDesktop", api);
