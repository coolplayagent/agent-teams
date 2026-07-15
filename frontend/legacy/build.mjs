import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const legacyRoot = path.dirname(fileURLToPath(import.meta.url));
const sourceDirectory = path.join(legacyRoot, "src");
const outputDirectory = path.resolve(legacyRoot, "../dist/v1");

await rm(outputDirectory, { force: true, recursive: true });
await mkdir(outputDirectory, { recursive: true });
await cp(sourceDirectory, outputDirectory, { recursive: true });
