import { describe, expect, it } from "vitest";

import { createAgentProposalExecutionBroadcastCloseoutEvidenceSet } from "./set.js";
import { verifyAgentProposalExecutionBroadcastCloseoutEvidenceSet } from "./verify.js";
import { getPolicyDecisionFixture } from "../../fixtures/policyDecisions.js";
import {
  BROADCAST_ARCHIVE_PATH,
  BROADCAST_PACKAGE_PATH,
  BROADCAST_RECEIPT_PATH,
  BROADCAST_REPORT_PATH,
  CLOSEOUT_STATUS_PATH,
  GENERATED_AT,
  SIGNER_ACCOUNT,
  SUBMIT_RESULT_PATH,
  createFixtureBroadcastCloseoutEvidence,
} from "../fixtures/closeoutEvidence.js";

describe("broadcast closeout evidence-set fixture integration", () => {
  it.each(["allowed-swap", "allowed-memory"] as const)("creates and verifies fixture report, archive, and status evidence together (%s)", async (fixtureId) => {
    const closeoutEvidence = await createFixtureBroadcastCloseoutEvidence({
      objective: "Build fixture broadcast closeout evidence set",
      proposalPath: "artifacts/fixture-broadcast-closeout-evidence-set-proposal.json",
      summaryPath: "artifacts/fixture-broadcast-closeout-evidence-set-proposal.md",
      manifestPath: "artifacts/fixture-broadcast-closeout-evidence-set-review.json",
      approvalPath: "artifacts/fixture-broadcast-closeout-evidence-set-approval.json",
      sourcePath: "artifacts/fixture-broadcast-closeout-evidence-set-plan.json",
      fixtures: [
        getPolicyDecisionFixture(fixtureId),
      ],
    });

    const evidenceSet = createAgentProposalExecutionBroadcastCloseoutEvidenceSet({
      ...closeoutEvidence.receiptEvidence,
      reportPath: BROADCAST_REPORT_PATH,
      archivePath: BROADCAST_ARCHIVE_PATH,
      statusPath: CLOSEOUT_STATUS_PATH,
      generatedAt: GENERATED_AT,
    });

    expect(evidenceSet.passed).toBe(true);
    expect(evidenceSet.failures).toEqual([]);
    expect(evidenceSet.report).toEqual(closeoutEvidence.report);
    expect(evidenceSet.archive).toEqual(closeoutEvidence.archive);
    expect(evidenceSet.status).toEqual({
      path: CLOSEOUT_STATUS_PATH,
      json: expect.stringContaining(`"transactions": 1`),
    });
    expect(JSON.parse(evidenceSet.status?.json ?? "{}")).toEqual({
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
    expect(
      verifyAgentProposalExecutionBroadcastCloseoutEvidenceSet({
        ...closeoutEvidence.params,
        statusPath: CLOSEOUT_STATUS_PATH,
        statusJson: evidenceSet.status?.json ?? "",
      }),
    ).toEqual({
      passed: true,
      failures: [],
      checks: [
        { name: "broadcast-closeout", passed: true, failures: [] },
        { name: "broadcast-closeout-status", passed: true, failures: [] },
      ],
    });
  });

  it.each(["allowed-swap", "allowed-memory"] as const)("blocks stale fixture status JSON during evidence-set verification (%s)", async (fixtureId) => {
    const closeoutEvidence = await createFixtureBroadcastCloseoutEvidence({
      objective: "Block stale fixture broadcast closeout evidence-set status",
      proposalPath: "artifacts/fixture-stale-broadcast-closeout-evidence-set-status-proposal.json",
      summaryPath: "artifacts/fixture-stale-broadcast-closeout-evidence-set-status-proposal.md",
      manifestPath: "artifacts/fixture-stale-broadcast-closeout-evidence-set-status-review.json",
      approvalPath: "artifacts/fixture-stale-broadcast-closeout-evidence-set-status-approval.json",
      sourcePath: "artifacts/fixture-stale-broadcast-closeout-evidence-set-status-plan.json",
      fixtures: [
        getPolicyDecisionFixture(fixtureId),
      ],
    });
    const status = JSON.parse(closeoutEvidence.statusJson);
    status.transactions = 0;

    expect(
      verifyAgentProposalExecutionBroadcastCloseoutEvidenceSet({
        ...closeoutEvidence.params,
        statusPath: CLOSEOUT_STATUS_PATH,
        statusJson: `${JSON.stringify(status, null, 2)}\n`,
      }),
    ).toEqual({
      passed: false,
      failures: ["closeout status JSON does not match current closeout evidence"],
      checks: [
        { name: "broadcast-closeout", passed: true, failures: [] },
        {
          name: "broadcast-closeout-status",
          passed: false,
          failures: ["closeout status JSON does not match current closeout evidence"],
        },
      ],
    });
  });

  it.each(["allowed-swap", "allowed-memory"] as const)("blocks stale fixture closeout archive evidence during evidence-set verification (%s)", async (fixtureId) => {
    const closeoutEvidence = await createFixtureBroadcastCloseoutEvidence({
      objective: "Block stale fixture broadcast closeout evidence-set archive",
      proposalPath: "artifacts/fixture-stale-broadcast-closeout-evidence-set-archive-proposal.json",
      summaryPath: "artifacts/fixture-stale-broadcast-closeout-evidence-set-archive-proposal.md",
      manifestPath: "artifacts/fixture-stale-broadcast-closeout-evidence-set-archive-review.json",
      approvalPath: "artifacts/fixture-stale-broadcast-closeout-evidence-set-archive-approval.json",
      sourcePath: "artifacts/fixture-stale-broadcast-closeout-evidence-set-archive-plan.json",
      fixtures: [
        getPolicyDecisionFixture(fixtureId),
      ],
    });
    const staleArchive = JSON.parse(closeoutEvidence.archive.json);
    staleArchive.receipt.sha256 = "56".repeat(32);

    expect(
      verifyAgentProposalExecutionBroadcastCloseoutEvidenceSet({
        ...closeoutEvidence.params,
        archiveJson: `${JSON.stringify(staleArchive, null, 2)}\n`,
        statusPath: CLOSEOUT_STATUS_PATH,
        statusJson: closeoutEvidence.statusJson,
      }),
    ).toEqual({
      passed: false,
      failures: [
        "closeout archive JSON does not match current broadcast closeout",
        "closeout archive JSON does not match current broadcast closeout",
        "closeout status JSON does not match current closeout evidence",
      ],
      checks: [
        {
          name: "broadcast-closeout",
          passed: false,
          failures: ["closeout archive JSON does not match current broadcast closeout"],
        },
        {
          name: "broadcast-closeout-status",
          passed: false,
          failures: [
            "closeout archive JSON does not match current broadcast closeout",
            "closeout status JSON does not match current closeout evidence",
          ],
        },
      ],
    });
  });
});
