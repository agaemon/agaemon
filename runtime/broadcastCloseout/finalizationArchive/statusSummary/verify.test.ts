import { describe, expect, it } from "vitest";

import { createAgentProposalExecutionBroadcastCloseoutFinalization } from "../../finalization/finalization/finalization.js";
import { createAgentProposalExecutionBroadcastCloseoutFinalizationArchive } from "../archive/archive.js";
import {
  createAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatus,
  formatAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatus,
} from "../status/status.js";
import { createAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummary } from "./summary.js";
import { verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummary } from "./verify.js";
import { createAgentProposalExecutionBroadcastReceipt } from "../../../broadcast/receipt.js";

import type { AgentProposalExecutionBroadcastSubmitResult } from "../../../broadcast/submit.js";

const GENERATED_AT = "2026-06-25T10:00:00.000Z";
const BROADCAST_ARCHIVE_PATH = "artifacts/example-agent-proposal-execution-broadcast-archive.json";
const BROADCAST_PACKAGE_PATH = "artifacts/example-agent-proposal-execution-broadcast-package.json";
const BROADCAST_RECEIPT_PATH = "artifacts/example-agent-proposal-execution-broadcast-receipt.json";
const BROADCAST_REPORT_PATH = "artifacts/example-agent-proposal-execution-broadcast-report.md";
const CLOSEOUT_STATUS_PATH = "artifacts/example-agent-proposal-execution-broadcast-closeout-status.json";
const CLOSEOUT_SUMMARY_PATH = "artifacts/example-agent-proposal-execution-broadcast-closeout-summary.md";
const FINALIZATION_ARCHIVE_PATH = "artifacts/example-agent-proposal-execution-broadcast-closeout-finalization-archive.json";
const FINALIZATION_ARCHIVE_STATUS_PATH =
  "artifacts/example-agent-proposal-execution-broadcast-closeout-finalization-archive-status.json";
const FINALIZATION_ARCHIVE_STATUS_SUMMARY_PATH =
  "artifacts/example-agent-proposal-execution-broadcast-closeout-finalization-archive-status-summary.md";
const FINALIZATION_STATUS_PATH = "artifacts/example-agent-proposal-execution-broadcast-closeout-finalization-status.json";
const SUBMIT_RESULT_PATH = "artifacts/example-agent-proposal-execution-broadcast-submit.json";
const SIGNER = "0x0000000000000000000000000000000000000d01";
const TX_HASH = `0x${"34".repeat(32)}` as const;

const BROADCAST_PACKAGE = {
  schemaVersion: 1,
  generatedAt: GENERATED_AT,
  signer: SIGNER,
  chainId: 84532,
  nonceStart: 7,
  pendingNonce: 7,
  transactions: [
    {
      index: 0,
      rawTransaction: "0x1234",
    },
  ],
};

const SUBMIT_RESULT: AgentProposalExecutionBroadcastSubmitResult = {
  mode: "send",
  passed: true,
  failures: [],
  broadcastPackage: BROADCAST_PACKAGE_PATH,
  signer: SIGNER,
  chainId: 84532,
  transactions: 1,
  submitted: [
    {
      index: 0,
      hash: TX_HASH,
      blockNumber: "999",
      status: "success",
    },
  ],
};

describe("verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummary", () => {
  it("passes when saved summary Markdown matches current finalization archive status evidence", () => {
    const evidence = createFinalizationArchiveStatusSummaryEvidence();

    expect(verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummary(evidence)).toEqual({
      passed: true,
      failures: [],
      expected: evidence.finalizationArchiveStatusSummaryMarkdown,
    });
  });

  it("rejects edited finalization archive status summary Markdown", () => {
    const evidence = createFinalizationArchiveStatusSummaryEvidence();

    expect(
      verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummary({
        ...evidence,
        finalizationArchiveStatusSummaryMarkdown: evidence.finalizationArchiveStatusSummaryMarkdown.replace("passed", "failed"),
      }),
    ).toEqual({
      passed: false,
      failures: [
        "closeout finalization archive status summary Markdown does not match current finalization archive status evidence",
      ],
      expected: evidence.finalizationArchiveStatusSummaryMarkdown,
    });
  });
});

