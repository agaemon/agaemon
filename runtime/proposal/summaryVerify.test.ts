import { describe, expect, it } from "vitest";

import { createAgentProposalSummary } from "./summary.js";
import { verifyAgentProposalSummary } from "./summaryVerify.js";

const AGENT = "0x0000000000000000000000000000000000000a01";
const TARGET = "0x0000000000000000000000000000000000000b01";
const CAPABILITY = `0x${"11".repeat(32)}`;
const PROPOSAL_PATH = "artifacts/example-agent-proposal.json";

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

describe("verifyAgentProposalSummary", () => {
  it("passes when the saved summary matches the proposal artifact", () => {
    const proposalJson = JSON.stringify(EXECUTABLE_PLAN_ARTIFACT);
    const expectedSummary = createAgentProposalSummary({
      proposalPath: PROPOSAL_PATH,
      proposalJson,
    }).markdown;

    expect(
      verifyAgentProposalSummary({
        proposalPath: PROPOSAL_PATH,
        proposalJson,
        summaryMarkdown: expectedSummary,
      }),
    ).toEqual({
      passed: true,
      failures: [],
      expected: expectedSummary,
    });
  });

  it("rejects stale summaries", () => {
    const proposalJson = JSON.stringify(EXECUTABLE_PLAN_ARTIFACT);
    const expectedSummary = createAgentProposalSummary({
      proposalPath: PROPOSAL_PATH,
      proposalJson,
    }).markdown;

    expect(
      verifyAgentProposalSummary({
        proposalPath: PROPOSAL_PATH,
        proposalJson,
        summaryMarkdown: expectedSummary.replace("| Transactions | 1 |", "| Transactions | 2 |"),
      }),
    ).toEqual({
      passed: false,
      failures: ["proposal summary is stale"],
      expected: expectedSummary,
    });
  });

  it("rejects invalid proposal artifacts with proposal verifier failures", () => {
    const proposalJson = JSON.stringify({
      ...EXECUTABLE_PLAN_ARTIFACT,
      executable: false,
    });

    expect(
      verifyAgentProposalSummary({
        proposalPath: PROPOSAL_PATH,
        proposalJson,
        summaryMarkdown: "",
      }),
    ).toEqual({
      passed: false,
      failures: ["non-executable proposals must not expose transaction payloads"],
      expected: "",
    });
  });
});
