import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const closeoutRoot = resolve(moduleDir, "..");
const runtimeRoot = resolve(closeoutRoot, "..");

const scopedRuntimeFiles = [
  "archive/archive.ts",
  "archive/archive.test.ts",
  "archive/archiveFixtures.test.ts",
  "archive/archiveVerify.ts",
  "archive/archiveVerify.test.ts",
  "status/status.ts",
  "status/status.test.ts",
  "status/statusFixtures.test.ts",
  "status/statusVerify.ts",
  "status/statusVerify.test.ts",
  "statusSummary/summary.ts",
  "statusSummary/summary.test.ts",
  "statusSummary/summaryFixtures.test.ts",
  "statusSummary/verify.ts",
  "statusSummary/verify.test.ts",
];

const scopedCliFiles = [
  "archive/archive.ts",
  "archive/archiveVerify.ts",
  "status/status.ts",
  "status/statusVerify.ts",
  "statusSummary/summary.ts",
  "statusSummary/verify.ts",
];

const oldRuntimeFiles = [
  "agentProposalExecutionBroadcastCloseoutFinalizationArchive.ts",
  "agentProposalExecutionBroadcastCloseoutFinalizationArchive.test.ts",
  "agentProposalExecutionBroadcastCloseoutFinalizationArchiveVerifier.ts",
  "agentProposalExecutionBroadcastCloseoutFinalizationArchiveVerifier.test.ts",
  "agentProposalExecutionBroadcastCloseoutFinalizationArchiveStatus.ts",
  "agentProposalExecutionBroadcastCloseoutFinalizationArchiveStatus.test.ts",
  "agentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusVerifier.ts",
  "agentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusVerifier.test.ts",
  "agentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummary.ts",
  "agentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummary.test.ts",
  "agentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryVerifier.ts",
  "agentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryVerifier.test.ts",
];

const oldCliFiles = [
  "baseAgentProposalExecutionBroadcastCloseoutFinalizeArchive.ts",
  "baseAgentProposalExecutionBroadcastCloseoutFinalizeArchiveVerify.ts",
  "baseAgentProposalExecutionBroadcastCloseoutFinalizeArchiveStatus.ts",
  "baseAgentProposalExecutionBroadcastCloseoutFinalizeArchiveStatusVerify.ts",
  "baseAgentProposalExecutionBroadcastCloseoutFinalizeArchiveStatusSummary.ts",
  "baseAgentProposalExecutionBroadcastCloseoutFinalizeArchiveStatusSummaryVerify.ts",
];

const oldFinalizationArchiveRootRuntimeFiles = [
  "archive.ts",
  "archive.test.ts",
  "archiveVerify.ts",
  "archiveVerify.test.ts",
  "status.ts",
  "status.test.ts",
  "statusVerify.ts",
  "statusVerify.test.ts",
  "statusSummary.ts",
  "statusSummary.test.ts",
  "statusSummaryVerify.ts",
  "statusSummaryVerify.test.ts",
];

const oldFinalizationArchiveRootCliFiles = [
  "archive.ts",
  "archiveVerify.ts",
  "status.ts",
  "statusVerify.ts",
  "statusSummary.ts",
  "statusSummaryVerify.ts",
];

const scopedPaths = [
  ...scopedRuntimeFiles.map((file) => resolve(moduleDir, file)),
  ...scopedCliFiles.map((file) => resolve(runtimeRoot, "cli/broadcastCloseout/finalizationArchive", file)),
];

const oldFlatPaths = [
  ...oldRuntimeFiles.map((file) => resolve(runtimeRoot, file)),
  ...oldCliFiles.map((file) => resolve(runtimeRoot, "cli", file)),
  ...oldFinalizationArchiveRootRuntimeFiles.map((file) => resolve(moduleDir, file)),
  ...oldFinalizationArchiveRootCliFiles.map((file) => resolve(runtimeRoot, "cli/broadcastCloseout/finalizationArchive", file)),
];

describe("broadcast closeout finalization archive file layout", () => {
  it("keeps finalization archive files in scoped directories with short filenames", async () => {
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
