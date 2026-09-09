import { describe, expect, it } from "vitest";

import { createAction } from "../core/action.js";
import { createAgentOsPlanWorkflowPackage } from "./planWorkflow.js";

import type { Address, Hex } from "viem";
import type { PolicyDecision } from "../core/policy.js";

const AGENT = "0x0000000000000000000000000000000000000a01" as Address;
const TARGET = "0x0000000000000000000000000000000000000b01" as Address;
const REVIEWER = "0x0000000000000000000000000000000000000c01";
const CAPABILITY = `0x${"11".repeat(32)}` as Hex;
const GENERATED_AT = "2026-07-03T11:00:00.000Z";

const PATHS = {
  chainId: 84532,
  deploymentManifestPath: "deployments/base-sepolia/latest.json",
  planPath: "artifacts/sdk/example-agent-plan.json",
  proposalPath: "artifacts/sdk/example-agent-proposal.json",
  summaryPath: "artifacts/sdk/example-agent-proposal.md",
  reviewManifestPath: "artifacts/sdk/example-agent-proposal-review.json",
  approvalPath: "artifacts/sdk/example-agent-proposal-approval.json",
  bundlePath: "artifacts/sdk/example-agent-proposal-execution-bundle.json",
  previewPath: "artifacts/sdk/example-agent-proposal-execution-preview.json",
  runbookPath: "artifacts/sdk/example-agent-proposal-execution-runbook.md",
  executionManifestPath: "artifacts/sdk/example-agent-proposal-execution-manifest.json",
};

describe("createAgentOsPlanWorkflowPackage", () => {
  it("retains multi-step diagnostics but blocks approved execution handoff", async () => {
    const result = await createAgentOsPlanWorkflowPackage({
      ...PATHS,
      agent: AGENT,
      objective: "Review independently allowed steps",
      steps: [createPlanStep(), { ...createPlanStep(), id: "step-2" }],
      simulatePolicy: async (): Promise<PolicyDecision> => ({ allowed: true, code: "Allowed" }),
      reviewer: REVIEWER,
      decision: "approved",
      generatedAt: GENERATED_AT,
    });
    expect(result.proposal.validationStatus).toBe("sequence-unverified");
    expect(result.proposal.steps.map((step) => step.decision.allowed)).toEqual([true, true]);
    expect(result.proposalArtifact.output.validationStatus).toBe("sequence-unverified");
    expect(result.proposalArtifact.output.steps.map((step) => step.transaction)).toEqual([null, null]);
    expect(result.workflow.reviewPackage.passed).toBe(true);
    expect(result.workflow.files.summary.markdown).toContain("Sequence execution, cumulative limits, and step dependencies are unverified");
    expect(result.passed).toBe(false);
    expect(result.workflow.executionBundle).toBeNull();
    expect(result.workflow.executionHandoff).toBeNull();
  });

  it("simulates an allowed typed plan and packages local execution handoff evidence", async () => {
    const result = await createAgentOsPlanWorkflowPackage({
      ...PATHS,
      agent: AGENT,
      objective: "Dry-run an allowed SDK plan",
      steps: [createPlanStep()],
      simulatePolicy: async (): Promise<PolicyDecision> => ({
        allowed: true,
        code: "Allowed",
      }),
      reviewer: REVIEWER,
      decision: "approved",
      generatedAt: GENERATED_AT,
    });

    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.proposal.executable).toBe(true);
    expect(result.proposalArtifact.path).toBe(PATHS.proposalPath);
    expect(result.proposalArtifact.output.manifest).toBe(PATHS.deploymentManifestPath);
    expect(result.proposalArtifact.output.plan).toBe(PATHS.planPath);
    expect(JSON.parse(result.proposalArtifact.json).steps[0].transaction).not.toBeNull();
    expect(result.workflow.executionHandoff?.passed).toBe(true);
    expect(JSON.parse(result.workflow.files.executionManifest.json).preflight.passed).toBe(true);
  });

  it("keeps denied typed plans reviewable without creating execution handoff evidence", async () => {
    const result = await createAgentOsPlanWorkflowPackage({
      ...PATHS,
      agent: AGENT,
      objective: "Dry-run a denied SDK plan",
      steps: [createPlanStep()],
      simulatePolicy: async (): Promise<PolicyDecision> => ({
        allowed: false,
        code: "CapabilityDenied",
      }),
      reviewer: REVIEWER,
      decision: "rejected",
      generatedAt: GENERATED_AT,
    });

    expect(result.passed).toBe(true);
    expect(result.proposal.executable).toBe(false);
    expect(JSON.parse(result.proposalArtifact.json).steps[0].transaction).toBeNull();
    expect(result.workflow.approval?.approval?.decision).toBe("rejected");
    expect(result.workflow.executionBundle).toBeNull();
    expect(result.workflow.executionHandoff).toBeNull();
  });

  it("fails approved denied typed plans before execution evidence is created", async () => {
    const result = await createAgentOsPlanWorkflowPackage({
      ...PATHS,
      agent: AGENT,
      objective: "Try to approve a denied SDK plan",
      steps: [createPlanStep()],
      simulatePolicy: async (): Promise<PolicyDecision> => ({
        allowed: false,
        code: "CapabilityDenied",
      }),
      reviewer: REVIEWER,
      decision: "approved",
      generatedAt: GENERATED_AT,
    });

    expect(result.passed).toBe(false);
    expect(result.failures).toEqual([
      "approved review packages must be executable",
      "approved review packages must include at least one transaction",
    ]);
    expect(result.workflow.executionBundle).toBeNull();
    expect(result.workflow.executionHandoff).toBeNull();
  });
});

function createPlanStep() {
  return {
    id: "step-1",
    title: "Call target",
    action: createAction({
      capability: CAPABILITY,
      target: TARGET,
      value: 123n,
      data: "0x1234",
      usesBorrowing: false,
    }),
  };
}
