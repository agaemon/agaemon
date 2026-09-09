import { describe, expect, it } from "vitest";

import { createAgentPlanProposal } from "../agentPlanning/planProposal.js";
import {
  createPolicyDecisionFixtureSimulator,
  getPolicyDecisionFixture,
} from "../fixtures/policyDecisions.js";
import { createAgentProposalOutput } from "./output.js";

describe("agent proposal output fixture integration", () => {
  it("preserves fixture decisions, action values, with suppressed transactions for an unverified sequence", async () => {
    const allowedSwap = getPolicyDecisionFixture("allowed-swap");
    const allowedMemory = getPolicyDecisionFixture("allowed-memory");
    const proposal = await createAgentPlanProposal({
      agent: allowedSwap.agent,
      objective: "Serialize allowed fixture plan",
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

    const output = createAgentProposalOutput({
      chainId: 84532,
      manifestPath: "deployments/base-sepolia/latest.json",
      source: { type: "plan", path: "artifacts/fixture-allowed-plan.json" },
      proposal,
    });

    expect(output).toMatchObject({
      mode: "dry-run",
      chainId: 84532,
      manifest: "deployments/base-sepolia/latest.json",
      plan: "artifacts/fixture-allowed-plan.json",
      objective: "Serialize allowed fixture plan",
      agent: allowedSwap.agent,
      executable: false,
      validationStatus: "sequence-unverified",
    });
    expect(output.steps.map((step) => step.decision)).toEqual([
      allowedSwap.decision,
      allowedMemory.decision,
    ]);
    expect(output.steps.map((step) => step.action.valueWei)).toEqual([
      allowedSwap.action.value.toString(),
      allowedMemory.action.value.toString(),
    ]);
    expect(output.steps.map((step) => step.transaction)).toEqual([null, null]);
  });

  it("preserves denied fixture decisions and suppresses transaction payloads in proposal JSON", async () => {
    const allowedSwap = getPolicyDecisionFixture("allowed-swap");
    const deniedCapability = getPolicyDecisionFixture("denied-capability");
    const proposal = await createAgentPlanProposal({
      agent: allowedSwap.agent,
      objective: "Serialize partially denied fixture plan",
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

    const output = createAgentProposalOutput({
      chainId: 84532,
      manifestPath: "deployments/base-sepolia/latest.json",
      source: { type: "plan", path: "artifacts/fixture-denied-plan.json" },
      proposal,
    });

    expect(output.executable).toBe(false);
    expect(output.steps.map((step) => step.id)).toEqual([
      allowedSwap.id,
      deniedCapability.id,
    ]);
    expect(output.steps.map((step) => step.decision)).toEqual([
      allowedSwap.decision,
      deniedCapability.decision,
    ]);
    expect(output.steps.map((step) => step.action.valueWei)).toEqual([
      allowedSwap.action.value.toString(),
      deniedCapability.action.value.toString(),
    ]);
    expect(output.steps.map((step) => step.action.data)).toEqual([
      allowedSwap.action.data,
      deniedCapability.action.data,
    ]);
    expect(output.steps.map((step) => step.transaction)).toEqual([null, null]);
  });
});
