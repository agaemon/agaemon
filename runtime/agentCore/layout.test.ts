import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const runtimeRoot = resolve(moduleDir, "..");

const scopedRuntimeFiles = [
  "account.ts",
  "account.test.ts",
  "directory.ts",
  "directory.test.ts",
  "coordination.ts",
  "coordination.test.ts",
  "profileMetadata.ts",
  "profileMetadata.test.ts",
];

const scopedCliFiles = [
  "account.ts",
  "accountSafetyCheck.ts",
  "directory.ts",
  "directorySafetyCheck.ts",
  "coordination.ts",
  "coordinationSafetyCheck.ts",
];

const oldRuntimeFiles = [
  "agentAccountOps.ts",
  "agentAccountOps.test.ts",
  "agentDirectory.ts",
  "agentDirectory.test.ts",
  "agentCoordination.ts",
  "agentCoordination.test.ts",
  "agentProfileMetadata.ts",
  "agentProfileMetadata.test.ts",
];

const oldCliFiles = [
  "baseAgentAccount.ts",
  "baseAgentAccountSafetyCheck.ts",
  "baseAgentDirectory.ts",
  "baseAgentDirectorySafetyCheck.ts",
  "baseAgentCoordination.ts",
  "baseAgentCoordinationSafetyCheck.ts",
];

const scopedPaths = [
  ...scopedRuntimeFiles.map((file) => resolve(moduleDir, file)),
  ...scopedCliFiles.map((file) => resolve(runtimeRoot, "cli/agentCore", file)),
];

const oldFlatPaths = [
  ...oldRuntimeFiles.map((file) => resolve(runtimeRoot, file)),
  ...oldCliFiles.map((file) => resolve(runtimeRoot, "cli", file)),
];

describe("agent core file layout", () => {
  it("keeps agent account, directory, coordination, and profile files in scoped directories with short filenames", async () => {
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
