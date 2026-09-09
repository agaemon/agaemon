import { describe, expect, it } from "vitest";

import { createAgentPlanProposal } from "../agentPlanning/planProposal.js";
import {
  createPolicyDecisionFixtureSimulator,
  getPolicyDecisionFixture,
} from "../fixtures/policyDecisions.js";
import { createAgentProposalOutput } from "./output.js";
import { verifyAgentProposalArtifact } from "./verify.js";

describe("verifyAgentProposalArtifact fixture integration", () => {
  it("accepts serialized unverified sequence artifacts", async () => {
    const allowedSwap = getPolicyDecisionFixture("allowed-swap");
    const allowedMemory = getPolicyDecisionFixture("allowed-memory");
    const proposal = await createAgentPlanProposal({
      agent: allowedSwap.agent,
      objective: "Verify allowed fixture plan",
      steps: [
        {
          id: allowedSwap.id,
          title: allowedSwap.title,
          action: allowedSwap.action,
        },
        {
          id: allowedMemory.id,
          title: allowedMemory.title,
          action: allowedMemory.action,
        },
      ],
      simulatePolicy: createPolicyDecisionFixtureSimulator(),
    });

    const artifact = createAgentProposalOutput({
      chainId: 84532,
      manifestPath: "deployments/base-sepolia/latest.json",
      source: { type: "plan", path: "artifacts/fixture-allowed-plan.json" },
      proposal,
    });

    expect(verifyAgentProposalArtifact(JSON.stringify(artifact))).toEqual({
      passed: true,
      failures: [],
      source: "plan",
      sourcePath: "artifacts/fixture-allowed-plan.json",
      chainId: 84532,
      executable: false,
      steps: 2,
      transactions: 0,
    });
  });

  it("accepts serialized denied fixture proposal artifacts with suppressed transactions", async () => {
    const allowedSwap = getPolicyDecisionFixture("allowed-swap");
    const deniedCapability = getPolicyDecisionFixture("denied-capability");
    const artifact = await createDeniedFixtureArtifact();

    expect(artifact.steps.map((step) => step.decision)).toEqual([
      allowedSwap.decision,
      deniedCapability.decision,
    ]);
    expect(artifact.steps.map((step) => step.transaction)).toEqual([null, null]);
    expect(verifyAgentProposalArtifact(JSON.stringify(artifact))).toEqual({
      passed: true,
      failures: [],
      source: "plan",
      sourcePath: "artifacts/fixture-denied-plan.json",
      chainId: 84532,
      executable: false,
      steps: 2,
      transactions: 0,
    });
  });

  it("rejects serialized denied fixture proposal artifacts when a transaction leaks", async () => {
    const artifact = await createDeniedFixtureArtifact();
    artifact.steps[0]!.transaction = {
      to: artifact.agent,
      value: artifact.steps[0]!.action.valueWei,
      data: "0xabcd",
    };

    expect(verifyAgentProposalArtifact(JSON.stringify(artifact)).failures).toContain(
      "non-executable proposals must not expose transaction payloads",
    );
  });
});

async function createDeniedFixtureArtifact() {
  const allowedSwap = getPolicyDecisionFixture("allowed-swap");
  const deniedCapability = getPolicyDecisionFixture("denied-capability");
  const proposal = await createAgentPlanProposal({
    agent: allowedSwap.agent,
    objective: "Verify partially denied fixture plan",
    steps: [
      {
        id: allowedSwap.id,
        title: allowedSwap.title,
        action: allowedSwap.action,
      },
      {
        id: deniedCapability.id,
        title: deniedCapability.title,
        action: deniedCapability.action,
      },
    ],
    simulatePolicy: createPolicyDecisionFixtureSimulator(),
  });

  return createAgentProposalOutput({
    chainId: 84532,
    manifestPath: "deployments/base-sepolia/latest.json",
    source: { type: "plan", path: "artifacts/fixture-denied-plan.json" },
    proposal,
  });
}
