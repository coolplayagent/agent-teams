import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { bundledBackendExecutable } from "../desktop/releasePaths";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("desktop release packaging", () => {
  it("provides repeatable Windows package and verification scripts", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(packageRoot, "package.json"), "utf-8"),
    ) as {
      main?: unknown;
      scripts?: Record<string, unknown>;
      version?: unknown;
    };

    expect(packageJson.version).toBe("0.0.3-dev.0");
    expect(packageJson.main).toBe("dist-desktop/desktop/main.js");
    expect(packageJson.scripts?.["desktop:package"]).toContain("electron-builder");
    expect(packageJson.scripts?.["desktop:dist"]).toContain("nsis");
    expect(packageJson.scripts?.["desktop:release"]).toContain("dir nsis");
    expect(packageJson.scripts?.["desktop:verify"]).toContain("desktop:release");
    expect(packageJson.scripts?.["desktop:test-build"]).toContain(
      "tsconfig.desktop-test.json",
    );
    expect(packageJson.scripts?.["desktop:build"]).toContain(
      "cleanDesktopProductionOutput.mjs",
    );
    expect(packageJson.scripts?.["desktop:smoke"]).toContain(
      "desktop:test-build",
    );
  });

  it("packages the compiled desktop shell and bundled backend as resources", () => {
    const builderConfig = readFileSync(
      resolve(packageRoot, "electron-builder.yml"),
      "utf-8",
    );

    expect(builderConfig).toContain("appId: io.relayteams.desktop");
    expect(builderConfig).toContain("asar: true");
    expect(builderConfig).toContain("dist-desktop/desktop/**/*.js");
    expect(builderConfig).toContain("!dist-desktop/desktop/testMain.js");
    expect(builderConfig).not.toContain("dist-desktop-test/desktop");
    expect(builderConfig).toContain("from: dist-backend/relay-teams-backend");
    expect(builderConfig).toContain("target: nsis");
    expect(builderConfig).toContain("arch:\n        - x64");
  });

  it("resolves only the supported packaged backend executable", () => {
    expect(
      bundledBackendExecutable({
        isPackaged: false,
        platform: "win32",
        resourcesPath: "C:/Agent Teams/resources",
      }),
    ).toBeNull();
    expect(
      bundledBackendExecutable({
        isPackaged: true,
        platform: "win32",
        resourcesPath: "C:/Agent Teams/resources",
      }),
    ).toBe(resolve("C:/Agent Teams/resources/backend/relay-teams-backend.exe"));
    expect(() =>
      bundledBackendExecutable({
        isPackaged: true,
        platform: "linux",
        resourcesPath: "/opt/agent-teams/resources",
      }),
    ).toThrow("currently supports Windows only");
  });

  it("keeps the desktop backend launcher in the release source set", () => {
    expect(existsSync(resolve(packageRoot, "src/desktop/backend_launcher.py"))).toBe(true);
  });
});
