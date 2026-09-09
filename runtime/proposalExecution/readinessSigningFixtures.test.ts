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
import { verifyAgentProposalExecutionHandoff } from "./handoffVerify.js";
import { createAgentProposalExecutionReadiness } from "./readiness.js";
import { verifyAgentProposalExecutionReadiness } from "./readinessVerify.js";
import { createAgentProposalExecutionSigningPayload } from "./signingPayload.js";
import { verifyAgentProposalExecutionSigningPayloadPreflight } from "./signingPayloadPreflight.js";
import { verifyAgentProposalExecutionSigningPayload } from "./signingPayloadVerify.js";

const GENERATED_AT = "2026-06-29T04:15:00.000Z";
const REVIEWER = "0x0000000000000000000000000000000000000c01";
const SIGNER = "0x0000000000000000000000000000000000000d01";
const PREVIEW_PATH = "artifacts/fixture-agent-proposal-execution-preview.json";
const RUNBOOK_PATH = "artifacts/fixture-agent-proposal-execution-runbook.md";
const BUNDLE_PATH = "artifacts/fixture-agent-proposal-execution-bundle.json";
const EXECUTION_MANIFEST_PATH = "artifacts/fixture-agent-proposal-execution-manifest.json";
const READINESS_PATH = "artifacts/fixture-agent-proposal-execution-readiness.json";
const PAYLOAD_PATH = "artifacts/fixture-agent-proposal-execution-signing-payload.json";

