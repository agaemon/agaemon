import { createHash } from "node:crypto";

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
import { createAgentProposalExecutionManifest } from "./manifest.js";
import { verifyAgentProposalExecutionManifest } from "./manifestVerify.js";
import { createAgentProposalExecutionPackage } from "./package.js";
import { verifyAgentProposalExecutionPackage } from "./packageVerify.js";

const GENERATED_AT = "2026-06-28T17:15:00.000Z";
const REVIEWER = "0x0000000000000000000000000000000000000c01";
const PREVIEW_PATH = "artifacts/fixture-agent-proposal-execution-preview.json";
const RUNBOOK_PATH = "artifacts/fixture-agent-proposal-execution-runbook.md";
const BUNDLE_PATH = "artifacts/fixture-agent-proposal-execution-bundle.json";
const EXECUTION_MANIFEST_PATH = "artifacts/fixture-agent-proposal-execution-manifest.json";

describe("proposal execution manifest/handoff fixture integration", () => {
  it("creates reproducible manifest and handoff evidence from fixture package artifacts", async () => {
    const evidence = await createFixtureExecutionEvidence({
      objective: "Create fixture execution manifest handoff",
      proposalPath: "artifacts/fixture-manifest-handoff-proposal.json",
      summaryPath: "artifacts/fixture-manifest-handoff-proposal.md",
      manifestPath: "artifacts/fixture-manifest-handoff-review.json",
      approvalPath: "artifacts/fixture-manifest-handoff-approval.json",
      sourcePath: "artifacts/fixture-manifest-handoff-plan.json",
      fixtures: [
        getPolicyDecisionFixture("allowed-swap"),
        getPolicyDecisionFixture("allowed-memory"),
      ],
    });
    const executionPackage = createAgentProposalExecutionPackage(evidence);
    if (!executionPackage.passed) {
      throw new Error(`fixture execution package failed: ${executionPackage.failures.join(", ")}`);
    }

    const packageVerification = verifyAgentProposalExecutionPackage({
      ...evidence,
      previewJson: executionPackage.preview.json,
      runbookMarkdown: executionPackage.runbook.markdown,
    });
    expect(packageVerification.passed).toBe(true);
    expect(packageVerification.failures).toEqual([]);

    const manifest = createAgentProposalExecutionManifest({
      ...evidence,
      previewJson: executionPackage.preview.json,
      runbookMarkdown: executionPackage.runbook.markdown,
      executionManifestPath: EXECUTION_MANIFEST_PATH,
    });
    const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;

    expect(manifest).toMatchObject({
      schemaVersion: 1,
      generatedAt: GENERATED_AT,
      preview: { path: PREVIEW_PATH, sha256: sha256(executionPackage.preview.json) },
      runbook: { path: RUNBOOK_PATH, sha256: sha256(executionPackage.runbook.markdown) },
      bundle: { path: BUNDLE_PATH, sha256: sha256(evidence.bundleJson) },
      preflight: {
        passed: true,
        preview: PREVIEW_PATH,
        runbook: RUNBOOK_PATH,
        bundle: BUNDLE_PATH,
        chainId: 84532,
        transactions: 2,
      },
    });
    expect(
      verifyAgentProposalExecutionManifest({
        ...evidence,
        previewJson: executionPackage.preview.json,
        runbookMarkdown: executionPackage.runbook.markdown,
        executionManifestJson: manifestJson,
      }),
    ).toEqual({ passed: true, failures: [] });

    const handoff = createAgentProposalExecutionHandoff({
      ...evidence,
      executionManifestPath: EXECUTION_MANIFEST_PATH,
    });

    expect(handoff.passed).toBe(true);
    expect(handoff.failures).toEqual([]);
    expect(handoff.preview).toEqual(executionPackage.preview);
    expect(handoff.runbook).toEqual(executionPackage.runbook);
    expect(handoff.executionManifest).toEqual({
      path: EXECUTION_MANIFEST_PATH,
      json: manifestJson,
    });
    expect(
      verifyAgentProposalExecutionHandoff({
        ...evidence,
        previewJson: handoff.preview.json,
        runbookMarkdown: handoff.runbook.markdown,
        executionManifestJson: handoff.executionManifest.json,
      }),
    ).toMatchObject({
      passed: true,
      failures: [],
      checks: [
        { name: "execution-package", passed: true, failures: [] },
        { name: "execution-manifest", passed: true, failures: [] },
      ],
    });
  });

  it("blocks stale fixture package evidence before downstream handoff creation", async () => {
    const evidence = await createFixtureExecutionEvidence({
      objective: "Block stale fixture handoff evidence",
      proposalPath: "artifacts/fixture-stale-handoff-proposal.json",
      summaryPath: "artifacts/fixture-stale-handoff-proposal.md",
      manifestPath: "artifacts/fixture-stale-handoff-review.json",
      approvalPath: "artifacts/fixture-stale-handoff-approval.json",
      sourcePath: "artifacts/fixture-stale-handoff-plan.json",
      fixtures: [
        getPolicyDecisionFixture("allowed-swap"),
        getPolicyDecisionFixture("allowed-memory"),
      ],
    });
    const staleBundle = JSON.parse(evidence.bundleJson);
    staleBundle.transactions[0].value = "999";

    const handoff = createAgentProposalExecutionHandoff({
      ...evidence,
      bundleJson: JSON.stringify(staleBundle, null, 2),
      executionManifestPath: EXECUTION_MANIFEST_PATH,
    });

    expect(handoff).toMatchObject({
      passed: false,
      failures: ["bundle transactions do not match current approved proposal"],
      preview: { path: PREVIEW_PATH, json: "" },
      runbook: { path: RUNBOOK_PATH, markdown: "" },
      executionManifest: { path: EXECUTION_MANIFEST_PATH, json: "" },
      executionPackage: {
        passed: false,
        failures: ["bundle transactions do not match current approved proposal"],
      },
      executionManifestVerification: null,
    });
  });
});

type Fixture = ReturnType<typeof getPolicyDecisionFixture>;

async function createFixtureExecutionEvidence(params: {
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
  const baseEvidence = {
    previewPath: PREVIEW_PATH,
    runbookPath: RUNBOOK_PATH,
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
  const bundle = createAgentProposalExecutionBundle(baseEvidence);
  if (!bundle.passed || bundle.bundle === null) {
    throw new Error(`fixture execution bundle failed: ${bundle.failures.join(", ")}`);
  }

  return {
    ...baseEvidence,
    bundleJson: JSON.stringify(bundle.bundle, null, 2),
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
