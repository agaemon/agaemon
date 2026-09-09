import { describe, expect, it } from "vitest";

import {
  createAgentPlanProposal,
  parseAgentPlanProposalDocument,
} from "./planProposal.js";
import { createAction } from "../core/action.js";

import type { Address, Hex } from "viem";
import type { PolicyDecision } from "../core/policy.js";

const AGENT = "0x0000000000000000000000000000000000000a01" as Address;
const TARGET_ONE = "0x0000000000000000000000000000000000000b01" as Address;
const TARGET_TWO = "0x0000000000000000000000000000000000000b02" as Address;
const CAPABILITY = `0x${"11".repeat(32)}` as Hex;

describe("parseAgentPlanProposalDocument", () => {
  it("normalizes a structured planner document into typed agent actions", () => {
    expect(
      parseAgentPlanProposalDocument({
        objective: "Dry-run a two-step plan",
        steps: [
          {
            id: "step-1",
            title: "Call the first target",
            action: {
              capability: CAPABILITY,
              target: TARGET_ONE,
              valueWei: "123",
              data: "0x1234",
              usesBorrowing: false,
            },
          },
        ],
      }),
    ).toEqual({
      objective: "Dry-run a two-step plan",
      steps: [
        {
          id: "step-1",
          title: "Call the first target",
          action: {
            capability: CAPABILITY,
            target: TARGET_ONE,
            value: 123n,
            data: "0x1234",
            usesBorrowing: false,
          },
        },
      ],
    });
  });

  it("rejects plans without at least one step", () => {
    expect(() =>
      parseAgentPlanProposalDocument({
        objective: "Empty plan",
        steps: [],
      }),
    ).toThrow("steps must include at least one step");
  });
});

describe("createAgentPlanProposal", () => {
  it("withholds a sequence whose independent checks miss cumulative spending", async () => {
    const dailyLimit = 15n;
    const steps = [1, 2].map((id) => ({
      id: `step-${id}`,
      title: "Spend ten units",
      action: createAction({ capability: CAPABILITY, target: TARGET_ONE, value: 10n }),
    }));
    const proposal = await createAgentPlanProposal({
      agent: AGENT,
      objective: "Spend against a shared daily allowance",
      steps,
      simulatePolicy: async ({ action }) => ({
        allowed: action.value <= dailyLimit,
        code: action.value <= dailyLimit ? "Allowed" : "DailyValueExceeded",
      }),
    });

    expect(proposal.validationStatus).toBe("sequence-unverified");
    expect(steps.reduce((sum, step) => sum + step.action.value, 0n)).toBeGreaterThan(dailyLimit);
    expect(proposal.steps.map((step) => step.decision.allowed)).toEqual([true, true]);
    expect(proposal.executable).toBe(false);
    expect(proposal.steps.map((step) => step.transaction)).toEqual([null, null]);
  });

  it("includes execute transactions when every plan step is allowed", async () => {
    const proposal = await createAgentPlanProposal({
      agent: AGENT,
      objective: "Allowed plan",
      steps: [
        {
          id: "step-1",
          title: "Allowed call",
          action: createAction({
            capability: CAPABILITY,
            target: TARGET_ONE,
            value: 5n,
            data: "0x1234",
          }),
        },
      ],
      simulatePolicy: async (): Promise<PolicyDecision> => ({
        allowed: true,
        code: "Allowed",
      }),
    });

    expect(proposal.executable).toBe(true);
    expect(proposal.validationStatus).toBe("single-step-policy-allowed");
    expect(proposal.steps).toHaveLength(1);
    expect(proposal.steps[0]).toMatchObject({
      id: "step-1",
      title: "Allowed call",
      decision: { allowed: true, code: "Allowed" },
    });
    expect(proposal.steps[0]!.transaction?.to).toBe(AGENT);
    expect(proposal.steps[0]!.transaction?.value).toBe(5n);
    expect(proposal.steps[0]!.transaction?.data).toMatch(/^0x[0-9a-f]+$/);
  });

  it("withholds zero-value steps whose target state dependencies were not simulated", async () => {
    const proposal = await createAgentPlanProposal({
      agent: AGENT,
      objective: "Configure a target then use its new state",
      steps: ["Configure", "Use"].map((title, index) => ({
        id: `step-${index}`, title,
        action: createAction({ capability: CAPABILITY, target: TARGET_ONE }),
      })),
      simulatePolicy: async () => ({ allowed: true, code: "Allowed" }),
    });
    expect(proposal.validationStatus).toBe("sequence-unverified");
    expect(proposal.executable).toBe(false);
    expect(proposal.steps.map((step) => step.transaction)).toEqual([null, null]);
    expect(proposal.steps.map((step) => step.title)).toEqual(["Configure", "Use"]);
  });

  it("suppresses all transaction payloads when any step is denied", async () => {
    const proposal = await createAgentPlanProposal({
      agent: AGENT,
      objective: "Partially denied plan",
      steps: [
        {
          id: "step-1",
          title: "Allowed call",
          action: createAction({
            capability: CAPABILITY,
            target: TARGET_ONE,
            data: "0x1111",
          }),
        },
        {
          id: "step-2",
          title: "Denied call",
          action: createAction({
            capability: CAPABILITY,
            target: TARGET_TWO,
            data: "0x2222",
          }),
        },
      ],
      simulatePolicy: async ({ action }): Promise<PolicyDecision> =>
        action.target === TARGET_TWO
          ? { allowed: false, code: "CapabilityDenied" }
          : { allowed: true, code: "Allowed" },
    });

    expect(proposal.executable).toBe(false);
    expect(proposal.steps.map((step) => step.transaction)).toEqual([null, null]);
    expect(proposal.steps.map((step) => step.decision.code)).toEqual(["Allowed", "CapabilityDenied"]);
    expect(proposal.validationStatus).toBe("policy-denied");
  });
});
