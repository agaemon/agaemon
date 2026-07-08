import { createHash } from "node:crypto";

import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";

import { createAgentProposalExecutionBroadcastPackage } from "./package.js";
import { createAgentProposalExecutionBroadcastPreflight } from "./preflight.js";
import { createAgentProposalExecutionBroadcastReceipt } from "./receipt.js";
import { verifyAgentProposalExecutionBroadcastReceipt } from "./receiptVerify.js";
import { submitAgentProposalExecutionBroadcast } from "./submit.js";
import { createAgentPlanProposal } from "../agentPlanning/planProposal.js";
import {
  createPolicyDecisionFixtureSimulator,
  getPolicyDecisionFixture,
} from "../fixtures/policyDecisions.js";
import { createAgentProposalExecutionBundle } from "../proposalExecution/bundle.js";
import { createAgentProposalExecutionHandoff } from "../proposalExecution/handoff.js";
import { createAgentProposalExecutionReadiness } from "../proposalExecution/readiness.js";
import { createAgentProposalExecutionSigningPayload } from "../proposalExecution/signingPayload.js";
import { createAgentProposalOutput } from "../proposal/output.js";
import { createAgentProposalSummary } from "../proposal/summary.js";
import { createAgentProposalReviewApproval } from "../proposalReview/approval.js";
import { createAgentProposalReviewPackage } from "../proposalReview/package.js";

import type { AgentProposalExecutionSigningPayload } from "../proposalExecution/signingPayload.js";

const GENERATED_AT = "2026-06-29T06:30:00.000Z";
const REVIEWER = "0x0000000000000000000000000000000000000c01";
const SIGNER_ACCOUNT = privateKeyToAccount(`0x${"44".repeat(32)}`);
const PREVIEW_PATH = "artifacts/fixture-agent-proposal-execution-preview.json";
const RUNBOOK_PATH = "artifacts/fixture-agent-proposal-execution-runbook.md";
const BUNDLE_PATH = "artifacts/fixture-agent-proposal-execution-bundle.json";
const EXECUTION_MANIFEST_PATH = "artifacts/fixture-agent-proposal-execution-manifest.json";
const READINESS_PATH = "artifacts/fixture-agent-proposal-execution-readiness.json";
const PAYLOAD_PATH = "artifacts/fixture-agent-proposal-execution-signing-payload.json";
const SIGNED_PAYLOAD_PATH = "artifacts/fixture-agent-proposal-execution-signed-payload.json";
const BROADCAST_PREFLIGHT_PATH = "artifacts/fixture-agent-proposal-execution-broadcast-preflight.json";
const BROADCAST_PACKAGE_PATH = "artifacts/fixture-agent-proposal-execution-broadcast-package.json";
const SUBMIT_RESULT_PATH = "artifacts/fixture-agent-proposal-execution-broadcast-submit.json";
const BROADCAST_RECEIPT_PATH = "artifacts/fixture-agent-proposal-execution-broadcast-receipt.json";
const FIRST_TX_HASH = `0x${"56".repeat(32)}` as const;
const SECOND_TX_HASH = `0x${"78".repeat(32)}` as const;

