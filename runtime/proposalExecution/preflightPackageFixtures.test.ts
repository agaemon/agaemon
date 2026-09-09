import { describe, expect, it } from "vitest";

import { createAgentPlanProposal } from "../agentPlanning/planProposal.js";
import {
  createPolicyDecisionFixtureSimulator,
  getPolicyDecisionFixture,
} from "../fixtures/policyDecisions.js";
import { createAgentProposalOutput } from "../proposal/output.js";
import { createAgentProposalSummary } from "../proposal/summary.js";
import { createAgentProposalReviewApproval } from "../proposalReview/approval.js";
import { createAgentProposalReviewPackage } from "../proposalReview/package.js";
import { createAgentProposalExecutionBundle } from "./bundle.js";
import { createAgentProposalExecutionPackage } from "./package.js";
import { verifyAgentProposalExecutionPreflight } from "./preflight.js";

const GENERATED_AT = "2026-06-28T16:35:00.000Z";
const REVIEWER = "0x0000000000000000000000000000000000000c01";
const PREVIEW_PATH = "artifacts/fixture-agent-proposal-execution-preview.json";
const RUNBOOK_PATH = "artifacts/fixture-agent-proposal-execution-runbook.md";
const BUNDLE_PATH = "artifacts/fixture-agent-proposal-execution-bundle.json";

describe("proposal execution fixture integration", () => {
  it.each(["allowed-swap", "allowed-memory"] as const)("packages approved executable fixture review evidence and passes execution preflight (%s)", async (fixtureId) => {
    const allowedSwap = getPolicyDecisionFixture(fixtureId);
    const evidence = await createFixtureExecutionEvidence({
      objective: "Package approved fixture execution",
      proposalPath: "artifacts/fixture-execution-proposal.json",
      summaryPath: "artifacts/fixture-execution-proposal.md",
      manifestPath: "artifacts/fixture-execution-review.json",
      approvalPath: "artifacts/fixture-execution-approval.json",
      sourcePath: "artifacts/fixture-execution-plan.json",
      fixtures: [allowedSwap],
      decision: "approved",
    });

    const executionPackage = createAgentProposalExecutionPackage(evidence);

    expect(executionPackage.passed).toBe(true);
    expect(executionPackage.failures).toEqual([]);
    expect(executionPackage.preview.path).toBe(PREVIEW_PATH);
    expect(executionPackage.preview.json).toContain("\"transactions\"");
    expect(executionPackage.runbook.path).toBe(RUNBOOK_PATH);
    expect(executionPackage.runbook.markdown).toContain("# Agent Proposal Execution Runbook");
    expect(executionPackage.previewVerification.passed).toBe(true);
    expect(executionPackage.runbookVerification?.passed).toBe(true);
    expect(
      verifyAgentProposalExecutionPreflight({
        ...evidence,
        previewJson: executionPackage.preview.json,
        runbookMarkdown: executionPackage.runbook.markdown,
      }),
    ).toMatchObject({
      passed: true,
      preview: PREVIEW_PATH,
      runbook: RUNBOOK_PATH,
      bundle: BUNDLE_PATH,
      approval: "artifacts/fixture-execution-approval.json",
      manifest: "artifacts/fixture-execution-review.json",
      proposal: "artifacts/fixture-execution-proposal.json",
      summary: "artifacts/fixture-execution-proposal.md",
      chainId: 84532,
      transactions: 1,
      checks: [
        { name: "execution-preview", passed: true, failures: [] },
        { name: "execution-runbook", passed: true, failures: [] },
        { name: "execution-package", passed: true, failures: [] },
      ],
    });
  });

  it.each(["allowed-swap", "allowed-memory"] as const)("blocks rejected fixture approval evidence from execution packaging (%s)", async (fixtureId) => {
    const allowedSwap = getPolicyDecisionFixture(fixtureId);
    const objective = "Create fixture execution approval decision";
    const approvedEvidence = await createFixtureExecutionEvidence({
      objective,
      proposalPath: "artifacts/fixture-rejected-proposal.json",
      summaryPath: "artifacts/fixture-rejected-proposal.md",
      manifestPath: "artifacts/fixture-rejected-review.json",
      approvalPath: "artifacts/fixture-rejected-approval.json",
      sourcePath: "artifacts/fixture-rejected-plan.json",
      fixtures: [allowedSwap],
      decision: "approved",
    });
    const rejectedEvidence = await createFixtureExecutionEvidence({
      objective,
      proposalPath: "artifacts/fixture-rejected-proposal.json",
      summaryPath: "artifacts/fixture-rejected-proposal.md",
      manifestPath: "artifacts/fixture-rejected-review.json",
      approvalPath: "artifacts/fixture-rejected-approval.json",
      sourcePath: "artifacts/fixture-rejected-plan.json",
      fixtures: [allowedSwap],
      decision: "rejected",
      skipBundle: true,
    });

    const executionPackage = createAgentProposalExecutionPackage({
      ...approvedEvidence,
      approvalJson: rejectedEvidence.approvalJson,
    });

    expect(executionPackage).toMatchObject({
      passed: false,
      failures: ["execution bundles require an approved review decision"],
      preview: { path: PREVIEW_PATH, json: "" },
      runbook: { path: RUNBOOK_PATH, markdown: "" },
      previewVerification: {
        passed: false,
        failures: ["execution bundles require an approved review decision"],
      },
      runbookVerification: null,
    });
  });

  it.each(["allowed-swap", "allowed-memory"] as const)("blocks stale fixture approval evidence from execution packaging (%s)", async (fixtureId) => {
    const allowedSwap = getPolicyDecisionFixture(fixtureId);
    const evidence = await createFixtureExecutionEvidence({
      objective: "Block stale fixture execution approval",
      proposalPath: "artifacts/fixture-stale-execution-proposal.json",
      summaryPath: "artifacts/fixture-stale-execution-proposal.md",
      manifestPath: "artifacts/fixture-stale-execution-review.json",
      approvalPath: "artifacts/fixture-stale-execution-approval.json",
      sourcePath: "artifacts/fixture-stale-execution-plan.json",
      fixtures: [allowedSwap],
      decision: "approved",
    });
    const staleApproval = {
      ...JSON.parse(evidence.approvalJson),
      generatedAt: "2026-06-28T16:36:00.000Z",
    };

    const executionPackage = createAgentProposalExecutionPackage({
      ...evidence,
      approvalJson: JSON.stringify(staleApproval, null, 2),
    });

    expect(executionPackage).toMatchObject({
      passed: false,
      failures: ["bundle approval sha256 does not match current approval"],
      preview: { path: PREVIEW_PATH, json: "" },
      runbook: { path: RUNBOOK_PATH, markdown: "" },
      previewVerification: {
        passed: false,
        failures: ["bundle approval sha256 does not match current approval"],
      },
      runbookVerification: null,
    });
  });
});

