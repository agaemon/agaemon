import { createHash } from "node:crypto";

import { verifyAgentProposalExecutionBroadcastCloseoutFinalizationStatus } from "../../finalization/status/statusVerify.js";

import type {
  AgentProposalExecutionBroadcastCloseoutFinalizationStatusVerification,
  VerifyAgentProposalExecutionBroadcastCloseoutFinalizationStatusParams,
} from "../../finalization/status/statusVerify.js";

export interface CreateAgentProposalExecutionBroadcastCloseoutFinalizationArchiveParams
  extends VerifyAgentProposalExecutionBroadcastCloseoutFinalizationStatusParams {
  finalizationArchivePath?: string | undefined;
  finalizationStatusPath: string;
  generatedAt?: string | undefined;
}

export interface AgentProposalExecutionBroadcastCloseoutFinalizationArchive {
  schemaVersion: 1;
  generatedAt: string;
  finalizationArchivePath?: string | undefined;
  report: AgentProposalExecutionBroadcastCloseoutFinalizationArchiveFile;
  archive: AgentProposalExecutionBroadcastCloseoutFinalizationArchiveFile;
  status: AgentProposalExecutionBroadcastCloseoutFinalizationArchiveFile;
  summary: AgentProposalExecutionBroadcastCloseoutFinalizationArchiveFile;
  finalizationStatus: AgentProposalExecutionBroadcastCloseoutFinalizationArchiveFile;
  receipt: AgentProposalExecutionBroadcastCloseoutFinalizationArchiveFile;
  broadcastPackage: AgentProposalExecutionBroadcastCloseoutFinalizationArchiveFile;
  submitResult: AgentProposalExecutionBroadcastCloseoutFinalizationArchiveFile;
  verification: AgentProposalExecutionBroadcastCloseoutFinalizationStatusVerification;
}

export interface AgentProposalExecutionBroadcastCloseoutFinalizationArchiveFile {
  path: string;
  sha256: string;
}

export function createAgentProposalExecutionBroadcastCloseoutFinalizationArchive(
  params: CreateAgentProposalExecutionBroadcastCloseoutFinalizationArchiveParams,
): AgentProposalExecutionBroadcastCloseoutFinalizationArchive {
  return {
    schemaVersion: 1,
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    finalizationArchivePath: params.finalizationArchivePath,
    report: { path: params.reportPath, sha256: sha256(params.reportMarkdown) },
    archive: { path: params.archivePath, sha256: sha256(params.archiveJson) },
    status: { path: params.statusPath, sha256: sha256(params.statusJson) },
    summary: { path: params.summaryPath, sha256: sha256(params.summaryMarkdown) },
    finalizationStatus: { path: params.finalizationStatusPath, sha256: sha256(params.finalizationStatusJson) },
    receipt: { path: params.broadcastReceiptPath, sha256: sha256(params.broadcastReceiptJson) },
    broadcastPackage: { path: params.broadcastPackagePath, sha256: sha256(params.broadcastPackageJson) },
    submitResult: { path: params.submitResultPath, sha256: sha256(params.submitResultJson) },
    verification: verifyAgentProposalExecutionBroadcastCloseoutFinalizationStatus(params),
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
