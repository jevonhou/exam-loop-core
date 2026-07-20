import {
  CONTENT_ISSUE_CODES,
  CONTENT_SCHEMA_VERSION,
  type ContentItem,
  type ContentLicense,
  type ContentPackage,
  type ContentSkill,
  type ContentStage,
  type ContentValidationIssue,
  type ContentValidationResult,
} from "./types.js";
import { copyPlainDataRecord } from "./dataRecord.js";
import type { PlainDataRecord } from "./dataRecord.js";

function hasOwn(record: PlainDataRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function addIssue(issues: ContentValidationIssue[], issue: ContentValidationIssue): void {
  issues.push(issue);
}

function addUnknownFieldWarnings(
  record: PlainDataRecord,
  allowedFields: ReadonlySet<string>,
  path: string,
  issues: ContentValidationIssue[],
): void {
  for (const key of Object.keys(record)) {
    if (!allowedFields.has(key)) {
      addIssue(issues, {
        path: `${path}.${key}`,
        code: CONTENT_ISSUE_CODES.unknownField,
        severity: "warning",
        message: `Unknown field '${key}' was ignored.`,
      });
    }
  }
}

function readRequiredRecord(
  record: PlainDataRecord,
  key: string,
  path: string,
  issues: ContentValidationIssue[],
): PlainDataRecord | undefined {
  const fieldPath = `${path}.${key}`;

  if (!hasOwn(record, key)) {
    addIssue(issues, {
      path: fieldPath,
      code: CONTENT_ISSUE_CODES.required,
      severity: "error",
      message: `Required field '${key}' is missing.`,
    });
    return undefined;
  }

  const value = copyPlainDataRecord(record[key]);
  if (value === undefined) {
    addIssue(issues, {
      path: fieldPath,
      code: CONTENT_ISSUE_CODES.invalidType,
      severity: "error",
      message: `Expected '${key}' to be an object.`,
    });
    return undefined;
  }

  return value;
}

function readRequiredString(
  record: PlainDataRecord,
  key: string,
  path: string,
  issues: ContentValidationIssue[],
): string | undefined {
  const fieldPath = `${path}.${key}`;

  if (!hasOwn(record, key)) {
    addIssue(issues, {
      path: fieldPath,
      code: CONTENT_ISSUE_CODES.required,
      severity: "error",
      message: `Required field '${key}' is missing.`,
    });
    return undefined;
  }

  const value = record[key];
  if (typeof value !== "string") {
    addIssue(issues, {
      path: fieldPath,
      code: CONTENT_ISSUE_CODES.invalidType,
      severity: "error",
      message: `Expected '${key}' to be a string.`,
    });
    return undefined;
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    addIssue(issues, {
      path: fieldPath,
      code: CONTENT_ISSUE_CODES.emptyString,
      severity: "error",
      message: `Field '${key}' cannot be empty.`,
    });
    return undefined;
  }

  return normalized;
}

function readOptionalString(
  record: PlainDataRecord,
  key: string,
  path: string,
  issues: ContentValidationIssue[],
): string | undefined {
  if (!hasOwn(record, key)) {
    return undefined;
  }

  const fieldPath = `${path}.${key}`;
  const value = record[key];
  if (typeof value !== "string") {
    addIssue(issues, {
      path: fieldPath,
      code: CONTENT_ISSUE_CODES.invalidType,
      severity: "error",
      message: `Expected '${key}' to be a string.`,
    });
    return undefined;
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    addIssue(issues, {
      path: fieldPath,
      code: CONTENT_ISSUE_CODES.emptyString,
      severity: "error",
      message: `Field '${key}' cannot be empty when provided.`,
    });
    return undefined;
  }

  return normalized;
}

function readRequiredBoolean(
  record: PlainDataRecord,
  key: string,
  path: string,
  issues: ContentValidationIssue[],
): boolean | undefined {
  const fieldPath = `${path}.${key}`;

  if (!hasOwn(record, key)) {
    addIssue(issues, {
      path: fieldPath,
      code: CONTENT_ISSUE_CODES.required,
      severity: "error",
      message: `Required field '${key}' is missing.`,
    });
    return undefined;
  }

  const value = record[key];
  if (typeof value !== "boolean") {
    addIssue(issues, {
      path: fieldPath,
      code: CONTENT_ISSUE_CODES.invalidType,
      severity: "error",
      message: `Expected '${key}' to be a boolean.`,
    });
    return undefined;
  }

  return value;
}

function readRequiredArray(
  record: PlainDataRecord,
  key: string,
  path: string,
  issues: ContentValidationIssue[],
): readonly unknown[] | undefined {
  const fieldPath = `${path}.${key}`;

  if (!hasOwn(record, key)) {
    addIssue(issues, {
      path: fieldPath,
      code: CONTENT_ISSUE_CODES.required,
      severity: "error",
      message: `Required field '${key}' is missing.`,
    });
    return undefined;
  }

  const value = record[key];
  if (!Array.isArray(value)) {
    addIssue(issues, {
      path: fieldPath,
      code: CONTENT_ISSUE_CODES.invalidType,
      severity: "error",
      message: `Expected '${key}' to be an array.`,
    });
    return undefined;
  }

  if (value.length === 0) {
    addIssue(issues, {
      path: fieldPath,
      code: CONTENT_ISSUE_CODES.emptyArray,
      severity: "error",
      message: `Array '${key}' cannot be empty.`,
    });
  }

  return value as readonly unknown[];
}

function parseStringArray(
  value: unknown,
  path: string,
  issues: ContentValidationIssue[],
  options: { readonly required: boolean; readonly nonEmpty: boolean },
): readonly string[] | undefined {
  if (value === undefined && !options.required) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    addIssue(issues, {
      path,
      code: value === undefined ? CONTENT_ISSUE_CODES.required : CONTENT_ISSUE_CODES.invalidType,
      severity: "error",
      message:
        value === undefined
          ? "Required reference array is missing."
          : "Expected an array of string identifiers.",
    });
    return undefined;
  }

  if (options.nonEmpty && value.length === 0) {
    addIssue(issues, {
      path,
      code: CONTENT_ISSUE_CODES.emptyArray,
      severity: "error",
      message: "Reference array cannot be empty.",
    });
  }

  const identifiers: string[] = [];
  const firstIndexById = new Map<string, number>();

  for (const [index, candidate] of value.entries()) {
    const itemPath = `${path}[${index}]`;
    if (typeof candidate !== "string") {
      addIssue(issues, {
        path: itemPath,
        code: CONTENT_ISSUE_CODES.invalidType,
        severity: "error",
        message: "Expected a string identifier.",
      });
      continue;
    }

    const identifier = candidate.trim();
    if (identifier.length === 0) {
      addIssue(issues, {
        path: itemPath,
        code: CONTENT_ISSUE_CODES.emptyString,
        severity: "error",
        message: "Reference identifier cannot be empty.",
      });
      continue;
    }

    const firstIndex = firstIndexById.get(identifier);
    if (firstIndex !== undefined) {
      addIssue(issues, {
        path: itemPath,
        code: CONTENT_ISSUE_CODES.duplicateReference,
        severity: "error",
        message: `Duplicate reference '${identifier}'; first used at ${path}[${firstIndex}].`,
      });
    } else {
      firstIndexById.set(identifier, index);
    }

    identifiers.push(identifier);
  }

  return identifiers;
}

