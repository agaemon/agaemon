import { createHash } from "node:crypto";

import { privateKeyToAccount } from "viem/accounts";

import { createAgentProposalExecutionBroadcastPackage } from "../../broadcast/package.js";
import { createAgentProposalExecutionBroadcastPreflight } from "../../broadcast/preflight.js";
import { createAgentProposalExecutionBroadcastReceipt } from "../../broadcast/receipt.js";
import { submitAgentProposalExecutionBroadcast } from "../../broadcast/submit.js";
import { createAgentProposalExecutionBroadcastCloseout } from "../closeout/closeout.js";
import { createAgentProposalExecutionBroadcastCloseoutEvidenceSetSummary } from "../evidenceSet/summary.js";
import { createAgentProposalExecutionBroadcastCloseoutFinalization } from "../finalization/finalization/finalization.js";
import {
  createAgentProposalExecutionBroadcastCloseoutFinalizationStatus,
  formatAgentProposalExecutionBroadcastCloseoutFinalizationStatus,
} from "../finalization/status/status.js";
import { createAgentProposalExecutionBroadcastCloseoutFinalizationArchive } from "../finalizationArchive/archive/archive.js";
import {
  createAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatus,
  formatAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatus,
} from "../finalizationArchive/status/status.js";
import { createAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummary } from "../finalizationArchive/statusSummary/summary.js";
import { createAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackage } from "../finalizationArchive/statusSummaryPackage/package.js";
import {
  createAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatus,
  formatAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatus,
} from "../finalizationArchive/statusSummaryPackage/status.js";
import { createPackageStatusSummary } from "../finalizationArchive/statusSummaryPackage/statusSummary/summary.js";
import {
  createAgentProposalExecutionBroadcastCloseoutStatus,
  formatAgentProposalExecutionBroadcastCloseoutStatus,
} from "../status/status.js";
import { createAgentPlanProposal } from "../../agentPlanning/planProposal.js";
import {
  createPolicyDecisionFixtureSimulator,
  getPolicyDecisionFixture,
} from "../../fixtures/policyDecisions.js";
import { createAgentProposalExecutionBundle } from "../../proposalExecution/bundle.js";
import { createAgentProposalExecutionHandoff } from "../../proposalExecution/handoff.js";
import { createAgentProposalExecutionReadiness } from "../../proposalExecution/readiness.js";
import { createAgentProposalExecutionSigningPayload } from "../../proposalExecution/signingPayload.js";
import { createAgentProposalOutput } from "../../proposal/output.js";
import { createAgentProposalSummary } from "../../proposal/summary.js";
import { createAgentProposalReviewApproval } from "../../proposalReview/approval.js";
import { createAgentProposalReviewPackage } from "../../proposalReview/package.js";

import type { AgentProposalExecutionSigningPayload } from "../../proposalExecution/signingPayload.js";

