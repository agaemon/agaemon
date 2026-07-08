import { describe, expect, it } from "vitest";

import { createAgentProposalExecutionBroadcastCloseout } from "./closeout.js";
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

describe("createAgentProposalExecutionBroadcastCloseout", () => {
  it("builds and verifies final post-broadcast report and archive artifacts", () => {
    const evidence = createReceiptEvidence();

    const closeout = createAgentProposalExecutionBroadcastCloseout({
      ...evidence,
      reportPath: BROADCAST_REPORT_PATH,
      archivePath: BROADCAST_ARCHIVE_PATH,
      generatedAt: GENERATED_AT,
    });

    expect(closeout.passed).toBe(true);
    expect(closeout.failures).toEqual([]);
    expect(closeout.report.path).toBe(BROADCAST_REPORT_PATH);
    expect(closeout.report.markdown).toContain("# Agent Proposal Execution Broadcast Report");
    expect(closeout.archive.path).toBe(BROADCAST_ARCHIVE_PATH);
    expect(JSON.parse(closeout.archive.json).verification.passed).toBe(true);
    expect(closeout.archiveVerification).toEqual({ passed: true, failures: [] });
  });

  it("does not build closeout artifacts when receipt evidence is stale", () => {
    const evidence = createReceiptEvidence();
    const staleReceipt = JSON.parse(evidence.broadcastReceiptJson);
    staleReceipt.transactions[0].status = "reverted";

    expect(
      createAgentProposalExecutionBroadcastCloseout({
        ...evidence,
        broadcastReceiptJson: JSON.stringify(staleReceipt, null, 2),
        reportPath: BROADCAST_REPORT_PATH,
        archivePath: BROADCAST_ARCHIVE_PATH,
        generatedAt: GENERATED_AT,
      }),
    ).toEqual({
      passed: false,
      failures: ["broadcast receipt JSON does not match current broadcast receipt"],
      report: { path: BROADCAST_REPORT_PATH, markdown: "" },
      archive: { path: BROADCAST_ARCHIVE_PATH, json: "" },
      reportResult: expect.objectContaining({
        passed: false,
        failures: ["broadcast receipt JSON does not match current broadcast receipt"],
      }),
      archiveVerification: null,
    });
  });
});

function createReceiptEvidence() {
  const broadcastPackageJson = JSON.stringify(BROADCAST_PACKAGE, null, 2);
  const submitResultJson = JSON.stringify(SUBMIT_RESULT, null, 2);
  const receipt = createAgentProposalExecutionBroadcastReceipt({
    broadcastPackagePath: BROADCAST_PACKAGE_PATH,
    broadcastPackageJson,
    submitResult: SUBMIT_RESULT,
    generatedAt: GENERATED_AT,
  });
  if (!receipt.passed || receipt.receipt === null) throw new Error("test fixture receipt failed");

  return {
    broadcastReceiptPath: BROADCAST_RECEIPT_PATH,
    broadcastReceiptJson: JSON.stringify(receipt.receipt, null, 2),
    broadcastPackagePath: BROADCAST_PACKAGE_PATH,
    broadcastPackageJson,
    submitResultPath: SUBMIT_RESULT_PATH,
    submitResultJson,
  };
}
