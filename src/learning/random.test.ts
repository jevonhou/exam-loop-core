import { describe, expect, it } from "vitest";

import { createSeededRandom, nextRandomIndex, shuffle } from "./random.js";

describe("createSeededRandom", () => {
  it("replays the same sequence for the same string seed", () => {
    const first = createSeededRandom("stable-seed");
    const second = createSeededRandom("stable-seed");

    expect([first(), first(), first(), first()]).toEqual([second(), second(), second(), second()]);
  });

  it("accepts numeric seeds and produces values in [0, 1)", () => {
    const random = createSeededRandom(42);
    const values = Array.from({ length: 50 }, () => random());

    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
  });

  it("rejects non-finite and non-primitive seeds at the runtime boundary", () => {
    expect(() => createSeededRandom(Number.NaN)).toThrow(/string or finite number/);
    expect(() => createSeededRandom({} as never)).toThrow(/string or finite number/);
  });
});

describe("random collection helpers", () => {
  it("shuffles without mutating its input", () => {
    const input = [1, 2, 3, 4];
    const result = shuffle(input, createSeededRandom("order"));

    expect(input).toEqual([1, 2, 3, 4]);
    expect([...result].sort()).toEqual(input);
  });

  it("rejects random sources outside the documented range", () => {
    expect(() => nextRandomIndex(2, () => 1)).toThrow(/\[0, 1\)/);
    expect(() => nextRandomIndex(2, () => Number.NaN)).toThrow(/\[0, 1\)/);
    expect(() => nextRandomIndex(0, () => 0)).toThrow(/positive safe integer/);
  });

  it("fails closed when a sparse collection reaches the defensive branch", () => {
    const sparse = new Array<number>(2);
    sparse[0] = 1;

    expect(() => shuffle(sparse, () => 0)).toThrow(/unexpected sparse array/);
  });
});