export const GENERATED_AT = "2026-06-29T07:40:00.000Z";
export const REVIEWER = "0x0000000000000000000000000000000000000c01";
export const SIGNER_ACCOUNT = privateKeyToAccount(`0x${"66".repeat(32)}`);
export const PREVIEW_PATH = "artifacts/fixture-agent-proposal-execution-preview.json";
export const RUNBOOK_PATH = "artifacts/fixture-agent-proposal-execution-runbook.md";
export const BUNDLE_PATH = "artifacts/fixture-agent-proposal-execution-bundle.json";
export const EXECUTION_MANIFEST_PATH = "artifacts/fixture-agent-proposal-execution-manifest.json";
export const READINESS_PATH = "artifacts/fixture-agent-proposal-execution-readiness.json";
export const PAYLOAD_PATH = "artifacts/fixture-agent-proposal-execution-signing-payload.json";
export const SIGNED_PAYLOAD_PATH = "artifacts/fixture-agent-proposal-execution-signed-payload.json";
export const BROADCAST_PREFLIGHT_PATH = "artifacts/fixture-agent-proposal-execution-broadcast-preflight.json";
export const BROADCAST_PACKAGE_PATH = "artifacts/fixture-agent-proposal-execution-broadcast-package.json";
export const SUBMIT_RESULT_PATH = "artifacts/fixture-agent-proposal-execution-broadcast-submit.json";
export const BROADCAST_RECEIPT_PATH = "artifacts/fixture-agent-proposal-execution-broadcast-receipt.json";
export const BROADCAST_REPORT_PATH = "artifacts/fixture-agent-proposal-execution-broadcast-report.md";
export const BROADCAST_ARCHIVE_PATH = "artifacts/fixture-agent-proposal-execution-broadcast-archive.json";
export const CLOSEOUT_STATUS_PATH = "artifacts/fixture-agent-proposal-execution-broadcast-closeout-status.json";
export const CLOSEOUT_SUMMARY_PATH = "artifacts/fixture-agent-proposal-execution-broadcast-closeout-summary.md";
export const FINALIZATION_STATUS_PATH = "artifacts/fixture-agent-proposal-execution-broadcast-closeout-finalization-status.json";
export const FINALIZATION_ARCHIVE_PATH = "artifacts/fixture-agent-proposal-execution-broadcast-closeout-finalization-archive.json";
export const FINALIZATION_ARCHIVE_STATUS_PATH = "artifacts/fixture-agent-proposal-execution-broadcast-closeout-finalization-archive-status.json";
export const FINALIZATION_ARCHIVE_STATUS_SUMMARY_PATH = "artifacts/fixture-agent-proposal-execution-broadcast-closeout-finalization-archive-status-summary.md";
export const FINALIZATION_ARCHIVE_STATUS_SUMMARY_PACKAGE_PATH = "artifacts/fixture-agent-proposal-execution-broadcast-closeout-finalization-archive-status-summary-package.json";
export const FINALIZATION_ARCHIVE_STATUS_SUMMARY_PACKAGE_STATUS_PATH = "artifacts/fixture-agent-proposal-execution-broadcast-closeout-finalization-archive-status-summary-package-status.json";
export const FINALIZATION_ARCHIVE_STATUS_SUMMARY_PACKAGE_STATUS_SUMMARY_PATH = "artifacts/fixture-agent-proposal-execution-broadcast-closeout-finalization-archive-status-summary-package-status-summary.md";
export const FIRST_TX_HASH = `0x${"de".repeat(32)}` as const;
export const SECOND_TX_HASH = `0x${"f0".repeat(32)}` as const;

type Fixture = ReturnType<typeof getPolicyDecisionFixture>;

export async function createFixtureBroadcastCloseoutEvidence(params: {
  objective: string;
  proposalPath: string;
  summaryPath: string;
  manifestPath: string;
  approvalPath: string;
  sourcePath: string;
  fixtures: Fixture[];
}) {
  const receiptEvidence = await createFixtureBroadcastReceiptEvidence(params);
  const closeout = createAgentProposalExecutionBroadcastCloseout({
    ...receiptEvidence,
    reportPath: BROADCAST_REPORT_PATH,
    archivePath: BROADCAST_ARCHIVE_PATH,
    generatedAt: GENERATED_AT,
  });
  if (!closeout.passed) {
    throw new Error(`fixture closeout failed: ${closeout.failures.join(", ")}`);
  }

  const verifierParams = {
    ...receiptEvidence,
    reportPath: BROADCAST_REPORT_PATH,
    reportMarkdown: closeout.report.markdown,
    archivePath: BROADCAST_ARCHIVE_PATH,
    archiveJson: closeout.archive.json,
  };
  const status = createAgentProposalExecutionBroadcastCloseoutStatus(verifierParams);
  if (!status.passed) {
    throw new Error(`fixture closeout status failed: ${status.checks.flatMap((check) => check.failures).join(", ")}`);
  }

  return {
    receiptEvidence,
    params: verifierParams,
    report: closeout.report,
    archive: closeout.archive,
    statusJson: formatAgentProposalExecutionBroadcastCloseoutStatus(status),
  };
}

