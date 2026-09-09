import { describe, expect, it } from "vitest";

import { createAgentPlanProposal } from "../agentPlanning/planProposal.js";
import {
  createPolicyDecisionFixtureSimulator,
  getPolicyDecisionFixture,
} from "../fixtures/policyDecisions.js";
import { createAgentProposalOutput } from "../proposal/output.js";
import { createAgentProposalSummary } from "../proposal/summary.js";
import { createAgentProposalReviewApproval } from "./approval.js";
import { verifyAgentProposalReviewApproval } from "./approvalVerify.js";
import { createAgentProposalReviewPackage } from "./package.js";

const GENERATED_AT = "2026-06-28T16:10:00.000Z";
const REVIEWER = "0x0000000000000000000000000000000000000c01";

describe("proposal review approval fixture integration", () => {
  it.each(["allowed-swap", "allowed-memory"] as const)("approves executable fixture review packages and verifies the saved approval (%s)", async (fixtureId) => {
    const allowedSwap = getPolicyDecisionFixture(fixtureId);
    const evidence = await createFixtureReviewPackage({
      objective: "Approve allowed fixture package",
      proposalPath: "artifacts/fixture-allowed-proposal.json",
      summaryPath: "artifacts/fixture-allowed-proposal.md",
      manifestPath: "artifacts/fixture-allowed-proposal-review.json",
      sourcePath: "artifacts/fixture-allowed-plan.json",
      fixtures: [allowedSwap],
    });

    const approval = createAgentProposalReviewApproval({
      ...evidence,
      reviewer: REVIEWER,
      decision: "approved",
      generatedAt: GENERATED_AT,
    });

    expect(approval.passed).toBe(true);
    expect(approval.failures).toEqual([]);
    expect(approval.approval?.decision).toBe("approved");
    expect(approval.approval?.preflight.executable).toBe(true);
    expect(approval.approval?.preflight.transactions).toBe(1);
    expect(
      verifyAgentProposalReviewApproval({
        ...evidence,
        approvalJson: JSON.stringify(approval.approval, null, 2),
      }),
    ).toEqual({
      passed: true,
      failures: [],
      manifestVerification: { passed: true, failures: [] },
    });
  });

  it("requires denied fixture review packages to be rejected rather than approved", async () => {
    const allowedSwap = getPolicyDecisionFixture("allowed-swap");
    const deniedCapability = getPolicyDecisionFixture("denied-capability");
    const evidence = await createFixtureReviewPackage({
      objective: "Reject denied fixture package",
      proposalPath: "artifacts/fixture-denied-proposal.json",
      summaryPath: "artifacts/fixture-denied-proposal.md",
      manifestPath: "artifacts/fixture-denied-proposal-review.json",
      sourcePath: "artifacts/fixture-denied-plan.json",
      fixtures: [allowedSwap, deniedCapability],
    });

    expect(
      createAgentProposalReviewApproval({
        ...evidence,
        reviewer: REVIEWER,
        decision: "approved",
        generatedAt: GENERATED_AT,
      }),
    ).toMatchObject({
      passed: false,
      failures: [
        "approved review packages must be executable",
        "approved review packages must include at least one transaction",
      ],
      manifestVerification: { passed: true, failures: [] },
      approval: null,
    });

    const rejection = createAgentProposalReviewApproval({
      ...evidence,
      reviewer: REVIEWER,
      decision: "rejected",
      generatedAt: GENERATED_AT,
    });

    expect(rejection.passed).toBe(true);
    expect(rejection.failures).toEqual([]);
    expect(rejection.approval?.decision).toBe("rejected");
    expect(rejection.approval?.preflight.executable).toBe(false);
    expect(rejection.approval?.preflight.transactions).toBe(0);
    expect(
      verifyAgentProposalReviewApproval({
        ...evidence,
        approvalJson: JSON.stringify(rejection.approval, null, 2),
      }),
    ).toEqual({
      passed: true,
      failures: [],
      manifestVerification: { passed: true, failures: [] },
    });
  });

  it.each(["allowed-swap", "allowed-memory"] as const)("blocks approval creation when fixture package summary evidence is stale (%s)", async (fixtureId) => {
    const allowedSwap = getPolicyDecisionFixture(fixtureId);
    const evidence = await createFixtureReviewPackage({
      objective: "Block stale fixture package",
      proposalPath: "artifacts/fixture-stale-proposal.json",
      summaryPath: "artifacts/fixture-stale-proposal.md",
      manifestPath: "artifacts/fixture-stale-proposal-review.json",
      sourcePath: "artifacts/fixture-stale-plan.json",
      fixtures: [allowedSwap],
    });
    const staleSummary = replaceSummaryRow(
      evidence.summaryMarkdown,
      "| Transactions | 1 |",
      "| Transactions | 0 |",
    );

    expect(
      createAgentProposalReviewApproval({
        ...evidence,
        summaryMarkdown: staleSummary,
        reviewer: REVIEWER,
        decision: "approved",
        generatedAt: GENERATED_AT,
      }),
    ).toEqual({
      passed: false,
      failures: [
        "summary sha256 does not match current summary",
        "preflight report does not match current proposal review",
      ],
      manifestVerification: {
        passed: false,
        failures: [
          "summary sha256 does not match current summary",
          "preflight report does not match current proposal review",
        ],
      },
      approval: null,
    });
  });
});

type Fixture = ReturnType<typeof getPolicyDecisionFixture>;

async function createFixtureReviewPackage(params: {
  objective: string;
  proposalPath: string;
  summaryPath: string;
  manifestPath: string;
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
  const reviewPackage = createAgentProposalReviewPackage({
    proposalPath: params.proposalPath,
    proposalJson,
    summaryPath: params.summaryPath,
    summaryMarkdown,
    manifestPath: params.manifestPath,
    generatedAt: GENERATED_AT,
  });

  if (!reviewPackage.passed || reviewPackage.manifest === null) {
    throw new Error(`fixture review package failed: ${reviewPackage.failures.join(", ")}`);
  }

  return {
    manifestPath: params.manifestPath,
    manifestJson: JSON.stringify(reviewPackage.manifest, null, 2),
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
