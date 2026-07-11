import { join } from "node:path";

export interface BundledBackendExecutableOptions {
  isPackaged: boolean;
  platform: NodeJS.Platform;
  resourcesPath: string;
}

export function bundledBackendExecutable(
  options: BundledBackendExecutableOptions,
): string | null {
  if (!options.isPackaged) {
    return null;
  }
  if (options.platform !== "win32") {
    throw new Error("The desktop distribution currently supports Windows only.");
  }
  return join(options.resourcesPath, "backend", "relay-teams-backend.exe");
}
