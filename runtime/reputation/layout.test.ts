import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const runtimeRoot = resolve(moduleDir, "..");

const scopedRuntimeFiles = [
  "registry.ts",
  "registry.test.ts",
  "history.ts",
  "history.test.ts",
  "scoreSync.ts",
  "scoreSync.test.ts",
];

const scopedCliFiles = [
  "registry.ts",
  "registrySafetyCheck.ts",
  "history.ts",
  "historySafetyCheck.ts",
  "scoreSync.ts",
  "scoreSyncSafetyCheck.ts",
];

const oldRuntimeFiles = [
  "reputation.ts",
  "reputation.test.ts",
  "reputationHistory.ts",
  "reputationHistory.test.ts",
  "reputationScoreSync.ts",
  "reputationScoreSync.test.ts",
];

const oldCliFiles = [
  "baseReputation.ts",
  "baseReputationSafetyCheck.ts",
  "baseReputationHistory.ts",
  "baseReputationHistorySafetyCheck.ts",
  "baseReputationScoreSync.ts",
  "baseReputationScoreSyncSafetyCheck.ts",
];

const scopedPaths = [
  ...scopedRuntimeFiles.map((file) => resolve(moduleDir, file)),
  ...scopedCliFiles.map((file) => resolve(runtimeRoot, "cli/reputation", file)),
];

const oldFlatPaths = [
  ...oldRuntimeFiles.map((file) => resolve(runtimeRoot, file)),
  ...oldCliFiles.map((file) => resolve(runtimeRoot, "cli", file)),
];

describe("reputation runtime file layout", () => {
  it("keeps reputation files in scoped directories with short filenames", async () => {
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
