import type { ContentPackagePreview, ContentPackagePreviewSummary } from "./types.js";
import { validateContentPackage } from "./validator.js";
import { copyPlainDataRecord } from "./dataRecord.js";

function previewString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function previewCount(value: unknown): number | null {
  return Array.isArray(value) ? value.length : null;
}

function createSummary(input: unknown): ContentPackagePreviewSummary {
  const root = copyPlainDataRecord(input);
  if (root === undefined) {
    return {
      schemaVersion: null,
      id: null,
      version: null,
      title: null,
      skillCount: null,
      stageCount: null,
      itemCount: null,
      license: null,
    };
  }

  const licenseRecord = copyPlainDataRecord(root.license);
  const license =
    licenseRecord !== undefined
      ? {
          copyrightHolderOrSource: previewString(licenseRecord.copyrightHolderOrSource),
          spdxId: previewString(licenseRecord.spdxId),
          hasCustomLicenseNotice: previewString(licenseRecord.customLicenseNotice) !== null,
          redistributionPermitted:
            typeof licenseRecord.redistributionPermitted === "boolean"
              ? licenseRecord.redistributionPermitted
              : null,
        }
      : null;

  return {
    schemaVersion: previewString(root.schemaVersion),
    id: previewString(root.id),
    version: previewString(root.version),
    title: previewString(root.title),
    skillCount: previewCount(root.skills),
    stageCount: previewCount(root.stages),
    itemCount: previewCount(root.items),
    license,
  };
}

/**
 * Produces a metadata-only preview. Invalid input is never returned, cast, or
 * exposed as a package; only independently checked primitive summary fields
 * are included.
 */
export function previewContentPackage(input: unknown): ContentPackagePreview {
  const validation = validateContentPackage(input);

  return {
    valid: validation.valid,
    summary: createSummary(input),
    issues: validation.issues,
  };
}
