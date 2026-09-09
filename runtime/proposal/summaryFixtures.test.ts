import { describe, expect, it } from "vitest";

import { createAgentPlanProposal } from "../agentPlanning/planProposal.js";
import {
  createPolicyDecisionFixtureSimulator,
  getPolicyDecisionFixture,
} from "../fixtures/policyDecisions.js";
import { createAgentProposalOutput } from "./output.js";
import { createAgentProposalSummary } from "./summary.js";

describe("createAgentProposalSummary fixture integration", () => {
  it("renders readable decision and transaction counts for unverified fixture sequences", async () => {
    const allowedSwap = getPolicyDecisionFixture("allowed-swap");
    const allowedMemory = getPolicyDecisionFixture("allowed-memory");
    const artifact = await createFixtureArtifact({
      objective: "Summarize allowed fixture plan",
      sourcePath: "artifacts/fixture-allowed-plan.json",
      fixtures: [allowedSwap, allowedMemory],
    });

    const summary = createAgentProposalSummary({
      proposalPath: "artifacts/fixture-allowed-proposal.json",
      proposalJson: JSON.stringify(artifact),
    });

    expect(summary.passed).toBe(true);
    expect(summary.markdown).toContain("| Executable | no |");
    expect(summary.markdown).toContain("| Steps | 2 |");
    expect(summary.markdown).toContain("| Allowed Decisions | 2 |");
    expect(summary.markdown).toContain("| Denied Decisions | 0 |");
    expect(summary.markdown).toContain("| Transactions | 0 |");
    expect(summary.markdown).toContain(
      `| ${allowedSwap.id} | ${allowedSwap.title} | Allowed | ${allowedSwap.action.target} | ${allowedSwap.action.value} | suppressed |`,
    );
    expect(summary.transactions).toBe(0);
    expect(summary.markdown).toContain("Sequence execution, cumulative limits, and step dependencies are unverified");
  });

  it("renders readable decision and transaction counts for denied fixture artifacts", async () => {
    const allowedSwap = getPolicyDecisionFixture("allowed-swap");
    const deniedCapability = getPolicyDecisionFixture("denied-capability");
    const artifact = await createFixtureArtifact({
      objective: "Summarize denied fixture plan",
      sourcePath: "artifacts/fixture-denied-plan.json",
      fixtures: [allowedSwap, deniedCapability],
    });

    const summary = createAgentProposalSummary({
      proposalPath: "artifacts/fixture-denied-proposal.json",
      proposalJson: JSON.stringify(artifact),
    });

    expect(summary.passed).toBe(true);
    expect(summary.markdown).toContain("| Executable | no |");
    expect(summary.markdown).toContain("| Steps | 2 |");
    expect(summary.markdown).toContain("| Allowed Decisions | 1 |");
    expect(summary.markdown).toContain("| Denied Decisions | 1 |");
    expect(summary.markdown).toContain("| Transactions | 0 |");
    expect(summary.markdown).toContain(
      `| ${deniedCapability.id} | ${deniedCapability.title} | CapabilityDenied | ${deniedCapability.action.target} | ${deniedCapability.action.value} | suppressed |`,
    );
    expect(summary.transactions).toBe(0);
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