describe("proposal execution readiness/signing fixture integration", () => {
  it.each(["allowed-swap", "allowed-memory"] as const)("creates reproducible readiness and signing payload evidence from verified fixture handoffs (%s)", async (fixtureId) => {
    const evidence = await createFixtureHandoffEvidence({
      objective: "Create fixture readiness signing payload",
      proposalPath: "artifacts/fixture-readiness-signing-proposal.json",
      summaryPath: "artifacts/fixture-readiness-signing-proposal.md",
      manifestPath: "artifacts/fixture-readiness-signing-review.json",
      approvalPath: "artifacts/fixture-readiness-signing-approval.json",
      sourcePath: "artifacts/fixture-readiness-signing-plan.json",
      fixtures: [
        getPolicyDecisionFixture(fixtureId),
      ],
    });

    expect(verifyAgentProposalExecutionHandoff(evidence)).toMatchObject({
      passed: true,
      failures: [],
    });

    const gasCalls: Array<{ account: string; to: string; value: bigint; data: string }> = [];
    const readiness = await createAgentProposalExecutionReadiness({
      ...evidence,
      signer: SIGNER,
      expectedChainId: 84532,
      client: {
        getChainId: async () => 84532,
        getTransactionCount: async (params) => {
          expect(params).toEqual({ address: SIGNER, blockTag: "pending" });
          return 13;
        },
        estimateGas: async (params) => {
          gasCalls.push(params);
          return params.value === 123n ? 31_000n : 42_000n;
        },
      },
    });
    const readinessJson = JSON.stringify(readiness, null, 2);

    expect(gasCalls).toEqual([
      expect.objectContaining({
        account: SIGNER, to: getPolicyDecisionFixture(fixtureId).agent,
        value: getPolicyDecisionFixture(fixtureId).action.value,
      }),
    ]);
    expect(readiness).toMatchObject({
      passed: true,
      failures: [],
      signer: SIGNER,
      expectedChainId: 84532,
      connectedChainId: 84532,
      pendingNonce: 13,
      transactions: [
        {
          index: 0, stepId: fixtureId, title: getPolicyDecisionFixture(fixtureId).title,
          value: getPolicyDecisionFixture(fixtureId).action.value.toString(),
          gasEstimate: fixtureId === "allowed-swap" ? "31000" : "42000",
        },
      ],
    });
    expect(
      verifyAgentProposalExecutionReadiness({
        ...evidence,
        readinessJson,
      }),
    ).toEqual({
      passed: true,
      failures: [],
      handoffVerification: expect.objectContaining({
        passed: true,
        failures: [],
      }),
    });

    const signingPayload = createAgentProposalExecutionSigningPayload({
      ...evidence,
      readinessPath: READINESS_PATH,
      readinessJson,
    });
    if (!signingPayload.passed || signingPayload.payload === null) {
      throw new Error(`fixture signing payload failed: ${signingPayload.failures.join(", ")}`);
    }
    const payloadJson = JSON.stringify(signingPayload.payload, null, 2);

    expect(signingPayload.payload).toEqual({
      schemaVersion: 1,
      signer: SIGNER,
      chainId: 84532,
      readiness: { path: READINESS_PATH },
      bundle: { path: BUNDLE_PATH },
      nonceStart: 13,
      transactions: [
        expect.objectContaining({
          index: 0,
          stepId: fixtureId,
          title: getPolicyDecisionFixture(fixtureId).title,
          nonce: 13,
          value: getPolicyDecisionFixture(fixtureId).action.value.toString(),
          gasLimit: fixtureId === "allowed-swap" ? "31000" : "42000",
        }),
      ],
    });
    expect(
      verifyAgentProposalExecutionSigningPayload({
        ...evidence,
        readinessPath: READINESS_PATH,
        readinessJson,
        payloadJson,
      }),
    ).toEqual({
      passed: true,
      failures: [],
      result: expect.objectContaining({
        passed: true,
        failures: [],
      }),
    });
    expect(
      verifyAgentProposalExecutionSigningPayloadPreflight({
        ...evidence,
        readinessPath: READINESS_PATH,
        readinessJson,
        payloadPath: PAYLOAD_PATH,
        payloadJson,
      }),
    ).toEqual({
      passed: true,
      payload: PAYLOAD_PATH,
      readiness: READINESS_PATH,
      preview: PREVIEW_PATH,
      runbook: RUNBOOK_PATH,
      executionManifest: EXECUTION_MANIFEST_PATH,
      bundle: BUNDLE_PATH,
      approval: "artifacts/fixture-readiness-signing-approval.json",
      manifest: "artifacts/fixture-readiness-signing-review.json",
      proposal: "artifacts/fixture-readiness-signing-proposal.json",
      summary: "artifacts/fixture-readiness-signing-proposal.md",
      signer: SIGNER,
      chainId: 84532,
      nonceStart: 13,
      transactions: 1,
      checks: [
        { name: "execution-readiness", passed: true, failures: [] },
        { name: "signing-payload", passed: true, failures: [] },
      ],
    });
  });

  it.each(["allowed-swap", "allowed-memory"] as const)("blocks stale fixture handoff evidence before signing payload preparation (%s)", async (fixtureId) => {
    const evidence = await createFixtureHandoffEvidence({
      objective: "Block stale fixture signing handoff",
      proposalPath: "artifacts/fixture-stale-signing-proposal.json",
      summaryPath: "artifacts/fixture-stale-signing-proposal.md",
      manifestPath: "artifacts/fixture-stale-signing-review.json",
      approvalPath: "artifacts/fixture-stale-signing-approval.json",
      sourcePath: "artifacts/fixture-stale-signing-plan.json",
      fixtures: [
        getPolicyDecisionFixture(fixtureId),
      ],
    });
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
          throw new Error("client must not be called for stale handoff evidence");
        },
        getTransactionCount: async () => {
          throw new Error("client must not be called for stale handoff evidence");
        },
        estimateGas: async () => {
          throw new Error("client must not be called for stale handoff evidence");
        },
      },
    });
    const readinessJson = JSON.stringify(readiness, null, 2);

    expect(readiness.passed).toBe(false);
    expect(readiness.transactions).toEqual([]);
    expect(readiness.failures).toContain("runbook markdown does not match current execution preview");

    const signingPayload = createAgentProposalExecutionSigningPayload({
      ...evidence,
      runbookMarkdown: staleRunbookMarkdown,
      readinessPath: READINESS_PATH,
      readinessJson,
    });

    expect(signingPayload.passed).toBe(false);
    expect(signingPayload.payload).toBeNull();
    expect(signingPayload.failures).toContain("runbook markdown does not match current execution preview");
    expect(signingPayload.failures).toContain("readiness passed must be true");
  });
});

type Fixture = ReturnType<typeof getPolicyDecisionFixture>;

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
