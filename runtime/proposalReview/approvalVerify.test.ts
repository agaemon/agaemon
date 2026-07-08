import { describe, expect, it } from "vitest";

import { createAgentProposalReviewApproval } from "./approval.js";
import { verifyAgentProposalReviewApproval } from "./approvalVerify.js";
import { createAgentProposalReviewPackage } from "./package.js";

const AGENT = "0x0000000000000000000000000000000000000a01";
const TARGET = "0x0000000000000000000000000000000000000b01";
const REVIEWER = "0x0000000000000000000000000000000000000c01";
const CAPABILITY = `0x${"11".repeat(32)}`;
const GENERATED_AT = "2026-06-25T10:00:00.000Z";
const PROPOSAL_PATH = "artifacts/example-agent-proposal.json";
const SUMMARY_PATH = "artifacts/example-agent-proposal.md";
const MANIFEST_PATH = "artifacts/example-agent-proposal-review.json";

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

const DENIED_INTENT_ARTIFACT = {
  mode: "dry-run",
  chainId: 84532,
  manifest: "deployments/base-sepolia/latest.json",
  intent: "artifacts/example-agent-intents.json",
  objective: "Dry-run operator intents",
  agent: AGENT,
  executable: false,
  steps: [
    {
      id: "intent-1",
      title: "Denied action",
      action: {
        capability: CAPABILITY,
        target: TARGET,
        valueWei: "0",
        data: "0x1234",
        usesBorrowing: false,
      },
      decision: {
        allowed: false,
        code: "CapabilityDenied",
      },
      transaction: null,
    },
  ],
};

describe("verifyAgentProposalReviewApproval", () => {
  it("passes when the saved approval matches the current review package", () => {
    const evidence = createApprovalEvidence(JSON.stringify(EXECUTABLE_PLAN_ARTIFACT), "approved");

    expect(verifyAgentProposalReviewApproval(evidence)).toEqual({
      passed: true,
      failures: [],
      manifestVerification: { passed: true, failures: [] },
    });
  });

  it("rejects approvals when the manifest file changed after approval", () => {
    const evidence = createApprovalEvidence(JSON.stringify(EXECUTABLE_PLAN_ARTIFACT), "approved");
    const currentManifest = {
      ...JSON.parse(evidence.manifestJson),
      generatedAt: "2026-06-25T11:00:00.000Z",
    };

    expect(
      verifyAgentProposalReviewApproval({
        ...evidence,
        manifestJson: JSON.stringify(currentManifest, null, 2),
      }),
    ).toEqual({
      passed: false,
      failures: ["approval manifest sha256 does not match current manifest"],
      manifestVerification: { passed: true, failures: [] },
    });
  });

  it("rejects mutated approvals that approve non-executable review evidence", () => {
    const evidence = createApprovalEvidence(JSON.stringify(DENIED_INTENT_ARTIFACT), "rejected");
    const approval = {
      ...JSON.parse(evidence.approvalJson),
      decision: "approved",
    };

    expect(
      verifyAgentProposalReviewApproval({
        ...evidence,
        approvalJson: JSON.stringify(approval, null, 2),
      }),
    ).toEqual({
      passed: false,
      failures: [
        "approved approval artifacts must be executable",
        "approved approval artifacts must include at least one transaction",
      ],
      manifestVerification: { passed: true, failures: [] },
    });
  });
});

function createApprovalEvidence(proposalJson: string, decision: "approved" | "rejected") {
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
    manifestPath: MANIFEST_PATH,
    manifestJson,
    proposalPath: PROPOSAL_PATH,
    proposalJson,
    summaryPath: SUMMARY_PATH,
    summaryMarkdown: reviewPackage.summary.markdown,
  };
}
