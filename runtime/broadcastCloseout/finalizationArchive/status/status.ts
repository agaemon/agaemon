import { verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchive } from "../archive/archiveVerify.js";

import type { AgentProposalExecutionBroadcastReceipt } from "../../../broadcast/receipt.js";
import type {
  VerifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveParams,
} from "../archive/archiveVerify.js";

export interface AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatus {
  passed: boolean;
  finalizationArchive: string | undefined;
  report: string;
  archive: string;
  status: string;
  summary: string;
  finalizationStatus: string;
  broadcastReceipt: string;
  broadcastPackage: string;
  submitResult: string;
  signer: string | null;
  chainId: number | null;
  transactions: number;
  checks: AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusCheck[];
}

export interface AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusCheck {
  name: "broadcast-closeout-finalization-archive";
  passed: boolean;
  failures: string[];
}

export function createAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatus(
  params: VerifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveParams,
): AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatus {
  const verification = verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchive(params);
  const receipt = parseReceipt(params.broadcastReceiptJson);

  return {
    passed: verification.passed,
    finalizationArchive: params.finalizationArchivePath,
    report: params.reportPath,
    archive: params.archivePath,
    status: params.statusPath,
    summary: params.summaryPath,
    finalizationStatus: params.finalizationStatusPath,
    broadcastReceipt: params.broadcastReceiptPath,
    broadcastPackage: params.broadcastPackagePath,
    submitResult: params.submitResultPath,
    signer: receipt?.signer ?? null,
    chainId: receipt?.chainId ?? null,
    transactions: receipt?.transactions.length ?? 0,
    checks: [
      {
        name: "broadcast-closeout-finalization-archive",
        passed: verification.passed,
        failures: verification.failures,
      },
    ],
  };
}

export function formatAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatus(
  status: AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatus,
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
