import { createAgentProposalExecutionRunbook } from "./runbook.js";

import type {
  AgentProposalExecutionRunbook,
  CreateAgentProposalExecutionRunbookParams,
} from "./runbook.js";

export interface VerifyAgentProposalExecutionRunbookParams extends CreateAgentProposalExecutionRunbookParams {
  runbookMarkdown: string;
}

export interface AgentProposalExecutionRunbookVerification {
  passed: boolean;
  failures: string[];
  runbook: AgentProposalExecutionRunbook;
}

export function verifyAgentProposalExecutionRunbook(
  params: VerifyAgentProposalExecutionRunbookParams,
): AgentProposalExecutionRunbookVerification {
  const runbook = createAgentProposalExecutionRunbook(params);
  const failures = [...runbook.failures];
  if (runbook.passed && params.runbookMarkdown !== runbook.markdown) {
    failures.push("runbook markdown does not match current execution preview");
  }

  return {
    passed: failures.length === 0,
    failures,
    runbook,
  };
}
