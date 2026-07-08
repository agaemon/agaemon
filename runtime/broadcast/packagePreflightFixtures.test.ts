import { createHash } from "node:crypto";

import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";

import { createAgentProposalExecutionBroadcastPackage } from "./package.js";
import { verifyAgentProposalExecutionBroadcastPackage } from "./packageVerify.js";
import { createAgentProposalExecutionBroadcastPreflight } from "./preflight.js";
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

const GENERATED_AT = "2026-06-29T05:45:00.000Z";
const REVIEWER = "0x0000000000000000000000000000000000000c01";
const SIGNER_ACCOUNT = privateKeyToAccount(`0x${"33".repeat(32)}`);
const PREVIEW_PATH = "artifacts/fixture-agent-proposal-execution-preview.json";
const RUNBOOK_PATH = "artifacts/fixture-agent-proposal-execution-runbook.md";
const BUNDLE_PATH = "artifacts/fixture-agent-proposal-execution-bundle.json";
const EXECUTION_MANIFEST_PATH = "artifacts/fixture-agent-proposal-execution-manifest.json";
const READINESS_PATH = "artifacts/fixture-agent-proposal-execution-readiness.json";
const PAYLOAD_PATH = "artifacts/fixture-agent-proposal-execution-signing-payload.json";
const SIGNED_PAYLOAD_PATH = "artifacts/fixture-agent-proposal-execution-signed-payload.json";
const BROADCAST_PREFLIGHT_PATH = "artifacts/fixture-agent-proposal-execution-broadcast-preflight.json";
const BROADCAST_PACKAGE_PATH = "artifacts/fixture-agent-proposal-execution-broadcast-package.json";

describe("broadcast package/preflight fixture integration", () => {
  it("packages verified fixture signed payload evidence for broadcast preparation", async () => {
    const evidence = await createFixtureSignedPayloadEvidence({
      objective: "Package fixture signed payload broadcast evidence",
      proposalPath: "artifacts/fixture-broadcast-package-proposal.json",
      summaryPath: "artifacts/fixture-broadcast-package-proposal.md",
      manifestPath: "artifacts/fixture-broadcast-package-review.json",
      approvalPath: "artifacts/fixture-broadcast-package-approval.json",
      sourcePath: "artifacts/fixture-broadcast-package-plan.json",
      fixtures: [
        getPolicyDecisionFixture("allowed-swap"),
        getPolicyDecisionFixture("allowed-memory"),
      ],
    });
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
    const broadcastPreflightJson = JSON.stringify(preflight, null, 2);

    expect(preflight).toEqual({
      passed: true,
      failures: [],
      signedPayload: SIGNED_PAYLOAD_PATH,
      payload: PAYLOAD_PATH,
      signer: SIGNER_ACCOUNT.address,
      expectedChainId: 84532,
      connectedChainId: 84532,
      expectedNonce: 21,
      pendingNonce: 21,
      transactions: 2,
      checks: [
        { name: "signed-payload", passed: true, failures: [] },
        { name: "chain", passed: true, failures: [] },
        { name: "nonce", passed: true, failures: [] },
      ],
    });

    const broadcastPackage = await createAgentProposalExecutionBroadcastPackage({
      ...evidence,
      broadcastPreflightPath: BROADCAST_PREFLIGHT_PATH,
      broadcastPreflightJson,
      generatedAt: GENERATED_AT,
    });
    if (!broadcastPackage.passed || broadcastPackage.package === null) {
      throw new Error(`fixture broadcast package failed: ${broadcastPackage.failures.join(", ")}`);
    }
    const broadcastPackageJson = JSON.stringify(broadcastPackage.package, null, 2);

    expect(broadcastPackage.package).toMatchObject({
      schemaVersion: 1,
      generatedAt: GENERATED_AT,
      broadcastPreflight: { path: BROADCAST_PREFLIGHT_PATH, sha256: sha256(broadcastPreflightJson) },
      signedPayload: { path: SIGNED_PAYLOAD_PATH, sha256: sha256(evidence.signedPayloadJson) },
      signingPayload: { path: PAYLOAD_PATH, sha256: sha256(evidence.payloadJson) },
      signer: SIGNER_ACCOUNT.address,
      chainId: 84532,
      nonceStart: 21,
      pendingNonce: 21,
      transactions: [
        { index: 0, rawTransaction: JSON.parse(evidence.signedPayloadJson).transactions[0].rawTransaction },
        { index: 1, rawTransaction: JSON.parse(evidence.signedPayloadJson).transactions[1].rawTransaction },
      ],
    });
    await expect(
      verifyAgentProposalExecutionBroadcastPackage({
        ...evidence,
        broadcastPreflightPath: BROADCAST_PREFLIGHT_PATH,
        broadcastPreflightJson,
        broadcastPackagePath: BROADCAST_PACKAGE_PATH,
        broadcastPackageJson,
      }),
    ).resolves.toEqual({
      passed: true,
      failures: [],
      packageResult: {
        passed: true,
        failures: [],
        package: broadcastPackage.package,
      },
    });
  });

  it("blocks stale fixture signed payload evidence before broadcast submission preparation", async () => {
    const evidence = await createFixtureSignedPayloadEvidence({
      objective: "Block stale fixture broadcast package",
      proposalPath: "artifacts/fixture-stale-broadcast-package-proposal.json",
      summaryPath: "artifacts/fixture-stale-broadcast-package-proposal.md",
      manifestPath: "artifacts/fixture-stale-broadcast-package-review.json",
      approvalPath: "artifacts/fixture-stale-broadcast-package-approval.json",
      sourcePath: "artifacts/fixture-stale-broadcast-package-plan.json",
      fixtures: [
        getPolicyDecisionFixture("allowed-swap"),
        getPolicyDecisionFixture("allowed-memory"),
      ],
    });
    const staleSignedPayload = JSON.parse(evidence.signedPayloadJson);
    staleSignedPayload.signingPayload.sha256 = `0x${"00".repeat(32)}`;
    const staleSignedPayloadJson = JSON.stringify(staleSignedPayload, null, 2);

    const preflight = await createAgentProposalExecutionBroadcastPreflight({
      ...evidence,
      signedPayloadJson: staleSignedPayloadJson,
      client: {
        getChainId: async () => {
          throw new Error("client must not be called for stale signed payload evidence");
        },
        getTransactionCount: async () => {
          throw new Error("client must not be called for stale signed payload evidence");
        },
      },
    });
    const broadcastPreflightJson = JSON.stringify(preflight, null, 2);

    expect(preflight).toMatchObject({
      passed: false,
      failures: ["signed payload signingPayload.sha256 must match payload JSON"],
      signedPayload: SIGNED_PAYLOAD_PATH,
      payload: PAYLOAD_PATH,
      connectedChainId: null,
      pendingNonce: null,
      checks: [
        {
          name: "signed-payload",
          passed: false,
          failures: ["signed payload signingPayload.sha256 must match payload JSON"],
        },
      ],
    });

    const broadcastPackage = await createAgentProposalExecutionBroadcastPackage({
      ...evidence,
      signedPayloadJson: staleSignedPayloadJson,
      broadcastPreflightPath: BROADCAST_PREFLIGHT_PATH,
      broadcastPreflightJson,
      generatedAt: GENERATED_AT,
    });

    expect(broadcastPackage.passed).toBe(false);
    expect(broadcastPackage.package).toBeNull();
    expect(broadcastPackage.failures).toContain("signed payload signingPayload.sha256 must match payload JSON");
    expect(broadcastPackage.failures).toContain("broadcast preflight must pass before creating a broadcast package");
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
