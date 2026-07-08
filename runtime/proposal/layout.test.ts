import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const runtimeRoot = resolve(moduleDir, "..");

const scopedPaths = [
  resolve(moduleDir, "output.ts"),
  resolve(moduleDir, "output.test.ts"),
  resolve(moduleDir, "outputFixtures.test.ts"),
  resolve(moduleDir, "verify.ts"),
  resolve(moduleDir, "verify.test.ts"),
  resolve(moduleDir, "verifyFixtures.test.ts"),
  resolve(moduleDir, "summary.ts"),
  resolve(moduleDir, "summary.test.ts"),
  resolve(moduleDir, "summaryFixtures.test.ts"),
  resolve(moduleDir, "summaryVerify.ts"),
  resolve(moduleDir, "summaryVerify.test.ts"),
  resolve(moduleDir, "summaryVerifyFixtures.test.ts"),
  resolve(runtimeRoot, "cli/proposal/verify.ts"),
  resolve(runtimeRoot, "cli/proposal/summary.ts"),
  resolve(runtimeRoot, "cli/proposal/summaryVerify.ts"),
];

const oldFlatPaths = [
  resolve(runtimeRoot, "agentProposalOutput.ts"),
  resolve(runtimeRoot, "agentProposalOutput.test.ts"),
  resolve(runtimeRoot, "agentProposalVerifier.ts"),
  resolve(runtimeRoot, "agentProposalVerifier.test.ts"),
  resolve(runtimeRoot, "agentProposalSummary.ts"),
  resolve(runtimeRoot, "agentProposalSummary.test.ts"),
  resolve(runtimeRoot, "agentProposalSummaryVerifier.ts"),
  resolve(runtimeRoot, "agentProposalSummaryVerifier.test.ts"),
  resolve(runtimeRoot, "cli/baseAgentProposalVerify.ts"),
  resolve(runtimeRoot, "cli/baseAgentProposalSummary.ts"),
  resolve(runtimeRoot, "cli/baseAgentProposalSummaryVerify.ts"),
];

describe("proposal file layout", () => {
  it("keeps proposal files in scoped directories with short filenames", async () => {
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
