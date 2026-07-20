export const ARCHIVE_FORMAT = "exam-loop/archive" as const;
export const ARCHIVE_VERSION = 1 as const;
export const ARCHIVE_CHECKSUM_ALGORITHM = "SHA-256" as const;

export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

/**
 * Recursively rejects values that cannot survive JSON serialization while
 * preserving the caller's object shape in the returned archive type.
 */
export type JsonCompatible<T> = T extends JsonPrimitive
  ? T
  : T extends readonly (infer TItem)[]
    ? readonly JsonCompatible<TItem>[]
    : T extends (...args: never[]) => unknown
      ? never
      : T extends object
        ? { readonly [TKey in keyof T]: JsonCompatible<T[TKey]> }
        : never;

export interface Archive<T = JsonValue> {
  readonly format: typeof ARCHIVE_FORMAT;
  readonly version: typeof ARCHIVE_VERSION;
  readonly createdAt: string;
  readonly checksumAlgorithm: typeof ARCHIVE_CHECKSUM_ALGORITHM;
  readonly checksum: string;
  readonly payload: T;
}

export type PayloadValidator<T> = (value: unknown) => value is T;

export interface CreateArchiveOptions {
  readonly createdAt?: Date | string;
}

export type ArchivePayloadKind = "array" | "boolean" | "null" | "number" | "object" | "string";

export interface ArchivePreview {
  readonly format: typeof ARCHIVE_FORMAT;
  readonly version: typeof ARCHIVE_VERSION;
  readonly createdAt: string;
  readonly checksumAlgorithm: typeof ARCHIVE_CHECKSUM_ALGORITHM;
  readonly checksum: string;
  readonly payloadKind: ArchivePayloadKind;
  readonly payloadBytes: number;
}

export type ArchiveErrorCode =
  | "INVALID_JSON"
  | "INVALID_ARCHIVE"
  | "INVALID_PAYLOAD"
  | "UNSUPPORTED_FORMAT"
  | "UNSUPPORTED_VERSION"
  | "UNSUPPORTED_ALGORITHM";

export class ArchiveParseError extends Error {
  readonly code: ArchiveErrorCode;

  constructor(code: ArchiveErrorCode, message: string) {
    super(message);
    this.name = "ArchiveParseError";
    this.code = code;
  }
}

export class ArchiveCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArchiveCryptoError";
  }
}

export type ArchiveVerification<T = JsonValue> =
  | {
      readonly ok: true;
      readonly archive: Archive<T>;
      readonly preview: ArchivePreview;
    }
  | {
      readonly ok: false;
      readonly code: ArchiveErrorCode | "CHECKSUM_MISMATCH" | "CRYPTO_UNAVAILABLE";
      readonly message: string;
      readonly preview?: ArchivePreview;
    };

const ARCHIVE_KEYS = [
  "checksum",
  "checksumAlgorithm",
  "createdAt",
  "format",
  "payload",
  "version",
] as const;

const HEX_SHA_256_PATTERN = /^[a-f0-9]{64}$/u;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertDataProperties(value: object, path: string): void {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === "symbol") {
      throw new ArchiveParseError(
        "INVALID_PAYLOAD",
        `${path} contains a symbol key and is not JSON data.`,
      );
    }

    if (Array.isArray(value) && key === "length") {
      continue;
    }

    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
      throw new ArchiveParseError(
        "INVALID_PAYLOAD",
        `${path}.${key} is not a plain enumerable data property.`,
      );
    }
  }
}

function assertJsonValueInternal(
  value: unknown,
  path: string,
  ancestors: Set<object>,
): asserts value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new ArchiveParseError("INVALID_PAYLOAD", `${path} contains a non-finite number.`);
    }
    return;
  }

  if (typeof value !== "object") {
    throw new ArchiveParseError(
      "INVALID_PAYLOAD",
      `${path} contains a value that JSON cannot represent.`,
    );
  }

  if (ancestors.has(value)) {
    throw new ArchiveParseError("INVALID_PAYLOAD", `${path} contains a circular reference.`);
  }

  if (!Array.isArray(value) && !isPlainRecord(value)) {
    throw new ArchiveParseError(
      "INVALID_PAYLOAD",
      `${path} must contain only arrays and plain objects.`,
    );
  }

  assertDataProperties(value, path);
  ancestors.add(value);

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!(index in value)) {
        throw new ArchiveParseError("INVALID_PAYLOAD", `${path}[${index}] is a sparse array slot.`);
      }
      assertJsonValueInternal(value[index], `${path}[${index}]`, ancestors);
    }

    const expectedKeys = new Set(Array.from({ length: value.length }, (_, index) => String(index)));
    for (const key of Object.keys(value)) {
      if (!expectedKeys.has(key)) {
        throw new ArchiveParseError(
          "INVALID_PAYLOAD",
          `${path}.${key} is an unsupported array property.`,
        );
      }
    }
  } else {
    for (const key of Object.keys(value)) {
      assertJsonValueInternal(value[key], `${path}.${key}`, ancestors);
    }
  }

  ancestors.delete(value);
}

