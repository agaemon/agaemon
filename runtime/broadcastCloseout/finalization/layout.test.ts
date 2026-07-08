import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const closeoutRoot = resolve(moduleDir, "..");
const runtimeRoot = resolve(closeoutRoot, "..");

const scopedRuntimeFiles = [
  "finalization/finalization.ts",
  "finalization/finalization.test.ts",
  "finalization/finalizationFixtures.test.ts",
  "finalization/finalizationVerify.ts",
  "finalization/finalizationVerify.test.ts",
  "status/status.ts",
  "status/status.test.ts",
  "status/statusFixtures.test.ts",
  "status/statusVerify.ts",
  "status/statusVerify.test.ts",
];

const scopedCliFiles = [
  "finalization/finalization.ts",
  "finalization/finalizationVerify.ts",
  "status/status.ts",
  "status/statusVerify.ts",
];

const oldRuntimeFiles = [
  "agentProposalExecutionBroadcastCloseoutFinalization.ts",
  "agentProposalExecutionBroadcastCloseoutFinalization.test.ts",
  "agentProposalExecutionBroadcastCloseoutFinalizationVerifier.ts",
  "agentProposalExecutionBroadcastCloseoutFinalizationVerifier.test.ts",
  "agentProposalExecutionBroadcastCloseoutFinalizationStatus.ts",
  "agentProposalExecutionBroadcastCloseoutFinalizationStatus.test.ts",
  "agentProposalExecutionBroadcastCloseoutFinalizationStatusVerifier.ts",
  "agentProposalExecutionBroadcastCloseoutFinalizationStatusVerifier.test.ts",
];

const oldCliFiles = [
  "baseAgentProposalExecutionBroadcastCloseoutFinalize.ts",
  "baseAgentProposalExecutionBroadcastCloseoutFinalizeVerify.ts",
  "baseAgentProposalExecutionBroadcastCloseoutFinalizeStatus.ts",
  "baseAgentProposalExecutionBroadcastCloseoutFinalizeStatusVerify.ts",
];

const oldFinalizationRootRuntimeFiles = [
  "finalization.ts",
  "finalization.test.ts",
  "finalizationVerify.ts",
  "finalizationVerify.test.ts",
  "status.ts",
  "status.test.ts",
  "statusVerify.ts",
  "statusVerify.test.ts",
];

const oldFinalizationRootCliFiles = [
  "finalization.ts",
  "finalizationVerify.ts",
  "status.ts",
  "statusVerify.ts",
];

const scopedPaths = [
  ...scopedRuntimeFiles.map((file) => resolve(moduleDir, file)),
  ...scopedCliFiles.map((file) => resolve(runtimeRoot, "cli/broadcastCloseout/finalization", file)),
];

const oldFlatPaths = [
  ...oldRuntimeFiles.map((file) => resolve(runtimeRoot, file)),
  ...oldCliFiles.map((file) => resolve(runtimeRoot, "cli", file)),
  ...oldFinalizationRootRuntimeFiles.map((file) => resolve(moduleDir, file)),
  ...oldFinalizationRootCliFiles.map((file) => resolve(runtimeRoot, "cli/broadcastCloseout/finalization", file)),
];

describe("broadcast closeout finalization file layout", () => {
  it("keeps finalization core files in scoped directories with short filenames", async () => {
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
