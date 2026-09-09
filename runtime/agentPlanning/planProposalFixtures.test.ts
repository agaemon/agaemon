import { describe, expect, it } from "vitest";

import {
  createPolicyDecisionFixtureSimulator,
  getPolicyDecisionFixture,
} from "../fixtures/policyDecisions.js";
import { createAgentPlanProposal } from "./planProposal.js";

describe("createAgentPlanProposal fixture integration", () => {
  it("retains independent decisions without transactions for an all-allowed fixture plan", async () => {
    const allowedSwap = getPolicyDecisionFixture("allowed-swap");
    const allowedMemory = getPolicyDecisionFixture("allowed-memory");

    const proposal = await createAgentPlanProposal({
      agent: allowedSwap.agent,
      objective: "Execute allowed fixture plan",
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

    expect(proposal.executable).toBe(false);
    expect(proposal.validationStatus).toBe("sequence-unverified");
    expect(proposal.steps.map((step) => step.decision)).toEqual([
      allowedSwap.decision,
      allowedMemory.decision,
    ]);
    expect(proposal.steps.map((step) => step.transaction)).toEqual([null, null]);
  });

  it("suppresses every transaction payload for a partially denied fixture plan", async () => {
    const allowedSwap = getPolicyDecisionFixture("allowed-swap");
    const deniedCapability = getPolicyDecisionFixture("denied-capability");

    const proposal = await createAgentPlanProposal({
      agent: allowedSwap.agent,
      objective: "Reject partially denied fixture plan",
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

    expect(proposal.executable).toBe(false);
    expect(proposal.steps.map((step) => step.decision)).toEqual([
      allowedSwap.decision,
      deniedCapability.decision,
    ]);
    expect(proposal.steps.map((step) => step.transaction)).toEqual([null, null]);
    expect(proposal.steps.map((step) => step.id)).toEqual([
      allowedSwap.id,
      deniedCapability.id,
    ]);
  });
});