export async function createFixtureBroadcastCloseoutEvidenceSetSummaryEvidence(params: {
  objective: string;
  proposalPath: string;
  summaryPath: string;
  manifestPath: string;
  approvalPath: string;
  sourcePath: string;
  fixtures: Fixture[];
}) {
  const closeoutEvidence = await createFixtureBroadcastCloseoutEvidence(params);
  const summaryParams = {
    ...closeoutEvidence.params,
    statusPath: CLOSEOUT_STATUS_PATH,
    statusJson: closeoutEvidence.statusJson,
  };
  const summary = createAgentProposalExecutionBroadcastCloseoutEvidenceSetSummary(summaryParams);
  if (!summary.passed) {
    throw new Error(`fixture closeout evidence-set summary failed: ${summary.failures.join(", ")}`);
  }

  return {
    ...closeoutEvidence,
    params: summaryParams,
    summary,
  };
}

export async function createFixtureBroadcastCloseoutEvidenceSetSummaryVerificationEvidence(params: {
  objective: string;
  proposalPath: string;
  summaryPath: string;
  manifestPath: string;
  approvalPath: string;
  sourcePath: string;
  fixtures: Fixture[];
}) {
  const summaryEvidence = await createFixtureBroadcastCloseoutEvidenceSetSummaryEvidence(params);

  return {
    ...summaryEvidence.params,
    summaryPath: CLOSEOUT_SUMMARY_PATH,
    summaryMarkdown: summaryEvidence.summary.markdown,
  };
}

export async function createFixtureBroadcastCloseoutFinalizationEvidence(params: {
  objective: string;
  proposalPath: string;
  summaryPath: string;
  manifestPath: string;
  approvalPath: string;
  sourcePath: string;
  fixtures: Fixture[];
}) {
  const summaryEvidence = await createFixtureBroadcastCloseoutEvidenceSetSummaryVerificationEvidence(params);
  const finalization = createAgentProposalExecutionBroadcastCloseoutFinalization({
    broadcastReceiptPath: summaryEvidence.broadcastReceiptPath,
    broadcastReceiptJson: summaryEvidence.broadcastReceiptJson,
    broadcastPackagePath: summaryEvidence.broadcastPackagePath,
    broadcastPackageJson: summaryEvidence.broadcastPackageJson,
    submitResultPath: summaryEvidence.submitResultPath,
    submitResultJson: summaryEvidence.submitResultJson,
    reportPath: summaryEvidence.reportPath,
    archivePath: summaryEvidence.archivePath,
    statusPath: summaryEvidence.statusPath,
    summaryPath: summaryEvidence.summaryPath,
    generatedAt: GENERATED_AT,
  });
  if (!finalization.passed) {
    throw new Error(`fixture closeout finalization failed: ${finalization.failures.join(", ")}`);
  }

  return {
    params: summaryEvidence,
    finalization,
  };
}

export async function createFixtureBroadcastCloseoutFinalizationStatusEvidence(params: {
  objective: string;
  proposalPath: string;
  summaryPath: string;
  manifestPath: string;
  approvalPath: string;
  sourcePath: string;
  fixtures: Fixture[];
}) {
  const finalizationEvidence = await createFixtureBroadcastCloseoutFinalizationEvidence(params);
  const status = createAgentProposalExecutionBroadcastCloseoutFinalizationStatus(finalizationEvidence.params);
  if (!status.passed) {
    throw new Error(`fixture closeout finalization status failed: ${status.checks.flatMap((check) => check.failures).join(", ")}`);
  }

  return {
    ...finalizationEvidence,
    status,
    params: {
      ...finalizationEvidence.params,
      finalizationStatusPath: FINALIZATION_STATUS_PATH,
      finalizationStatusJson: formatAgentProposalExecutionBroadcastCloseoutFinalizationStatus(status),
    },
  };
}

