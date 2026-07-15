import { clipboard, shell } from "electron";

import { startDesktopApplication } from "./application.js";

startDesktopApplication({
  copyText: (text) => clipboard.writeText(text),
  onBackendReady: () => undefined,
  openExternal: async (url) => {
    await shell.openExternal(url);
  },
});