type Fixture = ReturnType<typeof getPolicyDecisionFixture>;

async function createFixtureExecutionEvidence(params: {
  objective: string;
  proposalPath: string;
  summaryPath: string;
  manifestPath: string;
  approvalPath: string;
  sourcePath: string;
  fixtures: Fixture[];
  decision: "approved" | "rejected";
  skipBundle?: boolean;
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

  const manifestJson = JSON.stringify(reviewPackage.manifest, null, 2);
  const approval = createAgentProposalReviewApproval({
    manifestPath: params.manifestPath,
    manifestJson,
    proposalPath: params.proposalPath,
    proposalJson,
    summaryPath: params.summaryPath,
    summaryMarkdown,
    reviewer: REVIEWER,
    decision: params.decision,
    generatedAt: GENERATED_AT,
  });
  if (!approval.passed || approval.approval === null) {
    throw new Error(`fixture approval failed: ${approval.failures.join(", ")}`);
  }

  const approvalJson = JSON.stringify(approval.approval, null, 2);
  const baseEvidence = {
    previewPath: PREVIEW_PATH,
    runbookPath: RUNBOOK_PATH,
    bundlePath: BUNDLE_PATH,
    approvalPath: params.approvalPath,
    approvalJson,
    manifestPath: params.manifestPath,
    manifestJson,
    proposalPath: params.proposalPath,
    proposalJson,
    summaryPath: params.summaryPath,
    summaryMarkdown,
    generatedAt: GENERATED_AT,
  };

  if (params.skipBundle) return { ...baseEvidence, bundleJson: "" };

  const bundle = createAgentProposalExecutionBundle(baseEvidence);
  if (!bundle.passed || bundle.bundle === null) {
    throw new Error(`fixture execution bundle failed: ${bundle.failures.join(", ")}`);
  }

  return {
    ...baseEvidence,
    bundleJson: JSON.stringify(bundle.bundle, null, 2),
  };
}