export async function createFixtureBroadcastCloseoutFinalizationArchiveEvidence(params: {
  objective: string;
  proposalPath: string;
  summaryPath: string;
  manifestPath: string;
  approvalPath: string;
  sourcePath: string;
  fixtures: Fixture[];
}) {
  const statusEvidence = await createFixtureBroadcastCloseoutFinalizationStatusEvidence(params);
  const archive = createAgentProposalExecutionBroadcastCloseoutFinalizationArchive({
    ...statusEvidence.params,
    finalizationArchivePath: FINALIZATION_ARCHIVE_PATH,
    generatedAt: GENERATED_AT,
  });
  if (!archive.verification.passed) {
    throw new Error(`fixture closeout finalization archive failed: ${archive.verification.failures.join(", ")}`);
  }

  return {
    ...statusEvidence,
    archive,
    params: {
      ...statusEvidence.params,
      finalizationArchivePath: FINALIZATION_ARCHIVE_PATH,
      finalizationArchiveJson: JSON.stringify(archive, null, 2),
    },
  };
}

export async function createFixtureBroadcastCloseoutFinalizationArchiveStatusEvidence(params: {
  objective: string;
  proposalPath: string;
  summaryPath: string;
  manifestPath: string;
  approvalPath: string;
  sourcePath: string;
  fixtures: Fixture[];
}) {
  const archiveEvidence = await createFixtureBroadcastCloseoutFinalizationArchiveEvidence(params);
  const status = createAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatus(archiveEvidence.params);
  if (!status.passed) {
    throw new Error(`fixture closeout finalization archive status failed: ${status.checks.flatMap((check) => check.failures).join(", ")}`);
  }

  return {
    ...archiveEvidence,
    status,
    params: {
      ...archiveEvidence.params,
      finalizationArchiveStatusPath: FINALIZATION_ARCHIVE_STATUS_PATH,
      finalizationArchiveStatusJson: formatAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatus(status),
    },
  };
}

export async function createFixtureBroadcastCloseoutFinalizationArchiveStatusSummaryEvidence(params: {
  objective: string;
  proposalPath: string;
  summaryPath: string;
  manifestPath: string;
  approvalPath: string;
  sourcePath: string;
  fixtures: Fixture[];
}) {
  const statusEvidence = await createFixtureBroadcastCloseoutFinalizationArchiveStatusEvidence(params);
  const summaryParams = {
    ...statusEvidence.params,
    finalizationArchiveStatusSummaryPath: FINALIZATION_ARCHIVE_STATUS_SUMMARY_PATH,
  };
  const summary = createAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummary(summaryParams);
  if (!summary.passed) {
    throw new Error(`fixture closeout finalization archive status summary failed: ${summary.failures.join(", ")}`);
  }

  return {
    ...statusEvidence,
    summary,
    params: {
      ...summaryParams,
      finalizationArchiveStatusSummaryMarkdown: summary.markdown,
    },
  };
}

export async function createFixtureBroadcastCloseoutFinalizationArchiveStatusSummaryPackageEvidence(params: {
  objective: string;
  proposalPath: string;
  summaryPath: string;
  manifestPath: string;
  approvalPath: string;
  sourcePath: string;
  fixtures: Fixture[];
}) {
  const summaryEvidence = await createFixtureBroadcastCloseoutFinalizationArchiveStatusSummaryEvidence(params);
  const packageManifest = createAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackage({
    ...summaryEvidence.params,
    finalizationArchiveStatusSummaryPackagePath: FINALIZATION_ARCHIVE_STATUS_SUMMARY_PACKAGE_PATH,
    generatedAt: GENERATED_AT,
  });
  if (!packageManifest.verification.passed) {
    throw new Error(
      `fixture closeout finalization archive status summary package failed: ${packageManifest.verification.failures.join(", ")}`,
    );
  }

  return {
    ...summaryEvidence,
    packageManifest,
    params: {
      ...summaryEvidence.params,
      finalizationArchiveStatusSummaryPackagePath: FINALIZATION_ARCHIVE_STATUS_SUMMARY_PACKAGE_PATH,
      finalizationArchiveStatusSummaryPackageJson: JSON.stringify(packageManifest, null, 2),
    },
  };
}

