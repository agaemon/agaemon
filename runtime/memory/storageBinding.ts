import { createHash } from "node:crypto";

import type { MemoryCommitment } from "./commitment.js";
import type {
  StoredMemoryRecord,
  StoredMemoryRecordVerificationResult,
} from "./storageAdapter.js";

export interface MemoryStorageBindingFile {
  path: string;
  sha256: string;
}

export interface MemoryStorageBindingRecord extends MemoryCommitment {
  publisher: string;
  storageURI: string;
}

export interface MemoryStorageBinding {
  schemaVersion: 1;
  deploymentManifest: MemoryStorageBindingFile;
  memoryIdLabel: string;
  record: MemoryStorageBindingRecord;
  verification: {
    ok: boolean;
  };
}

export interface CreateMemoryStorageBindingParams {
  deploymentManifestPath: string;
  deploymentManifestJson: string;
  memoryIdLabel: string;
  verification: StoredMemoryRecordVerificationResult;
}

export interface VerifyMemoryStorageBindingParams {
  binding: MemoryStorageBinding;
  deploymentManifestJson: string;
  verification: StoredMemoryRecordVerificationResult;
}

export interface MemoryStorageBindingVerification {
  passed: boolean;
  failures: string[];
}

export function createMemoryStorageBinding(params: CreateMemoryStorageBindingParams): MemoryStorageBinding {
  return {
    schemaVersion: 1,
    deploymentManifest: {
      path: params.deploymentManifestPath,
      sha256: sha256(params.deploymentManifestJson),
    },
    memoryIdLabel: params.memoryIdLabel,
    record: toBindingRecord(params.verification.record),
    verification: {
      ok: params.verification.ok,
    },
  };
}

export function verifyMemoryStorageBinding(
  params: VerifyMemoryStorageBindingParams,
): MemoryStorageBindingVerification {
  const failures: string[] = [];
  const expectedManifestHash = sha256(params.deploymentManifestJson);

  if (params.binding.deploymentManifest.sha256 !== expectedManifestHash) {
    failures.push("deployment manifest hash does not match storage binding");
  }
  if (params.binding.verification.ok !== true) {
    failures.push("storage binding verification must be ok");
  }
  if (params.verification.ok !== true) {
    failures.push("stored memory verification must be ok");
  }
  if (params.binding.record.publisher !== params.verification.record.publisher) {
    failures.push("storage binding publisher does not match verified record");
  }
  if (params.binding.record.storageURI !== params.verification.record.storageURI) {
    failures.push("storage binding URI does not match verified record");
  }
  if (params.binding.record.memoryId !== params.verification.record.memoryId) {
    failures.push("storage binding memory ID does not match verified record");
  }
  if (params.binding.record.merkleRoot !== params.verification.record.merkleRoot) {
    failures.push("storage binding merkle root does not match verified record");
  }
  if (params.binding.record.contentHash !== params.verification.record.contentHash) {
    failures.push("storage binding record does not match verified record");
  }
  if (params.binding.record.storageURIHash !== params.verification.record.storageURIHash) {
    failures.push("storage binding URI hash does not match verified record");
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}

function toBindingRecord(record: StoredMemoryRecord): MemoryStorageBindingRecord {
  return {
    publisher: record.publisher,
    memoryId: record.memoryId,
    merkleRoot: record.merkleRoot,
    contentHash: record.contentHash,
    storageURIHash: record.storageURIHash,
    storageURI: record.storageURI,
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
