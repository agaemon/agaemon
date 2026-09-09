import { describe, expect, it } from "vitest";

import { verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatus } from "./statusVerify.js";
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
  FINALIZATION_ARCHIVE_STATUS_SUMMARY_PACKAGE_STATUS_PATH,
  FINALIZATION_ARCHIVE_STATUS_SUMMARY_PATH,
  FINALIZATION_STATUS_PATH,
  SIGNER_ACCOUNT,
  SUBMIT_RESULT_PATH,
  createFixtureBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusEvidence,
} from "../../fixtures/closeoutEvidence.js";

describe("broadcast closeout finalization archive status summary package status fixture integration", () => {
  it.each(["allowed-swap", "allowed-memory"] as const)("creates and verifies fixture finalization archive status summary package status evidence (%s)", async (fixtureId) => {
    const evidence = await createFixtureBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusEvidence({
      objective: "Create fixture broadcast closeout finalization archive status summary package status",
      proposalPath: "artifacts/fixture-broadcast-closeout-finalization-archive-status-summary-package-status-proposal.json",
      summaryPath: "artifacts/fixture-broadcast-closeout-finalization-archive-status-summary-package-status-proposal.md",
      manifestPath: "artifacts/fixture-broadcast-closeout-finalization-archive-status-summary-package-status-review.json",
      approvalPath: "artifacts/fixture-broadcast-closeout-finalization-archive-status-summary-package-status-approval.json",
      sourcePath: "artifacts/fixture-broadcast-closeout-finalization-archive-status-summary-package-status-plan.json",
      fixtures: [
        getPolicyDecisionFixture(fixtureId),
      ],
    });

    expect(evidence.status).toEqual({
      passed: true,
      finalizationArchiveStatusSummaryPackage: FINALIZATION_ARCHIVE_STATUS_SUMMARY_PACKAGE_PATH,
      finalizationArchiveStatusSummary: FINALIZATION_ARCHIVE_STATUS_SUMMARY_PATH,
      finalizationArchiveStatus: FINALIZATION_ARCHIVE_STATUS_PATH,
      finalizationArchive: FINALIZATION_ARCHIVE_PATH,
      report: BROADCAST_REPORT_PATH,
      archive: BROADCAST_ARCHIVE_PATH,
      status: CLOSEOUT_STATUS_PATH,
      summary: CLOSEOUT_SUMMARY_PATH,
      finalizationStatus: FINALIZATION_STATUS_PATH,
      broadcastReceipt: BROADCAST_RECEIPT_PATH,
      broadcastPackage: BROADCAST_PACKAGE_PATH,
      submitResult: SUBMIT_RESULT_PATH,
      signer: SIGNER_ACCOUNT.address,
      chainId: 84532,
      transactions: 1,
      checks: [
        {
          name: "broadcast-closeout-finalization-archive-status-summary-package",
          passed: true,
          failures: [],
        },
      ],
    });
    expect(evidence.params.finalizationArchiveStatusSummaryPackageStatusPath).toBe(
      FINALIZATION_ARCHIVE_STATUS_SUMMARY_PACKAGE_STATUS_PATH,
    );
    expect(verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatus(evidence.params)).toEqual({
      passed: true,
      failures: [],
    });
  });

  it.each(["allowed-swap", "allowed-memory"] as const)("rejects stale saved fixture finalization archive status summary package status JSON (%s)", async (fixtureId) => {
    const evidence = await createFixtureBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusEvidence({
      objective: "Reject stale fixture broadcast closeout finalization archive status summary package status JSON",
      proposalPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-summary-package-status-json-proposal.json",
      summaryPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-summary-package-status-json-proposal.md",
      manifestPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-summary-package-status-json-review.json",
      approvalPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-summary-package-status-json-approval.json",
      sourcePath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-summary-package-status-json-plan.json",
      fixtures: [
        getPolicyDecisionFixture(fixtureId),
      ],
    });
    const status = JSON.parse(evidence.params.finalizationArchiveStatusSummaryPackageStatusJson);
    status.transactions = 0;

    expect(
      verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatus({
        ...evidence.params,
        finalizationArchiveStatusSummaryPackageStatusJson: `${JSON.stringify(status, null, 2)}\n`,
      }),
    ).toEqual({
      passed: false,
      failures: [
        "closeout finalization archive status summary package status JSON does not match current finalization archive status summary package evidence",
      ],
    });
  });

  it.each(["allowed-swap", "allowed-memory"] as const)("blocks status verification when fixture status summary package evidence is stale (%s)", async (fixtureId) => {
    const evidence = await createFixtureBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusEvidence({
      objective: "Block stale fixture broadcast closeout finalization archive status summary package status package",
      proposalPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-summary-package-status-package-proposal.json",
      summaryPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-summary-package-status-package-proposal.md",
      manifestPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-summary-package-status-package-review.json",
      approvalPath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-summary-package-status-package-approval.json",
      sourcePath: "artifacts/fixture-stale-broadcast-closeout-finalization-archive-status-summary-package-status-package-plan.json",
      fixtures: [
        getPolicyDecisionFixture(fixtureId),
      ],
    });
    const packageManifest = JSON.parse(evidence.params.finalizationArchiveStatusSummaryPackageJson);
    packageManifest.summary.sha256 = "0".repeat(64);

    expect(
      verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatus({
        ...evidence.params,
        finalizationArchiveStatusSummaryPackageJson: JSON.stringify(packageManifest, null, 2),
      }),
    ).toEqual({
      passed: false,
      failures: [
        "summary sha256 does not match current summary",
        "closeout finalization archive status summary package status JSON does not match current finalization archive status summary package evidence",
      ],
    });
  });
});
