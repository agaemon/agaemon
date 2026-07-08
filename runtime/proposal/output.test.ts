import { describe, expect, it } from "vitest";

import { createAction } from "../core/action.js";
import {
  createAgentProposalOutput,
  createAgentProposalWriteSummary,
} from "./output.js";

import type { Address, Hex } from "viem";
import type { AgentPlanProposal } from "../agentPlanning/planProposal.js";

const AGENT = "0x0000000000000000000000000000000000000a01" as Address;
const TARGET = "0x0000000000000000000000000000000000000b01" as Address;
const CAPABILITY = `0x${"11".repeat(32)}` as Hex;

describe("agent proposal output", () => {
  it("formats a plan-backed proposal artifact with stringified transaction values", () => {
    const proposal: AgentPlanProposal = {
      objective: "Dry-run a structured plan",
      agent: AGENT,
      executable: true,
      steps: [
        {
          id: "step-1",
          title: "Allowed action",
          action: createAction({
            capability: CAPABILITY,
            target: TARGET,
            value: 123n,
            data: "0x1234",
            usesBorrowing: true,
          }),
          decision: {
            allowed: true,
            code: "Allowed",
          },
          transaction: {
            to: AGENT,
            value: 123n,
            data: "0xabcd",
          },
        },
      ],
    };

    expect(
      createAgentProposalOutput({
        chainId: 84532,
        manifestPath: "deployments/base-sepolia/latest.json",
        source: { type: "plan", path: "artifacts/example-agent-plan.json" },
        proposal,
      }),
    ).toEqual({
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
            usesBorrowing: true,
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
    });
  });

  it("formats an intent-backed proposal artifact and write summary", () => {
    const proposal: AgentPlanProposal = {
      objective: "Dry-run operator intents",
      agent: AGENT,
      executable: false,
      steps: [
        {
          id: "intent-1",
          title: "Denied action",
          action: createAction({
            capability: CAPABILITY,
            target: TARGET,
            data: "0x1234",
          }),
          decision: {
            allowed: false,
            code: "CapabilityDenied",
          },
          transaction: null,
        },
      ],
    };
    const source = { type: "intent", path: "artifacts/example-agent-intents.json" } as const;

    expect(
      createAgentProposalOutput({
        chainId: 84532,
        manifestPath: "deployments/base-sepolia/latest.json",
        source,
        proposal,
      }).intent,
    ).toBe("artifacts/example-agent-intents.json");
    expect(
      createAgentProposalWriteSummary({
        chainId: 84532,
        manifestPath: "deployments/base-sepolia/latest.json",
        source,
        outputPath: "artifacts/example-agent-intent-proposal.json",
        proposal,
      }),
    ).toEqual({
      mode: "dry-run",
      chainId: 84532,
      manifest: "deployments/base-sepolia/latest.json",
      intent: "artifacts/example-agent-intents.json",
      output: "artifacts/example-agent-intent-proposal.json",
      executable: false,
      steps: 1,
      written: true,
    });
  });
});
