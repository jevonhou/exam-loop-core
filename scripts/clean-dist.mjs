import { rm } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const target = resolve(root, "dist");

if (dirname(target) !== root || basename(target) !== "dist") {
  throw new Error("Refusing to clean an unexpected build directory.");
}

await rm(target, { force: true, recursive: true });
