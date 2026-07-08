import { createAgentProposalExecutionBroadcastCloseout } from "../closeout/closeout.js";
import {
  createAgentProposalExecutionBroadcastCloseoutStatus,
  formatAgentProposalExecutionBroadcastCloseoutStatus,
} from "../status/status.js";

import type {
  AgentProposalExecutionBroadcastCloseout,
  CreateAgentProposalExecutionBroadcastCloseoutParams,
} from "../closeout/closeout.js";

export interface CreateAgentProposalExecutionBroadcastCloseoutEvidenceSetParams
  extends CreateAgentProposalExecutionBroadcastCloseoutParams {
  statusPath?: string | undefined;
}

export interface AgentProposalExecutionBroadcastCloseoutEvidenceSet {
  passed: boolean;
  failures: string[];
  report: AgentProposalExecutionBroadcastCloseout["report"];
  archive: AgentProposalExecutionBroadcastCloseout["archive"];
  status: {
    path: string;
    json: string;
  } | null;
}

export function createAgentProposalExecutionBroadcastCloseoutEvidenceSet(
  params: CreateAgentProposalExecutionBroadcastCloseoutEvidenceSetParams,
): AgentProposalExecutionBroadcastCloseoutEvidenceSet {
  const closeout = createAgentProposalExecutionBroadcastCloseout(params);
  if (!closeout.passed) {
    return {
      passed: false,
      failures: closeout.failures,
      report: closeout.report,
      archive: closeout.archive,
      status: null,
    };
  }

  const status = createAgentProposalExecutionBroadcastCloseoutStatus({
    reportPath: closeout.report.path,
    reportMarkdown: closeout.report.markdown,
    archivePath: closeout.archive.path,
    archiveJson: closeout.archive.json,
    broadcastReceiptPath: params.broadcastReceiptPath,
    broadcastReceiptJson: params.broadcastReceiptJson,
    broadcastPackagePath: params.broadcastPackagePath,
    broadcastPackageJson: params.broadcastPackageJson,
    submitResultPath: params.submitResultPath,
    submitResultJson: params.submitResultJson,
  });
  const failures = status.passed ? [] : status.checks.flatMap((check) => check.failures);

  return {
    passed: status.passed,
    failures,
    report: closeout.report,
    archive: closeout.archive,
    status: params.statusPath === undefined
      ? null
      : {
          path: params.statusPath,
          json: formatAgentProposalExecutionBroadcastCloseoutStatus(status),
        },
  };
}