function createFinalizationArchiveStatusSummaryEvidence() {
  const archiveEvidence = createFinalizationArchiveEvidence();
  const finalizationArchiveJson = formatJson(createAgentProposalExecutionBroadcastCloseoutFinalizationArchive(archiveEvidence));
  const status = createAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatus({
    ...archiveEvidence,
    finalizationArchiveJson,
  });
  const summaryParams = {
    ...archiveEvidence,
    finalizationArchiveStatusPath: FINALIZATION_ARCHIVE_STATUS_PATH,
    finalizationArchiveJson,
    finalizationArchiveStatusJson: formatAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatus(status),
  };
  const summary = createAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummary(summaryParams);
  if (!summary.passed) throw new Error("test fixture finalization archive status summary failed");

  return {
    ...summaryParams,
    finalizationArchiveStatusSummaryPath: FINALIZATION_ARCHIVE_STATUS_SUMMARY_PATH,
    finalizationArchiveStatusSummaryMarkdown: summary.markdown,
  };
}

function createFinalizationArchiveEvidence() {
  const broadcastPackageJson = JSON.stringify(BROADCAST_PACKAGE, null, 2);
  const submitResultJson = JSON.stringify(SUBMIT_RESULT, null, 2);
  const receipt = createAgentProposalExecutionBroadcastReceipt({
    broadcastPackagePath: BROADCAST_PACKAGE_PATH,
    broadcastPackageJson,
    submitResult: SUBMIT_RESULT,
    generatedAt: GENERATED_AT,
  });
  if (!receipt.passed || receipt.receipt === null) throw new Error("test fixture receipt failed");

  const params = {
    broadcastReceiptPath: BROADCAST_RECEIPT_PATH,
    broadcastReceiptJson: JSON.stringify(receipt.receipt, null, 2),
    broadcastPackagePath: BROADCAST_PACKAGE_PATH,
    broadcastPackageJson,
    submitResultPath: SUBMIT_RESULT_PATH,
    submitResultJson,
    reportPath: BROADCAST_REPORT_PATH,
    archivePath: BROADCAST_ARCHIVE_PATH,
    statusPath: CLOSEOUT_STATUS_PATH,
    summaryPath: CLOSEOUT_SUMMARY_PATH,
    finalizationStatusPath: FINALIZATION_STATUS_PATH,
    generatedAt: GENERATED_AT,
  };
  const finalization = createAgentProposalExecutionBroadcastCloseoutFinalization(params);
  if (!finalization.passed || finalization.status === null || finalization.finalizationStatus === null) {
    throw new Error("test fixture finalization failed");
  }

  return {
    finalizationArchivePath: FINALIZATION_ARCHIVE_PATH,
    reportPath: BROADCAST_REPORT_PATH,
    reportMarkdown: finalization.report.markdown,
    archivePath: BROADCAST_ARCHIVE_PATH,
    archiveJson: finalization.archive.json,
    statusPath: CLOSEOUT_STATUS_PATH,
    statusJson: finalization.status.json,
    summaryPath: CLOSEOUT_SUMMARY_PATH,
    summaryMarkdown: finalization.summary.markdown,
    finalizationStatusPath: FINALIZATION_STATUS_PATH,
    finalizationStatusJson: finalization.finalizationStatus.json,
    broadcastReceiptPath: BROADCAST_RECEIPT_PATH,
    broadcastReceiptJson: params.broadcastReceiptJson,
    broadcastPackagePath: BROADCAST_PACKAGE_PATH,
    broadcastPackageJson,
    submitResultPath: SUBMIT_RESULT_PATH,
    submitResultJson,
    generatedAt: GENERATED_AT,
  };
}

function formatJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