describe("broadcast submit/receipt fixture integration", () => {
  it("creates receipt evidence from verified fixture broadcast package evidence", async () => {
    const evidence = await createFixtureBroadcastPackageEvidence({
      objective: "Submit fixture broadcast package evidence",
      proposalPath: "artifacts/fixture-broadcast-submit-receipt-proposal.json",
      summaryPath: "artifacts/fixture-broadcast-submit-receipt-proposal.md",
      manifestPath: "artifacts/fixture-broadcast-submit-receipt-review.json",
      approvalPath: "artifacts/fixture-broadcast-submit-receipt-approval.json",
      sourcePath: "artifacts/fixture-broadcast-submit-receipt-plan.json",
      fixtures: [
        getPolicyDecisionFixture("allowed-swap"),
        getPolicyDecisionFixture("allowed-memory"),
      ],
    });
    const broadcastPackage = JSON.parse(evidence.broadcastPackageJson);
    const sentTransactions: string[] = [];
    const waitedHashes: string[] = [];

    const submitResult = await submitAgentProposalExecutionBroadcast({
      ...evidence,
      send: true,
      client: {
        getChainId: async () => 84532,
        sendRawTransaction: async ({ serializedTransaction }) => {
          sentTransactions.push(serializedTransaction);
          return sentTransactions.length === 1 ? FIRST_TX_HASH : SECOND_TX_HASH;
        },
        waitForTransactionReceipt: async ({ hash }) => {
          waitedHashes.push(hash);
          return {
            blockNumber: hash === FIRST_TX_HASH ? 901n : 902n,
            status: "success",
          };
        },
      },
    });

    expect(sentTransactions).toEqual([
      broadcastPackage.transactions[0].rawTransaction,
      broadcastPackage.transactions[1].rawTransaction,
    ]);
    expect(waitedHashes).toEqual([FIRST_TX_HASH, SECOND_TX_HASH]);
    expect(submitResult).toEqual({
      mode: "send",
      passed: true,
      failures: [],
      broadcastPackage: BROADCAST_PACKAGE_PATH,
      signer: SIGNER_ACCOUNT.address,
      chainId: 84532,
      transactions: 2,
      submitted: [
        {
          index: 0,
          hash: FIRST_TX_HASH,
          blockNumber: "901",
          status: "success",
        },
        {
          index: 1,
          hash: SECOND_TX_HASH,
          blockNumber: "902",
          status: "success",
        },
      ],
    });

    const receiptResult = createAgentProposalExecutionBroadcastReceipt({
      broadcastPackagePath: BROADCAST_PACKAGE_PATH,
      broadcastPackageJson: evidence.broadcastPackageJson,
      submitResult,
      generatedAt: GENERATED_AT,
    });
    if (!receiptResult.passed || receiptResult.receipt === null) {
      throw new Error(`fixture broadcast receipt failed: ${receiptResult.failures.join(", ")}`);
    }
    const broadcastReceiptJson = JSON.stringify(receiptResult.receipt, null, 2);

    expect(receiptResult.receipt).toEqual({
      schemaVersion: 1,
      generatedAt: GENERATED_AT,
      broadcastPackage: {
        path: BROADCAST_PACKAGE_PATH,
        sha256: sha256(evidence.broadcastPackageJson),
      },
      signer: SIGNER_ACCOUNT.address,
      chainId: 84532,
      transactions: submitResult.submitted,
    });
    expect(
      verifyAgentProposalExecutionBroadcastReceipt({
        broadcastPackagePath: BROADCAST_PACKAGE_PATH,
        broadcastPackageJson: evidence.broadcastPackageJson,
        submitResultPath: SUBMIT_RESULT_PATH,
        submitResultJson: JSON.stringify(submitResult, null, 2),
        broadcastReceiptPath: BROADCAST_RECEIPT_PATH,
        broadcastReceiptJson,
      }),
    ).toEqual({
      passed: true,
      failures: [],
    });
  });

  it("blocks stale fixture broadcast package evidence before receipt preparation", async () => {
    const evidence = await createFixtureBroadcastPackageEvidence({
      objective: "Block stale fixture broadcast receipt evidence",
      proposalPath: "artifacts/fixture-stale-broadcast-receipt-proposal.json",
      summaryPath: "artifacts/fixture-stale-broadcast-receipt-proposal.md",
      manifestPath: "artifacts/fixture-stale-broadcast-receipt-review.json",
      approvalPath: "artifacts/fixture-stale-broadcast-receipt-approval.json",
      sourcePath: "artifacts/fixture-stale-broadcast-receipt-plan.json",
      fixtures: [
        getPolicyDecisionFixture("allowed-swap"),
        getPolicyDecisionFixture("allowed-memory"),
      ],
    });
    const staleBroadcastPackage = JSON.parse(evidence.broadcastPackageJson);
    staleBroadcastPackage.transactions[0].rawTransaction = `0x${"99".repeat(65)}`;
    const staleBroadcastPackageJson = JSON.stringify(staleBroadcastPackage, null, 2);

    const submitResult = await submitAgentProposalExecutionBroadcast({
      ...evidence,
      broadcastPackageJson: staleBroadcastPackageJson,
      send: true,
      client: {
        getChainId: async () => {
          throw new Error("client must not be called for stale broadcast package evidence");
        },
        sendRawTransaction: async () => {
          throw new Error("client must not be called for stale broadcast package evidence");
        },
        waitForTransactionReceipt: async () => {
          throw new Error("client must not be called for stale broadcast package evidence");
        },
      },
    });

    expect(submitResult).toMatchObject({
      mode: "send",
      passed: false,
      failures: ["broadcast package JSON does not match current broadcast package"],
      broadcastPackage: BROADCAST_PACKAGE_PATH,
      signer: SIGNER_ACCOUNT.address,
      chainId: 84532,
      transactions: 2,
      submitted: [],
    });

    expect(
      createAgentProposalExecutionBroadcastReceipt({
        broadcastPackagePath: BROADCAST_PACKAGE_PATH,
        broadcastPackageJson: staleBroadcastPackageJson,
        submitResult,
        generatedAt: GENERATED_AT,
      }),
    ).toEqual({
      passed: false,
      failures: ["broadcast receipt requires a successful send result"],
      receipt: null,
    });
  });
});

