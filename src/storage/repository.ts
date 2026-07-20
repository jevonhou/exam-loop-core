export interface Repository<T> {
  read(): Promise<T>;
  write(value: T): Promise<void>;
}

export interface SnapshotDescriptor {
  readonly id: string;
  readonly createdAt: string;
}

export interface SnapshotStore<T> {
  create(value: T): Promise<SnapshotDescriptor>;
  read(id: string): Promise<T | undefined>;
  delete(id: string): Promise<boolean>;
}
