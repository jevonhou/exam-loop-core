import { describe, expect, it } from "vitest";

import {
  CONTENT_ISSUE_CODES,
  CONTENT_SCHEMA_VERSION,
  previewContentPackage,
  validateContentPackage,
  type ContentPackage,
} from "./index.js";

interface FictionalPrompt {
  readonly prompt: string;
  readonly choices: readonly {
    readonly id: string;
    readonly label: string;
  }[];
  readonly correctChoiceId: string;
}

/** Entirely fictional, original, and intentionally tiny. */
function createFictionalCertificationPackage(): ContentPackage<FictionalPrompt> {
  return {
    schemaVersion: CONTENT_SCHEMA_VERSION,
    id: "fictional-orbital-archive",
    version: "1.0.0",
    title: "Fictional Orbital Archive Certificate",
    license: {
      copyrightHolderOrSource: "Example package contributors",
      spdxId: "CC0-1.0",
      redistributionPermitted: true,
      attribution: "Original example content for protocol tests.",
    },
    skills: [
      {
        id: "symbol-routing",
        title: "Symbol routing",
        description: "Apply an invented sorting rule.",
      },
    ],
    stages: [
      {
        id: "intake-desk",
        title: "Intake desk",
        skillIds: ["symbol-routing"],
      },
    ],
    items: [
      {
        id: "silver-hexagon",
        skillIds: ["symbol-routing"],
        stageIds: ["intake-desk"],
        payload: {
          prompt: "Under the invented archive rule, which tray receives a silver hexagon?",
          choices: [
            { id: "north", label: "North tray" },
            { id: "south", label: "South tray" },
          ],
          correctChoiceId: "north",
        },
      },
    ],
  };
}

function expectIssue(
  result: ReturnType<typeof validateContentPackage>,
  code: string,
  path: string,
): void {
  expect(result.issues).toEqual(
    expect.arrayContaining([expect.objectContaining({ code, path, severity: "error" })]),
  );
}

