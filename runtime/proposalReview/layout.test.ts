import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const runtimeRoot = resolve(moduleDir, "..");

const scopedPaths = [
  resolve(moduleDir, "preflight.ts"),
  resolve(moduleDir, "preflight.test.ts"),
  resolve(moduleDir, "manifest.ts"),
  resolve(moduleDir, "manifest.test.ts"),
  resolve(moduleDir, "manifestVerify.ts"),
  resolve(moduleDir, "manifestVerify.test.ts"),
  resolve(moduleDir, "package.ts"),
  resolve(moduleDir, "package.test.ts"),
  resolve(moduleDir, "preflightPackageFixtures.test.ts"),
  resolve(moduleDir, "approval.ts"),
  resolve(moduleDir, "approval.test.ts"),
  resolve(moduleDir, "approvalFixtures.test.ts"),
  resolve(moduleDir, "approvalVerify.ts"),
  resolve(moduleDir, "approvalVerify.test.ts"),
  resolve(runtimeRoot, "cli/proposalReview/preflight.ts"),
  resolve(runtimeRoot, "cli/proposalReview/manifest.ts"),
  resolve(runtimeRoot, "cli/proposalReview/manifestVerify.ts"),
  resolve(runtimeRoot, "cli/proposalReview/package.ts"),
  resolve(runtimeRoot, "cli/proposalReview/approval.ts"),
  resolve(runtimeRoot, "cli/proposalReview/approvalVerify.ts"),
];

const oldFlatPaths = [
  resolve(runtimeRoot, "agentProposalReviewPreflight.ts"),
  resolve(runtimeRoot, "agentProposalReviewPreflight.test.ts"),
  resolve(runtimeRoot, "agentProposalReviewManifest.ts"),
  resolve(runtimeRoot, "agentProposalReviewManifest.test.ts"),
  resolve(runtimeRoot, "agentProposalReviewManifestVerifier.ts"),
  resolve(runtimeRoot, "agentProposalReviewManifestVerifier.test.ts"),
  resolve(runtimeRoot, "agentProposalReviewPackage.ts"),
  resolve(runtimeRoot, "agentProposalReviewPackage.test.ts"),
  resolve(runtimeRoot, "agentProposalReviewApproval.ts"),
  resolve(runtimeRoot, "agentProposalReviewApproval.test.ts"),
  resolve(runtimeRoot, "agentProposalReviewApprovalVerifier.ts"),
  resolve(runtimeRoot, "agentProposalReviewApprovalVerifier.test.ts"),
  resolve(runtimeRoot, "cli/baseAgentProposalReviewPreflight.ts"),
  resolve(runtimeRoot, "cli/baseAgentProposalReviewManifest.ts"),
  resolve(runtimeRoot, "cli/baseAgentProposalReviewManifestVerify.ts"),
  resolve(runtimeRoot, "cli/baseAgentProposalReviewPackage.ts"),
  resolve(runtimeRoot, "cli/baseAgentProposalReviewApproval.ts"),
  resolve(runtimeRoot, "cli/baseAgentProposalReviewApprovalVerify.ts"),
];

describe("proposal review file layout", () => {
  it("keeps proposal review files in scoped directories with short filenames", async () => {
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
