import { createHash } from "node:crypto";

import { verifyAgentProposalExecutionBroadcastReport } from "./reportVerify.js";

import type {
  AgentProposalExecutionBroadcastReportVerification,
  VerifyAgentProposalExecutionBroadcastReportParams,
} from "./reportVerify.js";

export interface CreateAgentProposalExecutionBroadcastArchiveParams
  extends VerifyAgentProposalExecutionBroadcastReportParams {
  archivePath?: string | undefined;
  reportPath: string;
  generatedAt?: string | undefined;
}

export interface AgentProposalExecutionBroadcastArchive {
  schemaVersion: 1;
  generatedAt: string;
  archivePath?: string | undefined;
  report: AgentProposalExecutionBroadcastArchiveFile;
  receipt: AgentProposalExecutionBroadcastArchiveFile;
  broadcastPackage: AgentProposalExecutionBroadcastArchiveFile;
  submitResult: AgentProposalExecutionBroadcastArchiveFile;
  verification: AgentProposalExecutionBroadcastReportVerification;
}

export interface AgentProposalExecutionBroadcastArchiveFile {
  path: string;
  sha256: string;
}

export function createAgentProposalExecutionBroadcastArchive(
  params: CreateAgentProposalExecutionBroadcastArchiveParams,
): AgentProposalExecutionBroadcastArchive {
  return {
    schemaVersion: 1,
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    archivePath: params.archivePath,
    report: { path: params.reportPath, sha256: sha256(params.reportMarkdown) },
    receipt: { path: params.broadcastReceiptPath, sha256: sha256(params.broadcastReceiptJson) },
    broadcastPackage: { path: params.broadcastPackagePath, sha256: sha256(params.broadcastPackageJson) },
    submitResult: { path: params.submitResultPath, sha256: sha256(params.submitResultJson) },
    verification: verifyAgentProposalExecutionBroadcastReport(params),
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
