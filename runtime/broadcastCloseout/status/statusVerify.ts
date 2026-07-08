import { isDeepStrictEqual } from "node:util";

import { createAgentProposalExecutionBroadcastCloseoutStatus } from "./status.js";

import type {
  AgentProposalExecutionBroadcastCloseoutStatus,
  AgentProposalExecutionBroadcastCloseoutStatusCheck,
} from "./status.js";
import type { VerifyAgentProposalExecutionBroadcastCloseoutParams } from "../closeout/closeoutVerify.js";

export interface VerifyAgentProposalExecutionBroadcastCloseoutStatusParams
  extends VerifyAgentProposalExecutionBroadcastCloseoutParams {
  statusJson: string;
}

export interface AgentProposalExecutionBroadcastCloseoutStatusVerification {
  passed: boolean;
  failures: string[];
}

export function verifyAgentProposalExecutionBroadcastCloseoutStatus(
  params: VerifyAgentProposalExecutionBroadcastCloseoutStatusParams,
): AgentProposalExecutionBroadcastCloseoutStatusVerification {
  const failures: string[] = [];
  const savedStatus = parseStatus(params.statusJson, failures);
  if (savedStatus === null) return { passed: false, failures };

  const currentStatus = createAgentProposalExecutionBroadcastCloseoutStatus(params);
  if (!currentStatus.passed) failures.push(...currentStatus.checks.flatMap((check) => check.failures));
  if (!isDeepStrictEqual(savedStatus, currentStatus)) {
    failures.push("closeout status JSON does not match current closeout evidence");
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}

function parseStatus(
  json: string,
  failures: string[],
): AgentProposalExecutionBroadcastCloseoutStatus | null {
  try {
    const value = JSON.parse(json);
    if (!isRecord(value)) {
      failures.push("closeout status must be a JSON object");
      return null;
    }
    validateStatusShape(value, failures);
    return value as unknown as AgentProposalExecutionBroadcastCloseoutStatus;
  } catch (error) {
    failures.push(`closeout status JSON is malformed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function validateStatusShape(value: Record<string, unknown>, failures: string[]): void {
  if (typeof value.passed !== "boolean") failures.push("closeout status passed must be a boolean");
  for (const field of ["report", "archive", "broadcastReceipt", "broadcastPackage", "submitResult"]) {
    if (typeof value[field] !== "string") failures.push(`closeout status ${field} must be a string`);
  }
  if (value.signer !== null && typeof value.signer !== "string") {
    failures.push("closeout status signer must be a string or null");
  }
  if (value.chainId !== null && typeof value.chainId !== "number") {
    failures.push("closeout status chainId must be a number or null");
  }
  if (typeof value.transactions !== "number") failures.push("closeout status transactions must be a number");
  if (!Array.isArray(value.checks)) {
    failures.push("closeout status checks must be an array");
    return;
  }

  for (const check of value.checks as unknown[]) validateCheckShape(check, failures);
}

function validateCheckShape(
  value: unknown,
  failures: string[],
): value is AgentProposalExecutionBroadcastCloseoutStatusCheck {
  if (!isRecord(value)) {
    failures.push("closeout status check must be an object");
    return false;
  }
  if (!["broadcast-report", "broadcast-archive", "broadcast-closeout"].includes(String(value.name))) {
    failures.push("closeout status check name is unsupported");
  }
  if (typeof value.passed !== "boolean") failures.push("closeout status check passed must be a boolean");
  if (!Array.isArray(value.failures) || value.failures.some((failure) => typeof failure !== "string")) {
    failures.push("closeout status check failures must be a string array");
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
