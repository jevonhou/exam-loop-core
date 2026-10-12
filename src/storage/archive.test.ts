import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ARCHIVE_CHECKSUM_ALGORITHM,
  ARCHIVE_FORMAT,
  ARCHIVE_VERSION,
  ArchiveParseError,
  ArchiveCryptoError,
  canonicalizeJson,
  createArchive,
  parseArchive,
  previewArchive,
  serializeArchive,
  verifyArchive,
} from "./archive.js";

const CREATED_AT = "2026-07-20T09:30:00.000Z";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("archive", () => {
  it("creates, serializes, parses, previews, and verifies a versioned archive", async () => {
    const archive = await createArchive(
      { progress: 4, labels: ["one", "two"] },
      { createdAt: CREATED_AT },
    );

    expect(archive).toMatchObject({
      format: ARCHIVE_FORMAT,
      version: ARCHIVE_VERSION,
      createdAt: CREATED_AT,
      checksumAlgorithm: ARCHIVE_CHECKSUM_ALGORITHM,
    });
    expect(archive.checksum).toMatch(/^[a-f0-9]{64}$/u);

    const serialized = serializeArchive(archive);
    const parsed = parseArchive(serialized);
    const preview = previewArchive(serialized);
    const verification = await verifyArchive(serialized);

    expect(parsed.payload).toEqual({ labels: ["one", "two"], progress: 4 });
    expect(preview).toMatchObject({
      createdAt: CREATED_AT,
      payloadKind: "object",
      checksum: archive.checksum,
    });
    expect(preview.payloadBytes).toBeGreaterThan(0);
    expect(verification.ok).toBe(true);
  });

  it("uses canonical object ordering for stable checksums and serialization", async () => {
    const first = await createArchive(
      { beta: 2, alpha: { zed: true, first: "yes" } },
      { createdAt: CREATED_AT },
    );
    const second = await createArchive(
      { alpha: { first: "yes", zed: true }, beta: 2 },
      { createdAt: CREATED_AT },
    );

    expect(first.checksum).toBe(second.checksum);
    expect(serializeArchive(first)).toBe(serializeArchive(second));
    expect(canonicalizeJson({ z: 1, a: 2 })).toBe('{"a":2,"z":1}');
  });

  it("detects payload tampering", async () => {
    const archive = await createArchive<{ score: number }>({ score: 3 }, { createdAt: CREATED_AT });
    const tampered = { ...archive, payload: { score: 99 } };

    const verification = await verifyArchive(tampered);

    expect(verification).toMatchObject({
      ok: false,
      code: "CHECKSUM_MISMATCH",
    });
  });

  it("isolates verified payloads from later mutations of object input", async () => {
    const archive = await createArchive<{ score: number }>({ score: 3 }, { createdAt: CREATED_AT });
    const verification = await verifyArchive(archive);
    archive.payload.score = 99;

    expect(verification.ok).toBe(true);
    if (verification.ok) {
      expect(verification.archive.payload).toEqual({ score: 3 });
    }
  });

  it("detects metadata tampering", async () => {
    const archive = await createArchive({ score: 3 }, { createdAt: CREATED_AT });
    const tampered = { ...archive, createdAt: "2026-07-21T09:30:00.000Z" };

    const verification = await verifyArchive(tampered);

    expect(verification).toMatchObject({
      ok: false,
      code: "CHECKSUM_MISMATCH",
    });
  });

  it("returns a safe failure for malformed JSON", async () => {
    const verification = await verifyArchive('{"format":');

    expect(verification).toEqual({
      ok: false,
      code: "INVALID_JSON",
      message: "Archive text is not valid JSON.",
    });
  });

  it("strictly rejects missing and additional archive fields", async () => {
    const archive = await createArchive({ score: 3 }, { createdAt: CREATED_AT });

    expect(() => parseArchive({ ...archive, unexpected: true })).toThrow(ArchiveParseError);
    const { checksum: _checksum, ...withoutChecksum } = archive;
    expect(() => parseArchive(withoutChecksum)).toThrow(ArchiveParseError);
  });

  it("reports unsupported versions instead of attempting a best-effort parse", async () => {
    const archive = await createArchive({ score: 3 }, { createdAt: CREATED_AT });
    const verification = await verifyArchive({ ...archive, version: 2 });

    expect(verification).toMatchObject({
      ok: false,
      code: "UNSUPPORTED_VERSION",
    });
  });

  it("rejects non-JSON payloads before archive creation", async () => {
    await expect(
      createArchive({ score: Number.NaN }, { createdAt: CREATED_AT }),
    ).rejects.toMatchObject({ code: "INVALID_PAYLOAD" });

    const circular: { self?: unknown } = {};
    circular.self = circular;
    await expect(createArchive(circular as never, { createdAt: CREATED_AT })).rejects.toMatchObject(
      {
        code: "INVALID_PAYLOAD",
      },
    );
  });

  it("applies an application payload validator after checksum verification", async () => {
    const archive = await createArchive({ progress: "four" }, { createdAt: CREATED_AT });
    const isProgress = (value: unknown): value is { progress: number } =>
      typeof value === "object" &&
      value !== null &&
      "progress" in value &&
      typeof value.progress === "number";

    const verification = await verifyArchive(archive, isProgress);

    expect(verification).toMatchObject({
      ok: false,
      code: "INVALID_PAYLOAD",
    });
    expect(() => parseArchive(archive, isProgress)).toThrow(ArchiveParseError);
  });

  it("accepts a matching payload validator and preserves its narrowed type", async () => {
    const archive = await createArchive({ progress: 4 }, { createdAt: CREATED_AT });
    const isProgress = (value: unknown): value is { progress: number } =>
      typeof value === "object" &&
      value !== null &&
      "progress" in value &&
      typeof value.progress === "number";

    expect(parseArchive(archive, isProgress).payload.progress).toBe(4);
    const verification = await verifyArchive(archive, isProgress);
    expect(verification.ok).toBe(true);
    if (verification.ok) {
      expect(verification.archive.payload.progress).toBe(4);
    }
  });

  it("rejects every unsupported archive metadata shape with stable codes", async () => {
    const archive = await createArchive({ score: 3 }, { createdAt: CREATED_AT });
    const cases = [
      { value: null, code: "INVALID_ARCHIVE" },
      { value: [], code: "INVALID_ARCHIVE" },
      { value: { ...archive, format: 1 }, code: "INVALID_ARCHIVE" },
      { value: { ...archive, format: "other/archive" }, code: "UNSUPPORTED_FORMAT" },
      { value: { ...archive, version: "1" }, code: "INVALID_ARCHIVE" },
      { value: { ...archive, version: 2 }, code: "UNSUPPORTED_VERSION" },
      { value: { ...archive, createdAt: 1 }, code: "INVALID_ARCHIVE" },
      { value: { ...archive, createdAt: "not-a-date" }, code: "INVALID_ARCHIVE" },
      { value: { ...archive, checksumAlgorithm: 1 }, code: "INVALID_ARCHIVE" },
      { value: { ...archive, checksumAlgorithm: "MD5" }, code: "UNSUPPORTED_ALGORITHM" },
      { value: { ...archive, checksum: 1 }, code: "INVALID_ARCHIVE" },
      { value: { ...archive, checksum: "bad" }, code: "INVALID_ARCHIVE" },
    ] as const;

    for (const item of cases) {
      expect(await verifyArchive(item.value)).toMatchObject({ ok: false, code: item.code });
    }
  });

  it("rejects exotic objects, accessors, sparse arrays, and unsupported JSON values", () => {
    const getter = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(getter, "value", { enumerable: true, get: () => 1 });
    const hidden = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(hidden, "value", { enumerable: false, value: 1 });
    const symbolKey = { [Symbol("secret")]: 1 };
    const sparse = new Array(1);
    const extended: unknown[] = [];
    Object.assign(extended, { extra: true });

    for (const value of [
      new Date(),
      getter,
      hidden,
      symbolKey,
      sparse,
      extended,
      undefined,
      Symbol("value"),
      1n,
      () => true,
    ]) {
      expect(() => canonicalizeJson(value)).toThrow(ArchiveParseError);
    }
  });

  it("previews every JSON payload kind", async () => {
    const values = [
      [null, "null"],
      [[], "array"],
      [true, "boolean"],
      [4, "number"],
      [{ value: 1 }, "object"],
      ["value", "string"],
    ] as const;

    for (const [payload, payloadKind] of values) {
      const archive = await createArchive(payload, { createdAt: CREATED_AT });
      expect(previewArchive(archive).payloadKind).toBe(payloadKind);
    }
  });

  it("accepts Date options, defaults the timestamp, and rejects an invalid Date", async () => {
    expect((await createArchive({ value: 1 }, { createdAt: new Date(CREATED_AT) })).createdAt).toBe(
      CREATED_AT,
    );
    expect((await createArchive({ value: 1 })).createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
    await expect(
      createArchive({ value: 1 }, { createdAt: new Date(Number.NaN) }),
    ).rejects.toBeInstanceOf(ArchiveParseError);
  });

  it("reports missing Web Crypto without exposing an implementation error", async () => {
    const archive = await createArchive({ value: 1 }, { createdAt: CREATED_AT });
    vi.stubGlobal("crypto", undefined);

    await expect(createArchive({ value: 2 })).rejects.toBeInstanceOf(ArchiveCryptoError);
    expect(await verifyArchive(archive)).toMatchObject({
      ok: false,
      code: "CRYPTO_UNAVAILABLE",
    });
  });

  it("converts unexpected parser failures into a safe verification result", async () => {
    const hostile = new Proxy(
      {},
      {
        getPrototypeOf: () => {
          throw new Error("hostile object");
        },
      },
    );

    expect(await verifyArchive(hostile)).toEqual({
      ok: false,
      code: "INVALID_ARCHIVE",
      message: "Archive validation failed unexpectedly.",
    });
  });
});
