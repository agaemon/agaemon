import type { MemoryStorageBinding } from "./storageBinding.js";

export interface VerifyMemoryStorageMigrationParams {
  from: MemoryStorageBinding;
  to: MemoryStorageBinding;
}

export interface MemoryStorageMigrationVerification {
  passed: boolean;
  failures: string[];
}

export function verifyMemoryStorageMigration(
  params: VerifyMemoryStorageMigrationParams,
): MemoryStorageMigrationVerification {
  const failures: string[] = [];

  if (params.from.verification.ok !== true) failures.push("source memory binding must be verified");
  if (params.to.verification.ok !== true) failures.push("target memory binding must be verified");
  if (params.from.memoryIdLabel !== params.to.memoryIdLabel) failures.push("memory migration label changed");
  if (params.from.record.memoryId !== params.to.record.memoryId) failures.push("memory migration memory ID changed");
  if (params.from.record.merkleRoot !== params.to.record.merkleRoot) {
    failures.push("memory migration merkle root changed");
  }
  if (params.from.record.contentHash !== params.to.record.contentHash) {
    failures.push("memory migration content hash changed");
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}