type Fixture = ReturnType<typeof getPolicyDecisionFixture>;

async function createFixtureBroadcastPackageEvidence(params: {
  objective: string;
  proposalPath: string;
  summaryPath: string;
  manifestPath: string;
  approvalPath: string;
  sourcePath: string;
  fixtures: Fixture[];
}) {
  const evidence = await createFixtureSignedPayloadEvidence(params);
  const preflight = await createAgentProposalExecutionBroadcastPreflight({
    ...evidence,
    client: {
      getChainId: async () => 84532,
      getTransactionCount: async (params) => {
        expect(params).toEqual({ address: SIGNER_ACCOUNT.address, blockTag: "pending" });
        return 21;
      },
    },
  });
  if (!preflight.passed) {
    throw new Error(`fixture broadcast preflight failed: ${preflight.failures.join(", ")}`);
  }

  const broadcastPreflightJson = JSON.stringify(preflight, null, 2);
  const broadcastPackage = await createAgentProposalExecutionBroadcastPackage({
    ...evidence,
    broadcastPreflightPath: BROADCAST_PREFLIGHT_PATH,
    broadcastPreflightJson,
    generatedAt: GENERATED_AT,
  });
  if (!broadcastPackage.passed || broadcastPackage.package === null) {
    throw new Error(`fixture broadcast package failed: ${broadcastPackage.failures.join(", ")}`);
  }

  return {
    ...evidence,
    broadcastPreflightPath: BROADCAST_PREFLIGHT_PATH,
    broadcastPreflightJson,
    broadcastPackagePath: BROADCAST_PACKAGE_PATH,
    broadcastPackageJson: JSON.stringify(broadcastPackage.package, null, 2),
  };
}

async function createFixtureSignedPayloadEvidence(params: {
  objective: string;
  proposalPath: string;
  summaryPath: string;
  manifestPath: string;
  approvalPath: string;
  sourcePath: string;
  fixtures: Fixture[];
}) {
  const handoffEvidence = await createFixtureHandoffEvidence(params);
  const readiness = await createAgentProposalExecutionReadiness({
    ...handoffEvidence,
    signer: SIGNER_ACCOUNT.address,
    expectedChainId: 84532,
    client: {
      getChainId: async () => 84532,
      getTransactionCount: async () => 21,
      estimateGas: async (transaction) => transaction.value === 123n ? 31_000n : 42_000n,
    },
  });
  if (!readiness.passed) {
    throw new Error(`fixture readiness failed: ${readiness.failures.join(", ")}`);
  }

  const readinessJson = JSON.stringify(readiness, null, 2);
  const signingPayload = createAgentProposalExecutionSigningPayload({
    ...handoffEvidence,
    readinessPath: READINESS_PATH,
    readinessJson,
  });
  if (!signingPayload.passed || signingPayload.payload === null) {
    throw new Error(`fixture signing payload failed: ${signingPayload.failures.join(", ")}`);
  }

  const payloadJson = JSON.stringify(signingPayload.payload, null, 2);
  const signedPayloadJson = await createSignedPayloadJson(signingPayload.payload, payloadJson);
  return {
    ...handoffEvidence,
    readinessPath: READINESS_PATH,
    readinessJson,
    payloadPath: PAYLOAD_PATH,
    payloadJson,
    signedPayloadPath: SIGNED_PAYLOAD_PATH,
    signedPayloadJson,
  };
}

