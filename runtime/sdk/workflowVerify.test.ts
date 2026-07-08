import { describe, expect, it } from "vitest";

import { createAgentOsLocalWorkflowPackage } from "./localWorkflow.js";
import { verifyAgentOsLocalWorkflowPackage } from "./workflowVerify.js";

const AGENT = "0x0000000000000000000000000000000000000a01";
const TARGET = "0x0000000000000000000000000000000000000b01";
const REVIEWER = "0x0000000000000000000000000000000000000c01";
const CAPABILITY = `0x${"11".repeat(32)}`;
const GENERATED_AT = "2026-07-03T10:00:00.000Z";

const PATHS = {
  proposalPath: "artifacts/sdk/example-agent-proposal.json",
  summaryPath: "artifacts/sdk/example-agent-proposal.md",
  manifestPath: "artifacts/sdk/example-agent-proposal-review.json",
  approvalPath: "artifacts/sdk/example-agent-proposal-approval.json",
  bundlePath: "artifacts/sdk/example-agent-proposal-execution-bundle.json",
  previewPath: "artifacts/sdk/example-agent-proposal-execution-preview.json",
  runbookPath: "artifacts/sdk/example-agent-proposal-execution-runbook.md",
  executionManifestPath: "artifacts/sdk/example-agent-proposal-execution-manifest.json",
};

const EXECUTABLE_PLAN_ARTIFACT = {
  mode: "dry-run",
  chainId: 84532,
  manifest: "deployments/base-sepolia/latest.json",
  plan: "artifacts/example-agent-plan.json",
  objective: "Dry-run a structured plan",
  agent: AGENT,
  executable: true,
  steps: [
    {
      id: "step-1",
      title: "Allowed action",
      action: {
        capability: CAPABILITY,
        target: TARGET,
        valueWei: "123",
        data: "0x1234",
        usesBorrowing: false,
      },
      decision: {
        allowed: true,
        code: "Allowed",
      },
      transaction: {
        to: AGENT,
        value: "123",
        data: "0xabcd",
      },
    },
  ],
};

const DENIED_INTENT_ARTIFACT = {
  mode: "dry-run",
  chainId: 84532,
  manifest: "deployments/base-sepolia/latest.json",
  intent: "artifacts/example-agent-intents.json",
  objective: "Dry-run operator intents",
  agent: AGENT,
  executable: false,
  steps: [
    {
      id: "intent-1",
      title: "Denied action",
      action: {
        capability: CAPABILITY,
        target: TARGET,
        valueWei: "0",
        data: "0x1234",
        usesBorrowing: false,
      },
      decision: {
        allowed: false,
        code: "CapabilityDenied",
      },
      transaction: null,
    },
  ],
};

describe("verifyAgentOsLocalWorkflowPackage", () => {
  it("verifies approved SDK workflow review and execution handoff evidence", () => {
    const proposalJson = JSON.stringify(EXECUTABLE_PLAN_ARTIFACT);
    const workflow = createAgentOsLocalWorkflowPackage({
      ...PATHS,
      proposalJson,
      reviewer: REVIEWER,
      decision: "approved",
      generatedAt: GENERATED_AT,
    });

    const verification = verifyAgentOsLocalWorkflowPackage({
      workflow,
      proposalPath: PATHS.proposalPath,
      proposalJson,
    });

    expect(verification.passed).toBe(true);
    expect(verification.failures).toEqual([]);
    expect(verification.trustBoundary).toEqual({
      ai: "proposes",
      policy: "decides",
      accounts: "execute",
      callClass: "local-only",
      mainnet: false,
      liveFunds: false,
    });
    expect(verification.checks.map((check) => [check.name, check.passed])).toEqual([
      ["workflow-result", true],
      ["review-approval", true],
      ["execution-handoff", true],
      ["trust-boundary", true],
    ]);
  });

  it("verifies rejected SDK workflow reviews without execution evidence", () => {
    const proposalJson = JSON.stringify(DENIED_INTENT_ARTIFACT);
    const workflow = createAgentOsLocalWorkflowPackage({
      ...PATHS,
      proposalJson,
      reviewer: REVIEWER,
      decision: "rejected",
      generatedAt: GENERATED_AT,
    });

    const verification = verifyAgentOsLocalWorkflowPackage({
      workflow,
      proposalPath: PATHS.proposalPath,
      proposalJson,
    });

    expect(verification.passed).toBe(true);
    expect(verification.failures).toEqual([]);
    expect(verification.executionHandoffVerification).toBeNull();
    expect(verification.checks.find((check) => check.name === "trust-boundary")?.passed).toBe(true);
  });

  it("fails when approved SDK handoff evidence is stale", () => {
    const proposalJson = JSON.stringify(EXECUTABLE_PLAN_ARTIFACT);
    const workflow = createAgentOsLocalWorkflowPackage({
      ...PATHS,
      proposalJson,
      reviewer: REVIEWER,
      decision: "approved",
      generatedAt: GENERATED_AT,
    });
    workflow.files.executionPreview.json = workflow.files.executionPreview.json.replace(
      '"value": "123"',
      '"value": "124"',
    );

    const verification = verifyAgentOsLocalWorkflowPackage({
      workflow,
      proposalPath: PATHS.proposalPath,
      proposalJson,
    });

    expect(verification.passed).toBe(false);
    expect(verification.failures).toContain("package preview JSON does not match current execution package");
    expect(verification.checks.find((check) => check.name === "execution-handoff")?.passed).toBe(false);
  });

  it("keeps approved denied proposals blocked before execution evidence", () => {
    const proposalJson = JSON.stringify(DENIED_INTENT_ARTIFACT);
    const workflow = createAgentOsLocalWorkflowPackage({
      ...PATHS,
      proposalJson,
      reviewer: REVIEWER,
      decision: "approved",
      generatedAt: GENERATED_AT,
    });

    const verification = verifyAgentOsLocalWorkflowPackage({
      workflow,
      proposalPath: PATHS.proposalPath,
      proposalJson,
    });

    expect(verification.passed).toBe(false);
    expect(verification.failures).toContain("SDK workflow package did not pass");
    expect(verification.failures).toContain("approved review packages must be executable");
    expect(verification.failures).toContain("approved review packages must include at least one transaction");
    expect(verification.checks.find((check) => check.name === "trust-boundary")?.passed).toBe(false);
  });
});
