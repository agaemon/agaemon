import { verifyAgentProposalExecutionBroadcastCloseout } from "../closeout/closeoutVerify.js";

import type { AgentProposalExecutionBroadcastReceipt } from "../../broadcast/receipt.js";
import type { VerifyAgentProposalExecutionBroadcastCloseoutParams } from "../closeout/closeoutVerify.js";

export interface AgentProposalExecutionBroadcastCloseoutStatusCheck {
  name: "broadcast-report" | "broadcast-archive" | "broadcast-closeout";
  passed: boolean;
  failures: string[];
}

export interface AgentProposalExecutionBroadcastCloseoutStatus {
  passed: boolean;
  report: string;
  archive: string;
  broadcastReceipt: string;
  broadcastPackage: string;
  submitResult: string;
  signer: string | null;
  chainId: number | null;
  transactions: number;
  checks: AgentProposalExecutionBroadcastCloseoutStatusCheck[];
}

export function createAgentProposalExecutionBroadcastCloseoutStatus(
  params: VerifyAgentProposalExecutionBroadcastCloseoutParams,
): AgentProposalExecutionBroadcastCloseoutStatus {
  const verification = verifyAgentProposalExecutionBroadcastCloseout(params);
  const receipt = parseReceipt(params.broadcastReceiptJson);
  const reportResult = verification.closeout.reportResult;
  const archiveVerification = verification.closeout.archiveVerification;
  const checks: AgentProposalExecutionBroadcastCloseoutStatusCheck[] = [
    {
      name: "broadcast-report",
      passed: reportResult.passed,
      failures: reportResult.failures,
    },
    {
      name: "broadcast-archive",
      passed: archiveVerification?.passed ?? false,
      failures: archiveVerification?.failures ?? ["broadcast archive verification did not run"],
    },
    {
      name: "broadcast-closeout",
      passed: verification.passed,
      failures: verification.failures,
    },
  ];

  return {
    passed: checks.every((check) => check.passed),
    report: params.reportPath,
    archive: params.archivePath,
    broadcastReceipt: params.broadcastReceiptPath,
    broadcastPackage: params.broadcastPackagePath,
    submitResult: params.submitResultPath,
    signer: receipt?.signer ?? null,
    chainId: receipt?.chainId ?? null,
    transactions: receipt?.transactions.length ?? 0,
    checks,
  };
}

export function formatAgentProposalExecutionBroadcastCloseoutStatus(
  status: AgentProposalExecutionBroadcastCloseoutStatus,
): string {
  return `${JSON.stringify(status, null, 2)}\n`;
}

function parseReceipt(json: string): AgentProposalExecutionBroadcastReceipt | null {
  try {
    const value = JSON.parse(json);
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return value as AgentProposalExecutionBroadcastReceipt;
    }
  } catch {
    return null;
  }
  return null;
}
