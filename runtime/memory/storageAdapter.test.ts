import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createLocalMemoryStorageAdapter,
  storeAndVerifyMemoryRecord,
  verifyStoredMemoryRecord,
} from "./storageAdapter.js";

describe("createLocalMemoryStorageAdapter", () => {
  it("stores and verifies a local memory record from the same content hash", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "agentos-memory-adapter-"));
    const adapter = createLocalMemoryStorageAdapter({ rootDir });

    const result = await storeAndVerifyMemoryRecord({
      adapter,
      memoryIdLabel: "agentos.memory.adapter",
      content: "AgentOS durable memory adapter test",
    });

    expect(result.ok).toBe(true);
    expect(result.record.publisher).toBe("local");
    expect(result.record.storageURI).toBe(`memory://local/${result.record.contentHash}`);
    expect(result.content).toBe("AgentOS durable memory adapter test");
    expect(result.verification.checks).toEqual({
      memoryIdMatches: true,
      merkleRootMatches: true,
      contentHashMatches: true,
      storageURIHashMatches: true,
    });
  });

  it("fails verification when local content is missing", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "agentos-memory-adapter-"));
    const adapter = createLocalMemoryStorageAdapter({ rootDir });

    await expect(
      verifyStoredMemoryRecord({
        adapter,
        memoryIdLabel: "agentos.memory.adapter",
        record: {
          publisher: "local",
          storageURI: `memory://local/0x${"11".repeat(32)}`,
          memoryId: `0x${"22".repeat(32)}`,
          merkleRoot: `0x${"33".repeat(32)}`,
          contentHash: `0x${"11".repeat(32)}`,
          storageURIHash: `0x${"44".repeat(32)}`,
        },
      }),
    ).rejects.toThrow("Unable to retrieve stored memory content");
  });

  it("fails verification when local content is tampered", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "agentos-memory-adapter-"));
    const adapter = createLocalMemoryStorageAdapter({ rootDir });
    const stored = await adapter.store({
      memoryIdLabel: "agentos.memory.adapter",
      content: "original content",
    });

    await writeFile(join(rootDir, `${stored.contentHash}.txt`), "tampered content", "utf8");

    await expect(
      verifyStoredMemoryRecord({
        adapter,
        memoryIdLabel: "agentos.memory.adapter",
        record: stored,
      }),
    ).rejects.toThrow("Unable to retrieve stored memory content");
  });
});
