import { describe, expect, it } from "vitest";

import { createAgentProposalExecutionBundle } from "./bundle.js";
import { createAgentProposalExecutionPreview } from "./preview.js";
import { createAgentProposalExecutionRunbook } from "./runbook.js";
import { createAgentProposalReviewApproval } from "../proposalReview/approval.js";
import { createAgentProposalReviewPackage } from "../proposalReview/package.js";

const AGENT = "0x0000000000000000000000000000000000000a01";
const TARGET = "0x0000000000000000000000000000000000000b01";
const REVIEWER = "0x0000000000000000000000000000000000000c01";
const CAPABILITY = `0x${"11".repeat(32)}`;
const GENERATED_AT = "2026-06-25T10:00:00.000Z";
const PREVIEW_PATH = "artifacts/example-agent-proposal-execution-preview.json";
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

describe("createAgentProposalExecutionRunbook", () => {
  it("renders a Markdown execution runbook from verified preview evidence", () => {
    const evidence = createPreviewEvidence();
    const result = createAgentProposalExecutionRunbook(evidence);

    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.transactions).toBe(1);
    expect(result.markdown).toContain("# Agent Proposal Execution Runbook");
    expect(result.markdown).toContain(`| Preview | ${PREVIEW_PATH} |`);
    expect(result.markdown).toContain(`| Bundle | ${BUNDLE_PATH} |`);
    expect(result.markdown).toContain("| Chain ID | 84532 |");
    expect(result.markdown).toContain(`| Agent | ${AGENT} |`);
    expect(result.markdown).toContain("| Signing | not included |");
    expect(result.markdown).toContain("| 0 | step-1 | Allowed action | 0x0000000000000000000000000000000000000a01 | 123 | 2 |");
  });

  it("does not render a runbook when preview verification fails", () => {
    const evidence = createPreviewEvidence();
    const preview = JSON.parse(evidence.previewJson);
    preview.transactions[0].value = "456";

    expect(
      createAgentProposalExecutionRunbook({
        ...evidence,
        previewJson: JSON.stringify(preview, null, 2),
      }),
    ).toEqual({
      passed: false,
      failures: ["preview transactions do not match current execution bundle"],
      verification: expect.objectContaining({
        passed: false,
        failures: ["preview transactions do not match current execution bundle"],
      }),
      markdown: "",
      transactions: 0,
    });
  });
});

function createPreviewEvidence() {
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
  const bundleJson = JSON.stringify(bundle.bundle, null, 2);
  const preview = createAgentProposalExecutionPreview({
    bundlePath: BUNDLE_PATH,
    bundleJson,
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
  if (!preview.passed || preview.preview === null) throw new Error("test fixture preview failed");
  return {
    previewPath: PREVIEW_PATH,
    previewJson: JSON.stringify(preview.preview, null, 2),
    bundlePath: BUNDLE_PATH,
    bundleJson,
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
