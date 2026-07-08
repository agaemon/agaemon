import { describe, expect, it } from "vitest";

import { createAgentProposalExecutionBundle } from "./bundle.js";
import { createAgentProposalExecutionHandoff } from "./handoff.js";
import { createAgentProposalExecutionReadiness } from "./readiness.js";
import { verifyAgentProposalExecutionReadiness } from "./readinessVerify.js";
import { createAgentProposalReviewApproval } from "../proposalReview/approval.js";
import { createAgentProposalReviewPackage } from "../proposalReview/package.js";

const AGENT = "0x0000000000000000000000000000000000000a01";
const TARGET = "0x0000000000000000000000000000000000000b01";
const REVIEWER = "0x0000000000000000000000000000000000000c01";
const SIGNER = "0x0000000000000000000000000000000000000d01";
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

describe("verifyAgentProposalExecutionReadiness", () => {
  it("passes when saved readiness report matches current handoff evidence", async () => {
    const evidence = await createReadinessEvidence();

    expect(verifyAgentProposalExecutionReadiness(evidence)).toEqual({
      passed: true,
      failures: [],
      handoffVerification: expect.objectContaining({
        passed: true,
        failures: [],
      }),
    });
  });

  it("rejects stale handoff evidence in a saved readiness report", async () => {
    const evidence = await createReadinessEvidence();
    const staleRunbookMarkdown = evidence.runbookMarkdown.replace(
      "| Signing | not included |",
      "| Signing | required |",
    );

    expect(
      verifyAgentProposalExecutionReadiness({
        ...evidence,
        runbookMarkdown: staleRunbookMarkdown,
      }),
    ).toEqual({
      passed: false,
      failures: [
        "runbook markdown does not match current execution preview",
        "package runbook Markdown does not match current execution package",
        "runbook sha256 does not match current runbook",
        "preflight report does not match current execution handoff",
        "saved handoff verification does not match current handoff verification",
      ],
      handoffVerification: expect.objectContaining({
        passed: false,
      }),
    });
  });

  it("rejects malformed or stale readiness report fields", async () => {
    const evidence = await createReadinessEvidence();
    const report = JSON.parse(evidence.readinessJson);
    report.signer = "not-an-address";
    report.expectedChainId = 1;
    report.connectedChainId = 84532;
    report.pendingNonce = -1;
    report.transactions[0].gasEstimate = "0";

    expect(
      verifyAgentProposalExecutionReadiness({
        ...evidence,
        readinessJson: JSON.stringify(report),
      }),
    ).toMatchObject({
      passed: false,
      failures: expect.arrayContaining([
        "readiness signer must be an address",
        "readiness expectedChainId must match bundle chainId",
        "readiness connectedChainId must match expectedChainId",
        "readiness pendingNonce must be a non-negative integer",
        "readiness transaction 0 gasEstimate must be a positive integer string",
      ]),
    });
  });
});

async function createReadinessEvidence() {
  const evidence = createHandoffEvidence();
  const readiness = await createAgentProposalExecutionReadiness({
    ...evidence,
    signer: SIGNER,
    expectedChainId: 84532,
    client: {
      getChainId: async () => 84532,
      getTransactionCount: async () => 7,
      estimateGas: async () => 21000n,
    },
  });
  if (!readiness.passed) throw new Error("test fixture readiness failed");
  return {
    ...evidence,
    readinessJson: JSON.stringify(readiness, null, 2),
  };
}

function createHandoffEvidence() {
  const evidence = createBundleEvidence();
  const handoff = createAgentProposalExecutionHandoff({
    ...evidence,
    previewPath: PREVIEW_PATH,
    runbookPath: RUNBOOK_PATH,
    executionManifestPath: EXECUTION_MANIFEST_PATH,
  });
  if (!handoff.passed) throw new Error("test fixture handoff failed");
  return {
    ...evidence,
    previewPath: PREVIEW_PATH,
    previewJson: handoff.preview.json,
    runbookPath: RUNBOOK_PATH,
    runbookMarkdown: handoff.runbook.markdown,
    executionManifestJson: handoff.executionManifest.json,
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