export function assertJsonValue(value: unknown): asserts value is JsonValue {
  assertJsonValueInternal(value, "payload", new Set<object>());
}

function canonicalizeKnownJson(value: JsonValue): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeKnownJson(item)).join(",")}]`;
  }

  const members = Object.keys(value)
    .sort()
    .map((key) => {
      const item = value[key];
      if (item === undefined) {
        throw new ArchiveParseError("INVALID_PAYLOAD", `payload.${key} is undefined.`);
      }
      return `${JSON.stringify(key)}:${canonicalizeKnownJson(item)}`;
    });
  return `{${members.join(",")}}`;
}

export function canonicalizeJson(value: unknown): string {
  assertJsonValue(value);
  return canonicalizeKnownJson(value);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(canonicalizeJson(value)) as T;
}

function canonicalCreatedAt(value: Date | string | undefined): string {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) {
      throw new ArchiveParseError("INVALID_ARCHIVE", "createdAt is not a valid date.");
    }
    return value.toISOString();
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
      throw new ArchiveParseError(
        "INVALID_ARCHIVE",
        "createdAt must be an ISO 8601 UTC timestamp with milliseconds.",
      );
    }
    return value;
  }

  return new Date().toISOString();
}

function unsignedArchiveValue(archive: Omit<Archive<JsonValue>, "checksum">): JsonValue {
  return {
    format: archive.format,
    version: archive.version,
    createdAt: archive.createdAt,
    checksumAlgorithm: archive.checksumAlgorithm,
    payload: archive.payload,
  };
}

async function sha256Hex(value: string): Promise<string> {
  const cryptoValue: unknown = Reflect.get(globalThis, "crypto");
  if (typeof cryptoValue !== "object" || cryptoValue === null || !("subtle" in cryptoValue)) {
    throw new ArchiveCryptoError(
      "Web Crypto SubtleCrypto is required to calculate archive checksums.",
    );
  }

  const subtleValue: unknown = cryptoValue.subtle;
  if (
    typeof subtleValue !== "object" ||
    subtleValue === null ||
    !("digest" in subtleValue) ||
    typeof subtleValue.digest !== "function"
  ) {
    throw new ArchiveCryptoError(
      "Web Crypto SubtleCrypto is required to calculate archive checksums.",
    );
  }

  const bytes = new TextEncoder().encode(value);
  const digest = await (subtleValue as SubtleCrypto).digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseUnknownInput(input: unknown): unknown {
  if (typeof input !== "string") {
    return input;
  }

  try {
    return JSON.parse(input) as unknown;
  } catch {
    throw new ArchiveParseError("INVALID_JSON", "Archive text is not valid JSON.");
  }
}

function assertExactArchiveKeys(value: Record<string, unknown>): void {
  const keys = Object.keys(value).sort();
  if (
    keys.length !== ARCHIVE_KEYS.length ||
    keys.some((key, index) => key !== ARCHIVE_KEYS[index])
  ) {
    throw new ArchiveParseError(
      "INVALID_ARCHIVE",
      "Archive fields do not exactly match the supported format.",
    );
  }
}

function parseArchiveStructure(input: unknown): Archive<JsonValue> {
  const value = parseUnknownInput(input);
  if (!isPlainRecord(value)) {
    throw new ArchiveParseError("INVALID_ARCHIVE", "Archive must be a JSON object.");
  }

  assertDataProperties(value, "archive");
  assertExactArchiveKeys(value);

  if (typeof value.format !== "string") {
    throw new ArchiveParseError("INVALID_ARCHIVE", "Archive format must be a string.");
  }
  if (value.format !== ARCHIVE_FORMAT) {
    throw new ArchiveParseError(
      "UNSUPPORTED_FORMAT",
      `Unsupported archive format: ${value.format}`,
    );
  }

  if (typeof value.version !== "number" || !Number.isInteger(value.version)) {
    throw new ArchiveParseError("INVALID_ARCHIVE", "Archive version must be an integer.");
  }
  if (value.version !== ARCHIVE_VERSION) {
    throw new ArchiveParseError(
      "UNSUPPORTED_VERSION",
      `Unsupported archive version: ${value.version}`,
    );
  }

  if (typeof value.createdAt !== "string") {
    throw new ArchiveParseError("INVALID_ARCHIVE", "Archive createdAt must be a string.");
  }
  canonicalCreatedAt(value.createdAt);

  if (typeof value.checksumAlgorithm !== "string") {
    throw new ArchiveParseError("INVALID_ARCHIVE", "Archive checksumAlgorithm must be a string.");
  }
  if (value.checksumAlgorithm !== ARCHIVE_CHECKSUM_ALGORITHM) {
    throw new ArchiveParseError(
      "UNSUPPORTED_ALGORITHM",
      `Unsupported checksum algorithm: ${value.checksumAlgorithm}`,
    );
  }

  if (typeof value.checksum !== "string" || !HEX_SHA_256_PATTERN.test(value.checksum)) {
    throw new ArchiveParseError(
      "INVALID_ARCHIVE",
      "Archive checksum must be 64 lowercase hexadecimal characters.",
    );
  }

  assertJsonValue(value.payload);
  const payload = cloneJson(value.payload);

  return {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    createdAt: value.createdAt,
    checksumAlgorithm: ARCHIVE_CHECKSUM_ALGORITHM,
    checksum: value.checksum,
    payload,
  };
}

export async function createArchive<T>(
  payload: T & JsonCompatible<T>,
  options: CreateArchiveOptions = {},
): Promise<Archive<T>> {
  const clonedPayload = cloneJson(payload);
  const archiveWithoutChecksum: Omit<Archive<JsonValue>, "checksum"> = {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    createdAt: canonicalCreatedAt(options.createdAt),
    checksumAlgorithm: ARCHIVE_CHECKSUM_ALGORITHM,
    payload: clonedPayload as JsonValue,
  };
  const checksum = await sha256Hex(canonicalizeJson(unsignedArchiveValue(archiveWithoutChecksum)));

  return {
    ...archiveWithoutChecksum,
    checksum,
    payload: clonedPayload,
  };
}

export function serializeArchive(archive: unknown): string {
  return canonicalizeJson(parseArchiveStructure(archive));
}

export function parseArchive(input: unknown): Archive<JsonValue>;
export function parseArchive<T>(input: unknown, validatePayload: PayloadValidator<T>): Archive<T>;
export function parseArchive<T>(
  input: unknown,
  validatePayload?: PayloadValidator<T>,
): Archive<JsonValue> | Archive<T> {
  const archive = parseArchiveStructure(input);

  if (validatePayload !== undefined) {
    if (!validatePayload(archive.payload)) {
      throw new ArchiveParseError(
        "INVALID_PAYLOAD",
        "Archive payload does not satisfy the requested application schema.",
      );
    }
    return archive;
  }

  return archive;
}

function payloadKind(payload: JsonValue): ArchivePayloadKind {
  if (payload === null) {
    return "null";
  }
  if (Array.isArray(payload)) {
    return "array";
  }
  if (typeof payload === "string") {
    return "string";
  }
  if (typeof payload === "number") {
    return "number";
  }
  if (typeof payload === "boolean") {
    return "boolean";
  }
  return "object";
}

function createPreview(archive: Archive<JsonValue>): ArchivePreview {
  return {
    format: archive.format,
    version: archive.version,
    createdAt: archive.createdAt,
    checksumAlgorithm: archive.checksumAlgorithm,
    checksum: archive.checksum,
    payloadKind: payloadKind(archive.payload),
    payloadBytes: new TextEncoder().encode(canonicalizeJson(archive.payload)).byteLength,
  };
}

export function previewArchive(input: unknown): ArchivePreview {
  return createPreview(parseArchiveStructure(input));
}

export async function verifyArchive(input: unknown): Promise<ArchiveVerification<JsonValue>>;
export async function verifyArchive<T>(
  input: unknown,
  validatePayload: PayloadValidator<T>,
): Promise<ArchiveVerification<T>>;
export async function verifyArchive<T>(
  input: unknown,
  validatePayload?: PayloadValidator<T>,
): Promise<ArchiveVerification<JsonValue> | ArchiveVerification<T>> {
  let archive: Archive<JsonValue>;
  let preview: ArchivePreview;

  try {
    archive = parseArchiveStructure(input);
    preview = createPreview(archive);
  } catch (error) {
    if (error instanceof ArchiveParseError) {
      return {
        ok: false,
        code: error.code,
        message: error.message,
      };
    }
    return {
      ok: false,
      code: "INVALID_ARCHIVE",
      message: "Archive validation failed unexpectedly.",
    };
  }

  let expectedChecksum: string;
  try {
    const archiveWithoutChecksum: Omit<Archive<JsonValue>, "checksum"> = {
      format: archive.format,
      version: archive.version,
      createdAt: archive.createdAt,
      checksumAlgorithm: archive.checksumAlgorithm,
      payload: archive.payload,
    };
    expectedChecksum = await sha256Hex(
      canonicalizeJson(unsignedArchiveValue(archiveWithoutChecksum)),
    );
  } catch (error) {
    return {
      ok: false,
      code: "CRYPTO_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Archive checksum could not be calculated.",
      preview,
    };
  }

  if (expectedChecksum !== archive.checksum) {
    return {
      ok: false,
      code: "CHECKSUM_MISMATCH",
      message: "Archive checksum does not match its metadata and payload.",
      preview,
    };
  }

  if (validatePayload !== undefined && !validatePayload(archive.payload)) {
    return {
      ok: false,
      code: "INVALID_PAYLOAD",
      message: "Archive payload does not satisfy the requested application schema.",
      preview,
    };
  }

  return {
    ok: true,
    archive: archive as Archive<T>,
    preview,
  };
}
