import { createHash } from "node:crypto";

import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";

import { createAgentPlanProposal } from "../agentPlanning/planProposal.js";
import {
  createPolicyDecisionFixtureSimulator,
  getPolicyDecisionFixture,
} from "../fixtures/policyDecisions.js";
import { createAgentProposalOutput } from "../proposal/output.js";
import { createAgentProposalSummary } from "../proposal/summary.js";
import { createAgentProposalReviewApproval } from "../proposalReview/approval.js";
import { createAgentProposalReviewPackage } from "../proposalReview/package.js";
import { createAgentProposalExecutionBundle } from "./bundle.js";
import { createAgentProposalExecutionHandoff } from "./handoff.js";
import { createAgentProposalExecutionReadiness } from "./readiness.js";
import { createAgentProposalExecutionSigningPayload } from "./signingPayload.js";
import { verifyAgentProposalExecutionSignedPayload } from "./signedPayloadVerify.js";

import type { AgentProposalExecutionSigningPayload } from "./signingPayload.js";

const GENERATED_AT = "2026-06-29T05:05:00.000Z";
const REVIEWER = "0x0000000000000000000000000000000000000c01";
const SIGNER_ACCOUNT = privateKeyToAccount(`0x${"22".repeat(32)}`);
const PREVIEW_PATH = "artifacts/fixture-agent-proposal-execution-preview.json";
const RUNBOOK_PATH = "artifacts/fixture-agent-proposal-execution-runbook.md";
const BUNDLE_PATH = "artifacts/fixture-agent-proposal-execution-bundle.json";
const EXECUTION_MANIFEST_PATH = "artifacts/fixture-agent-proposal-execution-manifest.json";
const READINESS_PATH = "artifacts/fixture-agent-proposal-execution-readiness.json";
const PAYLOAD_PATH = "artifacts/fixture-agent-proposal-execution-signing-payload.json";
const SIGNED_PAYLOAD_PATH = "artifacts/fixture-agent-proposal-execution-signed-payload.json";

describe("proposal execution signed-payload fixture integration", () => {
  it("verifies fixture signed payload evidence before broadcast preparation", async () => {
    const evidence = await createFixtureSignedPayloadEvidence({
      objective: "Verify fixture signed payload evidence",
      proposalPath: "artifacts/fixture-signed-payload-proposal.json",
      summaryPath: "artifacts/fixture-signed-payload-proposal.md",
      manifestPath: "artifacts/fixture-signed-payload-review.json",
      approvalPath: "artifacts/fixture-signed-payload-approval.json",
      sourcePath: "artifacts/fixture-signed-payload-plan.json",
      fixtures: [
        getPolicyDecisionFixture("allowed-swap"),
        getPolicyDecisionFixture("allowed-memory"),
      ],
    });

    await expect(verifyAgentProposalExecutionSignedPayload(evidence)).resolves.toEqual({
      passed: true,
      failures: [],
      preflight: expect.objectContaining({
        passed: true,
        payload: PAYLOAD_PATH,
        readiness: READINESS_PATH,
        bundle: BUNDLE_PATH,
        signer: SIGNER_ACCOUNT.address,
        chainId: 84532,
        nonceStart: 21,
        transactions: 2,
      }),
    });
  });

  it("blocks stale fixture readiness evidence before downstream broadcast preparation", async () => {
    const evidence = await createFixtureSignedPayloadEvidence({
      objective: "Block stale signed payload readiness",
      proposalPath: "artifacts/fixture-stale-readiness-signed-payload-proposal.json",
      summaryPath: "artifacts/fixture-stale-readiness-signed-payload-proposal.md",
      manifestPath: "artifacts/fixture-stale-readiness-signed-payload-review.json",
      approvalPath: "artifacts/fixture-stale-readiness-signed-payload-approval.json",
      sourcePath: "artifacts/fixture-stale-readiness-signed-payload-plan.json",
      fixtures: [
        getPolicyDecisionFixture("allowed-swap"),
        getPolicyDecisionFixture("allowed-memory"),
      ],
    });
    const staleReadiness = JSON.parse(evidence.readinessJson);
    staleReadiness.transactions[0].gasEstimate = "999999";

    const verification = await verifyAgentProposalExecutionSignedPayload({
      ...evidence,
      readinessJson: JSON.stringify(staleReadiness, null, 2),
    });

    expect(verification.passed).toBe(false);
    expect(verification.preflight.passed).toBe(false);
    expect(verification.failures).toContain("saved signing payload does not match current signing payload");
  });

  it("blocks stale fixture signing payload evidence before downstream broadcast preparation", async () => {
    const evidence = await createFixtureSignedPayloadEvidence({
      objective: "Block stale signed payload artifact",
      proposalPath: "artifacts/fixture-stale-payload-signed-payload-proposal.json",
      summaryPath: "artifacts/fixture-stale-payload-signed-payload-proposal.md",
      manifestPath: "artifacts/fixture-stale-payload-signed-payload-review.json",
      approvalPath: "artifacts/fixture-stale-payload-signed-payload-approval.json",
      sourcePath: "artifacts/fixture-stale-payload-signed-payload-plan.json",
      fixtures: [
        getPolicyDecisionFixture("allowed-swap"),
        getPolicyDecisionFixture("allowed-memory"),
      ],
    });
    const stalePayload = JSON.parse(evidence.payloadJson);
    stalePayload.transactions[1].nonce = 99;

    const verification = await verifyAgentProposalExecutionSignedPayload({
      ...evidence,
      payloadJson: JSON.stringify(stalePayload, null, 2),
    });

    expect(verification.passed).toBe(false);
    expect(verification.preflight.passed).toBe(false);
    expect(verification.failures).toContain("saved signing payload does not match current signing payload");
    expect(verification.failures).toContain("signed payload signingPayload.sha256 must match payload JSON");
    expect(verification.failures).toContain("signed transaction 1 nonce does not match signing payload");
  });
});

type Fixture = ReturnType<typeof getPolicyDecisionFixture>;

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
