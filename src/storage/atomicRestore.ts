import type { Repository, SnapshotDescriptor, SnapshotStore } from "./repository.js";

export interface AtomicRestoreOptions<T> {
  readonly repository: Repository<T>;
  readonly snapshots: SnapshotStore<T>;
  readonly value: T;
}

export type AtomicRestoreResult =
  | {
      readonly ok: true;
      readonly code: "RESTORED";
      readonly message: string;
      readonly snapshot: SnapshotDescriptor;
    }
  | {
      readonly ok: false;
      readonly code: "READ_FAILED" | "SNAPSHOT_FAILED";
      readonly message: string;
      readonly cause: string;
    }
  | {
      readonly ok: false;
      readonly code: "WRITE_FAILED_ROLLED_BACK";
      readonly message: string;
      readonly cause: string;
      readonly snapshot: SnapshotDescriptor;
    }
  | {
      readonly ok: false;
      readonly code: "WRITE_FAILED_ROLLBACK_FAILED";
      readonly message: string;
      readonly cause: string;
      readonly rollbackCause: string;
      readonly snapshot: SnapshotDescriptor;
    };

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

/**
 * Replaces repository state using a compensating transaction.
 *
 * The current value is captured before the write. If the write rejects, the
 * helper immediately attempts to write the captured value back. A failed
 * rollback is reported explicitly because the repository state is then
 * unknown and must be inspected by the caller.
 */
export async function restoreAtomically<T>(
  options: AtomicRestoreOptions<T>,
): Promise<AtomicRestoreResult> {
  let previousValue: T;

  try {
    previousValue = await options.repository.read();
  } catch (error) {
    return {
      ok: false,
      code: "READ_FAILED",
      message: "Restore did not start because the current value could not be read.",
      cause: describeError(error),
    };
  }

  let snapshot: SnapshotDescriptor;

  try {
    snapshot = await options.snapshots.create(previousValue);
  } catch (error) {
    return {
      ok: false,
      code: "SNAPSHOT_FAILED",
      message: "Restore did not start because the safety snapshot could not be created.",
      cause: describeError(error),
    };
  }

  try {
    await options.repository.write(options.value);
    return {
      ok: true,
      code: "RESTORED",
      message: "The value was restored and the previous value remains available as a snapshot.",
      snapshot,
    };
  } catch (error) {
    const cause = describeError(error);

    try {
      await options.repository.write(previousValue);
      return {
        ok: false,
        code: "WRITE_FAILED_ROLLED_BACK",
        message: "The restore write failed, so the previous value was written back successfully.",
        cause,
        snapshot,
      };
    } catch (rollbackError) {
      return {
        ok: false,
        code: "WRITE_FAILED_ROLLBACK_FAILED",
        message: "Both the restore write and rollback failed; repository state is unknown.",
        cause,
        rollbackCause: describeError(rollbackError),
        snapshot,
      };
    }
  }
}
