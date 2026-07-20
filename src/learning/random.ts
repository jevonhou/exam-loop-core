export type RandomSeed = string | number;

/** Returns a floating-point number in the half-open range [0, 1). */
export type RandomSource = () => number;

function hashSeed(seed: RandomSeed): number {
  const value = String(seed);
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

/**
 * Creates a small deterministic PRNG suitable for repeatable planning and
 * tests. It is not intended for cryptographic or security-sensitive uses.
 */
export function createSeededRandom(seed: RandomSeed): RandomSource {
  if (
    (typeof seed !== "string" && typeof seed !== "number") ||
    (typeof seed === "number" && !Number.isFinite(seed))
  ) {
    throw new TypeError("seed must be a string or finite number");
  }

  let state = hashSeed(seed);

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function nextRandomIndex(length: number, random: RandomSource): number {
  if (!Number.isSafeInteger(length) || length <= 0) {
    throw new RangeError("length must be a positive safe integer");
  }

  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError("random source must return a finite number in [0, 1)");
  }

  return Math.floor(value * length);
}

/** Returns a shuffled copy without mutating the input. */
export function shuffle<T>(values: readonly T[], random: RandomSource): T[] {
  const result = [...values];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = nextRandomIndex(index + 1, random);
    const currentValue = result[index];
    const targetValue = result[target];

    if (currentValue === undefined || targetValue === undefined) {
      throw new Error("shuffle encountered an unexpected sparse array");
    }

    result[index] = targetValue;
    result[target] = currentValue;
  }

  return result;
}
