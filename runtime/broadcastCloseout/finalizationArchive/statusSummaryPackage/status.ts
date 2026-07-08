import { verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackage } from "./packageVerify.js";

import type { AgentProposalExecutionBroadcastReceipt } from "../../../broadcast/receipt.js";
import type {
  VerifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageParams,
} from "./packageVerify.js";

export interface AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatus {
  passed: boolean;
  finalizationArchiveStatusSummaryPackage: string | undefined;
  finalizationArchiveStatusSummary: string;
  finalizationArchiveStatus: string;
  finalizationArchive: string;
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
  checks: AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusCheck[];
}

export interface AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusCheck {
  name: "broadcast-closeout-finalization-archive-status-summary-package";
  passed: boolean;
  failures: string[];
}

export function createAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatus(
  params: VerifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageParams,
): AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatus {
  const verification = verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackage(params);
  const receipt = parseReceipt(params.broadcastReceiptJson);

  return {
    passed: verification.passed,
    finalizationArchiveStatusSummaryPackage: params.finalizationArchiveStatusSummaryPackagePath,
    finalizationArchiveStatusSummary: params.finalizationArchiveStatusSummaryPath,
    finalizationArchiveStatus: params.finalizationArchiveStatusPath,
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
        name: "broadcast-closeout-finalization-archive-status-summary-package",
        passed: verification.passed,
        failures: verification.failures,
      },
    ],
  };
}

export function formatAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatus(
  status: AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatus,
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
