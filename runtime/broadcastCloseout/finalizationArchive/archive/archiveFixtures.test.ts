import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchive } from "./archiveVerify.js";
import { getPolicyDecisionFixture } from "../../../fixtures/policyDecisions.js";
import {
  BROADCAST_ARCHIVE_PATH,
  BROADCAST_PACKAGE_PATH,
  BROADCAST_RECEIPT_PATH,
  BROADCAST_REPORT_PATH,
  CLOSEOUT_STATUS_PATH,
  CLOSEOUT_SUMMARY_PATH,
  FINALIZATION_ARCHIVE_PATH,
  FINALIZATION_STATUS_PATH,
  SUBMIT_RESULT_PATH,
  createFixtureBroadcastCloseoutFinalizationArchiveEvidence,
} from "../../fixtures/closeoutEvidence.js";

describe("broadcast closeout finalization archive fixture integration", () => {
  it("creates and verifies fixture finalization archive evidence from saved finalization status artifacts", async () => {
    const evidence = await createFixtureBroadcastCloseoutFinalizationArchiveEvidence({
      objective: "Create fixture broadcast closeout finalization archive",
      proposalPath: "artifacts/fixture-broadcast-closeout-finalization-archive-proposal.json",
      summaryPath: "artifacts/fixture-broadcast-closeout-finalization-archive-proposal.md",
      manifestPath: "artifacts/fixture-broadcast-closeout-finalization-archive-review.json",
      approvalPath: "artifacts/fixture-broadcast-closeout-finalization-archive-approval.json",
      sourcePath: "artifacts/fixture-broadcast-closeout-finalization-archive-plan.json",
      fixtures: [
        getPolicyDecisionFixture("allowed-swap"),
        getPolicyDecisionFixture("allowed-memory"),
      ],
    });

    expect(evidence.archive).toEqual({
      schemaVersion: 1,
      generatedAt: "2026-06-29T07:40:00.000Z",
      finalizationArchivePath: FINALIZATION_ARCHIVE_PATH,
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
      },
    });
    expect(verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchive(evidence.params)).toEqual({
      passed: true,
      failures: [],
    });
  });

  it("rejects stale saved fixture finalization archive hashes", async () => {
    const evidence = await createFixtureBroadcastCloseoutFinalizationArchiveEvidence({
      objective: "Reject stale fixture broadcast closeout finalization archive hash",
      proposalPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-hash-proposal.json",
      summaryPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-hash-proposal.md",
      manifestPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-hash-review.json",
      approvalPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-hash-approval.json",
      sourcePath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-hash-plan.json",
      fixtures: [
        getPolicyDecisionFixture("allowed-swap"),
        getPolicyDecisionFixture("allowed-memory"),
      ],
    });
    const archive = JSON.parse(evidence.params.finalizationArchiveJson);
    archive.summary.sha256 = "0".repeat(64);

    expect(
      verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchive({
        ...evidence.params,
        finalizationArchiveJson: JSON.stringify(archive, null, 2),
      }),
    ).toEqual({
      passed: false,
      failures: ["summary sha256 does not match current summary"],
    });
  });

  it("blocks archive verification when fixture finalization status evidence is stale", async () => {
    const evidence = await createFixtureBroadcastCloseoutFinalizationArchiveEvidence({
      objective: "Block stale fixture broadcast closeout finalization archive status",
      proposalPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-proposal.json",
      summaryPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-proposal.md",
      manifestPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-review.json",
      approvalPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-approval.json",
      sourcePath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-plan.json",
      fixtures: [
        getPolicyDecisionFixture("allowed-swap"),
        getPolicyDecisionFixture("allowed-memory"),
      ],
    });
    const status = JSON.parse(evidence.params.finalizationStatusJson);
    status.transactions = 1;
    const finalizationStatusJson = `${JSON.stringify(status, null, 2)}\n`;

    expect(
      verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchive({
        ...evidence.params,
        finalizationStatusJson,
      }),
    ).toEqual({
      passed: false,
      failures: [
        "finalizationStatus sha256 does not match current finalizationStatus",
        "finalization status verification does not match current finalization archive evidence",
      ],
    });
  });
});

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