function parseLicense(
  root: PlainDataRecord,
  issues: ContentValidationIssue[],
): ContentLicense | undefined {
  const path = "$.license";
  const record = readRequiredRecord(root, "license", "$", issues);
  if (record === undefined) {
    return undefined;
  }

  addUnknownFieldWarnings(
    record,
    new Set([
      "copyrightHolderOrSource",
      "redistributionPermitted",
      "spdxId",
      "customLicenseNotice",
      "attribution",
      "modificationNotice",
    ]),
    path,
    issues,
  );

  const copyrightHolderOrSource = readRequiredString(
    record,
    "copyrightHolderOrSource",
    path,
    issues,
  );
  const redistributionPermitted = readRequiredBoolean(
    record,
    "redistributionPermitted",
    path,
    issues,
  );
  const spdxId = readOptionalString(record, "spdxId", path, issues);
  const customLicenseNotice = readOptionalString(record, "customLicenseNotice", path, issues);
  const attribution = readOptionalString(record, "attribution", path, issues);
  const modificationNotice = readOptionalString(record, "modificationNotice", path, issues);

  if (spdxId === undefined && customLicenseNotice === undefined) {
    addIssue(issues, {
      path,
      code: CONTENT_ISSUE_CODES.missingLicenseTerms,
      severity: "error",
      message: "Provide an SPDX identifier or a complete custom license notice.",
    });
  }

  if (spdxId !== undefined && !/^[A-Za-z0-9][A-Za-z0-9.+-]*$/u.test(spdxId)) {
    addIssue(issues, {
      path: `${path}.spdxId`,
      code: CONTENT_ISSUE_CODES.invalidSpdxId,
      severity: "error",
      message: "spdxId must use SPDX identifier syntax, not a license expression.",
    });
  }

  if (redistributionPermitted === false) {
    addIssue(issues, {
      path: `${path}.redistributionPermitted`,
      code: CONTENT_ISSUE_CODES.redistributionRestricted,
      severity: "warning",
      message: "This package declares that redistribution is not permitted.",
    });
  }

  if (copyrightHolderOrSource === undefined || redistributionPermitted === undefined) {
    return undefined;
  }

  const common = {
    copyrightHolderOrSource,
    redistributionPermitted,
    ...(attribution === undefined ? {} : { attribution }),
    ...(modificationNotice === undefined ? {} : { modificationNotice }),
  };

  if (spdxId !== undefined) {
    return {
      ...common,
      spdxId,
      ...(customLicenseNotice === undefined ? {} : { customLicenseNotice }),
    };
  }

  if (customLicenseNotice !== undefined) {
    return {
      ...common,
      customLicenseNotice,
    };
  }

  return undefined;
}

