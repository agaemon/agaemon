import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { keccak256, stringToHex } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";

import { storeLocalMemoryContent } from "./localStorage.js";
import { createSingleLeafMemoryCommitment } from "./commitment.js";
import { readPublishedMemoryContent, verifyPublishedMemoryContent } from "./contentVerifier.js";

describe("readPublishedMemoryContent", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads memory://local content by content hash", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "agentos-memory-verify-"));
    const stored = await storeLocalMemoryContent({
      rootDir,
      memoryIdLabel: "agentos.profile.verify",
      content: "AgentOS local verifier content",
    });

    await expect(
      readPublishedMemoryContent({
        storageURI: stored.storageURI,
        localRootDir: rootDir,
      }),
    ).resolves.toBe("AgentOS local verifier content");
  });

  it("reads ipfs:// content through the configured gateway", async () => {
    const fetchMock = vi.fn(async () => new Response("AgentOS IPFS verifier content", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      readPublishedMemoryContent({
        storageURI: "ipfs://bafyprofilecid",
        ipfsGatewayUrl: "https://gateway.example/ipfs/",
      }),
    ).resolves.toBe("AgentOS IPFS verifier content");

    expect(fetchMock).toHaveBeenCalledWith("https://gateway.example/ipfs/bafyprofilecid");
  });

  it("rejects unsupported storage URI schemes", async () => {
    await expect(
      readPublishedMemoryContent({
        storageURI: "ar://memory-id",
        localRootDir: "storage/memory",
      }),
    ).rejects.toThrow("Unsupported memory storage URI: ar://memory-id");
  });
});

describe("verifyPublishedMemoryContent", () => {
  it("reports ok when fetched content matches the expected commitment", () => {
    const content = "{\"profile\":true}\n";
    const storageURI = "ipfs://bafyprofilecid";
    const commitment = createSingleLeafMemoryCommitment({
      memoryIdLabel: "agentos.profile.verify",
      content,
      storageURI,
    });

    const result = verifyPublishedMemoryContent({
      memoryIdLabel: "agentos.profile.verify",
      storageURI,
      content,
      commitment,
    });

    expect(result.ok).toBe(true);
    expect(result.checks).toEqual({
      memoryIdMatches: true,
      merkleRootMatches: true,
      contentHashMatches: true,
      storageURIHashMatches: true,
    });
  });

  it("reports the mismatched commitment fields", () => {
    const content = "{\"profile\":true}\n";
    const storageURI = "ipfs://bafyprofilecid";
    const commitment = {
      ...createSingleLeafMemoryCommitment({
        memoryIdLabel: "agentos.profile.verify",
        content,
        storageURI: "ipfs://different-cid",
      }),
      contentHash: keccak256(stringToHex("different content")),
    };

    const result = verifyPublishedMemoryContent({
      memoryIdLabel: "agentos.profile.verify",
      storageURI,
      content,
      commitment,
    });

    expect(result.ok).toBe(false);
    expect(result.checks).toEqual({
      memoryIdMatches: true,
      merkleRootMatches: true,
      contentHashMatches: false,
      storageURIHashMatches: false,
    });
  });
});
