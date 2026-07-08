import { describe, expect, it } from "vitest";

import { createAgentProposalExecutionBroadcastReceipt } from "./receipt.js";
import { verifyAgentProposalExecutionBroadcastReceipt } from "./receiptVerify.js";

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

describe("verifyAgentProposalExecutionBroadcastReceipt", () => {
  it("passes for current saved receipt evidence", () => {
    const evidence = createReceiptEvidence();

    expect(verifyAgentProposalExecutionBroadcastReceipt(evidence)).toEqual({
      passed: true,
      failures: [],
    });
  });

  it("rejects mutated receipt hash evidence", () => {
    const evidence = createReceiptEvidence();
    const staleReceipt = JSON.parse(evidence.broadcastReceiptJson);
    staleReceipt.transactions[0].hash = `0x${"56".repeat(32)}`;

    expect(
      verifyAgentProposalExecutionBroadcastReceipt({
        ...evidence,
        broadcastReceiptJson: JSON.stringify(staleReceipt, null, 2),
      }),
    ).toEqual({
      passed: false,
      failures: ["broadcast receipt JSON does not match current broadcast receipt"],
    });
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
  const broadcastReceiptJson = JSON.stringify(result.receipt, null, 2);

  return {
    broadcastReceiptPath: BROADCAST_RECEIPT_PATH,
    broadcastReceiptJson,
    broadcastPackagePath: BROADCAST_PACKAGE_PATH,
    broadcastPackageJson,
    submitResultPath: SUBMIT_RESULT_PATH,
    submitResultJson,
  };
}