function parseSkills(
  root: PlainDataRecord,
  issues: ContentValidationIssue[],
): readonly ContentSkill[] | undefined {
  const candidates = readRequiredArray(root, "skills", "$", issues);
  if (candidates === undefined) {
    return undefined;
  }

  const skills: ContentSkill[] = [];
  for (const [index, candidate] of candidates.entries()) {
    const path = `$.skills[${index}]`;
    const record = copyPlainDataRecord(candidate);
    if (record === undefined) {
      addIssue(issues, {
        path,
        code: CONTENT_ISSUE_CODES.invalidType,
        severity: "error",
        message: "Expected a skill object.",
      });
      continue;
    }

    addUnknownFieldWarnings(record, new Set(["id", "title", "description"]), path, issues);

    const id = readRequiredString(record, "id", path, issues);
    const title = readRequiredString(record, "title", path, issues);
    const description = readOptionalString(record, "description", path, issues);
    if (id === undefined || title === undefined) {
      continue;
    }

    skills.push({
      id,
      title,
      ...(description === undefined ? {} : { description }),
    });
  }

  addDuplicateIdIssues(skills, "$.skills", issues);
  return skills;
}

function parseStages(
  root: PlainDataRecord,
  issues: ContentValidationIssue[],
): readonly ContentStage[] | undefined {
  const candidates = readRequiredArray(root, "stages", "$", issues);
  if (candidates === undefined) {
    return undefined;
  }

  const stages: ContentStage[] = [];
  for (const [index, candidate] of candidates.entries()) {
    const path = `$.stages[${index}]`;
    const record = copyPlainDataRecord(candidate);
    if (record === undefined) {
      addIssue(issues, {
        path,
        code: CONTENT_ISSUE_CODES.invalidType,
        severity: "error",
        message: "Expected a stage object.",
      });
      continue;
    }

    addUnknownFieldWarnings(
      record,
      new Set(["id", "title", "skillIds", "prerequisiteStageIds"]),
      path,
      issues,
    );

    const id = readRequiredString(record, "id", path, issues);
    const title = readRequiredString(record, "title", path, issues);
    const skillIds = parseStringArray(record.skillIds, `${path}.skillIds`, issues, {
      required: true,
      nonEmpty: true,
    });
    const prerequisiteStageIds = parseStringArray(
      record.prerequisiteStageIds,
      `${path}.prerequisiteStageIds`,
      issues,
      { required: false, nonEmpty: false },
    );

    if (id === undefined || title === undefined || skillIds === undefined) {
      continue;
    }

    stages.push({
      id,
      title,
      skillIds,
      ...(prerequisiteStageIds === undefined ? {} : { prerequisiteStageIds }),
    });
  }

  addDuplicateIdIssues(stages, "$.stages", issues);
  return stages;
}

