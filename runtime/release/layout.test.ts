import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const runtimeRoot = resolve(moduleDir, "..");

const scopedRuntimeFiles = [
  "index.ts",
  "index.test.ts",
  "indexSummaryFixtures.test.ts",
  "status.ts",
  "status.test.ts",
  "statusSummaryFixtures.test.ts",
  "statusVerifierSummaryFixtures.test.ts",
  "summary.ts",
  "summary.test.ts",
  "summaryFixtures.test.ts",
  "note.ts",
  "note.test.ts",
  "noteSummaryFixtures.test.ts",
  "noteVerifier.ts",
  "noteVerifier.test.ts",
  "noteVerifierSummaryFixtures.test.ts",
  "automation.ts",
  "automation.test.ts",
  "automationFixtures.test.ts",
  "automationSummaryFixtures.test.ts",
];
const scopedCliFiles = [
  "index.ts",
  "index.test.ts",
  "status.ts",
  "status.test.ts",
  "statusVerify.ts",
  "statusVerify.test.ts",
  "summary.ts",
  "summary.test.ts",
  "note.ts",
  "note.test.ts",
  "noteVerify.ts",
  "noteVerify.test.ts",
  "automation.ts",
  "automation.test.ts",
];
const oldRuntimeFiles = [
  "releaseIndex.ts",
  "releaseIndex.test.ts",
  "releaseStatus.ts",
  "releaseStatus.test.ts",
  "releaseSummary.ts",
  "releaseSummary.test.ts",
  "releaseNote.ts",
  "releaseNote.test.ts",
  "releaseNoteVerifier.ts",
  "releaseNoteVerifier.test.ts",
  "releaseAutomation.ts",
  "releaseAutomation.test.ts",
];
const oldCliFiles = [
  "baseReleaseIndex.ts",
  "baseReleaseStatus.ts",
  "baseReleaseStatusVerify.ts",
  "baseReleaseSummary.ts",
  "baseReleaseNote.ts",
  "baseReleaseNoteVerify.ts",
  "baseReleaseAutomation.ts",
];

const scopedPaths = [
  ...scopedRuntimeFiles.map((file) => resolve(moduleDir, file)),
  ...scopedCliFiles.map((file) => resolve(runtimeRoot, "cli/release", file)),
];

const oldFlatPaths = [
  ...oldRuntimeFiles.map((file) => resolve(runtimeRoot, file)),
  ...oldCliFiles.map((file) => resolve(runtimeRoot, "cli", file)),
];

describe("release runtime file layout", () => {
  it("keeps release automation, note, index, status, and summary files in scoped release directories with short filenames", async () => {
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
