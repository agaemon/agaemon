import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const runtimeRoot = resolve(moduleDir, "..");

const scopedRuntimeFiles = [
  "cliReportValidation.ts",
  "closeout/closeout.ts",
  "closeout/closeout.test.ts",
  "closeout/closeoutFixtures.test.ts",
  "closeout/closeoutVerify.ts",
  "closeout/closeoutVerify.test.ts",
  "fixtures/closeoutEvidence.ts",
  "status/status.ts",
  "status/status.test.ts",
  "status/statusFixtures.test.ts",
  "status/statusVerify.ts",
  "status/statusVerify.test.ts",
  "evidenceSet/set.ts",
  "evidenceSet/set.test.ts",
  "evidenceSet/evidenceSetFixtures.test.ts",
  "evidenceSet/verify.ts",
  "evidenceSet/verify.test.ts",
  "evidenceSet/summary.ts",
  "evidenceSet/summary.test.ts",
  "evidenceSet/summaryFixtures.test.ts",
  "evidenceSet/summaryVerify.ts",
  "evidenceSet/summaryVerify.test.ts",
  "evidenceSet/summaryVerifyFixtures.test.ts",
];

const scopedCliFiles = [
  "closeout/closeout.ts",
  "closeout/closeoutVerify.ts",
  "status/status.ts",
  "status/statusVerify.ts",
  "evidenceSet/verify.ts",
  "evidenceSet/summary.ts",
  "evidenceSet/summaryVerify.ts",
];

const oldRuntimeFiles = [
  "agentProposalExecutionBroadcastCloseout.ts",
  "agentProposalExecutionBroadcastCloseout.test.ts",
  "agentProposalExecutionBroadcastCloseoutVerifier.ts",
  "agentProposalExecutionBroadcastCloseoutVerifier.test.ts",
  "agentProposalExecutionBroadcastCloseoutStatus.ts",
  "agentProposalExecutionBroadcastCloseoutStatus.test.ts",
  "agentProposalExecutionBroadcastCloseoutStatusVerifier.ts",
  "agentProposalExecutionBroadcastCloseoutStatusVerifier.test.ts",
  "agentProposalExecutionBroadcastCloseoutEvidenceSet.ts",
  "agentProposalExecutionBroadcastCloseoutEvidenceSet.test.ts",
  "agentProposalExecutionBroadcastCloseoutEvidenceSetVerifier.ts",
  "agentProposalExecutionBroadcastCloseoutEvidenceSetVerifier.test.ts",
  "agentProposalExecutionBroadcastCloseoutEvidenceSetSummary.ts",
  "agentProposalExecutionBroadcastCloseoutEvidenceSetSummary.test.ts",
  "agentProposalExecutionBroadcastCloseoutEvidenceSetSummaryVerifier.ts",
  "agentProposalExecutionBroadcastCloseoutEvidenceSetSummaryVerifier.test.ts",
];

const oldCliFiles = [
  "baseAgentProposalExecutionBroadcastCloseout.ts",
  "baseAgentProposalExecutionBroadcastCloseoutVerify.ts",
  "baseAgentProposalExecutionBroadcastCloseoutStatus.ts",
  "baseAgentProposalExecutionBroadcastCloseoutStatusVerify.ts",
  "baseAgentProposalExecutionBroadcastCloseoutEvidenceSetVerify.ts",
  "baseAgentProposalExecutionBroadcastCloseoutEvidenceSetSummary.ts",
  "baseAgentProposalExecutionBroadcastCloseoutEvidenceSetSummaryVerify.ts",
];

const oldCloseoutRootRuntimeFiles = [
  "closeout.ts",
  "closeout.test.ts",
  "closeoutVerify.ts",
  "closeoutVerify.test.ts",
  "evidenceSet.ts",
  "evidenceSet.test.ts",
  "evidenceSetVerify.ts",
  "evidenceSetVerify.test.ts",
  "evidenceSetSummary.ts",
  "evidenceSetSummary.test.ts",
  "evidenceSetSummaryVerify.ts",
  "evidenceSetSummaryVerify.test.ts",
  "status.ts",
  "status.test.ts",
  "statusVerify.ts",
  "statusVerify.test.ts",
];

const oldCloseoutRootCliFiles = [
  "closeout.ts",
  "closeoutVerify.ts",
  "evidenceSetVerify.ts",
  "evidenceSetSummary.ts",
  "evidenceSetSummaryVerify.ts",
  "status.ts",
  "statusVerify.ts",
];

const scopedPaths = [
  ...scopedRuntimeFiles.map((file) => resolve(moduleDir, file)),
  ...scopedCliFiles.map((file) => resolve(runtimeRoot, "cli/broadcastCloseout", file)),
];

const oldFlatPaths = [
  ...oldRuntimeFiles.map((file) => resolve(runtimeRoot, file)),
  ...oldCliFiles.map((file) => resolve(runtimeRoot, "cli", file)),
  ...oldCloseoutRootRuntimeFiles.map((file) => resolve(moduleDir, file)),
  ...oldCloseoutRootCliFiles.map((file) => resolve(runtimeRoot, "cli/broadcastCloseout", file)),
];

describe("broadcast closeout core file layout", () => {
  it("keeps closeout core files in scoped directories with short filenames", async () => {
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