function parseItems(
  root: PlainDataRecord,
  issues: ContentValidationIssue[],
): readonly ContentItem<unknown>[] | undefined {
  const candidates = readRequiredArray(root, "items", "$", issues);
  if (candidates === undefined) {
    return undefined;
  }

  const items: ContentItem<unknown>[] = [];
  for (const [index, candidate] of candidates.entries()) {
    const path = `$.items[${index}]`;
    const record = copyPlainDataRecord(candidate);
    if (record === undefined) {
      addIssue(issues, {
        path,
        code: CONTENT_ISSUE_CODES.invalidType,
        severity: "error",
        message: "Expected a content item object.",
      });
      continue;
    }

    addUnknownFieldWarnings(
      record,
      new Set(["id", "skillIds", "stageIds", "payload"]),
      path,
      issues,
    );

    const id = readRequiredString(record, "id", path, issues);
    const skillIds = parseStringArray(record.skillIds, `${path}.skillIds`, issues, {
      required: true,
      nonEmpty: true,
    });
    const stageIds = parseStringArray(record.stageIds, `${path}.stageIds`, issues, {
      required: true,
      nonEmpty: true,
    });

    let hasPayload = true;
    if (!hasOwn(record, "payload")) {
      hasPayload = false;
      addIssue(issues, {
        path: `${path}.payload`,
        code: CONTENT_ISSUE_CODES.required,
        severity: "error",
        message: "Required field 'payload' is missing.",
      });
    }

    if (id === undefined || skillIds === undefined || stageIds === undefined || !hasPayload) {
      continue;
    }

    items.push({
      id,
      skillIds,
      stageIds,
      payload: record.payload,
    });
  }

  addDuplicateIdIssues(items, "$.items", issues);
  return items;
}

function addDuplicateIdIssues(
  entries: readonly { readonly id: string }[],
  path: string,
  issues: ContentValidationIssue[],
): void {
  const firstIndexById = new Map<string, number>();

  for (const [index, entry] of entries.entries()) {
    const firstIndex = firstIndexById.get(entry.id);
    if (firstIndex === undefined) {
      firstIndexById.set(entry.id, index);
      continue;
    }

    addIssue(issues, {
      path: `${path}[${index}].id`,
      code: CONTENT_ISSUE_CODES.duplicateId,
      severity: "error",
      message: `Duplicate id '${entry.id}'; first declared at ${path}[${firstIndex}].id.`,
    });
  }
}

function validateReferences(
  skills: readonly ContentSkill[],
  stages: readonly ContentStage[],
  items: readonly ContentItem<unknown>[],
  issues: ContentValidationIssue[],
): void {
  const skillIds = new Set(skills.map((skill) => skill.id));
  const stageIds = new Set(stages.map((stage) => stage.id));

  for (const [stageIndex, stage] of stages.entries()) {
    for (const [referenceIndex, skillId] of stage.skillIds.entries()) {
      if (!skillIds.has(skillId)) {
        addIssue(issues, {
          path: `$.stages[${stageIndex}].skillIds[${referenceIndex}]`,
          code: CONTENT_ISSUE_CODES.unknownSkillReference,
          severity: "error",
          message: `Unknown skill reference '${skillId}'.`,
        });
      }
    }

    for (const [referenceIndex, prerequisiteId] of (stage.prerequisiteStageIds ?? []).entries()) {
      const path = `$.stages[${stageIndex}].prerequisiteStageIds[${referenceIndex}]`;
      if (!stageIds.has(prerequisiteId)) {
        addIssue(issues, {
          path,
          code: CONTENT_ISSUE_CODES.unknownStageReference,
          severity: "error",
          message: `Unknown stage reference '${prerequisiteId}'.`,
        });
      } else if (prerequisiteId === stage.id) {
        addIssue(issues, {
          path,
          code: CONTENT_ISSUE_CODES.selfStageReference,
          severity: "error",
          message: "A stage cannot require itself.",
        });
      }
    }
  }

  for (const [itemIndex, item] of items.entries()) {
    for (const [referenceIndex, skillId] of item.skillIds.entries()) {
      if (!skillIds.has(skillId)) {
        addIssue(issues, {
          path: `$.items[${itemIndex}].skillIds[${referenceIndex}]`,
          code: CONTENT_ISSUE_CODES.unknownSkillReference,
          severity: "error",
          message: `Unknown skill reference '${skillId}'.`,
        });
      }
    }

    for (const [referenceIndex, stageId] of item.stageIds.entries()) {
      if (!stageIds.has(stageId)) {
        addIssue(issues, {
          path: `$.items[${itemIndex}].stageIds[${referenceIndex}]`,
          code: CONTENT_ISSUE_CODES.unknownStageReference,
          severity: "error",
          message: `Unknown stage reference '${stageId}'.`,
        });
      }
    }
  }

  validateStageGraph(stages, stageIds, issues);
}

