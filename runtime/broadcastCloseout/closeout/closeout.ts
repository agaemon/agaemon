import { createAgentProposalExecutionBroadcastArchive } from "../../broadcast/archive.js";
import { verifyAgentProposalExecutionBroadcastArchive } from "../../broadcast/archiveVerify.js";
import { createAgentProposalExecutionBroadcastReport } from "../../broadcast/report.js";

import type {
  AgentProposalExecutionBroadcastArchiveVerification,
} from "../../broadcast/archiveVerify.js";
import type {
  AgentProposalExecutionBroadcastReport,
  CreateAgentProposalExecutionBroadcastReportParams,
} from "../../broadcast/report.js";

export interface CreateAgentProposalExecutionBroadcastCloseoutParams
  extends CreateAgentProposalExecutionBroadcastReportParams {
  archivePath: string;
  reportPath: string;
  generatedAt?: string | undefined;
}

export interface AgentProposalExecutionBroadcastCloseout {
  passed: boolean;
  failures: string[];
  report: {
    path: string;
    markdown: string;
  };
  archive: {
    path: string;
    json: string;
  };
  reportResult: AgentProposalExecutionBroadcastReport;
  archiveVerification: AgentProposalExecutionBroadcastArchiveVerification | null;
}

export function createAgentProposalExecutionBroadcastCloseout(
  params: CreateAgentProposalExecutionBroadcastCloseoutParams,
): AgentProposalExecutionBroadcastCloseout {
  const reportResult = createAgentProposalExecutionBroadcastReport(params);
  if (!reportResult.passed) {
    return {
      passed: false,
      failures: reportResult.failures,
      report: { path: params.reportPath, markdown: "" },
      archive: { path: params.archivePath, json: "" },
      reportResult,
      archiveVerification: null,
    };
  }

  const archive = createAgentProposalExecutionBroadcastArchive({
    ...params,
    reportMarkdown: reportResult.markdown,
  });
  const archiveJson = `${JSON.stringify(archive, null, 2)}\n`;
  const archiveVerification = verifyAgentProposalExecutionBroadcastArchive({
    ...params,
    archiveJson,
    reportMarkdown: reportResult.markdown,
  });

  return {
    passed: archiveVerification.passed,
    failures: archiveVerification.failures,
    report: { path: params.reportPath, markdown: reportResult.markdown },
    archive: { path: params.archivePath, json: archiveJson },
    reportResult,
    archiveVerification,
  };
}
