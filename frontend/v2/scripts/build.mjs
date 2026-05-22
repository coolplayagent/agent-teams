import { cp, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = resolve(projectDir, 'src');
const outputDir = resolve(projectDir, 'dist');

await rm(outputDir, { force: true, recursive: true });
await cp(sourceDir, outputDir, { recursive: true });
