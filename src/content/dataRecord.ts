export type PlainDataRecord = Record<string, unknown>;

/**
 * Creates a shallow snapshot without invoking property getters. Only plain,
 * enumerable, string-keyed data records cross the untrusted-input boundary.
 */
export function copyPlainDataRecord(value: unknown): PlainDataRecord | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  try {
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return undefined;
    }

    const copy = Object.create(null) as PlainDataRecord;
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") {
        return undefined;
      }

      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
        return undefined;
      }

      Object.defineProperty(copy, key, {
        configurable: true,
        enumerable: true,
        value: descriptor.value,
        writable: true,
      });
    }

    return copy;
  } catch {
    return undefined;
  }
}
