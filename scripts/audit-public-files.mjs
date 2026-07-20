import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  findSensitiveText,
  hasUnsupportedAssetExtension,
  isTextPath,
} from "./public-file-policy.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ignoredDirectories = new Set([".git", "coverage", "dist", "node_modules", "release"]);

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
      continue;
    }

    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(absolutePath)));
    } else if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return files;
}

const failures = [];
const files = await collectFiles(root);

for (const file of files) {
  const path = relative(root, file);
  if (hasUnsupportedAssetExtension(path)) {
    failures.push(`${path}: unsupported media asset`);
    continue;
  }

  if (
    path === "scripts/audit-public-files.mjs" ||
    path === "scripts/public-file-policy.mjs" ||
    !isTextPath(path)
  ) {
    continue;
  }

  const content = await readFile(file, "utf8");
  failures.push(...findSensitiveText(path, content));
}

if (failures.length > 0) {
  console.error("Public file audit failed:\n");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Public file audit passed (${files.length} files checked).`);
}
