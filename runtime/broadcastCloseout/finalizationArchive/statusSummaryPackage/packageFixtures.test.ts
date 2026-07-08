import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackage } from "./packageVerify.js";
import { getPolicyDecisionFixture } from "../../../fixtures/policyDecisions.js";
import {
  BROADCAST_ARCHIVE_PATH,
  BROADCAST_PACKAGE_PATH,
  BROADCAST_RECEIPT_PATH,
  BROADCAST_REPORT_PATH,
  CLOSEOUT_STATUS_PATH,
  CLOSEOUT_SUMMARY_PATH,
  FINALIZATION_ARCHIVE_PATH,
  FINALIZATION_ARCHIVE_STATUS_PATH,
  FINALIZATION_ARCHIVE_STATUS_SUMMARY_PACKAGE_PATH,
  FINALIZATION_ARCHIVE_STATUS_SUMMARY_PATH,
  FINALIZATION_STATUS_PATH,
  SUBMIT_RESULT_PATH,
  createFixtureBroadcastCloseoutFinalizationArchiveStatusSummaryPackageEvidence,
} from "../../fixtures/closeoutEvidence.js";

describe("broadcast closeout finalization archive status summary package fixture integration", () => {
  it("creates and verifies fixture finalization archive status summary package evidence", async () => {
    const evidence = await createFixtureBroadcastCloseoutFinalizationArchiveStatusSummaryPackageEvidence({
      objective: "Create fixture broadcast closeout finalization archive status summary package",
      proposalPath: "artifacts/fixture-broadcast-closeout-finalization-archive-status-summary-package-proposal.json",
      summaryPath: "artifacts/fixture-broadcast-closeout-finalization-archive-status-summary-package-proposal.md",
      manifestPath: "artifacts/fixture-broadcast-closeout-finalization-archive-status-summary-package-review.json",
      approvalPath: "artifacts/fixture-broadcast-closeout-finalization-archive-status-summary-package-approval.json",
      sourcePath: "artifacts/fixture-broadcast-closeout-finalization-archive-status-summary-package-plan.json",
      fixtures: [
        getPolicyDecisionFixture("allowed-swap"),
        getPolicyDecisionFixture("allowed-memory"),
      ],
    });

    expect(evidence.packageManifest).toEqual({
      schemaVersion: 1,
      generatedAt: "2026-06-29T07:40:00.000Z",
      finalizationArchiveStatusSummaryPackagePath: FINALIZATION_ARCHIVE_STATUS_SUMMARY_PACKAGE_PATH,
      finalizationArchiveStatusSummary: {
        path: FINALIZATION_ARCHIVE_STATUS_SUMMARY_PATH,
        sha256: sha256(evidence.params.finalizationArchiveStatusSummaryMarkdown),
      },
      finalizationArchiveStatus: {
        path: FINALIZATION_ARCHIVE_STATUS_PATH,
        sha256: sha256(evidence.params.finalizationArchiveStatusJson),
      },
      finalizationArchive: {
        path: FINALIZATION_ARCHIVE_PATH,
        sha256: sha256(evidence.params.finalizationArchiveJson),
      },
      report: { path: BROADCAST_REPORT_PATH, sha256: sha256(evidence.params.reportMarkdown) },
      archive: { path: BROADCAST_ARCHIVE_PATH, sha256: sha256(evidence.params.archiveJson) },
      status: { path: CLOSEOUT_STATUS_PATH, sha256: sha256(evidence.params.statusJson) },
      summary: { path: CLOSEOUT_SUMMARY_PATH, sha256: sha256(evidence.params.summaryMarkdown) },
      finalizationStatus: { path: FINALIZATION_STATUS_PATH, sha256: sha256(evidence.params.finalizationStatusJson) },
      receipt: { path: BROADCAST_RECEIPT_PATH, sha256: sha256(evidence.params.broadcastReceiptJson) },
      broadcastPackage: { path: BROADCAST_PACKAGE_PATH, sha256: sha256(evidence.params.broadcastPackageJson) },
      submitResult: { path: SUBMIT_RESULT_PATH, sha256: sha256(evidence.params.submitResultJson) },
      verification: {
        passed: true,
        failures: [],
        expected: evidence.params.finalizationArchiveStatusSummaryMarkdown,
      },
    });
    expect(verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackage(evidence.params)).toEqual({
      passed: true,
      failures: [],
    });
  });

  it("rejects stale saved fixture finalization archive status summary package hashes", async () => {
    const evidence = await createFixtureBroadcastCloseoutFinalizationArchiveStatusSummaryPackageEvidence({
      objective: "Reject stale fixture broadcast closeout finalization archive status summary package hash",
      proposalPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-summary-package-hash-proposal.json",
      summaryPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-summary-package-hash-proposal.md",
      manifestPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-summary-package-hash-review.json",
      approvalPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-summary-package-hash-approval.json",
      sourcePath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-summary-package-hash-plan.json",
      fixtures: [
        getPolicyDecisionFixture("allowed-swap"),
        getPolicyDecisionFixture("allowed-memory"),
      ],
    });
    const packageManifest = JSON.parse(evidence.params.finalizationArchiveStatusSummaryPackageJson);
    packageManifest.summary.sha256 = "0".repeat(64);

    expect(
      verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackage({
        ...evidence.params,
        finalizationArchiveStatusSummaryPackageJson: JSON.stringify(packageManifest, null, 2),
      }),
    ).toEqual({
      passed: false,
      failures: ["summary sha256 does not match current summary"],
    });
  });

  it("blocks package verification when fixture status summary evidence is stale", async () => {
    const evidence = await createFixtureBroadcastCloseoutFinalizationArchiveStatusSummaryPackageEvidence({
      objective: "Block stale fixture broadcast closeout finalization archive status summary package summary",
      proposalPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-summary-package-summary-proposal.json",
      summaryPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-summary-package-summary-proposal.md",
      manifestPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-summary-package-summary-review.json",
      approvalPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-summary-package-summary-approval.json",
      sourcePath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-summary-package-summary-plan.json",
      fixtures: [
        getPolicyDecisionFixture("allowed-swap"),
        getPolicyDecisionFixture("allowed-memory"),
      ],
    });

    expect(
      verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackage({
        ...evidence.params,
        finalizationArchiveStatusSummaryMarkdown: evidence.params.finalizationArchiveStatusSummaryMarkdown.replace(
          "| Overall Status | passed |",
          "| Overall Status | failed |",
        ),
      }),
    ).toEqual({
      passed: false,
      failures: [
        "finalizationArchiveStatusSummary sha256 does not match current finalizationArchiveStatusSummary",
        "finalization archive status summary verification does not match current finalization archive status summary package evidence",
      ],
    });
  });
});

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
