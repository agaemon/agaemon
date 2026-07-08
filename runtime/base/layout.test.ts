import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const runtimeRoot = resolve(moduleDir, "..");

const scopedRuntimeFiles = [
  "commandReferences.ts",
  "commandReferences.test.ts",
  "deploymentManifest.ts",
  "deploymentManifest.test.ts",
  "execution.ts",
  "execution.test.ts",
  "executionPolicySimulatorFixtures.test.ts",
  "localPreflight.ts",
  "localPreflight.test.ts",
  "localPreflightSummaryFixtures.test.ts",
  "manifestVerifier.ts",
  "manifestVerifier.test.ts",
  "manifestVerifierSummaryFixtures.test.ts",
  "packageScripts.ts",
  "packageScripts.test.ts",
  "readiness.ts",
  "readiness.test.ts",
  "readinessSummaryFixtures.test.ts",
  "checkpoint.ts",
  "checkpoint.test.ts",
  "checkpointSummaryFixtures.test.ts",
  "checkpointVerificationSummaryFixtures.test.ts",
];
const scopedCliFiles = [
  "execute.ts",
  "execute.test.ts",
  "localPreflight.ts",
  "localPreflight.test.ts",
  "manifestVerify.ts",
  "manifestVerify.test.ts",
  "readiness.ts",
  "readiness.test.ts",
  "checkpoint.ts",
  "checkpoint.test.ts",
  "checkpointVerify.ts",
  "checkpointVerify.test.ts",
];
const oldRuntimeFiles = [
  "deploymentManifest.ts",
  "deploymentManifest.test.ts",
  "baseSepoliaExecution.ts",
  "baseSepoliaExecution.test.ts",
  "localPreflight.ts",
  "localPreflight.test.ts",
  "deploymentManifestVerifier.ts",
  "deploymentManifestVerifier.test.ts",
  "baseReadiness.ts",
  "baseReadiness.test.ts",
  "readinessCheckpoint.ts",
  "readinessCheckpoint.test.ts",
];
const oldCliFiles = [
  "baseSepoliaExecute.ts",
  "baseLocalPreflight.ts",
  "baseManifestVerify.ts",
  "baseReadiness.ts",
  "baseReadinessCheckpoint.ts",
  "baseCheckpointVerify.ts",
];

const scopedPaths = [
  ...scopedRuntimeFiles.map((file) => resolve(moduleDir, file)),
  ...scopedCliFiles.map((file) => resolve(runtimeRoot, "cli/base", file)),
];

const oldFlatPaths = [
  ...oldRuntimeFiles.map((file) => resolve(runtimeRoot, file)),
  ...oldCliFiles.map((file) => resolve(runtimeRoot, "cli", file)),
];

describe("base runtime file layout", () => {
  it("keeps base runtime files in scoped base directories with short filenames", async () => {
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
