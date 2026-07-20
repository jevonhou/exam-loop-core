import { extname } from "node:path";

export const unsupportedAssetExtensions = new Set([
  ".gif",
  ".heic",
  ".jpeg",
  ".jpg",
  ".mov",
  ".mp4",
  ".png",
  ".webp",
]);

export const sensitiveTextRules = [
  { label: "macOS user-home path", pattern: /\/Users\/[^/\s]+\//u },
  { label: "Windows user-home path", pattern: /[A-Za-z]:\\Users\\[^\\\s]+\\/u },
  { label: "private key material", pattern: /-----BEGIN (?:EC |OPENSSH |RSA )?PRIVATE KEY-----/u },
];

const textExtensions = new Set([
  "",
  ".cjs",
  ".js",
  ".json",
  ".map",
  ".md",
  ".mjs",
  ".ts",
  ".txt",
  ".yaml",
  ".yml",
]);

export function hasUnsupportedAssetExtension(path) {
  return unsupportedAssetExtensions.has(extname(path).toLowerCase());
}

export function isTextPath(path) {
  return textExtensions.has(extname(path).toLowerCase());
}

export function findSensitiveText(path, content) {
  return sensitiveTextRules
    .filter(({ pattern }) => pattern.test(content))
    .map(({ label }) => `${path}: contains ${label}`);
}
