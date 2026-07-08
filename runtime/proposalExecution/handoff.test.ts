import { describe, expect, it } from "vitest";

import { createAgentProposalExecutionBundle } from "./bundle.js";
import { createAgentProposalExecutionHandoff } from "./handoff.js";
import { createAgentProposalReviewApproval } from "../proposalReview/approval.js";
import { createAgentProposalReviewPackage } from "../proposalReview/package.js";

const AGENT = "0x0000000000000000000000000000000000000a01";
const TARGET = "0x0000000000000000000000000000000000000b01";
const REVIEWER = "0x0000000000000000000000000000000000000c01";
const CAPABILITY = `0x${"11".repeat(32)}`;
const GENERATED_AT = "2026-06-25T10:00:00.000Z";
const PREVIEW_PATH = "artifacts/example-agent-proposal-execution-preview.json";
const RUNBOOK_PATH = "artifacts/example-agent-proposal-execution-runbook.md";
const EXECUTION_MANIFEST_PATH = "artifacts/example-agent-proposal-execution-manifest.json";
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

describe("createAgentProposalExecutionHandoff", () => {
  it("builds and verifies all signer handoff artifacts", () => {
    const evidence = createBundleEvidence();

    const handoff = createAgentProposalExecutionHandoff({
      ...evidence,
      previewPath: PREVIEW_PATH,
      runbookPath: RUNBOOK_PATH,
      executionManifestPath: EXECUTION_MANIFEST_PATH,
    });

    expect(handoff.passed).toBe(true);
    expect(handoff.failures).toEqual([]);
    expect(handoff.preview.path).toBe(PREVIEW_PATH);
    expect(JSON.parse(handoff.preview.json).transactions).toHaveLength(1);
    expect(handoff.runbook.path).toBe(RUNBOOK_PATH);
    expect(handoff.runbook.markdown).toContain("# Agent Proposal Execution Runbook");
    expect(handoff.executionManifest.path).toBe(EXECUTION_MANIFEST_PATH);
    expect(JSON.parse(handoff.executionManifest.json).preflight.passed).toBe(true);
    if (handoff.executionManifestVerification === null) throw new Error("expected manifest verification");
    expect(handoff.executionManifestVerification.passed).toBe(true);
  });

  it("does not build handoff artifacts when the execution bundle is stale", () => {
    const evidence = createBundleEvidence();
    const bundle = JSON.parse(evidence.bundleJson);
    bundle.transactions[0].value = "456";

    expect(
      createAgentProposalExecutionHandoff({
        ...evidence,
        bundleJson: JSON.stringify(bundle, null, 2),
        previewPath: PREVIEW_PATH,
        runbookPath: RUNBOOK_PATH,
        executionManifestPath: EXECUTION_MANIFEST_PATH,
      }),
    ).toEqual({
      passed: false,
      failures: ["bundle transactions do not match current approved proposal"],
      preview: { path: PREVIEW_PATH, json: "" },
      runbook: { path: RUNBOOK_PATH, markdown: "" },
      executionManifest: { path: EXECUTION_MANIFEST_PATH, json: "" },
      executionPackage: expect.objectContaining({
        passed: false,
        failures: ["bundle transactions do not match current approved proposal"],
      }),
      executionManifestVerification: null,
    });
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
