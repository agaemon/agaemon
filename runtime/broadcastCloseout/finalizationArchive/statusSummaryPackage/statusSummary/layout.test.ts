import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const runtimeRoot = resolve(moduleDir, "../../../..");

const scopedPaths = [
  resolve(moduleDir, "summary.ts"),
  resolve(moduleDir, "summary.test.ts"),
  resolve(moduleDir, "summaryFixtures.test.ts"),
  resolve(moduleDir, "verify.ts"),
  resolve(moduleDir, "verify.test.ts"),
  resolve(runtimeRoot, "cli/broadcastCloseout/finalizationArchive/statusSummaryPackage/statusSummary/summary.ts"),
  resolve(runtimeRoot, "cli/broadcastCloseout/finalizationArchive/statusSummaryPackage/statusSummary/verify.ts"),
];

const oldFlatPaths = [
  resolve(runtimeRoot, "agentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusSummary.ts"),
  resolve(runtimeRoot, "agentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusSummary.test.ts"),
  resolve(runtimeRoot, "agentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusSummaryVerifier.ts"),
  resolve(runtimeRoot, "agentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusSummaryVerifier.test.ts"),
  resolve(runtimeRoot, "cli/baseAgentProposalExecutionBroadcastCloseoutFinalizeArchiveStatusSummaryPackageStatusSummary.ts"),
  resolve(runtimeRoot, "cli/baseAgentProposalExecutionBroadcastCloseoutFinalizeArchiveStatusSummaryPackageStatusSummaryVerify.ts"),
  resolve(runtimeRoot, "cli/broadcastCloseout/finalizationArchive/statusSummaryPackage/statusSummary.ts"),
  resolve(runtimeRoot, "cli/broadcastCloseout/finalizationArchive/statusSummaryPackage/statusSummaryVerify.ts"),
];

describe("package status summary file layout", () => {
  it("keeps package status summary files in scoped directories with short filenames", async () => {
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
