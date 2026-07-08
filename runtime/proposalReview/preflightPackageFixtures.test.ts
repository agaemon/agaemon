import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createAgentPlanProposal } from "../agentPlanning/planProposal.js";
import {
  createPolicyDecisionFixtureSimulator,
  getPolicyDecisionFixture,
} from "../fixtures/policyDecisions.js";
import { createAgentProposalOutput } from "../proposal/output.js";
import { createAgentProposalSummary } from "../proposal/summary.js";
import { createAgentProposalReviewPackage } from "./package.js";
import { verifyAgentProposalReviewPreflight } from "./preflight.js";

const GENERATED_AT = "2026-06-28T15:45:00.000Z";

describe("proposal review fixture integration", () => {
  it("preflights and packages saved executable fixture proposal evidence", async () => {
    const allowedSwap = getPolicyDecisionFixture("allowed-swap");
    const allowedMemory = getPolicyDecisionFixture("allowed-memory");
    const fixture = await createFixtureReviewEvidence({
      objective: "Review allowed fixture proposal",
      proposalPath: "artifacts/fixture-allowed-proposal.json",
      summaryPath: "artifacts/fixture-allowed-proposal.md",
      sourcePath: "artifacts/fixture-allowed-plan.json",
      fixtures: [allowedSwap, allowedMemory],
    });

    expect(fixture.summaryMarkdown).toContain("# Agent Proposal Review");
    expect(fixture.summaryMarkdown).toContain("| Allowed Decisions | 2 |");
    expect(fixture.summaryMarkdown).toContain("| Transactions | 2 |");
    expect(
      verifyAgentProposalReviewPreflight({
        proposalPath: fixture.proposalPath,
        proposalJson: fixture.proposalJson,
        summaryPath: fixture.summaryPath,
        summaryMarkdown: fixture.summaryMarkdown,
      }),
    ).toEqual({
      passed: true,
      proposal: fixture.proposalPath,
      summary: fixture.summaryPath,
      source: "plan",
      sourcePath: "artifacts/fixture-allowed-plan.json",
      chainId: 84532,
      executable: true,
      steps: 2,
      transactions: 2,
      checks: [
        { name: "proposal-artifact", passed: true, failures: [] },
        { name: "proposal-summary", passed: true, failures: [] },
      ],
    });

    const reviewPackage = createAgentProposalReviewPackage({
      proposalPath: fixture.proposalPath,
      proposalJson: fixture.proposalJson,
      summaryPath: fixture.summaryPath,
      summaryMarkdown: fixture.summaryMarkdown,
      manifestPath: "artifacts/fixture-allowed-proposal-review.json",
      generatedAt: GENERATED_AT,
    });

    expect(reviewPackage.passed).toBe(true);
    expect(reviewPackage.failures).toEqual([]);
    expect(reviewPackage.summary).toEqual({
      path: fixture.summaryPath,
      markdown: fixture.summaryMarkdown,
    });
    expect(reviewPackage.manifest?.generatedAt).toBe(GENERATED_AT);
    expect(reviewPackage.manifest?.proposal.sha256).toBe(sha256(fixture.proposalJson));
    expect(reviewPackage.manifest?.summary.sha256).toBe(sha256(fixture.summaryMarkdown));
    expect(reviewPackage.manifest?.preflight.passed).toBe(true);
    expect(reviewPackage.manifestVerification).toEqual({ passed: true, failures: [] });
  });

  it("blocks stale denied fixture summaries from preflight and package evidence", async () => {
    const allowedSwap = getPolicyDecisionFixture("allowed-swap");
    const deniedCapability = getPolicyDecisionFixture("denied-capability");
    const fixture = await createFixtureReviewEvidence({
      objective: "Review denied fixture proposal",
      proposalPath: "artifacts/fixture-denied-proposal.json",
      summaryPath: "artifacts/fixture-denied-proposal.md",
      sourcePath: "artifacts/fixture-denied-plan.json",
      fixtures: [allowedSwap, deniedCapability],
    });
    const staleSummary = replaceSummaryRow(
      fixture.summaryMarkdown,
      "| Denied Decisions | 1 |",
      "| Denied Decisions | 0 |",
    );

    expect(fixture.summaryMarkdown).toContain("| Executable | no |");
    expect(fixture.summaryMarkdown).toContain("| Transactions | 0 |");
    expect(
      verifyAgentProposalReviewPreflight({
        proposalPath: fixture.proposalPath,
        proposalJson: fixture.proposalJson,
        summaryPath: fixture.summaryPath,
        summaryMarkdown: staleSummary,
      }),
    ).toMatchObject({
      passed: false,
      executable: false,
      transactions: 0,
      checks: [
        { name: "proposal-artifact", passed: true, failures: [] },
        { name: "proposal-summary", passed: false, failures: ["proposal summary is stale"] },
      ],
    });

    expect(
      createAgentProposalReviewPackage({
        proposalPath: fixture.proposalPath,
        proposalJson: fixture.proposalJson,
        summaryPath: fixture.summaryPath,
        summaryMarkdown: staleSummary,
        manifestPath: "artifacts/fixture-denied-proposal-review.json",
        generatedAt: GENERATED_AT,
      }),
    ).toEqual({
      passed: false,
      failures: ["proposal summary is stale"],
      proposal: fixture.proposalPath,
      summary: { path: fixture.summaryPath, markdown: staleSummary },
      manifestPath: "artifacts/fixture-denied-proposal-review.json",
      manifest: null,
      manifestVerification: null,
    });
  });
});

type Fixture = ReturnType<typeof getPolicyDecisionFixture>;

async function createFixtureReviewEvidence(params: {
  objective: string;
  proposalPath: string;
  summaryPath: string;
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
  const artifact = createAgentProposalOutput({
    chainId: 84532,
    manifestPath: "deployments/base-sepolia/latest.json",
    source: { type: "plan", path: params.sourcePath },
    proposal,
  });
  const proposalJson = JSON.stringify(artifact);
  const summaryMarkdown = createAgentProposalSummary({
    proposalPath: params.proposalPath,
    proposalJson,
  }).markdown;

  return {
    proposalPath: params.proposalPath,
    proposalJson,
    summaryPath: params.summaryPath,
    summaryMarkdown,
  };
}

function replaceSummaryRow(markdown: string, expected: string, replacement: string): string {
  const updated = markdown.replace(expected, replacement);
  expect(updated).not.toBe(markdown);
  return updated;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
