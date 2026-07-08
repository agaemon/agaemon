import { describe, expect, it } from "vitest";

import { createAgentProposalExecutionBundle } from "./bundle.js";
import { createAgentProposalExecutionHandoff } from "./handoff.js";
import { createAgentProposalExecutionReadiness } from "./readiness.js";
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

describe("createAgentProposalExecutionReadiness", () => {
  it("reports signer nonce and gas estimates for a verified handoff", async () => {
    const evidence = createHandoffEvidence();
    const readiness = await createAgentProposalExecutionReadiness({
      ...evidence,
      signer: SIGNER,
      expectedChainId: 84532,
      client: {
        getChainId: async () => 84532,
        getTransactionCount: async (params) => {
          expect(params).toEqual({ address: SIGNER, blockTag: "pending" });
          return 7;
        },
        estimateGas: async (params) => {
          expect(params).toEqual({
            account: SIGNER,
            to: AGENT,
            value: 123n,
            data: "0xabcd",
          });
          return 21000n;
        },
      },
    });

    expect(readiness).toEqual({
      passed: true,
      failures: [],
      checks: [
        { name: "execution-handoff", passed: true, failures: [] },
        { name: "chain", passed: true, failures: [] },
        { name: "nonce", passed: true, failures: [] },
        { name: "gas-estimates", passed: true, failures: [] },
      ],
      signer: SIGNER,
      expectedChainId: 84532,
      connectedChainId: 84532,
      pendingNonce: 7,
      transactions: [
        {
          index: 0,
          stepId: "step-1",
          title: "Allowed action",
          to: AGENT,
          value: "123",
          data: "0xabcd",
          gasEstimate: "21000",
        },
      ],
      handoffVerification: expect.objectContaining({
        passed: true,
        failures: [],
      }),
    });
  });

  it("stops before RPC checks when saved handoff evidence is stale", async () => {
    const evidence = createHandoffEvidence();
    const staleRunbookMarkdown = evidence.runbookMarkdown.replace(
      "| Signing | not included |",
      "| Signing | required |",
    );

    const readiness = await createAgentProposalExecutionReadiness({
      ...evidence,
      runbookMarkdown: staleRunbookMarkdown,
      signer: SIGNER,
      expectedChainId: 84532,
      client: {
        getChainId: async () => {
          throw new Error("RPC must not be called for stale handoff evidence");
        },
        getTransactionCount: async () => {
          throw new Error("RPC must not be called for stale handoff evidence");
        },
        estimateGas: async () => {
          throw new Error("RPC must not be called for stale handoff evidence");
        },
      },
    });

    expect(readiness).toEqual({
      passed: false,
      failures: [
        "runbook markdown does not match current execution preview",
        "package runbook Markdown does not match current execution package",
        "runbook sha256 does not match current runbook",
        "preflight report does not match current execution handoff",
      ],
      checks: [
        {
          name: "execution-handoff",
          passed: false,
          failures: [
            "runbook markdown does not match current execution preview",
            "package runbook Markdown does not match current execution package",
            "runbook sha256 does not match current runbook",
            "preflight report does not match current execution handoff",
          ],
        },
      ],
      signer: SIGNER,
      expectedChainId: 84532,
      connectedChainId: null,
      pendingNonce: null,
      transactions: [],
      handoffVerification: expect.objectContaining({
        passed: false,
      }),
    });
  });
});

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
