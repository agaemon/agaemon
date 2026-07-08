import { verifyAgentProposalExecutionBroadcastCloseoutFinalization } from "../finalization/finalizationVerify.js";

import type { AgentProposalExecutionBroadcastReceipt } from "../../../broadcast/receipt.js";
import type {
  AgentProposalExecutionBroadcastCloseoutFinalizationVerificationCheck,
  VerifyAgentProposalExecutionBroadcastCloseoutFinalizationParams,
} from "../finalization/finalizationVerify.js";

export interface AgentProposalExecutionBroadcastCloseoutFinalizationStatus {
  passed: boolean;
  summary: string;
  report: string;
  archive: string;
  status: string;
  broadcastReceipt: string;
  broadcastPackage: string;
  submitResult: string;
  signer: string | null;
  chainId: number | null;
  transactions: number;
  checks: AgentProposalExecutionBroadcastCloseoutFinalizationVerificationCheck[];
}

export function createAgentProposalExecutionBroadcastCloseoutFinalizationStatus(
  params: VerifyAgentProposalExecutionBroadcastCloseoutFinalizationParams,
): AgentProposalExecutionBroadcastCloseoutFinalizationStatus {
  const verification = verifyAgentProposalExecutionBroadcastCloseoutFinalization(params);
  const receipt = parseReceipt(params.broadcastReceiptJson);

  return {
    passed: verification.passed,
    summary: params.summaryPath,
    report: params.reportPath,
    archive: params.archivePath,
    status: params.statusPath,
    broadcastReceipt: params.broadcastReceiptPath,
    broadcastPackage: params.broadcastPackagePath,
    submitResult: params.submitResultPath,
    signer: receipt?.signer ?? null,
    chainId: receipt?.chainId ?? null,
    transactions: receipt?.transactions.length ?? 0,
    checks: verification.checks,
  };
}

export function formatAgentProposalExecutionBroadcastCloseoutFinalizationStatus(
  status: AgentProposalExecutionBroadcastCloseoutFinalizationStatus,
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
