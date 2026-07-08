import { createAgentProposalExecutionBroadcastCloseout } from "./closeout.js";

import type {
  AgentProposalExecutionBroadcastCloseout,
  CreateAgentProposalExecutionBroadcastCloseoutParams,
} from "./closeout.js";

export interface VerifyAgentProposalExecutionBroadcastCloseoutParams
  extends Omit<CreateAgentProposalExecutionBroadcastCloseoutParams, "generatedAt"> {
  archiveJson: string;
  reportMarkdown: string;
}

export interface AgentProposalExecutionBroadcastCloseoutVerification {
  passed: boolean;
  failures: string[];
  closeout: AgentProposalExecutionBroadcastCloseout;
}

export function verifyAgentProposalExecutionBroadcastCloseout(
  params: VerifyAgentProposalExecutionBroadcastCloseoutParams,
): AgentProposalExecutionBroadcastCloseoutVerification {
  const closeout = createAgentProposalExecutionBroadcastCloseout({
    ...params,
    generatedAt: readArchiveGeneratedAt(params.archiveJson),
  });
  const failures = [...closeout.failures];

  if (closeout.passed && params.reportMarkdown !== closeout.report.markdown) {
    failures.push("closeout report Markdown does not match current broadcast closeout");
  }
  if (closeout.passed && params.archiveJson !== closeout.archive.json) {
    failures.push("closeout archive JSON does not match current broadcast closeout");
  }

  return {
    passed: failures.length === 0,
    failures,
    closeout,
  };
}

function readArchiveGeneratedAt(archiveJson: string): string | undefined {
  try {
    const archive = JSON.parse(archiveJson);
    if (typeof archive === "object" && archive !== null && !Array.isArray(archive)) {
      const generatedAt = (archive as Record<string, unknown>).generatedAt;
      if (typeof generatedAt === "string") return generatedAt;
    }
  } catch {
    return undefined;
  }
  return undefined;
}
