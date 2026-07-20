export const CONTENT_SCHEMA_VERSION = "1.0.0" as const;

export type ContentSchemaVersion = typeof CONTENT_SCHEMA_VERSION;

export interface ContentSkill {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
}

export interface ContentStage {
  readonly id: string;
  readonly title: string;
  readonly skillIds: readonly string[];
  readonly prerequisiteStageIds?: readonly string[];
}

export interface ContentItem<TPayload> {
  readonly id: string;
  readonly skillIds: readonly string[];
  readonly stageIds: readonly string[];
  readonly payload: TPayload;
}

interface ContentLicenseBase {
  readonly copyrightHolderOrSource: string;
  readonly redistributionPermitted: boolean;
  readonly attribution?: string;
  readonly modificationNotice?: string;
}

export interface SpdxContentLicense extends ContentLicenseBase {
  readonly spdxId: string;
  readonly customLicenseNotice?: string;
}

export interface CustomContentLicense extends ContentLicenseBase {
  readonly spdxId?: string;
  readonly customLicenseNotice: string;
}

/**
 * License metadata belongs to the content package, independently of the
 * engine's source-code license. At least one license identifier or complete
 * custom notice is required.
 */
export type ContentLicense = SpdxContentLicense | CustomContentLicense;

export interface ContentPackage<TPayload = unknown> {
  readonly schemaVersion: ContentSchemaVersion;
  readonly id: string;
  readonly version: string;
  readonly title: string;
  readonly license: ContentLicense;
  readonly skills: readonly ContentSkill[];
  readonly stages: readonly ContentStage[];
  readonly items: readonly ContentItem<TPayload>[];
}

export const CONTENT_ISSUE_CODES = {
  required: "field.required",
  invalidType: "field.invalid_type",
  unknownField: "field.unknown",
  emptyString: "string.empty",
  emptyArray: "array.empty",
  unsupportedSchemaVersion: "schema.unsupported_version",
  duplicateId: "id.duplicate",
  duplicateReference: "reference.duplicate",
  unknownSkillReference: "reference.unknown_skill",
  unknownStageReference: "reference.unknown_stage",
  selfStageReference: "reference.self_stage",
  stageCycle: "reference.stage_cycle",
  missingLicenseTerms: "license.missing_terms",
  invalidSpdxId: "license.invalid_spdx_id",
  redistributionRestricted: "license.redistribution_restricted",
} as const;

export type ContentIssueCode = (typeof CONTENT_ISSUE_CODES)[keyof typeof CONTENT_ISSUE_CODES];

export type ContentIssueSeverity = "error" | "warning";

export interface ContentValidationIssue {
  /** A JSONPath-like location rooted at `$`. */
  readonly path: string;
  readonly code: ContentIssueCode;
  readonly severity: ContentIssueSeverity;
  readonly message: string;
}

export type ContentValidationResult =
  | {
      readonly valid: true;
      /** A newly constructed structural value. Item payloads remain unknown. */
      readonly value: ContentPackage<unknown>;
      readonly issues: readonly ContentValidationIssue[];
    }
  | {
      readonly valid: false;
      readonly issues: readonly ContentValidationIssue[];
    };

export interface ContentPackagePreviewSummary {
  readonly schemaVersion: string | null;
  readonly id: string | null;
  readonly version: string | null;
  readonly title: string | null;
  readonly skillCount: number | null;
  readonly stageCount: number | null;
  readonly itemCount: number | null;
  readonly license: {
    readonly copyrightHolderOrSource: string | null;
    readonly spdxId: string | null;
    readonly hasCustomLicenseNotice: boolean;
    readonly redistributionPermitted: boolean | null;
  } | null;
}

/**
 * A display-safe summary. It deliberately contains no package value or item
 * payload, so callers cannot mistake an import preview for validated content.
 */
export interface ContentPackagePreview {
  readonly valid: boolean;
  readonly summary: ContentPackagePreviewSummary;
  readonly issues: readonly ContentValidationIssue[];
}
