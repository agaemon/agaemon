import { describe, expect, it } from "vitest";

import { createAgentProposalExecutionBroadcastCloseout } from "../closeout/closeout.js";
import { verifyAgentProposalExecutionBroadcastCloseout } from "../closeout/closeoutVerify.js";
import {
  createAgentProposalExecutionBroadcastCloseoutStatus,
  formatAgentProposalExecutionBroadcastCloseoutStatus,
} from "./status.js";
import { verifyAgentProposalExecutionBroadcastCloseoutStatus } from "./statusVerify.js";
import { getPolicyDecisionFixture } from "../../fixtures/policyDecisions.js";
import {
  BROADCAST_ARCHIVE_PATH,
  BROADCAST_PACKAGE_PATH,
  BROADCAST_RECEIPT_PATH,
  BROADCAST_REPORT_PATH,
  GENERATED_AT,
  SIGNER_ACCOUNT,
  SUBMIT_RESULT_PATH,
  createFixtureBroadcastReceiptEvidence,
} from "../fixtures/closeoutEvidence.js";

describe("broadcast closeout status fixture integration", () => {
  it.each(["allowed-swap", "allowed-memory"] as const)("renders and verifies status output from verified fixture closeout evidence (%s)", async (fixtureId) => {
    const evidence = await createFixtureCloseoutEvidence(fixtureId, {
      objective: "Render fixture broadcast closeout status",
      proposalPath: "artifacts/fixture-broadcast-closeout-status-proposal.json",
      summaryPath: "artifacts/fixture-broadcast-closeout-status-proposal.md",
      manifestPath: "artifacts/fixture-broadcast-closeout-status-review.json",
      approvalPath: "artifacts/fixture-broadcast-closeout-status-approval.json",
      sourcePath: "artifacts/fixture-broadcast-closeout-status-plan.json",
    });
    const closeoutVerification = verifyAgentProposalExecutionBroadcastCloseout(evidence);

    expect(closeoutVerification).toEqual({
      passed: true,
      failures: [],
      closeout: expect.objectContaining({
        passed: true,
        failures: [],
      }),
    });

    const status = createAgentProposalExecutionBroadcastCloseoutStatus(evidence);
    const statusJson = formatAgentProposalExecutionBroadcastCloseoutStatus(status);

    expect(status).toEqual({
      passed: true,
      report: BROADCAST_REPORT_PATH,
      archive: BROADCAST_ARCHIVE_PATH,
      broadcastReceipt: BROADCAST_RECEIPT_PATH,
      broadcastPackage: BROADCAST_PACKAGE_PATH,
      submitResult: SUBMIT_RESULT_PATH,
      signer: SIGNER_ACCOUNT.address,
      chainId: 84532,
      transactions: 1,
      checks: [
        { name: "broadcast-report", passed: true, failures: [] },
        { name: "broadcast-archive", passed: true, failures: [] },
        { name: "broadcast-closeout", passed: true, failures: [] },
      ],
    });
    expect(statusJson).toBe(`${JSON.stringify(status, null, 2)}\n`);
    expect(
      verifyAgentProposalExecutionBroadcastCloseoutStatus({
        ...evidence,
        statusJson,
      }),
    ).toEqual({
      passed: true,
      failures: [],
    });
  });

  it.each(["allowed-swap", "allowed-memory"] as const)("blocks stale fixture closeout evidence during status verification (%s)", async (fixtureId) => {
    const evidence = await createFixtureCloseoutEvidence(fixtureId, {
      objective: "Block stale fixture broadcast closeout status",
      proposalPath: "artifacts/fixture-stale-broadcast-closeout-status-proposal.json",
      summaryPath: "artifacts/fixture-stale-broadcast-closeout-status-proposal.md",
      manifestPath: "artifacts/fixture-stale-broadcast-closeout-status-review.json",
      approvalPath: "artifacts/fixture-stale-broadcast-closeout-status-approval.json",
      sourcePath: "artifacts/fixture-stale-broadcast-closeout-status-plan.json",
    });
    const statusJson = formatAgentProposalExecutionBroadcastCloseoutStatus(
      createAgentProposalExecutionBroadcastCloseoutStatus(evidence),
    );
    const staleArchive = JSON.parse(evidence.archiveJson);
    staleArchive.receipt.sha256 = "34".repeat(32);
    const staleArchiveJson = `${JSON.stringify(staleArchive, null, 2)}\n`;

    expect(
      verifyAgentProposalExecutionBroadcastCloseoutStatus({
        ...evidence,
        archiveJson: staleArchiveJson,
        statusJson,
      }),
    ).toEqual({
      passed: false,
      failures: [
        "closeout archive JSON does not match current broadcast closeout",
        "closeout status JSON does not match current closeout evidence",
      ],
    });
  });
});

async function createFixtureCloseoutEvidence(fixtureId: "allowed-swap" | "allowed-memory", params: {
  objective: string;
  proposalPath: string;
  summaryPath: string;
  manifestPath: string;
  approvalPath: string;
  sourcePath: string;
}) {
  const receiptEvidence = await createFixtureBroadcastReceiptEvidence({
    ...params,
    fixtures: [
      getPolicyDecisionFixture(fixtureId),
    ],
  });
  const closeout = createAgentProposalExecutionBroadcastCloseout({
    ...receiptEvidence,
    reportPath: BROADCAST_REPORT_PATH,
    archivePath: BROADCAST_ARCHIVE_PATH,
    generatedAt: GENERATED_AT,
  });
  if (!closeout.passed) {
    throw new Error(`fixture closeout failed: ${closeout.failures.join(", ")}`);
  }

  return {
    ...receiptEvidence,
    reportPath: BROADCAST_REPORT_PATH,
    reportMarkdown: closeout.report.markdown,
    archivePath: BROADCAST_ARCHIVE_PATH,
    archiveJson: closeout.archive.json,
  };
}
