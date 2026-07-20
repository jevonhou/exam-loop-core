import type { Repository, SnapshotDescriptor, SnapshotStore } from "./repository.js";

export type CloneValue<T> = (value: T) => T;

function cloneWithStructuredClone<T>(value: T): T {
  return structuredClone(value);
}

export interface MemoryRepositoryOptions<T> {
  readonly clone?: CloneValue<T>;
}

/**
 * An in-memory repository intended for tests, examples, and ephemeral tools.
 * It is not a persistence adapter.
 */
export class MemoryRepository<T> implements Repository<T> {
  readonly #clone: CloneValue<T>;
  #value: T;

  constructor(initialValue: T, options: MemoryRepositoryOptions<T> = {}) {
    this.#clone = options.clone ?? cloneWithStructuredClone;
    this.#value = this.#clone(initialValue);
  }

  async read(): Promise<T> {
    return this.#clone(this.#value);
  }

  async write(value: T): Promise<void> {
    this.#value = this.#clone(value);
  }
}

export interface MemorySnapshotStoreOptions<T> {
  readonly clone?: CloneValue<T>;
  readonly now?: () => Date;
  readonly createId?: (sequence: number) => string;
}

interface StoredSnapshot<T> {
  readonly descriptor: SnapshotDescriptor;
  readonly value: T;
}

/**
 * An in-memory snapshot store intended for tests, examples, and ephemeral tools.
 * Snapshots survive neither process restarts nor page reloads.
 */
export class MemorySnapshotStore<T> implements SnapshotStore<T> {
  readonly #clone: CloneValue<T>;
  readonly #now: () => Date;
  readonly #createId: (sequence: number) => string;
  readonly #snapshots = new Map<string, StoredSnapshot<T>>();
  #sequence = 0;

  constructor(options: MemorySnapshotStoreOptions<T> = {}) {
    this.#clone = options.clone ?? cloneWithStructuredClone;
    this.#now = options.now ?? (() => new Date());
    this.#createId = options.createId ?? ((sequence) => `snapshot-${sequence}`);
  }

  async create(value: T): Promise<SnapshotDescriptor> {
    this.#sequence += 1;
    const descriptor: SnapshotDescriptor = {
      id: this.#createId(this.#sequence),
      createdAt: this.#now().toISOString(),
    };

    if (this.#snapshots.has(descriptor.id)) {
      throw new Error(`Snapshot id already exists: ${descriptor.id}`);
    }

    this.#snapshots.set(descriptor.id, {
      descriptor,
      value: this.#clone(value),
    });

    return descriptor;
  }

  async read(id: string): Promise<T | undefined> {
    const snapshot = this.#snapshots.get(id);
    return snapshot === undefined ? undefined : this.#clone(snapshot.value);
  }

  async delete(id: string): Promise<boolean> {
    return this.#snapshots.delete(id);
  }

  async list(): Promise<readonly SnapshotDescriptor[]> {
    return [...this.#snapshots.values()].map(({ descriptor }) => descriptor);
  }
}
