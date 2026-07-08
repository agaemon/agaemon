import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createAgentProposalExecutionBundle } from "./bundle.js";
import { createAgentProposalExecutionPreview } from "./preview.js";
import { createAgentProposalReviewApproval } from "../proposalReview/approval.js";
import { createAgentProposalReviewPackage } from "../proposalReview/package.js";

const AGENT = "0x0000000000000000000000000000000000000a01";
const TARGET = "0x0000000000000000000000000000000000000b01";
const REVIEWER = "0x0000000000000000000000000000000000000c01";
const CAPABILITY = `0x${"11".repeat(32)}`;
const GENERATED_AT = "2026-06-25T10:00:00.000Z";
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

describe("createAgentProposalExecutionPreview", () => {
  it("renders signer-facing evidence for a verified execution bundle", () => {
    const evidence = createBundleEvidence();

    expect(createAgentProposalExecutionPreview({ ...evidence, generatedAt: GENERATED_AT })).toEqual({
      passed: true,
      failures: [],
      verification: { passed: true, failures: [], approvalVerification: { passed: true, failures: [], manifestVerification: { passed: true, failures: [] } } },
      preview: {
        schemaVersion: 1,
        generatedAt: GENERATED_AT,
        chainId: 84532,
        objective: "Dry-run a structured plan",
        agent: AGENT,
        bundle: {
          path: BUNDLE_PATH,
          sha256: sha256(evidence.bundleJson),
        },
        transactions: [
          {
            index: 0,
            stepId: "step-1",
            title: "Allowed action",
            to: AGENT,
            value: "123",
            dataSha256: sha256("0xabcd"),
            dataBytes: 2,
          },
        ],
      },
    });
  });

  it("does not render preview evidence when bundle verification fails", () => {
    const evidence = createBundleEvidence();
    const bundle = JSON.parse(evidence.bundleJson);
    bundle.transactions[0].value = "456";

    expect(
      createAgentProposalExecutionPreview({
        ...evidence,
        bundleJson: JSON.stringify(bundle, null, 2),
        generatedAt: GENERATED_AT,
      }),
    ).toEqual({
      passed: false,
      failures: ["bundle transactions do not match current approved proposal"],
      verification: {
        passed: false,
        failures: ["bundle transactions do not match current approved proposal"],
        approvalVerification: { passed: true, failures: [], manifestVerification: { passed: true, failures: [] } },
      },
      preview: null,
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
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
