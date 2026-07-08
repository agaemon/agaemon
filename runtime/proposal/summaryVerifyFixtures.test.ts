import { describe, expect, it } from "vitest";

import { createAgentPlanProposal } from "../agentPlanning/planProposal.js";
import {
  createPolicyDecisionFixtureSimulator,
  getPolicyDecisionFixture,
} from "../fixtures/policyDecisions.js";
import { createAgentProposalOutput } from "./output.js";
import { createAgentProposalSummary } from "./summary.js";
import { verifyAgentProposalSummary } from "./summaryVerify.js";

describe("verifyAgentProposalSummary fixture integration", () => {
  it("accepts saved executable fixture summaries and rejects stale allowed decision and transaction counts", async () => {
    const allowedSwap = getPolicyDecisionFixture("allowed-swap");
    const allowedMemory = getPolicyDecisionFixture("allowed-memory");
    const proposalPath = "artifacts/fixture-allowed-proposal.json";
    const proposalJson = JSON.stringify(
      await createFixtureArtifact({
        objective: "Verify allowed fixture summary",
        sourcePath: "artifacts/fixture-allowed-plan.json",
        fixtures: [allowedSwap, allowedMemory],
      }),
    );
    const savedSummary = createAgentProposalSummary({ proposalPath, proposalJson }).markdown;

    expect(verifyAgentProposalSummary({ proposalPath, proposalJson, summaryMarkdown: savedSummary })).toEqual({
      passed: true,
      failures: [],
      expected: savedSummary,
    });
    expectStaleSummary({
      proposalPath,
      proposalJson,
      expectedSummary: savedSummary,
      summaryMarkdown: replaceSummaryRow(savedSummary, "| Allowed Decisions | 2 |", "| Allowed Decisions | 1 |"),
    });
    expectStaleSummary({
      proposalPath,
      proposalJson,
      expectedSummary: savedSummary,
      summaryMarkdown: replaceSummaryRow(savedSummary, "| Transactions | 2 |", "| Transactions | 1 |"),
    });
  });

  it("accepts saved denied fixture summaries and rejects stale denied decision and transaction counts", async () => {
    const allowedSwap = getPolicyDecisionFixture("allowed-swap");
    const deniedCapability = getPolicyDecisionFixture("denied-capability");
    const proposalPath = "artifacts/fixture-denied-proposal.json";
    const proposalJson = JSON.stringify(
      await createFixtureArtifact({
        objective: "Verify denied fixture summary",
        sourcePath: "artifacts/fixture-denied-plan.json",
        fixtures: [allowedSwap, deniedCapability],
      }),
    );
    const savedSummary = createAgentProposalSummary({ proposalPath, proposalJson }).markdown;

    expect(verifyAgentProposalSummary({ proposalPath, proposalJson, summaryMarkdown: savedSummary })).toEqual({
      passed: true,
      failures: [],
      expected: savedSummary,
    });
    expectStaleSummary({
      proposalPath,
      proposalJson,
      expectedSummary: savedSummary,
      summaryMarkdown: replaceSummaryRow(savedSummary, "| Denied Decisions | 1 |", "| Denied Decisions | 0 |"),
    });
    expectStaleSummary({
      proposalPath,
      proposalJson,
      expectedSummary: savedSummary,
      summaryMarkdown: replaceSummaryRow(savedSummary, "| Transactions | 0 |", "| Transactions | 1 |"),
    });
  });
});

type Fixture = ReturnType<typeof getPolicyDecisionFixture>;

async function createFixtureArtifact(params: {
  objective: string;
  sourcePath: string;
  fixtures: Fixture[];
}) {
  const [firstFixture] = params.fixtures;
  if (!firstFixture) throw new Error("fixtures must include at least one fixture");

  const proposal = await createAgentPlanProposal({
    agent: firstFixture.agent,
    objective: params.objective,
    steps: params.fixtures.map((fixture) => ({
      id: fixture.id,
      title: fixture.title,
      action: fixture.action,
    })),
    simulatePolicy: createPolicyDecisionFixtureSimulator(),
  });

  return createAgentProposalOutput({
    chainId: 84532,
    manifestPath: "deployments/base-sepolia/latest.json",
    source: { type: "plan", path: params.sourcePath },
    proposal,
  });
}

function expectStaleSummary(params: {
  proposalPath: string;
  proposalJson: string;
  expectedSummary: string;
  summaryMarkdown: string;
}) {
  expect(
    verifyAgentProposalSummary({
      proposalPath: params.proposalPath,
      proposalJson: params.proposalJson,
      summaryMarkdown: params.summaryMarkdown,
    }),
  ).toEqual({
    passed: false,
    failures: ["proposal summary is stale"],
    expected: params.expectedSummary,
  });
}

function replaceSummaryRow(markdown: string, expected: string, replacement: string): string {
  const updated = markdown.replace(expected, replacement);
  expect(updated).not.toBe(markdown);
  return updated;
}
