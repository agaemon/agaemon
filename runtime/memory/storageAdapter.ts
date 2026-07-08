import { readPublishedMemoryContent, verifyPublishedMemoryContent } from "./contentVerifier.js";
import { storeLocalMemoryContent } from "./localStorage.js";

import type { PublishedMemoryVerification } from "./contentVerifier.js";
import type { MemoryCommitment } from "./commitment.js";
import type { LocalMemoryRecord } from "./localStorage.js";

export type MemoryStorageAdapterName = "local";

export interface StoredMemoryRecord extends MemoryCommitment {
  publisher: MemoryStorageAdapterName;
  storageURI: string;
  filePath?: string | undefined;
}

export interface StoreMemoryRecordParams {
  memoryIdLabel: string;
  content: string;
}

export interface RetrieveMemoryRecordParams {
  storageURI: string;
}

export interface MemoryStorageAdapter {
  name: MemoryStorageAdapterName;
  store(params: StoreMemoryRecordParams): Promise<StoredMemoryRecord>;
  retrieve(params: RetrieveMemoryRecordParams): Promise<string>;
}

export interface LocalMemoryStorageAdapterParams {
  rootDir: string;
}

export interface VerifyStoredMemoryRecordParams {
  adapter: MemoryStorageAdapter;
  memoryIdLabel: string;
  record: StoredMemoryRecord;
}

export interface StoredMemoryRecordVerificationResult {
  ok: boolean;
  record: StoredMemoryRecord;
  content: string;
  verification: PublishedMemoryVerification;
}

export interface StoreAndVerifyMemoryRecordParams {
  adapter: MemoryStorageAdapter;
  memoryIdLabel: string;
  content: string;
}

export function createLocalMemoryStorageAdapter(params: LocalMemoryStorageAdapterParams): MemoryStorageAdapter {
  return {
    name: "local",
    async store(input) {
      const record = await storeLocalMemoryContent({
        rootDir: params.rootDir,
        memoryIdLabel: input.memoryIdLabel,
        content: input.content,
      });
      return toStoredMemoryRecord(record);
    },
    async retrieve(input) {
      return readPublishedMemoryContent({
        storageURI: input.storageURI,
        localRootDir: params.rootDir,
      });
    },
  };
}

export async function storeAndVerifyMemoryRecord(
  params: StoreAndVerifyMemoryRecordParams,
): Promise<StoredMemoryRecordVerificationResult> {
  const record = await params.adapter.store({
    memoryIdLabel: params.memoryIdLabel,
    content: params.content,
  });

  return verifyStoredMemoryRecord({
    adapter: params.adapter,
    memoryIdLabel: params.memoryIdLabel,
    record,
  });
}

export async function verifyStoredMemoryRecord(
  params: VerifyStoredMemoryRecordParams,
): Promise<StoredMemoryRecordVerificationResult> {
  const content = await retrieveStoredContent(params.adapter, params.record.storageURI);
  const verification = verifyPublishedMemoryContent({
    memoryIdLabel: params.memoryIdLabel,
    storageURI: params.record.storageURI,
    content,
    commitment: params.record,
  });

  if (!verification.ok) {
    throw new Error("Stored memory verification failed");
  }

  return {
    ok: true,
    record: params.record,
    content,
    verification,
  };
}

async function retrieveStoredContent(adapter: MemoryStorageAdapter, storageURI: string): Promise<string> {
  try {
    return await adapter.retrieve({ storageURI });
  } catch (error) {
    throw new Error(`Unable to retrieve stored memory content: ${errorMessage(error)}`);
  }
}

function toStoredMemoryRecord(record: LocalMemoryRecord): StoredMemoryRecord {
  return {
    publisher: "local",
    memoryId: record.memoryId,
    merkleRoot: record.merkleRoot,
    contentHash: record.contentHash,
    storageURIHash: record.storageURIHash,
    storageURI: record.storageURI,
    filePath: record.filePath,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
