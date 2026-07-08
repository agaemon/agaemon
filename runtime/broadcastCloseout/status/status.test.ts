import { describe, expect, it } from "vitest";

import { createAgentProposalExecutionBroadcastCloseout } from "../closeout/closeout.js";
import {
  createAgentProposalExecutionBroadcastCloseoutStatus,
  formatAgentProposalExecutionBroadcastCloseoutStatus,
} from "./status.js";
import { createAgentProposalExecutionBroadcastReceipt } from "../../broadcast/receipt.js";

import type { AgentProposalExecutionBroadcastSubmitResult } from "../../broadcast/submit.js";

const GENERATED_AT = "2026-06-25T10:00:00.000Z";
const BROADCAST_ARCHIVE_PATH = "artifacts/example-agent-proposal-execution-broadcast-archive.json";
const BROADCAST_PACKAGE_PATH = "artifacts/example-agent-proposal-execution-broadcast-package.json";
const BROADCAST_RECEIPT_PATH = "artifacts/example-agent-proposal-execution-broadcast-receipt.json";
const BROADCAST_REPORT_PATH = "artifacts/example-agent-proposal-execution-broadcast-report.md";
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

describe("createAgentProposalExecutionBroadcastCloseoutStatus", () => {
  it("returns compact status metadata and named checks for valid closeout evidence", () => {
    const evidence = createCloseoutEvidence();

    expect(createAgentProposalExecutionBroadcastCloseoutStatus(evidence)).toEqual({
      passed: true,
      report: BROADCAST_REPORT_PATH,
      archive: BROADCAST_ARCHIVE_PATH,
      broadcastReceipt: BROADCAST_RECEIPT_PATH,
      broadcastPackage: BROADCAST_PACKAGE_PATH,
      submitResult: SUBMIT_RESULT_PATH,
      signer: SIGNER,
      chainId: 84532,
      transactions: 1,
      checks: [
        { name: "broadcast-report", passed: true, failures: [] },
        { name: "broadcast-archive", passed: true, failures: [] },
        { name: "broadcast-closeout", passed: true, failures: [] },
      ],
    });
  });

  it("returns a failing closeout check for edited report evidence", () => {
    const evidence = createCloseoutEvidence();

    expect(
      createAgentProposalExecutionBroadcastCloseoutStatus({
        ...evidence,
        reportMarkdown: evidence.reportMarkdown.replace("success", "pending"),
      }),
    ).toEqual({
      passed: false,
      report: BROADCAST_REPORT_PATH,
      archive: BROADCAST_ARCHIVE_PATH,
      broadcastReceipt: BROADCAST_RECEIPT_PATH,
      broadcastPackage: BROADCAST_PACKAGE_PATH,
      submitResult: SUBMIT_RESULT_PATH,
      signer: SIGNER,
      chainId: 84532,
      transactions: 1,
      checks: [
        { name: "broadcast-report", passed: true, failures: [] },
        { name: "broadcast-archive", passed: true, failures: [] },
        {
          name: "broadcast-closeout",
          passed: false,
          failures: ["closeout report Markdown does not match current broadcast closeout"],
        },
      ],
    });
  });

  it("formats status artifacts as deterministic pretty JSON", () => {
    const status = createAgentProposalExecutionBroadcastCloseoutStatus(createCloseoutEvidence());

    expect(formatAgentProposalExecutionBroadcastCloseoutStatus(status)).toBe(`${JSON.stringify(status, null, 2)}\n`);
  });
});

function createCloseoutEvidence() {
  const broadcastPackageJson = JSON.stringify(BROADCAST_PACKAGE, null, 2);
  const submitResultJson = JSON.stringify(SUBMIT_RESULT, null, 2);
  const receipt = createAgentProposalExecutionBroadcastReceipt({
    broadcastPackagePath: BROADCAST_PACKAGE_PATH,
    broadcastPackageJson,
    submitResult: SUBMIT_RESULT,
    generatedAt: GENERATED_AT,
  });
  if (!receipt.passed || receipt.receipt === null) throw new Error("test fixture receipt failed");
  const broadcastReceiptJson = JSON.stringify(receipt.receipt, null, 2);
  const closeout = createAgentProposalExecutionBroadcastCloseout({
    broadcastReceiptPath: BROADCAST_RECEIPT_PATH,
    broadcastReceiptJson,
    broadcastPackagePath: BROADCAST_PACKAGE_PATH,
    broadcastPackageJson,
    submitResultPath: SUBMIT_RESULT_PATH,
    submitResultJson,
    reportPath: BROADCAST_REPORT_PATH,
    archivePath: BROADCAST_ARCHIVE_PATH,
    generatedAt: GENERATED_AT,
  });
  if (!closeout.passed) throw new Error("test fixture closeout failed");

  return {
    reportPath: BROADCAST_REPORT_PATH,
    reportMarkdown: closeout.report.markdown,
    archivePath: BROADCAST_ARCHIVE_PATH,
    archiveJson: closeout.archive.json,
    broadcastReceiptPath: BROADCAST_RECEIPT_PATH,
    broadcastReceiptJson,
    broadcastPackagePath: BROADCAST_PACKAGE_PATH,
    broadcastPackageJson,
    submitResultPath: SUBMIT_RESULT_PATH,
    submitResultJson,
  };
}