function validateStageGraph(
  stages: readonly ContentStage[],
  knownStageIds: ReadonlySet<string>,
  issues: ContentValidationIssue[],
): void {
  const stateById = new Map<string, "visiting" | "visited">();
  const indexById = new Map(stages.map((stage, index) => [stage.id, index]));
  const path: string[] = [];

  const visit = (stage: ContentStage): void => {
    stateById.set(stage.id, "visiting");
    path.push(stage.id);

    for (const [referenceIndex, prerequisiteId] of (stage.prerequisiteStageIds ?? []).entries()) {
      if (!knownStageIds.has(prerequisiteId) || prerequisiteId === stage.id) {
        continue;
      }

      const prerequisiteState = stateById.get(prerequisiteId);
      if (prerequisiteState === "visiting") {
        const cycleStart = path.indexOf(prerequisiteId);
        const cycle = [...path.slice(cycleStart), prerequisiteId];
        const stageIndex = indexById.get(stage.id);
        if (stageIndex !== undefined) {
          addIssue(issues, {
            path: `$.stages[${stageIndex}].prerequisiteStageIds[${referenceIndex}]`,
            code: CONTENT_ISSUE_CODES.stageCycle,
            severity: "error",
            message: `Stage prerequisite cycle detected: ${cycle.join(" -> ")}.`,
          });
        }
        continue;
      }

      if (prerequisiteState === undefined) {
        const prerequisiteIndex = indexById.get(prerequisiteId);
        const prerequisite =
          prerequisiteIndex === undefined ? undefined : stages[prerequisiteIndex];
        if (prerequisite !== undefined) {
          visit(prerequisite);
        }
      }
    }

    path.pop();
    stateById.set(stage.id, "visited");
  };

  for (const stage of stages) {
    if (stateById.get(stage.id) === undefined) {
      visit(stage);
    }
  }
}

/**
 * Validates an unknown import without asserting its generic payload type.
 * Successful values are rebuilt from validated structural fields, while each
 * item payload deliberately remains `unknown` for an application-defined decoder.
 */
export function validateContentPackage(input: unknown): ContentValidationResult {
  const issues: ContentValidationIssue[] = [];
  const root = copyPlainDataRecord(input);

  if (root === undefined) {
    addIssue(issues, {
      path: "$",
      code: CONTENT_ISSUE_CODES.invalidType,
      severity: "error",
      message: "Expected a content package object.",
    });
    return { valid: false, issues };
  }

  addUnknownFieldWarnings(
    root,
    new Set(["schemaVersion", "id", "version", "title", "license", "skills", "stages", "items"]),
    "$",
    issues,
  );

  const rawSchemaVersion = readRequiredString(root, "schemaVersion", "$", issues);
  const schemaVersion =
    rawSchemaVersion === CONTENT_SCHEMA_VERSION ? CONTENT_SCHEMA_VERSION : undefined;
  if (rawSchemaVersion !== undefined && rawSchemaVersion !== CONTENT_SCHEMA_VERSION) {
    addIssue(issues, {
      path: "$.schemaVersion",
      code: CONTENT_ISSUE_CODES.unsupportedSchemaVersion,
      severity: "error",
      message: `Unsupported schema version '${rawSchemaVersion}'.`,
    });
  }

  const id = readRequiredString(root, "id", "$", issues);
  const version = readRequiredString(root, "version", "$", issues);
  const title = readRequiredString(root, "title", "$", issues);
  const license = parseLicense(root, issues);
  const skills = parseSkills(root, issues);
  const stages = parseStages(root, issues);
  const items = parseItems(root, issues);

  if (skills !== undefined && stages !== undefined && items !== undefined) {
    validateReferences(skills, stages, items, issues);
  }

  const hasErrors = issues.some((issue) => issue.severity === "error");
  if (
    hasErrors ||
    schemaVersion === undefined ||
    id === undefined ||
    version === undefined ||
    title === undefined ||
    license === undefined ||
    skills === undefined ||
    stages === undefined ||
    items === undefined
  ) {
    return { valid: false, issues };
  }

  const value: ContentPackage<unknown> = {
    schemaVersion,
    id,
    version,
    title,
    license,
    skills,
    stages,
    items,
  };

  return { valid: true, value, issues };
}
