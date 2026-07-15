export interface DesktopWindowWebPreferences {
  contextIsolation: true;
  nodeIntegration: false;
  preload: string;
  sandbox: true;
}

export interface DesktopWindowOptions {
  height: number;
  minHeight: number;
  minWidth: number;
  show: boolean;
  title: string;
  webPreferences: DesktopWindowWebPreferences;
  width: number;
}

export function buildDesktopWindowOptions(preloadPath: string): DesktopWindowOptions {
  return {
    height: 820,
    minHeight: 640,
    minWidth: 900,
    show: false,
    title: "Agent Teams",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
      sandbox: true,
    },
    width: 1280,
  };
}