async function createSignedPayloadJson(
  payload: AgentProposalExecutionSigningPayload,
  payloadJson: string,
): Promise<string> {
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
      sha256: sha256(payloadJson),
    },
    signer: payload.signer,
    chainId: payload.chainId,
    transactions: rawTransactions.map((rawTransaction, index) => ({
      index,
      rawTransaction,
    })),
  };

  return JSON.stringify(signedPayload, null, 2);
}

async function createFixtureHandoffEvidence(params: {
  objective: string;
  proposalPath: string;
  summaryPath: string;
  manifestPath: string;
  approvalPath: string;
  sourcePath: string;
  fixtures: Fixture[];
}) {
  const [firstFixture] = params.fixtures;
  if (!firstFixture) throw new Error("fixtures must include at least one fixture");

  const proposal = await createAgentPlanProposal({
    agent: firstFixture.agent,
    objective: params.objective,
    steps: params.fixtures.map((fixture) => ({
      id: fixture.id,
      title: fixture.title,
      action: fixture.action,
    })),
    simulatePolicy: createPolicyDecisionFixtureSimulator(),
  });
  const artifact = createAgentProposalOutput({
    chainId: 84532,
    manifestPath: "deployments/base-sepolia/latest.json",
    source: { type: "plan", path: params.sourcePath },
    proposal,
  });
  const proposalJson = JSON.stringify(artifact);
  const summaryMarkdown = createAgentProposalSummary({
    proposalPath: params.proposalPath,
    proposalJson,
  }).markdown;
  const reviewPackage = createAgentProposalReviewPackage({
    proposalPath: params.proposalPath,
    proposalJson,
    summaryPath: params.summaryPath,
    summaryMarkdown,
    manifestPath: params.manifestPath,
    generatedAt: GENERATED_AT,
  });
  if (!reviewPackage.passed || reviewPackage.manifest === null) {
    throw new Error(`fixture review package failed: ${reviewPackage.failures.join(", ")}`);
  }

  const manifestJson = JSON.stringify(reviewPackage.manifest, null, 2);
  const approval = createAgentProposalReviewApproval({
    manifestPath: params.manifestPath,
    manifestJson,
    proposalPath: params.proposalPath,
    proposalJson,
    summaryPath: params.summaryPath,
    summaryMarkdown,
    reviewer: REVIEWER,
    decision: "approved",
    generatedAt: GENERATED_AT,
  });
  if (!approval.passed || approval.approval === null) {
    throw new Error(`fixture approval failed: ${approval.failures.join(", ")}`);
  }

  const approvalJson = JSON.stringify(approval.approval, null, 2);
  const bundleEvidence = {
    bundlePath: BUNDLE_PATH,
    approvalPath: params.approvalPath,
    approvalJson,
    manifestPath: params.manifestPath,
    manifestJson,
    proposalPath: params.proposalPath,
    proposalJson,
    summaryPath: params.summaryPath,
    summaryMarkdown,
    generatedAt: GENERATED_AT,
  };
  const bundle = createAgentProposalExecutionBundle(bundleEvidence);
  if (!bundle.passed || bundle.bundle === null) {
    throw new Error(`fixture execution bundle failed: ${bundle.failures.join(", ")}`);
  }
  const handoffEvidence = {
    ...bundleEvidence,
    bundleJson: JSON.stringify(bundle.bundle, null, 2),
    previewPath: PREVIEW_PATH,
    runbookPath: RUNBOOK_PATH,
    executionManifestPath: EXECUTION_MANIFEST_PATH,
  };
  const handoff = createAgentProposalExecutionHandoff(handoffEvidence);
  if (!handoff.passed) {
    throw new Error(`fixture handoff failed: ${handoff.failures.join(", ")}`);
  }

  return {
    ...handoffEvidence,
    previewJson: handoff.preview.json,
    runbookMarkdown: handoff.runbook.markdown,
    executionManifestJson: handoff.executionManifest.json,
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
