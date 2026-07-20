import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import {
  findSensitiveText,
  hasUnsupportedAssetExtension,
  isTextPath,
} from "./public-file-policy.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const releaseDirectory = resolve(root, "release");
await mkdir(releaseDirectory, { recursive: true });

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    env: options.env ?? process.env,
  });

  if (result.status !== 0) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`${command} exited with status ${result.status ?? "unknown"}`);
  }

  return result.stdout;
}

const packedOutput = run("npm", [
  "pack",
  "--ignore-scripts",
  "--json",
  "--pack-destination",
  releaseDirectory,
]);
const result = JSON.parse(packedOutput);
const artifact = result[0];

if (!artifact || typeof artifact.filename !== "string" || !Array.isArray(artifact.files)) {
  throw new Error("npm pack returned an unexpected result");
}

const packageFailures = [];
for (const file of artifact.files) {
  const path = file.path;
  if (typeof path !== "string" || isAbsolute(path) || path.split(/[\\/]/u).includes("..")) {
    packageFailures.push(`unsafe package path: ${String(path)}`);
    continue;
  }
  if (hasUnsupportedAssetExtension(path)) {
    packageFailures.push(`${path}: unsupported media asset`);
    continue;
  }
  if (isTextPath(path)) {
    const sourcePath = resolve(root, path);
    if (relative(root, sourcePath).startsWith(`..${sep}`)) {
      packageFailures.push(`${path}: resolved outside the repository`);
      continue;
    }
    packageFailures.push(...findSensitiveText(path, await readFile(sourcePath, "utf8")));
  }
}

if (packageFailures.length > 0) {
  throw new Error(`Package file audit failed:\n${packageFailures.join("\n")}`);
}

const artifactPath = resolve(releaseDirectory, artifact.filename);
const consumerDirectory = await mkdtemp(join(tmpdir(), "exam-loop-core-consumer-"));

if (
  dirname(consumerDirectory) !== resolve(tmpdir()) ||
  !consumerDirectory.startsWith(`${resolve(tmpdir())}${sep}exam-loop-core-consumer-`)
) {
  throw new Error("Refusing to use an unexpected consumer directory.");
}

try {
  run(
    "npm",
    [
      "install",
      "--prefix",
      consumerDirectory,
      artifactPath,
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
    ],
    { cwd: consumerDirectory },
  );

  const smokePath = resolve(consumerDirectory, "smoke.mjs");
  await writeFile(
    smokePath,
    [
      'import { createReviewState, validateContentPackage, verifyArchive } from "exam-loop-core";',
      'import { scheduleAttempt } from "exam-loop-core/learning";',
      'import { MemoryRepository } from "exam-loop-core/storage";',
      'const state = createReviewState("consumer-item");',
      'if (state.itemId !== "consumer-item") throw new Error("root export failed");',
      'if (typeof validateContentPackage !== "function") throw new Error("content export failed");',
      'if (typeof verifyArchive !== "function") throw new Error("storage export failed");',
      'if (typeof scheduleAttempt !== "function") throw new Error("learning subpath failed");',
      'if (typeof MemoryRepository !== "function") throw new Error("storage subpath failed");',
      'console.log("Fresh-consumer ESM and subpath imports passed.");',
      "",
    ].join("\n"),
    "utf8",
  );
  run(process.execPath, [smokePath], { cwd: consumerDirectory });

  const installedPackage = resolve(consumerDirectory, "node_modules", "exam-loop-core");
  run("npm", ["run", "example", "--silent"], { cwd: installedPackage });
} finally {
  await rm(consumerDirectory, { force: true, recursive: true });
}

const digest = createHash("sha256")
  .update(await readFile(artifactPath))
  .digest("hex");
await writeFile(
  resolve(releaseDirectory, "SHA256SUMS.txt"),
  `${digest}  ${artifact.filename}\n`,
  "utf8",
);
await writeFile(
  resolve(releaseDirectory, "manifest.json"),
  `${JSON.stringify(
    {
      package: artifact.id,
      artifact: artifact.filename,
      sha256: digest,
      entryCount: artifact.entryCount,
      unpackedSize: artifact.unpackedSize,
      node: process.version,
      checks: [
        "package-file-audit",
        "fresh-consumer-install",
        "root-and-subpath-imports",
        "installed-example",
      ],
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(`Created ${artifact.filename}`);
console.log(`SHA-256 ${digest}`);
console.log(`Files ${artifact.entryCount}, unpacked ${artifact.unpackedSize} bytes`);
