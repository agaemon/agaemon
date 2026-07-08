import { createHash } from "node:crypto";

import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";

import { createAgentProposalExecutionBroadcastPackage } from "./package.js";
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
const BROADCAST_PREFLIGHT_PATH = "artifacts/example-agent-proposal-execution-broadcast-preflight.json";
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

describe("createAgentProposalExecutionBroadcastPackage", () => {
  it("creates a package from passing broadcast preflight evidence", async () => {
    const evidence = await createBroadcastEvidence();
    const result = await createAgentProposalExecutionBroadcastPackage({
      ...evidence,
      generatedAt: GENERATED_AT,
    });

    expect(result).toEqual({
      passed: true,
      failures: [],
      package: {
        schemaVersion: 1,
        generatedAt: GENERATED_AT,
        broadcastPreflight: {
          path: BROADCAST_PREFLIGHT_PATH,
          sha256: sha256(evidence.broadcastPreflightJson),
        },
        signedPayload: {
          path: SIGNED_PAYLOAD_PATH,
          sha256: sha256(evidence.signedPayloadJson),
        },
        signingPayload: {
          path: PAYLOAD_PATH,
          sha256: sha256(evidence.payloadJson),
        },
        readiness: {
          path: READINESS_PATH,
          sha256: sha256(evidence.readinessJson),
        },
        preview: {
          path: PREVIEW_PATH,
          sha256: sha256(evidence.previewJson),
        },
        runbook: {
          path: RUNBOOK_PATH,
          sha256: sha256(evidence.runbookMarkdown),
        },
        executionManifest: {
          path: EXECUTION_MANIFEST_PATH,
          sha256: sha256(evidence.executionManifestJson),
        },
        bundle: {
          path: BUNDLE_PATH,
          sha256: sha256(evidence.bundleJson),
        },
        approval: {
          path: APPROVAL_PATH,
          sha256: sha256(evidence.approvalJson),
        },
        manifest: {
          path: MANIFEST_PATH,
          sha256: sha256(evidence.manifestJson),
        },
        proposal: {
          path: PROPOSAL_PATH,
          sha256: sha256(evidence.proposalJson),
        },
        summary: {
          path: SUMMARY_PATH,
          sha256: sha256(evidence.summaryMarkdown),
        },
        signer: SIGNER_ACCOUNT.address,
        chainId: 84532,
        nonceStart: 7,
        pendingNonce: 7,
        transactions: [
          {
            index: 0,
            rawTransaction: JSON.parse(evidence.signedPayloadJson).transactions[0].rawTransaction,
          },
        ],
      },
    });
  });

  it("rejects failed broadcast preflight evidence", async () => {
    const evidence = await createBroadcastEvidence();
    const failedPreflight = JSON.parse(evidence.broadcastPreflightJson);
    failedPreflight.passed = false;
    failedPreflight.failures = ["pending nonce 9 does not match signed payload nonce 7"];
    failedPreflight.checks[2] = {
      name: "nonce",
      passed: false,
      failures: ["pending nonce 9 does not match signed payload nonce 7"],
    };

    const result = await createAgentProposalExecutionBroadcastPackage({
      ...evidence,
      broadcastPreflightJson: JSON.stringify(failedPreflight, null, 2),
      generatedAt: GENERATED_AT,
    });

    expect(result).toEqual({
      passed: false,
      failures: [
        "broadcast preflight must pass before creating a broadcast package",
        "pending nonce 9 does not match signed payload nonce 7",
      ],
      package: null,
    });
  });
});

async function createBroadcastEvidence() {
  const evidence = await createSignedPayloadEvidence();
  const preflight = await createAgentProposalExecutionBroadcastPreflight({
    ...evidence,
    client: {
      getChainId: async () => 84532,
      getTransactionCount: async () => 7,
    },
  });
  if (!preflight.passed) throw new Error("test fixture broadcast preflight failed");
  return {
    ...evidence,
    broadcastPreflightPath: BROADCAST_PREFLIGHT_PATH,
    broadcastPreflightJson: JSON.stringify(preflight, null, 2),
  };
}

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
