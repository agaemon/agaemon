import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createAgentProposalReviewApproval } from "../proposalReview/approval.js";
import { createAgentProposalExecutionBundle } from "./bundle.js";
import { createAgentProposalReviewPackage } from "../proposalReview/package.js";

const AGENT = "0x0000000000000000000000000000000000000a01";
const TARGET = "0x0000000000000000000000000000000000000b01";
const REVIEWER = "0x0000000000000000000000000000000000000c01";
const CAPABILITY = `0x${"11".repeat(32)}`;
const GENERATED_AT = "2026-06-25T10:00:00.000Z";
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

describe("createAgentProposalExecutionBundle", () => {
  it("creates a deterministic bundle from an approved executable review package", () => {
    const evidence = createEvidence("approved");

    expect(
      createAgentProposalExecutionBundle({
        approvalPath: APPROVAL_PATH,
        approvalJson: evidence.approvalJson,
        manifestPath: MANIFEST_PATH,
        manifestJson: evidence.manifestJson,
        proposalPath: PROPOSAL_PATH,
        proposalJson: evidence.proposalJson,
        summaryPath: SUMMARY_PATH,
        summaryMarkdown: evidence.summaryMarkdown,
        generatedAt: GENERATED_AT,
      }),
    ).toEqual({
      passed: true,
      failures: [],
      approvalVerification: { passed: true, failures: [], manifestVerification: { passed: true, failures: [] } },
      bundle: {
        schemaVersion: 1,
        generatedAt: GENERATED_AT,
        chainId: 84532,
        objective: "Dry-run a structured plan",
        agent: AGENT,
        approval: { path: APPROVAL_PATH, sha256: sha256(evidence.approvalJson) },
        manifest: { path: MANIFEST_PATH, sha256: sha256(evidence.manifestJson) },
        proposal: { path: PROPOSAL_PATH, sha256: sha256(evidence.proposalJson) },
        summary: { path: SUMMARY_PATH, sha256: sha256(evidence.summaryMarkdown) },
        transactions: [
          {
            stepId: "step-1",
            title: "Allowed action",
            to: AGENT,
            value: "123",
            data: "0xabcd",
          },
        ],
      },
    });
  });

  it("rejects rejected review decisions", () => {
    const evidence = createEvidence("rejected");

    expect(
      createAgentProposalExecutionBundle({
        approvalPath: APPROVAL_PATH,
        approvalJson: evidence.approvalJson,
        manifestPath: MANIFEST_PATH,
        manifestJson: evidence.manifestJson,
        proposalPath: PROPOSAL_PATH,
        proposalJson: evidence.proposalJson,
        summaryPath: SUMMARY_PATH,
        summaryMarkdown: evidence.summaryMarkdown,
        generatedAt: GENERATED_AT,
      }),
    ).toEqual({
      passed: false,
      failures: ["execution bundles require an approved review decision"],
      approvalVerification: { passed: true, failures: [], manifestVerification: { passed: true, failures: [] } },
      bundle: null,
    });
  });
});

function createEvidence(decision: "approved" | "rejected") {
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
    decision,
    generatedAt: GENERATED_AT,
  });
  if (!approval.passed || approval.approval === null) throw new Error("test fixture approval failed");
  return {
    approvalJson: JSON.stringify(approval.approval, null, 2),
    manifestJson,
    proposalJson,
    summaryMarkdown: reviewPackage.summary.markdown,
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
