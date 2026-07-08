import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const runtimeRoot = resolve(moduleDir, "..");

const scopedRuntimeFiles = [
  "bundle.ts",
  "bundle.test.ts",
  "bundleVerify.ts",
  "bundleVerify.test.ts",
  "preview.ts",
  "preview.test.ts",
  "previewVerify.ts",
  "previewVerify.test.ts",
  "runbook.ts",
  "runbook.test.ts",
  "runbookVerify.ts",
  "runbookVerify.test.ts",
  "package.ts",
  "package.test.ts",
  "packageVerify.ts",
  "packageVerify.test.ts",
  "preflight.ts",
  "preflight.test.ts",
  "preflightPackageFixtures.test.ts",
  "manifest.ts",
  "manifest.test.ts",
  "manifestHandoffFixtures.test.ts",
  "manifestVerify.ts",
  "manifestVerify.test.ts",
  "handoff.ts",
  "handoff.test.ts",
  "handoffVerify.ts",
  "handoffVerify.test.ts",
  "readiness.ts",
  "readiness.test.ts",
  "readinessSigningFixtures.test.ts",
  "readinessVerify.ts",
  "readinessVerify.test.ts",
  "signingPayload.ts",
  "signingPayload.test.ts",
  "signingPayloadVerify.ts",
  "signingPayloadVerify.test.ts",
  "signingPayloadPreflight.ts",
  "signingPayloadPreflight.test.ts",
  "signedPayloadFixtures.test.ts",
  "signedPayloadVerify.ts",
  "signedPayloadVerify.test.ts",
];

const scopedCliFiles = [
  "bundle.ts",
  "bundleVerify.ts",
  "preview.ts",
  "previewVerify.ts",
  "runbook.ts",
  "runbookVerify.ts",
  "package.ts",
  "packageVerify.ts",
  "preflight.ts",
  "manifest.ts",
  "manifestVerify.ts",
  "handoff.ts",
  "handoffVerify.ts",
  "readiness.ts",
  "readinessVerify.ts",
  "signingPayload.ts",
  "signingPayloadVerify.ts",
  "signingPayloadPreflight.ts",
  "signedPayloadVerify.ts",
];

const oldRuntimeFiles = [
  "agentProposalExecutionBundle.ts",
  "agentProposalExecutionBundle.test.ts",
  "agentProposalExecutionBundleVerifier.ts",
  "agentProposalExecutionBundleVerifier.test.ts",
  "agentProposalExecutionPreview.ts",
  "agentProposalExecutionPreview.test.ts",
  "agentProposalExecutionPreviewVerifier.ts",
  "agentProposalExecutionPreviewVerifier.test.ts",
  "agentProposalExecutionRunbook.ts",
  "agentProposalExecutionRunbook.test.ts",
  "agentProposalExecutionRunbookVerifier.ts",
  "agentProposalExecutionRunbookVerifier.test.ts",
  "agentProposalExecutionPackage.ts",
  "agentProposalExecutionPackage.test.ts",
  "agentProposalExecutionPackageVerifier.ts",
  "agentProposalExecutionPackageVerifier.test.ts",
  "agentProposalExecutionPreflight.ts",
  "agentProposalExecutionPreflight.test.ts",
  "agentProposalExecutionManifest.ts",
  "agentProposalExecutionManifest.test.ts",
  "agentProposalExecutionManifestVerifier.ts",
  "agentProposalExecutionManifestVerifier.test.ts",
  "agentProposalExecutionHandoff.ts",
  "agentProposalExecutionHandoff.test.ts",
  "agentProposalExecutionHandoffVerifier.ts",
  "agentProposalExecutionHandoffVerifier.test.ts",
  "agentProposalExecutionReadiness.ts",
  "agentProposalExecutionReadiness.test.ts",
  "agentProposalExecutionReadinessVerifier.ts",
  "agentProposalExecutionReadinessVerifier.test.ts",
  "agentProposalExecutionSigningPayload.ts",
  "agentProposalExecutionSigningPayload.test.ts",
  "agentProposalExecutionSigningPayloadVerifier.ts",
  "agentProposalExecutionSigningPayloadVerifier.test.ts",
  "agentProposalExecutionSigningPayloadPreflight.ts",
  "agentProposalExecutionSigningPayloadPreflight.test.ts",
  "agentProposalExecutionSignedPayloadVerifier.ts",
  "agentProposalExecutionSignedPayloadVerifier.test.ts",
];

const oldCliFiles = [
  "baseAgentProposalExecutionBundle.ts",
  "baseAgentProposalExecutionBundleVerify.ts",
  "baseAgentProposalExecutionPreview.ts",
  "baseAgentProposalExecutionPreviewVerify.ts",
  "baseAgentProposalExecutionRunbook.ts",
  "baseAgentProposalExecutionRunbookVerify.ts",
  "baseAgentProposalExecutionPackage.ts",
  "baseAgentProposalExecutionPackageVerify.ts",
  "baseAgentProposalExecutionPreflight.ts",
  "baseAgentProposalExecutionManifest.ts",
  "baseAgentProposalExecutionManifestVerify.ts",
  "baseAgentProposalExecutionHandoff.ts",
  "baseAgentProposalExecutionHandoffVerify.ts",
  "baseAgentProposalExecutionReadiness.ts",
  "baseAgentProposalExecutionReadinessVerify.ts",
  "baseAgentProposalExecutionSigningPayload.ts",
  "baseAgentProposalExecutionSigningPayloadVerify.ts",
  "baseAgentProposalExecutionSigningPayloadPreflight.ts",
  "baseAgentProposalExecutionSignedPayloadVerify.ts",
];

const scopedPaths = [
  ...scopedRuntimeFiles.map((file) => resolve(moduleDir, file)),
  ...scopedCliFiles.map((file) => resolve(runtimeRoot, "cli/proposalExecution", file)),
];

const oldFlatPaths = [
  ...oldRuntimeFiles.map((file) => resolve(runtimeRoot, file)),
  ...oldCliFiles.map((file) => resolve(runtimeRoot, "cli", file)),
];

describe("proposal execution file layout", () => {
  it("keeps non-broadcast proposal execution files in scoped directories with short filenames", async () => {
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
