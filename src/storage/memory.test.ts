import { describe, expect, it } from "vitest";

import { MemoryRepository, MemorySnapshotStore } from "./memory.js";

describe("memory adapters", () => {
  it("isolates repository values with structured clones", async () => {
    const initial = { nested: { count: 1 } };
    const repository = new MemoryRepository(initial);
    initial.nested.count = 9;

    const firstRead = await repository.read();
    firstRead.nested.count = 7;

    expect(await repository.read()).toEqual({ nested: { count: 1 } });
  });

  it("creates, lists, reads, and deletes isolated snapshots", async () => {
    const store = new MemorySnapshotStore<{ values: number[] }>({
      now: () => new Date("2026-07-20T09:30:00.000Z"),
      createId: (sequence) => `test-${sequence}`,
    });
    const value = { values: [1, 2] };

    const descriptor = await store.create(value);
    value.values.push(3);
    const loaded = await store.read(descriptor.id);
    loaded?.values.push(4);

    expect(await store.list()).toEqual([{ id: "test-1", createdAt: "2026-07-20T09:30:00.000Z" }]);
    expect(await store.read(descriptor.id)).toEqual({ values: [1, 2] });
    expect(await store.delete(descriptor.id)).toBe(true);
    expect(await store.read(descriptor.id)).toBeUndefined();
  });

  it("rejects duplicate generated snapshot ids", async () => {
    const store = new MemorySnapshotStore<number>({ createId: () => "duplicate" });

    await store.create(1);
    await expect(store.create(2)).rejects.toThrow("Snapshot id already exists");
  });
});
