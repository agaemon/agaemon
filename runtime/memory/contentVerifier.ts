import type { Hex } from "viem";

import { readLocalMemoryContent } from "./localStorage.js";
import { createSingleLeafMemoryCommitment } from "./commitment.js";
import type { MemoryCommitment } from "./commitment.js";

export interface ReadPublishedMemoryContentParams {
  storageURI: string;
  localRootDir?: string | undefined;
  ipfsGatewayUrl?: string | undefined;
}

export interface VerifyPublishedMemoryContentParams {
  memoryIdLabel: string;
  storageURI: string;
  content: string;
  commitment: MemoryCommitment;
}

export interface PublishedMemoryVerification {
  ok: boolean;
  computed: MemoryCommitment;
  expected: MemoryCommitment;
  checks: {
    memoryIdMatches: boolean;
    merkleRootMatches: boolean;
    contentHashMatches: boolean;
    storageURIHashMatches: boolean;
  };
}

export async function readPublishedMemoryContent(params: ReadPublishedMemoryContentParams): Promise<string> {
  if (params.storageURI.startsWith("memory://local/")) {
    const localRootDir = params.localRootDir;
    if (localRootDir === undefined || localRootDir.length === 0) {
      throw new Error("LOCAL_MEMORY_STORAGE_DIR is required for memory://local content");
    }

    return readLocalMemoryContent({
      rootDir: localRootDir,
      contentHash: parseLocalMemoryContentHash(params.storageURI),
    });
  }

  if (params.storageURI.startsWith("ipfs://")) {
    const gatewayUrl = params.ipfsGatewayUrl;
    if (gatewayUrl === undefined || gatewayUrl.length === 0) {
      throw new Error("IPFS_GATEWAY_URL is required for ipfs:// content");
    }

    const response = await fetch(createIpfsGatewayUrl(gatewayUrl, params.storageURI.slice("ipfs://".length)));
    if (!response.ok) {
      throw new Error(`IPFS gateway fetch failed: ${response.status} ${await response.text()}`);
    }
    return response.text();
  }

  throw new Error(`Unsupported memory storage URI: ${params.storageURI}`);
}

export function verifyPublishedMemoryContent(
  params: VerifyPublishedMemoryContentParams,
): PublishedMemoryVerification {
  const computed = createSingleLeafMemoryCommitment({
    memoryIdLabel: params.memoryIdLabel,
    content: params.content,
    storageURI: params.storageURI,
  });
  const checks = {
    memoryIdMatches: computed.memoryId === params.commitment.memoryId,
    merkleRootMatches: computed.merkleRoot === params.commitment.merkleRoot,
    contentHashMatches: computed.contentHash === params.commitment.contentHash,
    storageURIHashMatches: computed.storageURIHash === params.commitment.storageURIHash,
  };

  return {
    ok: Object.values(checks).every(Boolean),
    computed,
    expected: params.commitment,
    checks,
  };
}

function parseLocalMemoryContentHash(storageURI: string): Hex {
  const contentHash = storageURI.slice("memory://local/".length);
  if (!/^0x[0-9a-fA-F]{64}$/.test(contentHash)) {
    throw new Error(`Invalid local memory content hash: ${contentHash}`);
  }
  return contentHash as Hex;
}

function createIpfsGatewayUrl(gatewayUrl: string, cid: string): string {
  return `${gatewayUrl.replace(/\/+$/, "")}/${cid}`;
}
