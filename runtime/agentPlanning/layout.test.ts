import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const runtimeRoot = resolve(moduleDir, "..");

describe("agent planning file layout", () => {
  it("keeps agent intent and plan proposal files in scoped directories with short filenames", async () => {
    const scopedRuntimeFiles = [
      "intentCompiler.ts",
      "intentCompiler.test.ts",
      "intentProposal.ts",
      "intentProposal.test.ts",
      "planProposal.ts",
      "planProposal.test.ts",
      "planProposalFixtures.test.ts",
    ].map((file) => resolve(moduleDir, file));

    const scopedCliFiles = [
      "intentPlan.ts",
      "intentProposal.ts",
      "planProposal.ts",
    ].map((file) => resolve(runtimeRoot, "cli/agentPlanning", file));

    const oldRuntimeFiles = [
      "agentIntentCompiler.ts",
      "agentIntentCompiler.test.ts",
      "agentIntentProposal.ts",
      "agentIntentProposal.test.ts",
      "agentPlanProposal.ts",
      "agentPlanProposal.test.ts",
    ].map((file) => resolve(runtimeRoot, file));

    const oldCliFiles = [
      "baseAgentIntentPlan.ts",
      "baseAgentIntentProposal.ts",
      "baseAgentPlanProposal.ts",
    ].map((file) => resolve(runtimeRoot, "cli", file));

    for (const file of [...scopedRuntimeFiles, ...scopedCliFiles]) {
      await expect(access(file), file).resolves.toBeUndefined();
    }

    for (const file of [...oldRuntimeFiles, ...oldCliFiles]) {
      await expect(access(file), file).rejects.toMatchObject({
        code: "ENOENT",
      });
    }
  });
});
