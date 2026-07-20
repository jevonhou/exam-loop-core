import { describe, expect, it } from "vitest";

import { restoreAtomically } from "./atomicRestore.js";
import { MemoryRepository, MemorySnapshotStore } from "./memory.js";
import type { Repository, SnapshotStore } from "./repository.js";

interface State {
  readonly value: string;
}

class MutatingFailOnceRepository implements Repository<State> {
  value: State;
  writeCount = 0;

  constructor(initialValue: State) {
    this.value = initialValue;
  }

  async read(): Promise<State> {
    return structuredClone(this.value);
  }

  async write(value: State): Promise<void> {
    this.writeCount += 1;
    this.value = structuredClone(value);
    if (this.writeCount === 1) {
      throw new Error("simulated partial write");
    }
  }
}

class AlwaysFailingWriteRepository implements Repository<State> {
  constructor(readonly value: State) {}

  async read(): Promise<State> {
    return structuredClone(this.value);
  }

  async write(_value: State): Promise<void> {
    throw new Error("storage unavailable");
  }
}

describe("restoreAtomically", () => {
  it("stores a safety snapshot before replacing the repository value", async () => {
    const repository = new MemoryRepository<State>({ value: "before" });
    const snapshots = new MemorySnapshotStore<State>({
      now: () => new Date(CREATED_AT),
      createId: () => "before-restore",
    });

    const result = await restoreAtomically({
      repository,
      snapshots,
      value: { value: "after" },
    });

    expect(result).toMatchObject({
      ok: true,
      code: "RESTORED",
      snapshot: { id: "before-restore", createdAt: CREATED_AT },
    });
    expect(await repository.read()).toEqual({ value: "after" });
    expect(await snapshots.read("before-restore")).toEqual({ value: "before" });
  });

  it("rolls back a failed write even when the failed write mutated state", async () => {
    const repository = new MutatingFailOnceRepository({ value: "before" });
    const snapshots = new MemorySnapshotStore<State>();

    const result = await restoreAtomically({
      repository,
      snapshots,
      value: { value: "after" },
    });

    expect(result).toMatchObject({
      ok: false,
      code: "WRITE_FAILED_ROLLED_BACK",
      cause: "simulated partial write",
    });
    expect(repository.value).toEqual({ value: "before" });
    expect(repository.writeCount).toBe(2);
  });

  it("reports when both the restore and rollback writes fail", async () => {
    const repository = new AlwaysFailingWriteRepository({ value: "before" });
    const snapshots = new MemorySnapshotStore<State>();

    const result = await restoreAtomically({
      repository,
      snapshots,
      value: { value: "after" },
    });

    expect(result).toMatchObject({
      ok: false,
      code: "WRITE_FAILED_ROLLBACK_FAILED",
      cause: "storage unavailable",
      rollbackCause: "storage unavailable",
    });
  });

  it("does not write when reading the current value fails", async () => {
    let writeCalled = false;
    const repository: Repository<State> = {
      read: () => Promise.reject(new Error("read denied")),
      write: () => {
        writeCalled = true;
        return Promise.resolve();
      },
    };

    const result = await restoreAtomically({
      repository,
      snapshots: new MemorySnapshotStore<State>(),
      value: { value: "after" },
    });

    expect(result).toEqual({
      ok: false,
      code: "READ_FAILED",
      message: "Restore did not start because the current value could not be read.",
      cause: "read denied",
    });
    expect(writeCalled).toBe(false);
  });

  it("does not write when the safety snapshot cannot be stored", async () => {
    let writeCalled = false;
    const repository: Repository<State> = {
      read: () => Promise.resolve({ value: "before" }),
      write: () => {
        writeCalled = true;
        return Promise.resolve();
      },
    };
    const snapshots: SnapshotStore<State> = {
      create: () => Promise.reject(new Error("snapshot full")),
      read: () => Promise.resolve(undefined),
      delete: () => Promise.resolve(false),
    };

    const result = await restoreAtomically({
      repository,
      snapshots,
      value: { value: "after" },
    });

    expect(result).toEqual({
      ok: false,
      code: "SNAPSHOT_FAILED",
      message: "Restore did not start because the safety snapshot could not be created.",
      cause: "snapshot full",
    });
    expect(writeCalled).toBe(false);
  });
});

const CREATED_AT = "2026-07-20T09:30:00.000Z";
