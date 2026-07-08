import { describe, expect, it } from "vitest";

import { createAgentOsLocalWorkflowPackage } from "./localWorkflow.js";

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

describe("createAgentOsLocalWorkflowPackage", () => {
  it("packages executable local proposal review and execution handoff evidence", () => {
    const result = createAgentOsLocalWorkflowPackage({
      ...PATHS,
      proposalJson: JSON.stringify(EXECUTABLE_PLAN_ARTIFACT),
      reviewer: REVIEWER,
      decision: "approved",
      generatedAt: GENERATED_AT,
    });

    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.reviewPackage.passed).toBe(true);
    expect(result.approval?.passed).toBe(true);
    expect(result.executionBundle?.passed).toBe(true);
    expect(result.executionHandoff?.passed).toBe(true);
    expect(result.files.summary.markdown).toContain("# Agent Proposal Review");
    expect(JSON.parse(result.files.reviewManifest.json).preflight.executable).toBe(true);
    expect(JSON.parse(result.files.approval.json).decision).toBe("approved");
    expect(JSON.parse(result.files.executionBundle.json).transactions).toHaveLength(1);
    expect(JSON.parse(result.files.executionManifest.json).preflight.passed).toBe(true);
  });

  it("allows denied local proposals to be reviewed and rejected without execution handoff", () => {
    const result = createAgentOsLocalWorkflowPackage({
      ...PATHS,
      proposalJson: JSON.stringify(DENIED_INTENT_ARTIFACT),
      reviewer: REVIEWER,
      decision: "rejected",
      generatedAt: GENERATED_AT,
    });

    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.reviewPackage.passed).toBe(true);
    expect(result.approval?.passed).toBe(true);
    expect(result.executionBundle).toBeNull();
    expect(result.executionHandoff).toBeNull();
    expect(JSON.parse(result.files.reviewManifest.json).preflight.executable).toBe(false);
    expect(JSON.parse(result.files.approval.json).decision).toBe("rejected");
    expect(result.files.executionBundle.json).toBe("");
    expect(result.files.executionManifest.json).toBe("");
  });

  it("fails approved denied proposals before execution artifacts are created", () => {
    const result = createAgentOsLocalWorkflowPackage({
      ...PATHS,
      proposalJson: JSON.stringify(DENIED_INTENT_ARTIFACT),
      reviewer: REVIEWER,
      decision: "approved",
      generatedAt: GENERATED_AT,
    });

    expect(result.passed).toBe(false);
    expect(result.failures).toEqual([
      "approved review packages must be executable",
      "approved review packages must include at least one transaction",
    ]);
    expect(result.approval?.passed).toBe(false);
    expect(result.executionBundle).toBeNull();
    expect(result.executionHandoff).toBeNull();
    expect(result.files.approval.json).toBe("");
  });

  it("fails malformed proposal artifacts before review approval", () => {
    const result = createAgentOsLocalWorkflowPackage({
      ...PATHS,
      proposalJson: JSON.stringify({
        ...EXECUTABLE_PLAN_ARTIFACT,
        executable: false,
      }),
      reviewer: REVIEWER,
      decision: "approved",
      generatedAt: GENERATED_AT,
    });

    expect(result.passed).toBe(false);
    expect(result.failures).toEqual(["non-executable proposals must not expose transaction payloads"]);
    expect(result.reviewPackage.passed).toBe(false);
    expect(result.approval).toBeNull();
    expect(result.executionBundle).toBeNull();
    expect(result.executionHandoff).toBeNull();
  });

  it("fails stale supplied review summaries before approval", () => {
    const result = createAgentOsLocalWorkflowPackage({
      ...PATHS,
      proposalJson: JSON.stringify(EXECUTABLE_PLAN_ARTIFACT),
      summaryMarkdown: "# stale summary\n",
      reviewer: REVIEWER,
      decision: "approved",
      generatedAt: GENERATED_AT,
    });

    expect(result.passed).toBe(false);
    expect(result.failures).toEqual(["proposal summary is stale"]);
    expect(result.reviewPackage.passed).toBe(false);
    expect(result.approval).toBeNull();
    expect(result.executionBundle).toBeNull();
    expect(result.executionHandoff).toBeNull();
  });
});
