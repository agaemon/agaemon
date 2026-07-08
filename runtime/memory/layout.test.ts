import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const runtimeRoot = resolve(moduleDir, "..");

const scopedRuntimeFiles = [
  "commitment.ts",
  "commitment.test.ts",
  "contentVerifier.ts",
  "contentVerifier.test.ts",
  "localStorage.ts",
  "localStorage.test.ts",
  "publisher.ts",
  "publisher.test.ts",
];

const scopedCliFiles = ["commit.ts", "store.ts", "safetyCheck.ts", "profile.ts", "profileVerify.ts"];

const oldRuntimeFiles = [
  "memoryCommitment.ts",
  "memoryCommitment.test.ts",
  "memoryContentVerifier.ts",
  "memoryContentVerifier.test.ts",
  "localMemoryStorage.ts",
  "localMemoryStorage.test.ts",
  "memoryPublisher.ts",
  "memoryPublisher.test.ts",
];

const oldCliFiles = [
  "baseMemoryCommit.ts",
  "baseMemoryStore.ts",
  "baseMemorySafetyCheck.ts",
  "baseAgentProfileMemory.ts",
  "baseAgentProfileMemoryVerify.ts",
];

const scopedPaths = [
  ...scopedRuntimeFiles.map((file) => resolve(moduleDir, file)),
  ...scopedCliFiles.map((file) => resolve(runtimeRoot, "cli/memory", file)),
];

const oldFlatPaths = [
  ...oldRuntimeFiles.map((file) => resolve(runtimeRoot, file)),
  ...oldCliFiles.map((file) => resolve(runtimeRoot, "cli", file)),
];

describe("memory runtime file layout", () => {
  it("keeps memory files in scoped directories with short filenames", async () => {
    await expect(Promise.all(scopedPaths.map(pathExists))).resolves.toEqual(scopedPaths.map(() => true));
    await expect(Promise.all(oldFlatPaths.map(pathExists))).resolves.toEqual(oldFlatPaths.map(() => false));
  });
});

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
