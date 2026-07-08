import { createHash } from "node:crypto";

import { verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummary } from "../statusSummary/verify.js";

import type {
  AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryVerification,
  VerifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryParams,
} from "../statusSummary/verify.js";

export interface CreateAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageParams
  extends VerifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryParams {
  finalizationArchiveStatusSummaryPackagePath?: string | undefined;
  finalizationArchiveStatusSummaryPath: string;
  finalizationArchivePath: string;
  generatedAt?: string | undefined;
}

export interface AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackage {
  schemaVersion: 1;
  generatedAt: string;
  finalizationArchiveStatusSummaryPackagePath?: string | undefined;
  finalizationArchiveStatusSummary: AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageFile;
  finalizationArchiveStatus: AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageFile;
  finalizationArchive: AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageFile;
  report: AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageFile;
  archive: AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageFile;
  status: AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageFile;
  summary: AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageFile;
  finalizationStatus: AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageFile;
  receipt: AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageFile;
  broadcastPackage: AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageFile;
  submitResult: AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageFile;
  verification: AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryVerification;
}

export interface AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageFile {
  path: string;
  sha256: string;
}

export function createAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackage(
  params: CreateAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageParams,
): AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackage {
  return {
    schemaVersion: 1,
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    finalizationArchiveStatusSummaryPackagePath: params.finalizationArchiveStatusSummaryPackagePath,
    finalizationArchiveStatusSummary: {
      path: params.finalizationArchiveStatusSummaryPath,
      sha256: sha256(params.finalizationArchiveStatusSummaryMarkdown),
    },
    finalizationArchiveStatus: {
      path: params.finalizationArchiveStatusPath,
      sha256: sha256(params.finalizationArchiveStatusJson),
    },
    finalizationArchive: { path: params.finalizationArchivePath, sha256: sha256(params.finalizationArchiveJson) },
    report: { path: params.reportPath, sha256: sha256(params.reportMarkdown) },
    archive: { path: params.archivePath, sha256: sha256(params.archiveJson) },
    status: { path: params.statusPath, sha256: sha256(params.statusJson) },
    summary: { path: params.summaryPath, sha256: sha256(params.summaryMarkdown) },
    finalizationStatus: { path: params.finalizationStatusPath, sha256: sha256(params.finalizationStatusJson) },
    receipt: { path: params.broadcastReceiptPath, sha256: sha256(params.broadcastReceiptJson) },
    broadcastPackage: { path: params.broadcastPackagePath, sha256: sha256(params.broadcastPackageJson) },
    submitResult: { path: params.submitResultPath, sha256: sha256(params.submitResultJson) },
    verification: verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummary(params),
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
