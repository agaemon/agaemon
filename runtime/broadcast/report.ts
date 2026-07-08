import { verifyAgentProposalExecutionBroadcastReceipt } from "./receiptVerify.js";

import type { VerifyAgentProposalExecutionBroadcastReceiptParams } from "./receiptVerify.js";
import type { AgentProposalExecutionBroadcastReceipt } from "./receipt.js";

export interface CreateAgentProposalExecutionBroadcastReportParams
  extends VerifyAgentProposalExecutionBroadcastReceiptParams {}

export interface AgentProposalExecutionBroadcastReport {
  passed: boolean;
  failures: string[];
  markdown: string;
  transactions: number;
}

export function createAgentProposalExecutionBroadcastReport(
  params: CreateAgentProposalExecutionBroadcastReportParams,
): AgentProposalExecutionBroadcastReport {
  const verification = verifyAgentProposalExecutionBroadcastReceipt(params);
  if (!verification.passed) {
    return {
      passed: false,
      failures: verification.failures,
      markdown: "",
      transactions: 0,
    };
  }

  const receipt = JSON.parse(params.broadcastReceiptJson) as AgentProposalExecutionBroadcastReceipt;
  return {
    passed: true,
    failures: [],
    markdown: renderReport(params, receipt),
    transactions: receipt.transactions.length,
  };
}

function renderReport(
  params: CreateAgentProposalExecutionBroadcastReportParams,
  receipt: AgentProposalExecutionBroadcastReceipt,
): string {
  const rows = [
    "# Agent Proposal Execution Broadcast Report",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Receipt | ${escapeCell(params.broadcastReceiptPath)} |`,
    `| Broadcast Package | ${escapeCell(receipt.broadcastPackage.path)} |`,
    `| Broadcast Package SHA-256 | ${receipt.broadcastPackage.sha256} |`,
    `| Signer | ${escapeCell(receipt.signer)} |`,
    `| Chain ID | ${receipt.chainId} |`,
    `| Transactions | ${receipt.transactions.length} |`,
    "",
    "| Index | Hash | Block Number | Status |",
    "| --- | --- | --- | --- |",
    ...receipt.transactions.map((transaction) =>
      `| ${transaction.index} | ${transaction.hash} | ${escapeCell(transaction.blockNumber)} | ${transaction.status} |`
    ),
    "",
  ];
  return rows.join("\n");
}

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|").replace(/\r?\n/g, " ");
}
