import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const runtimeRoot = resolve(moduleDir, "..");

const scopedRuntimeFiles = [
  "cliReportValidation.ts",
  "preflight.ts",
  "preflight.test.ts",
  "package.ts",
  "package.test.ts",
  "packagePreflightFixtures.test.ts",
  "packageVerify.ts",
  "packageVerify.test.ts",
  "submit.ts",
  "submit.test.ts",
  "submitReceiptFixtures.test.ts",
  "receipt.ts",
  "receipt.test.ts",
  "receiptVerify.ts",
  "receiptVerify.test.ts",
  "report.ts",
  "report.test.ts",
  "reportArchiveFixtures.test.ts",
  "reportVerify.ts",
  "reportVerify.test.ts",
  "archive.ts",
  "archive.test.ts",
  "archiveVerify.ts",
  "archiveVerify.test.ts",
];

const scopedCliFiles = [
  "preflight.ts",
  "package.ts",
  "packageVerify.ts",
  "submit.ts",
  "receiptVerify.ts",
  "report.ts",
  "reportVerify.ts",
  "archive.ts",
  "archiveVerify.ts",
];

const oldRuntimeFiles = [
  "agentProposalExecutionBroadcastPreflight.ts",
  "agentProposalExecutionBroadcastPreflight.test.ts",
  "agentProposalExecutionBroadcastPackage.ts",
  "agentProposalExecutionBroadcastPackage.test.ts",
  "agentProposalExecutionBroadcastPackageVerifier.ts",
  "agentProposalExecutionBroadcastPackageVerifier.test.ts",
  "agentProposalExecutionBroadcastSubmit.ts",
  "agentProposalExecutionBroadcastSubmit.test.ts",
  "agentProposalExecutionBroadcastReceipt.ts",
  "agentProposalExecutionBroadcastReceipt.test.ts",
  "agentProposalExecutionBroadcastReceiptVerifier.ts",
  "agentProposalExecutionBroadcastReceiptVerifier.test.ts",
  "agentProposalExecutionBroadcastReport.ts",
  "agentProposalExecutionBroadcastReport.test.ts",
  "agentProposalExecutionBroadcastReportVerifier.ts",
  "agentProposalExecutionBroadcastReportVerifier.test.ts",
  "agentProposalExecutionBroadcastArchive.ts",
  "agentProposalExecutionBroadcastArchive.test.ts",
  "agentProposalExecutionBroadcastArchiveVerifier.ts",
  "agentProposalExecutionBroadcastArchiveVerifier.test.ts",
];

const oldCliFiles = [
  "baseAgentProposalExecutionBroadcastPreflight.ts",
  "baseAgentProposalExecutionBroadcastPackage.ts",
  "baseAgentProposalExecutionBroadcastPackageVerify.ts",
  "baseAgentProposalExecutionBroadcastSubmit.ts",
  "baseAgentProposalExecutionBroadcastReceiptVerify.ts",
  "baseAgentProposalExecutionBroadcastReport.ts",
  "baseAgentProposalExecutionBroadcastReportVerify.ts",
  "baseAgentProposalExecutionBroadcastArchive.ts",
  "baseAgentProposalExecutionBroadcastArchiveVerify.ts",
];

const scopedPaths = [
  ...scopedRuntimeFiles.map((file) => resolve(moduleDir, file)),
  ...scopedCliFiles.map((file) => resolve(runtimeRoot, "cli/broadcast", file)),
];

const oldFlatPaths = [
  ...oldRuntimeFiles.map((file) => resolve(runtimeRoot, file)),
  ...oldCliFiles.map((file) => resolve(runtimeRoot, "cli", file)),
];

describe("broadcast file layout", () => {
  it("keeps first-slice broadcast files in scoped directories with short filenames", async () => {
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
