import { isDeepStrictEqual } from "node:util";

import { createAgentProposalExecutionSigningPayload } from "./signingPayload.js";

import type {
  AgentProposalExecutionSigningPayloadResult,
  CreateAgentProposalExecutionSigningPayloadParams,
} from "./signingPayload.js";

export interface VerifyAgentProposalExecutionSigningPayloadParams extends CreateAgentProposalExecutionSigningPayloadParams {
  payloadJson: string;
}

export interface AgentProposalExecutionSigningPayloadVerification {
  passed: boolean;
  failures: string[];
  result: AgentProposalExecutionSigningPayloadResult;
}

export function verifyAgentProposalExecutionSigningPayload(
  params: VerifyAgentProposalExecutionSigningPayloadParams,
): AgentProposalExecutionSigningPayloadVerification {
  const result = createAgentProposalExecutionSigningPayload(params);
  const failures = [...result.failures];
  let savedPayload: unknown;
  try {
    savedPayload = JSON.parse(params.payloadJson);
  } catch (error) {
    return {
      passed: false,
      failures: [`signing payload JSON is malformed: ${error instanceof Error ? error.message : String(error)}`],
      result,
    };
  }

  if (result.payload === null) {
    return {
      passed: false,
      failures,
      result,
    };
  }

  if (!isDeepStrictEqual(savedPayload, result.payload)) {
    failures.push("saved signing payload does not match current signing payload");
  }

  return {
    passed: failures.length === 0,
    failures: uniqueFailures(failures),
    result,
  };
}

function uniqueFailures(failures: string[]): string[] {
  return [...new Set(failures)];
}
