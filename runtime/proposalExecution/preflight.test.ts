import { describe, expect, it } from "vitest";

import { createAgentProposalExecutionBundle } from "./bundle.js";
import { createAgentProposalExecutionPackage } from "./package.js";
import { verifyAgentProposalExecutionPreflight } from "./preflight.js";
import { createAgentProposalReviewApproval } from "../proposalReview/approval.js";
import { createAgentProposalReviewPackage } from "../proposalReview/package.js";

const AGENT = "0x0000000000000000000000000000000000000a01";
const TARGET = "0x0000000000000000000000000000000000000b01";
const REVIEWER = "0x0000000000000000000000000000000000000c01";
const CAPABILITY = `0x${"11".repeat(32)}`;
const GENERATED_AT = "2026-06-25T10:00:00.000Z";
const PREVIEW_PATH = "artifacts/example-agent-proposal-execution-preview.json";
const RUNBOOK_PATH = "artifacts/example-agent-proposal-execution-runbook.md";
const BUNDLE_PATH = "artifacts/example-agent-proposal-execution-bundle.json";
const PROPOSAL_PATH = "artifacts/example-agent-proposal.json";
const SUMMARY_PATH = "artifacts/example-agent-proposal.md";
const MANIFEST_PATH = "artifacts/example-agent-proposal-review.json";
const APPROVAL_PATH = "artifacts/example-agent-proposal-approval.json";

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

describe("verifyAgentProposalExecutionPreflight", () => {
  it("returns a passing signer handoff report for current package evidence", () => {
    const evidence = createBundleEvidence();
    const packageResult = createAgentProposalExecutionPackage(evidence);
    if (!packageResult.passed) throw new Error("test fixture package failed");

    expect(
      verifyAgentProposalExecutionPreflight({
        ...evidence,
        previewJson: packageResult.preview.json,
        runbookMarkdown: packageResult.runbook.markdown,
      }),
    ).toEqual({
      passed: true,
      preview: PREVIEW_PATH,
      runbook: RUNBOOK_PATH,
      bundle: BUNDLE_PATH,
      approval: APPROVAL_PATH,
      manifest: MANIFEST_PATH,
      proposal: PROPOSAL_PATH,
      summary: SUMMARY_PATH,
      chainId: 84532,
      agent: AGENT,
      objective: "Dry-run a structured plan",
      transactions: 1,
      checks: [
        { name: "execution-preview", passed: true, failures: [] },
        { name: "execution-runbook", passed: true, failures: [] },
        { name: "execution-package", passed: true, failures: [] },
      ],
    });
  });

  it("returns failed checks when package evidence is stale", () => {
    const evidence = createBundleEvidence();
    const packageResult = createAgentProposalExecutionPackage(evidence);
    if (!packageResult.passed) throw new Error("test fixture package failed");

    const report = verifyAgentProposalExecutionPreflight({
      ...evidence,
      previewJson: packageResult.preview.json,
      runbookMarkdown: packageResult.runbook.markdown.replace("| Signing | not included |", "| Signing | required |"),
    });

    expect(report.passed).toBe(false);
    expect(report.checks).toEqual([
      { name: "execution-preview", passed: true, failures: [] },
      {
        name: "execution-runbook",
        passed: false,
        failures: ["runbook markdown does not match current execution preview"],
      },
      {
        name: "execution-package",
        passed: false,
        failures: [
          "runbook markdown does not match current execution preview",
          "package runbook Markdown does not match current execution package",
        ],
      },
    ]);
  });
});

function createBundleEvidence() {
  const proposalJson = JSON.stringify(EXECUTABLE_PLAN_ARTIFACT);
  const reviewPackage = createAgentProposalReviewPackage({
    proposalPath: PROPOSAL_PATH,
    proposalJson,
    summaryPath: SUMMARY_PATH,
    manifestPath: MANIFEST_PATH,
    generatedAt: GENERATED_AT,
  });
  if (!reviewPackage.passed || reviewPackage.manifest === null) throw new Error("test fixture package failed");
  const manifestJson = JSON.stringify(reviewPackage.manifest, null, 2);
  const approval = createAgentProposalReviewApproval({
    manifestPath: MANIFEST_PATH,
    manifestJson,
    proposalPath: PROPOSAL_PATH,
    proposalJson,
    summaryPath: SUMMARY_PATH,
    summaryMarkdown: reviewPackage.summary.markdown,
    reviewer: REVIEWER,
    decision: "approved",
    generatedAt: GENERATED_AT,
  });
  if (!approval.passed || approval.approval === null) throw new Error("test fixture approval failed");
  const approvalJson = JSON.stringify(approval.approval, null, 2);
  const bundle = createAgentProposalExecutionBundle({
    approvalPath: APPROVAL_PATH,
    approvalJson,
    manifestPath: MANIFEST_PATH,
    manifestJson,
    proposalPath: PROPOSAL_PATH,
    proposalJson,
    summaryPath: SUMMARY_PATH,
    summaryMarkdown: reviewPackage.summary.markdown,
    generatedAt: GENERATED_AT,
  });
  if (!bundle.passed || bundle.bundle === null) throw new Error("test fixture bundle failed");
  return {
    previewPath: PREVIEW_PATH,
    runbookPath: RUNBOOK_PATH,
    bundlePath: BUNDLE_PATH,
    bundleJson: JSON.stringify(bundle.bundle, null, 2),
    approvalPath: APPROVAL_PATH,
    approvalJson,
    manifestPath: MANIFEST_PATH,
    manifestJson,
    proposalPath: PROPOSAL_PATH,
    proposalJson,
    summaryPath: SUMMARY_PATH,
    summaryMarkdown: reviewPackage.summary.markdown,
    generatedAt: GENERATED_AT,
  };
}
