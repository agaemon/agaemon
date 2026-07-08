import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const runtimeRoot = resolve(moduleDir, "../../..");

const scopedPaths = [
  resolve(moduleDir, "package.ts"),
  resolve(moduleDir, "package.test.ts"),
  resolve(moduleDir, "packageFixtures.test.ts"),
  resolve(moduleDir, "packageVerify.ts"),
  resolve(moduleDir, "packageVerify.test.ts"),
  resolve(moduleDir, "status.ts"),
  resolve(moduleDir, "status.test.ts"),
  resolve(moduleDir, "statusFixtures.test.ts"),
  resolve(moduleDir, "statusVerify.ts"),
  resolve(moduleDir, "statusVerify.test.ts"),
  resolve(runtimeRoot, "cli/broadcastCloseout/finalizationArchive/statusSummaryPackage/package/package.ts"),
  resolve(runtimeRoot, "cli/broadcastCloseout/finalizationArchive/statusSummaryPackage/package/packageVerify.ts"),
  resolve(runtimeRoot, "cli/broadcastCloseout/finalizationArchive/statusSummaryPackage/status/status.ts"),
  resolve(runtimeRoot, "cli/broadcastCloseout/finalizationArchive/statusSummaryPackage/status/statusVerify.ts"),
];

const oldFlatPaths = [
  resolve(runtimeRoot, "agentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackage.ts"),
  resolve(runtimeRoot, "agentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackage.test.ts"),
  resolve(runtimeRoot, "agentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageVerifier.ts"),
  resolve(runtimeRoot, "agentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageVerifier.test.ts"),
  resolve(runtimeRoot, "agentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatus.ts"),
  resolve(runtimeRoot, "agentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatus.test.ts"),
  resolve(runtimeRoot, "agentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusVerifier.ts"),
  resolve(runtimeRoot, "agentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusVerifier.test.ts"),
  resolve(runtimeRoot, "cli/baseAgentProposalExecutionBroadcastCloseoutFinalizeArchiveStatusSummaryPackage.ts"),
  resolve(runtimeRoot, "cli/baseAgentProposalExecutionBroadcastCloseoutFinalizeArchiveStatusSummaryPackageVerify.ts"),
  resolve(runtimeRoot, "cli/baseAgentProposalExecutionBroadcastCloseoutFinalizeArchiveStatusSummaryPackageStatus.ts"),
  resolve(runtimeRoot, "cli/baseAgentProposalExecutionBroadcastCloseoutFinalizeArchiveStatusSummaryPackageStatusVerify.ts"),
  resolve(runtimeRoot, "cli/broadcastCloseout/finalizationArchive/statusSummaryPackage/package.ts"),
  resolve(runtimeRoot, "cli/broadcastCloseout/finalizationArchive/statusSummaryPackage/packageVerify.ts"),
  resolve(runtimeRoot, "cli/broadcastCloseout/finalizationArchive/statusSummaryPackage/status.ts"),
  resolve(runtimeRoot, "cli/broadcastCloseout/finalizationArchive/statusSummaryPackage/statusVerify.ts"),
];

describe("status summary package file layout", () => {
  it("keeps status summary package files in scoped directories with short filenames", async () => {
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