export async function createFixtureBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusEvidence(params: {
  objective: string;
  proposalPath: string;
  summaryPath: string;
  manifestPath: string;
  approvalPath: string;
  sourcePath: string;
  fixtures: Fixture[];
}) {
  const packageEvidence = await createFixtureBroadcastCloseoutFinalizationArchiveStatusSummaryPackageEvidence(params);
  const status = createAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatus(packageEvidence.params);
  if (!status.passed) {
    throw new Error(
      `fixture closeout finalization archive status summary package status failed: ${status.checks.flatMap((check) => check.failures).join(", ")}`,
    );
  }

  return {
    ...packageEvidence,
    status,
    params: {
      ...packageEvidence.params,
      finalizationArchiveStatusSummaryPackageStatusPath: FINALIZATION_ARCHIVE_STATUS_SUMMARY_PACKAGE_STATUS_PATH,
      finalizationArchiveStatusSummaryPackageStatusJson:
        formatAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatus(status),
    },
  };
}

export async function createFixtureBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusSummaryEvidence(params: {
  objective: string;
  proposalPath: string;
  summaryPath: string;
  manifestPath: string;
  approvalPath: string;
  sourcePath: string;
  fixtures: Fixture[];
}) {
  const statusEvidence = await createFixtureBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusEvidence(params);
  const summary = createPackageStatusSummary(statusEvidence.params);
  if (!summary.passed) {
    throw new Error(
      `fixture closeout finalization archive status summary package status summary failed: ${summary.failures.join(", ")}`,
    );
  }

  return {
    ...statusEvidence,
    summary,
    params: {
      ...statusEvidence.params,
      finalizationArchiveStatusSummaryPackageStatusSummaryPath:
        FINALIZATION_ARCHIVE_STATUS_SUMMARY_PACKAGE_STATUS_SUMMARY_PATH,
      finalizationArchiveStatusSummaryPackageStatusSummaryMarkdown: summary.markdown,
    },
  };
}

export async function createFixtureBroadcastReceiptEvidence(params: {
  objective: string;
  proposalPath: string;
  summaryPath: string;
  manifestPath: string;
  approvalPath: string;
  sourcePath: string;
  fixtures: Fixture[];
}) {
  const evidence = await createFixtureBroadcastPackageEvidence(params);
  const broadcastPackage = JSON.parse(evidence.broadcastPackageJson);
  const submitResult = await submitAgentProposalExecutionBroadcast({
    ...evidence,
    send: true,
    client: {
      getChainId: async () => 84532,
      sendRawTransaction: async ({ serializedTransaction }) => {
        const index = broadcastPackage.transactions.findIndex(
          (transaction: { rawTransaction: string }) => transaction.rawTransaction === serializedTransaction,
        );
        return index === 0 ? FIRST_TX_HASH : SECOND_TX_HASH;
      },
      waitForTransactionReceipt: async ({ hash }) => ({
        blockNumber: hash === FIRST_TX_HASH ? 901n : 902n,
        status: "success",
      }),
    },
  });
  if (!submitResult.passed) {
    throw new Error(`fixture submit failed: ${submitResult.failures.join(", ")}`);
  }

  const receipt = createAgentProposalExecutionBroadcastReceipt({
    broadcastPackagePath: BROADCAST_PACKAGE_PATH,
    broadcastPackageJson: evidence.broadcastPackageJson,
    submitResult,
    generatedAt: GENERATED_AT,
  });
  if (!receipt.passed || receipt.receipt === null) {
    throw new Error(`fixture receipt failed: ${receipt.failures.join(", ")}`);
  }

  return {
    ...evidence,
    submitResultPath: SUBMIT_RESULT_PATH,
    submitResultJson: JSON.stringify(submitResult, null, 2),
    broadcastReceiptPath: BROADCAST_RECEIPT_PATH,
    broadcastReceiptJson: JSON.stringify(receipt.receipt, null, 2),
  };
}

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
        if (params.address !== SIGNER_ACCOUNT.address || params.blockTag !== "pending") {
          throw new Error("fixture broadcast preflight nonce params changed");
        }
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