describe("validateContentPackage", () => {
  it("accepts the tiny fictional package and rebuilds its structural shell", () => {
    const input = {
      ...createFictionalCertificationPackage(),
      ignoredRootField: "not part of the protocol",
      skills: [
        {
          ...createFictionalCertificationPackage().skills[0],
          ignoredSkillField: true,
        },
      ],
    };

    const result = validateContentPackage(input);

    expect(result.valid).toBe(true);
    if (!result.valid) {
      throw new Error("Expected the fixture to be valid.");
    }

    expect(result.issues).toEqual([
      expect.objectContaining({
        code: CONTENT_ISSUE_CODES.unknownField,
        path: "$.ignoredRootField",
        severity: "warning",
      }),
      expect.objectContaining({
        code: CONTENT_ISSUE_CODES.unknownField,
        path: "$.skills[0].ignoredSkillField",
        severity: "warning",
      }),
    ]);
    expect(result.value).not.toHaveProperty("ignoredRootField");
    expect(result.value.skills[0]).not.toHaveProperty("ignoredSkillField");
    expect(result.value.items[0]?.payload).toEqual(
      createFictionalCertificationPackage().items[0]?.payload,
    );
  });

  it("normalizes surrounding whitespace in validated structural strings", () => {
    const fixture = createFictionalCertificationPackage();
    const result = validateContentPackage({
      ...fixture,
      id: `  ${fixture.id}  `,
      skills: [{ ...fixture.skills[0], id: "  symbol-routing  " }],
      stages: [
        {
          ...fixture.stages[0],
          skillIds: ["  symbol-routing  "],
        },
      ],
      items: [
        {
          ...fixture.items[0],
          skillIds: ["  symbol-routing  "],
        },
      ],
    });

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.value.id).toBe(fixture.id);
      expect(result.value.skills[0]?.id).toBe("symbol-routing");
      expect(result.value.items[0]?.skillIds).toEqual(["symbol-routing"]);
    }
  });

  it("rejects a non-object root without returning a package value", () => {
    const result = validateContentPackage("not a package");

    expect(result.valid).toBe(false);
    expect(result).not.toHaveProperty("value");
    expectIssue(result, CONTENT_ISSUE_CODES.invalidType, "$");
  });

  it("rejects exotic roots without invoking accessors or proxy traps", () => {
    const fixture = createFictionalCertificationPackage();
    const inherited = Object.assign(Object.create({ inherited: true }) as object, fixture);
    const symbolKey = { ...fixture } as Record<PropertyKey, unknown>;
    symbolKey[Symbol("private")] = true;
    const accessor = { ...fixture };
    Object.defineProperty(accessor, "id", {
      enumerable: true,
      get: () => {
        throw new Error("must not execute");
      },
    });
    const hostileProxy = new Proxy(
      {},
      {
        getPrototypeOf: () => {
          throw new Error("hostile proxy");
        },
      },
    );

    for (const candidate of [inherited, symbolKey, accessor, hostileProxy]) {
      const result = validateContentPackage(candidate);
      expect(result.valid).toBe(false);
      expectIssue(result, CONTENT_ISSUE_CODES.invalidType, "$");
    }
  });

  it("snapshots data descriptors without invoking a Proxy get trap", () => {
    const fixture = createFictionalCertificationPackage();
    const proxy = new Proxy(fixture, {
      get: () => {
        throw new Error("must not invoke Proxy get");
      },
    });

    const validation = validateContentPackage(proxy);
    const preview = previewContentPackage(proxy);

    expect(validation.valid).toBe(true);
    expect(preview.valid).toBe(true);
    expect(preview.summary.id).toBe(fixture.id);
  });

  it("rejects an unsupported schema version at a stable path", () => {
    const result = validateContentPackage({
      ...createFictionalCertificationPackage(),
      schemaVersion: "2.0.0",
    });

    expect(result.valid).toBe(false);
    expectIssue(result, CONTENT_ISSUE_CODES.unsupportedSchemaVersion, "$.schemaVersion");
  });

  it("reports missing, mistyped, and empty required fields", () => {
    const fixture = createFictionalCertificationPackage();
    const result = validateContentPackage({
      schemaVersion: fixture.schemaVersion,
      id: "   ",
      version: 1,
      license: fixture.license,
      skills: fixture.skills,
      stages: fixture.stages,
      items: fixture.items,
    });

    expect(result.valid).toBe(false);
    expectIssue(result, CONTENT_ISSUE_CODES.emptyString, "$.id");
    expectIssue(result, CONTENT_ISSUE_CODES.invalidType, "$.version");
    expectIssue(result, CONTENT_ISSUE_CODES.required, "$.title");
  });

  it("rejects duplicate skill, stage, and item identifiers", () => {
    const fixture = createFictionalCertificationPackage();
    const result = validateContentPackage({
      ...fixture,
      skills: [fixture.skills[0], fixture.skills[0]],
      stages: [fixture.stages[0], fixture.stages[0]],
      items: [fixture.items[0], fixture.items[0]],
    });

    expect(result.valid).toBe(false);
    expectIssue(result, CONTENT_ISSUE_CODES.duplicateId, "$.skills[1].id");
    expectIssue(result, CONTENT_ISSUE_CODES.duplicateId, "$.stages[1].id");
    expectIssue(result, CONTENT_ISSUE_CODES.duplicateId, "$.items[1].id");
  });

  it("rejects duplicate references within an item", () => {
    const fixture = createFictionalCertificationPackage();
    const result = validateContentPackage({
      ...fixture,
      items: [
        {
          ...fixture.items[0],
          skillIds: ["symbol-routing", "symbol-routing"],
        },
      ],
    });

    expect(result.valid).toBe(false);
    expectIssue(result, CONTENT_ISSUE_CODES.duplicateReference, "$.items[0].skillIds[1]");
  });

  it("locates unknown skill references in stages and items", () => {
    const fixture = createFictionalCertificationPackage();
    const result = validateContentPackage({
      ...fixture,
      stages: [{ ...fixture.stages[0], skillIds: ["missing-skill"] }],
      items: [{ ...fixture.items[0], skillIds: ["missing-skill"] }],
    });

    expect(result.valid).toBe(false);
    expectIssue(result, CONTENT_ISSUE_CODES.unknownSkillReference, "$.stages[0].skillIds[0]");
    expectIssue(result, CONTENT_ISSUE_CODES.unknownSkillReference, "$.items[0].skillIds[0]");
  });

  it("locates unknown stage references in prerequisites and items", () => {
    const fixture = createFictionalCertificationPackage();
    const result = validateContentPackage({
      ...fixture,
      stages: [
        {
          ...fixture.stages[0],
          prerequisiteStageIds: ["missing-stage"],
        },
      ],
      items: [{ ...fixture.items[0], stageIds: ["missing-stage"] }],
    });

    expect(result.valid).toBe(false);
    expectIssue(
      result,
      CONTENT_ISSUE_CODES.unknownStageReference,
      "$.stages[0].prerequisiteStageIds[0]",
    );
    expectIssue(result, CONTENT_ISSUE_CODES.unknownStageReference, "$.items[0].stageIds[0]");
  });

  it("rejects a stage that requires itself", () => {
    const fixture = createFictionalCertificationPackage();
    const result = validateContentPackage({
      ...fixture,
      stages: [
        {
          ...fixture.stages[0],
          prerequisiteStageIds: [fixture.stages[0]?.id],
        },
      ],
    });

    expect(result.valid).toBe(false);
    expectIssue(
      result,
      CONTENT_ISSUE_CODES.selfStageReference,
      "$.stages[0].prerequisiteStageIds[0]",
    );
  });

  it("rejects prerequisite cycles across multiple stages", () => {
    const fixture = createFictionalCertificationPackage();
    const result = validateContentPackage({
      ...fixture,
      stages: [
        {
          id: "stage-a",
          title: "Stage A",
          skillIds: ["symbol-routing"],
          prerequisiteStageIds: ["stage-b"],
        },
        {
          id: "stage-b",
          title: "Stage B",
          skillIds: ["symbol-routing"],
          prerequisiteStageIds: ["stage-a"],
        },
      ],
      items: [{ ...fixture.items[0], stageIds: ["stage-a"] }],
    });

    expect(result.valid).toBe(false);
    expectIssue(result, CONTENT_ISSUE_CODES.stageCycle, "$.stages[1].prerequisiteStageIds[0]");
  });

  it("requires non-empty skill, stage, item, and item-reference arrays", () => {
    const fixture = createFictionalCertificationPackage();
    const result = validateContentPackage({
      ...fixture,
      skills: [],
      stages: [],
      items: [
        {
          ...fixture.items[0],
          skillIds: [],
          stageIds: [],
        },
      ],
    });

    expect(result.valid).toBe(false);
    expectIssue(result, CONTENT_ISSUE_CODES.emptyArray, "$.skills");
    expectIssue(result, CONTENT_ISSUE_CODES.emptyArray, "$.stages");
    expectIssue(result, CONTENT_ISSUE_CODES.emptyArray, "$.items[0].skillIds");
    expectIssue(result, CONTENT_ISSUE_CODES.emptyArray, "$.items[0].stageIds");
  });

  it("requires each item to have a payload property", () => {
    const fixture = createFictionalCertificationPackage();
    const item = fixture.items[0];
    const result = validateContentPackage({
      ...fixture,
      items: [
        {
          id: item?.id,
          skillIds: item?.skillIds,
          stageIds: item?.stageIds,
        },
      ],
    });

    expect(result.valid).toBe(false);
    expectIssue(result, CONTENT_ISSUE_CODES.required, "$.items[0].payload");
  });

  it("requires a copyright source and SPDX or custom license terms", () => {
    const fixture = createFictionalCertificationPackage();
    const result = validateContentPackage({
      ...fixture,
      license: {
        redistributionPermitted: true,
      },
    });

    expect(result.valid).toBe(false);
    expectIssue(result, CONTENT_ISSUE_CODES.required, "$.license.copyrightHolderOrSource");
    expectIssue(result, CONTENT_ISSUE_CODES.missingLicenseTerms, "$.license");
  });

  it("validates the license object and every optional license field", () => {
    const fixture = createFictionalCertificationPackage();

    const missing = { ...fixture } as Record<string, unknown>;
    Reflect.deleteProperty(missing, "license");
    expectIssue(validateContentPackage(missing), CONTENT_ISSUE_CODES.required, "$.license");

    expectIssue(
      validateContentPackage({ ...fixture, license: [] }),
      CONTENT_ISSUE_CODES.invalidType,
      "$.license",
    );

    const result = validateContentPackage({
      ...fixture,
      license: {
        copyrightHolderOrSource: "Fixture author",
        redistributionPermitted: "yes",
        spdxId: 42,
        customLicenseNotice: " ",
        attribution: false,
        modificationNotice: " ",
      },
    });

    expectIssue(result, CONTENT_ISSUE_CODES.invalidType, "$.license.redistributionPermitted");
    expectIssue(result, CONTENT_ISSUE_CODES.invalidType, "$.license.spdxId");
    expectIssue(result, CONTENT_ISSUE_CODES.emptyString, "$.license.customLicenseNotice");
    expectIssue(result, CONTENT_ISSUE_CODES.invalidType, "$.license.attribution");
    expectIssue(result, CONTENT_ISSUE_CODES.emptyString, "$.license.modificationNotice");
  });

  it("rejects a license expression in the singular spdxId field", () => {
    const fixture = createFictionalCertificationPackage();
    const result = validateContentPackage({
      ...fixture,
      license: {
        ...fixture.license,
        spdxId: "MIT OR Apache-2.0",
      },
    });

    expect(result.valid).toBe(false);
    expectIssue(result, CONTENT_ISSUE_CODES.invalidSpdxId, "$.license.spdxId");
  });

  it("accepts complete custom license terms without an SPDX identifier", () => {
    const fixture = createFictionalCertificationPackage();
    const result = validateContentPackage({
      ...fixture,
      license: {
        copyrightHolderOrSource: "Original fixture author",
        customLicenseNotice:
          "Permission is granted to use and redistribute this fictional fixture.",
        redistributionPermitted: true,
      },
    });

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.value.license).toMatchObject({
        copyrightHolderOrSource: "Original fixture author",
        redistributionPermitted: true,
      });
    }
  });

  it("keeps a restricted package valid but emits a distribution warning", () => {
    const fixture = createFictionalCertificationPackage();
    const result = validateContentPackage({
      ...fixture,
      license: {
        ...fixture.license,
        redistributionPermitted: false,
      },
    });

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([
      expect.objectContaining({
        path: "$.license.redistributionPermitted",
        code: CONTENT_ISSUE_CODES.redistributionRestricted,
        severity: "warning",
      }),
    ]);
  });

  it("never returns a partially parsed package when any structural error exists", () => {
    const fixture = createFictionalCertificationPackage();
    const result = validateContentPackage({
      ...fixture,
      items: [{ ...fixture.items[0], stageIds: [123] }],
    });

    expect(result.valid).toBe(false);
    expect(result).not.toHaveProperty("value");
  });

  it("reports missing and mistyped top-level collections", () => {
    const fixture = createFictionalCertificationPackage();
    const missing = { ...fixture } as Record<string, unknown>;
    Reflect.deleteProperty(missing, "skills");
    Reflect.deleteProperty(missing, "stages");
    Reflect.deleteProperty(missing, "items");

    const missingResult = validateContentPackage(missing);
    expectIssue(missingResult, CONTENT_ISSUE_CODES.required, "$.skills");
    expectIssue(missingResult, CONTENT_ISSUE_CODES.required, "$.stages");
    expectIssue(missingResult, CONTENT_ISSUE_CODES.required, "$.items");

    const invalidResult = validateContentPackage({
      ...fixture,
      skills: {},
      stages: "stages",
      items: null,
    });
    expectIssue(invalidResult, CONTENT_ISSUE_CODES.invalidType, "$.skills");
    expectIssue(invalidResult, CONTENT_ISSUE_CODES.invalidType, "$.stages");
    expectIssue(invalidResult, CONTENT_ISSUE_CODES.invalidType, "$.items");
  });

  it("validates collection entries before building the structural shell", () => {
    const fixture = createFictionalCertificationPackage();
    const nonObjects = validateContentPackage({
      ...fixture,
      skills: [null],
      stages: [42],
      items: ["item"],
    });
    expectIssue(nonObjects, CONTENT_ISSUE_CODES.invalidType, "$.skills[0]");
    expectIssue(nonObjects, CONTENT_ISSUE_CODES.invalidType, "$.stages[0]");
    expectIssue(nonObjects, CONTENT_ISSUE_CODES.invalidType, "$.items[0]");

    const malformed = validateContentPackage({
      ...fixture,
      skills: [{ id: " ", title: 42, description: false }],
      stages: [
        {
          id: " ",
          title: 42,
          prerequisiteStageIds: "not-an-array",
        },
      ],
      items: [
        {
          id: " ",
          skillIds: [42, " "],
          stageIds: "not-an-array",
          payload: null,
        },
      ],
    });

    expectIssue(malformed, CONTENT_ISSUE_CODES.emptyString, "$.skills[0].id");
    expectIssue(malformed, CONTENT_ISSUE_CODES.invalidType, "$.skills[0].title");
    expectIssue(malformed, CONTENT_ISSUE_CODES.invalidType, "$.skills[0].description");
    expectIssue(malformed, CONTENT_ISSUE_CODES.required, "$.stages[0].skillIds");
    expectIssue(malformed, CONTENT_ISSUE_CODES.invalidType, "$.stages[0].prerequisiteStageIds");
    expectIssue(malformed, CONTENT_ISSUE_CODES.invalidType, "$.items[0].skillIds[0]");
    expectIssue(malformed, CONTENT_ISSUE_CODES.emptyString, "$.items[0].skillIds[1]");
    expectIssue(malformed, CONTENT_ISSUE_CODES.invalidType, "$.items[0].stageIds");
  });
});

