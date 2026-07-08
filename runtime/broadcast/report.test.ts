import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createAgentProposalExecutionBroadcastReceipt } from "./receipt.js";
import { createAgentProposalExecutionBroadcastReport } from "./report.js";

import type { AgentProposalExecutionBroadcastSubmitResult } from "./submit.js";

const GENERATED_AT = "2026-06-25T10:00:00.000Z";
const BROADCAST_PACKAGE_PATH = "artifacts/example-agent-proposal-execution-broadcast-package.json";
const BROADCAST_RECEIPT_PATH = "artifacts/example-agent-proposal-execution-broadcast-receipt.json";
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

describe("createAgentProposalExecutionBroadcastReport", () => {
  it("renders a Markdown report from current receipt evidence", () => {
    const evidence = createReceiptEvidence();

    expect(createAgentProposalExecutionBroadcastReport(evidence)).toEqual({
      passed: true,
      failures: [],
      transactions: 1,
      markdown: [
        "# Agent Proposal Execution Broadcast Report",
        "",
        "| Field | Value |",
        "| --- | --- |",
        `| Receipt | ${BROADCAST_RECEIPT_PATH} |`,
        `| Broadcast Package | ${BROADCAST_PACKAGE_PATH} |`,
        `| Broadcast Package SHA-256 | ${sha256(evidence.broadcastPackageJson)} |`,
        `| Signer | ${SIGNER} |`,
        "| Chain ID | 84532 |",
        "| Transactions | 1 |",
        "",
        "| Index | Hash | Block Number | Status |",
        "| --- | --- | --- | --- |",
        `| 0 | ${TX_HASH} | 999 | success |`,
        "",
      ].join("\n"),
    });
  });

  it("rejects stale receipt evidence", () => {
    const evidence = createReceiptEvidence();
    const staleReceipt = JSON.parse(evidence.broadcastReceiptJson);
    staleReceipt.transactions[0].status = "reverted";

    const result = createAgentProposalExecutionBroadcastReport({
      ...evidence,
      broadcastReceiptJson: JSON.stringify(staleReceipt, null, 2),
    });

    expect(result.passed).toBe(false);
    expect(result.failures).toEqual(["broadcast receipt JSON does not match current broadcast receipt"]);
    expect(result.markdown).toBe("");
  });
});

function createReceiptEvidence() {
  const broadcastPackageJson = JSON.stringify(BROADCAST_PACKAGE, null, 2);
  const submitResultJson = JSON.stringify(SUBMIT_RESULT, null, 2);
  const result = createAgentProposalExecutionBroadcastReceipt({
    broadcastPackagePath: BROADCAST_PACKAGE_PATH,
    broadcastPackageJson,
    submitResult: SUBMIT_RESULT,
    generatedAt: GENERATED_AT,
  });
  if (!result.passed || result.receipt === null) throw new Error("test fixture receipt failed");

  return {
    broadcastReceiptPath: BROADCAST_RECEIPT_PATH,
    broadcastReceiptJson: JSON.stringify(result.receipt, null, 2),
    broadcastPackagePath: BROADCAST_PACKAGE_PATH,
    broadcastPackageJson,
    submitResultPath: SUBMIT_RESULT_PATH,
    submitResultJson,
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
