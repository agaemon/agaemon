import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { keccak256, stringToHex } from "viem";
import type { Hex } from "viem";

import type { MemoryCommitment } from "./commitment.js";

export interface LocalMemoryRecord extends MemoryCommitment {
  storageURI: string;
  filePath: string;
}

export interface StoreLocalMemoryContentParams {
  rootDir: string;
  memoryIdLabel: string;
  content: string;
}

export interface ReadLocalMemoryContentParams {
  rootDir: string;
  contentHash: Hex;
}

export async function storeLocalMemoryContent(params: StoreLocalMemoryContentParams): Promise<LocalMemoryRecord> {
  const contentHash = keccak256(stringToHex(params.content));
  const storageURI = `memory://local/${contentHash}`;
  const filePath = join(params.rootDir, `${contentHash}.txt`);

  await mkdir(params.rootDir, { recursive: true });
  await writeFile(filePath, params.content, "utf8");

  return {
    memoryId: keccak256(stringToHex(params.memoryIdLabel)),
    merkleRoot: contentHash,
    contentHash,
    storageURIHash: keccak256(stringToHex(storageURI)),
    storageURI,
    filePath,
  };
}

export async function readLocalMemoryContent(params: ReadLocalMemoryContentParams): Promise<string> {
  const filePath = join(params.rootDir, `${params.contentHash}.txt`);
  const content = await readFile(filePath, "utf8");
  const actualHash = keccak256(stringToHex(content));

  if (actualHash !== params.contentHash) {
    throw new Error("Local memory content hash mismatch");
  }

  return content;
}