describe("previewContentPackage", () => {
  it("returns only checked metadata and never exposes payloads or a package value", () => {
    const fixture = createFictionalCertificationPackage();
    const preview = previewContentPackage({
      ...fixture,
      title: 42,
      items: [{ untrustedPayload: { hidden: true } }],
    });

    expect(preview.valid).toBe(false);
    expect(preview.summary).toEqual({
      schemaVersion: CONTENT_SCHEMA_VERSION,
      id: fixture.id,
      version: fixture.version,
      title: null,
      skillCount: 1,
      stageCount: 1,
      itemCount: 1,
      license: {
        copyrightHolderOrSource: "Example package contributors",
        spdxId: "CC0-1.0",
        hasCustomLicenseNotice: false,
        redistributionPermitted: true,
      },
    });
    expect(preview).not.toHaveProperty("value");
    expect(preview).not.toHaveProperty("package");
    expect(JSON.stringify(preview)).not.toContain("hidden");
  });

  it("uses null summary fields for a non-object input", () => {
    const preview = previewContentPackage(null);

    expect(preview.valid).toBe(false);
    expect(preview.summary).toEqual({
      schemaVersion: null,
      id: null,
      version: null,
      title: null,
      skillCount: null,
      stageCount: null,
      itemCount: null,
      license: null,
    });
  });

  it("summarizes malformed metadata conservatively", () => {
    const preview = previewContentPackage({
      schemaVersion: 1,
      id: " ",
      version: null,
      title: [],
      skills: {},
      stages: null,
      items: "items",
      license: {
        copyrightHolderOrSource: 42,
        spdxId: " ",
        customLicenseNotice: "Custom terms",
        redistributionPermitted: "yes",
      },
    });

    expect(preview.summary).toEqual({
      schemaVersion: null,
      id: null,
      version: null,
      title: null,
      skillCount: null,
      stageCount: null,
      itemCount: null,
      license: {
        copyrightHolderOrSource: null,
        spdxId: null,
        hasCustomLicenseNotice: true,
        redistributionPermitted: null,
      },
    });
  });
});
