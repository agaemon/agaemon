import { describe, expect, it } from "vitest";

import { verifyAgentProposalReviewPreflight } from "./preflight.js";
import { createAgentProposalSummary } from "../proposal/summary.js";

const AGENT = "0x0000000000000000000000000000000000000a01";
const TARGET = "0x0000000000000000000000000000000000000b01";
const CAPABILITY = `0x${"11".repeat(32)}`;
const PROPOSAL_PATH = "artifacts/example-agent-proposal.json";
const SUMMARY_PATH = "artifacts/example-agent-proposal.md";

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

describe("verifyAgentProposalReviewPreflight", () => {
  it("passes when the proposal artifact and review summary are current", () => {
    const proposalJson = JSON.stringify(EXECUTABLE_PLAN_ARTIFACT);
    const summaryMarkdown = createAgentProposalSummary({
      proposalPath: PROPOSAL_PATH,
      proposalJson,
    }).markdown;

    expect(
      verifyAgentProposalReviewPreflight({
        proposalPath: PROPOSAL_PATH,
        proposalJson,
        summaryPath: SUMMARY_PATH,
        summaryMarkdown,
      }),
    ).toEqual({
      passed: true,
      proposal: PROPOSAL_PATH,
      summary: SUMMARY_PATH,
      source: "plan",
      sourcePath: "artifacts/example-agent-plan.json",
      chainId: 84532,
      executable: true,
      steps: 1,
      transactions: 1,
      checks: [
        { name: "proposal-artifact", passed: true, failures: [] },
        { name: "proposal-summary", passed: true, failures: [] },
      ],
    });
  });

  it("fails when the review summary is stale", () => {
    const proposalJson = JSON.stringify(EXECUTABLE_PLAN_ARTIFACT);
    const summaryMarkdown = createAgentProposalSummary({
      proposalPath: PROPOSAL_PATH,
      proposalJson,
    }).markdown;

    expect(
      verifyAgentProposalReviewPreflight({
        proposalPath: PROPOSAL_PATH,
        proposalJson,
        summaryPath: SUMMARY_PATH,
        summaryMarkdown: summaryMarkdown.replace("| Transactions | 1 |", "| Transactions | 2 |"),
      }),
    ).toMatchObject({
      passed: false,
      checks: [
        { name: "proposal-artifact", passed: true, failures: [] },
        { name: "proposal-summary", passed: false, failures: ["proposal summary is stale"] },
      ],
    });
  });

  it("fails the summary check with a skip reason when the proposal artifact is invalid", () => {
    const proposalJson = JSON.stringify({
      ...EXECUTABLE_PLAN_ARTIFACT,
      executable: false,
    });

    expect(
      verifyAgentProposalReviewPreflight({
        proposalPath: PROPOSAL_PATH,
        proposalJson,
        summaryPath: SUMMARY_PATH,
        summaryMarkdown: "",
      }),
    ).toMatchObject({
      passed: false,
      executable: false,
      transactions: 1,
      checks: [
        {
          name: "proposal-artifact",
          passed: false,
          failures: ["non-executable proposals must not expose transaction payloads"],
        },
        {
          name: "proposal-summary",
          passed: false,
          failures: ["proposal artifact is invalid"],
        },
      ],
    });
  });
});
