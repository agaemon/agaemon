import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { keccak256, stringToHex } from "viem";
import { describe, expect, it } from "vitest";

import { readLocalMemoryContent, storeLocalMemoryContent } from "./localStorage.js";

describe("storeLocalMemoryContent", () => {
  it("writes content-addressed memory content and returns commitment hashes", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "agentos-memory-"));
    const content = "AgentOS local memory storage test";
    const expectedContentHash = keccak256(stringToHex(content));

    const stored = await storeLocalMemoryContent({
      rootDir,
      memoryIdLabel: "agentos.memory.local",
      content,
    });

    expect(stored.memoryId).toBe(keccak256(stringToHex("agentos.memory.local")));
    expect(stored.contentHash).toBe(expectedContentHash);
    expect(stored.merkleRoot).toBe(expectedContentHash);
    expect(stored.storageURI).toBe(`memory://local/${expectedContentHash}`);
    expect(stored.storageURIHash).toBe(keccak256(stringToHex(stored.storageURI)));
    expect(stored.filePath).toBe(join(rootDir, `${expectedContentHash}.txt`));

    await expect(readLocalMemoryContent({ rootDir, contentHash: stored.contentHash })).resolves.toBe(content);
  });

  it("rejects local memory content whose bytes no longer match its hash", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "agentos-memory-"));
    const stored = await storeLocalMemoryContent({
      rootDir,
      memoryIdLabel: "agentos.memory.local",
      content: "original content",
    });

    await writeFile(stored.filePath, "tampered content", "utf8");

    await expect(readLocalMemoryContent({ rootDir, contentHash: stored.contentHash })).rejects.toThrow(
      "Local memory content hash mismatch",
    );
  });
});
