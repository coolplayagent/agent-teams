import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./browser-tests",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  reporter: [["list"]],
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        browserName: "chromium",
        colorScheme: "dark",
        launchOptions: {
          executablePath: chromiumExecutablePath(),
        },
        viewport: { height: 720, width: 1280 },
      },
    },
  ],
});

function chromiumExecutablePath(): string | undefined {
  const configuredPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim();
  if (configuredPath) {
    return configuredPath;
  }
  return cachedWindowsChromiumPath();
}

function cachedWindowsChromiumPath(): string | undefined {
  const localAppData = process.env.LOCALAPPDATA?.trim();
  if (!localAppData) {
    return undefined;
  }
  const browserRoot = join(localAppData, "ms-playwright");
  if (!existsSync(browserRoot)) {
    return undefined;
  }
  return readdirSync(browserRoot)
    .filter((entry) => entry.startsWith("chromium-"))
    .sort()
    .reverse()
    .map((entry) => join(browserRoot, entry, "chrome-win64", "chrome.exe"))
    .find((candidate) => existsSync(candidate));
}
