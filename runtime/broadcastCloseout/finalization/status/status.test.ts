import { describe, expect, it } from "vitest";

import { createAgentProposalExecutionBroadcastCloseoutFinalization } from "../finalization/finalization.js";
import {
  createAgentProposalExecutionBroadcastCloseoutFinalizationStatus,
  formatAgentProposalExecutionBroadcastCloseoutFinalizationStatus,
} from "./status.js";
import { createAgentProposalExecutionBroadcastReceipt } from "../../../broadcast/receipt.js";

import type { AgentProposalExecutionBroadcastSubmitResult } from "../../../broadcast/submit.js";

const GENERATED_AT = "2026-06-25T10:00:00.000Z";
const BROADCAST_ARCHIVE_PATH = "artifacts/example-agent-proposal-execution-broadcast-archive.json";
const BROADCAST_PACKAGE_PATH = "artifacts/example-agent-proposal-execution-broadcast-package.json";
const BROADCAST_RECEIPT_PATH = "artifacts/example-agent-proposal-execution-broadcast-receipt.json";
const BROADCAST_REPORT_PATH = "artifacts/example-agent-proposal-execution-broadcast-report.md";
const CLOSEOUT_STATUS_PATH = "artifacts/example-agent-proposal-execution-broadcast-closeout-status.json";
const CLOSEOUT_SUMMARY_PATH = "artifacts/example-agent-proposal-execution-broadcast-closeout-summary.md";
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

describe("createAgentProposalExecutionBroadcastCloseoutFinalizationStatus", () => {
  it("creates a compact status for a verified finalization output set", () => {
    const status = createAgentProposalExecutionBroadcastCloseoutFinalizationStatus(createFinalizationEvidence());

    expect(status).toEqual({
      passed: true,
      summary: CLOSEOUT_SUMMARY_PATH,
      report: BROADCAST_REPORT_PATH,
      archive: BROADCAST_ARCHIVE_PATH,
      status: CLOSEOUT_STATUS_PATH,
      broadcastReceipt: BROADCAST_RECEIPT_PATH,
      broadcastPackage: BROADCAST_PACKAGE_PATH,
      submitResult: SUBMIT_RESULT_PATH,
      signer: SIGNER,
      chainId: 84532,
      transactions: 1,
      checks: [
        {
          name: "broadcast-closeout-finalization",
          passed: true,
          failures: [],
        },
      ],
    });
    expect(formatAgentProposalExecutionBroadcastCloseoutFinalizationStatus(status)).toBe(`${JSON.stringify(status, null, 2)}\n`);
  });

  it("keeps finalization verification failures in the status checks", () => {
    const evidence = createFinalizationEvidence();

    expect(
      createAgentProposalExecutionBroadcastCloseoutFinalizationStatus({
        ...evidence,
        summaryMarkdown: evidence.summaryMarkdown.replace("Overall Status | passed", "Overall Status | failed"),
      }),
    ).toEqual({
      passed: false,
      summary: CLOSEOUT_SUMMARY_PATH,
      report: BROADCAST_REPORT_PATH,
      archive: BROADCAST_ARCHIVE_PATH,
      status: CLOSEOUT_STATUS_PATH,
      broadcastReceipt: BROADCAST_RECEIPT_PATH,
      broadcastPackage: BROADCAST_PACKAGE_PATH,
      submitResult: SUBMIT_RESULT_PATH,
      signer: SIGNER,
      chainId: 84532,
      transactions: 1,
      checks: [
        {
          name: "broadcast-closeout-finalization",
          passed: false,
          failures: ["closeout evidence set summary Markdown does not match current evidence"],
        },
      ],
    });
  });
});

function createFinalizationEvidence() {
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
    generatedAt: GENERATED_AT,
  };
  const finalization = createAgentProposalExecutionBroadcastCloseoutFinalization(params);
  if (!finalization.passed || finalization.status === null) throw new Error("test fixture finalization failed");

  return {
    summaryPath: CLOSEOUT_SUMMARY_PATH,
    summaryMarkdown: finalization.summary.markdown,
    reportPath: BROADCAST_REPORT_PATH,
    reportMarkdown: finalization.report.markdown,
    archivePath: BROADCAST_ARCHIVE_PATH,
    archiveJson: finalization.archive.json,
    statusPath: CLOSEOUT_STATUS_PATH,
    statusJson: finalization.status.json,
    broadcastReceiptPath: BROADCAST_RECEIPT_PATH,
    broadcastReceiptJson: params.broadcastReceiptJson,
    broadcastPackagePath: BROADCAST_PACKAGE_PATH,
    broadcastPackageJson,
    submitResultPath: SUBMIT_RESULT_PATH,
    submitResultJson,
  };
}
