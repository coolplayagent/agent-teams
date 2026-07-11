import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const packageRoot = resolve(__dirname, "../..");
const repoRoot = resolve(packageRoot, "../..");
const backendDist = resolve(packageRoot, "dist-backend");
const workRoot = resolve(repoRoot, ".tmp", "desktop-pyinstaller");
const buildVenv = resolve(workRoot, "venv");
const launcher = resolve(packageRoot, "src", "desktop", "backend_launcher.py");
const frontendDist = resolve(repoRoot, "frontend", "dist");
const backendVersionFile = resolve(repoRoot, "src", "relay_teams", "_version.py");
const releaseMetadataFile = resolve(
  packageRoot,
  "dist-desktop",
  "desktop",
  "release-metadata.json",
);

if (process.platform !== "win32") {
  throw new Error("Desktop backend packaging currently supports Windows only.");
}

const backendVersion = readBackendVersion(backendVersionFile);
const packageMetadata = JSON.parse(
  readFileSync(resolve(packageRoot, "package.json"), "utf-8"),
) as { name?: unknown; version?: unknown };
if (typeof packageMetadata.version !== "string") {
  throw new Error("package.json must define a desktop product version.");
}

rmSync(backendDist, { force: true, recursive: true });
rmSync(workRoot, { force: true, recursive: true });
mkdirSync(backendDist, { recursive: true });
mkdirSync(workRoot, { recursive: true });

run("uv", ["sync", "--no-default-groups"], {
  UV_PROJECT_ENVIRONMENT: buildVenv,
});
run("uv", [
  "pip",
  "install",
  "--python",
  resolve(buildVenv, "Scripts", "python.exe"),
  "pyinstaller==6.16.0",
]);

const result = spawnSync(
  resolve(buildVenv, "Scripts", "pyinstaller.exe"),
  [
    "--noconfirm",
    "--clean",
    "--onedir",
    "--name",
    "relay-teams-backend",
    "--distpath",
    backendDist,
    "--workpath",
    resolve(workRoot, "work"),
    "--specpath",
    resolve(workRoot, "spec"),
    "--paths",
    resolve(repoRoot, "src"),
    "--collect-submodules",
    "relay_teams",
    "--collect-data",
    "relay_teams.builtin",
    "--recursive-copy-metadata",
    "relay-teams",
    "--hidden-import",
    "relay_teams.interfaces.server.runtime_bundle",
    "--add-data",
    `${frontendDist};relay_teams/frontend/dist`,
    launcher,
  ],
  {
    cwd: repoRoot,
    encoding: "utf-8",
    stdio: "inherit",
  },
);
if (result.error !== undefined) {
  throw result.error;
}
if (result.status !== 0) {
  throw new Error(`PyInstaller exited with status ${result.status ?? "unknown"}.`);
}

writeFileSync(
  releaseMetadataFile,
  `${JSON.stringify(
    {
      backendVersion,
      productName: "Agent Teams",
      productVersion: packageMetadata.version,
      rendererPath: "relay_teams/frontend/dist/index.html",
    },
    null,
    2,
  )}\n`,
  "utf-8",
);

function readBackendVersion(path: string): string {
  const source = readFileSync(path, "utf-8");
  const match = /^__version__\s*=\s*["']([^"']+)["']/m.exec(source);
  if (match?.[1] === undefined) {
    throw new Error(`Could not read backend version from ${path}.`);
  }
  return match[1];
}

function run(
  command: string,
  args: string[],
  extraEnv: Record<string, string> = {},
): void {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: { ...process.env, ...extraEnv },
    encoding: "utf-8",
    stdio: "inherit",
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status ?? "unknown"}.`);
  }
}
