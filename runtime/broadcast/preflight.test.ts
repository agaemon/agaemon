import { createHash } from "node:crypto";

import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";

import { createAgentProposalExecutionBroadcastPreflight } from "./preflight.js";
import { createAgentProposalExecutionBundle } from "../proposalExecution/bundle.js";
import { createAgentProposalExecutionHandoff } from "../proposalExecution/handoff.js";
import { createAgentProposalExecutionReadiness } from "../proposalExecution/readiness.js";
import { createAgentProposalExecutionSigningPayload } from "../proposalExecution/signingPayload.js";
import { createAgentProposalReviewApproval } from "../proposalReview/approval.js";
import { createAgentProposalReviewPackage } from "../proposalReview/package.js";

import type { AgentProposalExecutionSigningPayload } from "../proposalExecution/signingPayload.js";

const AGENT = "0x0000000000000000000000000000000000000a01";
const TARGET = "0x0000000000000000000000000000000000000b01";
const REVIEWER = "0x0000000000000000000000000000000000000c01";
const SIGNER_ACCOUNT = privateKeyToAccount(`0x${"11".repeat(32)}`);
const CAPABILITY = `0x${"11".repeat(32)}`;
const GENERATED_AT = "2026-06-25T10:00:00.000Z";
const PREVIEW_PATH = "artifacts/example-agent-proposal-execution-preview.json";
const RUNBOOK_PATH = "artifacts/example-agent-proposal-execution-runbook.md";
const EXECUTION_MANIFEST_PATH = "artifacts/example-agent-proposal-execution-manifest.json";
const READINESS_PATH = "artifacts/example-agent-proposal-execution-readiness.json";
const PAYLOAD_PATH = "artifacts/example-agent-proposal-execution-signing-payload.json";
const SIGNED_PAYLOAD_PATH = "artifacts/example-agent-proposal-execution-signed-payload.json";
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

describe("createAgentProposalExecutionBroadcastPreflight", () => {
  it("passes when signed payload is current and signer nonce still matches", async () => {
    const evidence = await createSignedPayloadEvidence();

    await expect(
      createAgentProposalExecutionBroadcastPreflight({
        ...evidence,
        client: {
          getChainId: async () => 84532,
          getTransactionCount: async () => 7,
        },
      }),
    ).resolves.toEqual({
      passed: true,
      failures: [],
      signedPayload: SIGNED_PAYLOAD_PATH,
      payload: PAYLOAD_PATH,
      signer: SIGNER_ACCOUNT.address,
      expectedChainId: 84532,
      connectedChainId: 84532,
      expectedNonce: 7,
      pendingNonce: 7,
      transactions: 1,
      checks: [
        { name: "signed-payload", passed: true, failures: [] },
        { name: "chain", passed: true, failures: [] },
        { name: "nonce", passed: true, failures: [] },
      ],
    });
  });

  it("rejects when signer pending nonce no longer matches the signed payload", async () => {
    const evidence = await createSignedPayloadEvidence();
    const report = await createAgentProposalExecutionBroadcastPreflight({
      ...evidence,
      client: {
        getChainId: async () => 84532,
        getTransactionCount: async () => 9,
      },
    });

    expect(report.passed).toBe(false);
    expect(report.checks).toContainEqual({
      name: "nonce",
      passed: false,
      failures: ["pending nonce 9 does not match signed payload nonce 7"],
    });
  });
});

async function createSignedPayloadEvidence() {
  const evidence = await createPayloadEvidence();
  const payload = JSON.parse(evidence.payloadJson) as AgentProposalExecutionSigningPayload;
  const rawTransactions = await Promise.all(
    payload.transactions.map((transaction) =>
      SIGNER_ACCOUNT.signTransaction({
        chainId: payload.chainId,
        nonce: transaction.nonce,
        to: transaction.to as `0x${string}`,
        value: BigInt(transaction.value),
        data: transaction.data as `0x${string}`,
        gas: BigInt(transaction.gasLimit),
        gasPrice: 1n,
      }),
    ),
  );
  const signedPayload = {
    schemaVersion: 1,
    signingPayload: {
      path: PAYLOAD_PATH,
      sha256: sha256(evidence.payloadJson),
    },
    signer: payload.signer,
    chainId: payload.chainId,
    transactions: rawTransactions.map((rawTransaction, index) => ({
      index,
      rawTransaction,
    })),
  };

  return {
    ...evidence,
    signedPayloadPath: SIGNED_PAYLOAD_PATH,
    signedPayloadJson: JSON.stringify(signedPayload, null, 2),
  };
}

async function createPayloadEvidence() {
  const evidence = await createReadinessEvidence();
  const result = createAgentProposalExecutionSigningPayload(evidence);
  if (!result.passed || result.payload === null) throw new Error("test fixture payload failed");
  return {
    ...evidence,
    payloadPath: PAYLOAD_PATH,
    payloadJson: JSON.stringify(result.payload, null, 2),
  };
}

async function createReadinessEvidence() {
  const evidence = createHandoffEvidence();
  const readiness = await createAgentProposalExecutionReadiness({
    ...evidence,
    signer: SIGNER_ACCOUNT.address,
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
    readinessPath: READINESS_PATH,
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
    executionManifestPath: EXECUTION_MANIFEST_PATH,
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

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
