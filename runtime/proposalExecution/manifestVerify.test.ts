import { describe, expect, it } from "vitest";

import { createAgentProposalExecutionBundle } from "./bundle.js";
import { createAgentProposalExecutionManifest } from "./manifest.js";
import { verifyAgentProposalExecutionManifest } from "./manifestVerify.js";
import { createAgentProposalExecutionPackage } from "./package.js";
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

describe("verifyAgentProposalExecutionManifest", () => {
  it("passes when the saved manifest matches current execution handoff evidence", () => {
    const evidence = createManifestEvidence();

    expect(verifyAgentProposalExecutionManifest(evidence)).toEqual({
      passed: true,
      failures: [],
    });
  });

  it("rejects stale hashes and embedded preflight reports", () => {
    const evidence = createManifestEvidence();
    const staleRunbookMarkdown = evidence.runbookMarkdown.replace(
      "| Signing | not included |",
      "| Signing | required |",
    );

    expect(
      verifyAgentProposalExecutionManifest({
        ...evidence,
        runbookMarkdown: staleRunbookMarkdown,
      }),
    ).toEqual({
      passed: false,
      failures: [
        "runbook sha256 does not match current runbook",
        "preflight report does not match current execution handoff",
      ],
    });
  });

  it("rejects malformed or unsupported manifests", () => {
    const evidence = createManifestEvidence();

    expect(
      verifyAgentProposalExecutionManifest({
        ...evidence,
        executionManifestJson: JSON.stringify({
          schemaVersion: 2,
          generatedAt: "not-a-date",
          preview: { path: PREVIEW_PATH, sha256: "bad" },
          runbook: { path: RUNBOOK_PATH, sha256: "bad" },
          bundle: { path: BUNDLE_PATH, sha256: "bad" },
          approval: { path: APPROVAL_PATH, sha256: "bad" },
          reviewManifest: { path: MANIFEST_PATH, sha256: "bad" },
          proposal: { path: PROPOSAL_PATH, sha256: "bad" },
          summary: { path: SUMMARY_PATH, sha256: "bad" },
          preflight: {},
        }),
      }),
    ).toMatchObject({
      passed: false,
      failures: expect.arrayContaining([
        "execution manifest schemaVersion must be 1",
        "execution manifest generatedAt must be a valid timestamp",
        "preview sha256 must be a SHA-256 hex string",
        "runbook sha256 must be a SHA-256 hex string",
        "bundle sha256 must be a SHA-256 hex string",
        "approval sha256 must be a SHA-256 hex string",
        "reviewManifest sha256 must be a SHA-256 hex string",
        "proposal sha256 must be a SHA-256 hex string",
        "summary sha256 must be a SHA-256 hex string",
        "preflight report does not match current execution handoff",
      ]),
    });
  });
});

function createManifestEvidence() {
  const evidence = createBundleEvidence();
  const packageResult = createAgentProposalExecutionPackage(evidence);
  if (!packageResult.passed) throw new Error("test fixture package failed");
  const executionManifest = createAgentProposalExecutionManifest({
    ...evidence,
    previewJson: packageResult.preview.json,
    runbookMarkdown: packageResult.runbook.markdown,
  });
  return {
    executionManifestJson: JSON.stringify(executionManifest),
    ...evidence,
    previewJson: packageResult.preview.json,
    runbookMarkdown: packageResult.runbook.markdown,
  };
}

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
