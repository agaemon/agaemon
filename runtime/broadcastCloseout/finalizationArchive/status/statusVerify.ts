import { isDeepStrictEqual } from "node:util";

import { createAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatus } from "./status.js";

import type {
  AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatus,
  AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusCheck,
} from "./status.js";
import type {
  VerifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveParams,
} from "../archive/archiveVerify.js";

export interface VerifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusParams
  extends VerifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveParams {
  finalizationArchiveStatusJson: string;
}

export interface AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusVerification {
  passed: boolean;
  failures: string[];
}

export function verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatus(
  params: VerifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusParams,
): AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusVerification {
  const failures: string[] = [];
  const savedStatus = parseStatus(params.finalizationArchiveStatusJson, failures);
  if (savedStatus === null) return { passed: false, failures };

  const currentStatus = createAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatus(params);
  if (!currentStatus.passed) failures.push(...currentStatus.checks.flatMap((check) => check.failures));
  if (!isDeepStrictEqual(savedStatus, currentStatus)) {
    failures.push("closeout finalization archive status JSON does not match current finalization archive evidence");
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}

function parseStatus(
  json: string,
  failures: string[],
): AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatus | null {
  try {
    const value = JSON.parse(json);
    if (!isRecord(value)) {
      failures.push("closeout finalization archive status must be a JSON object");
      return null;
    }
    validateStatusShape(value, failures);
    return value as unknown as AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatus;
  } catch (error) {
    failures.push(`closeout finalization archive status JSON is malformed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function validateStatusShape(value: Record<string, unknown>, failures: string[]): void {
  if (typeof value.passed !== "boolean") failures.push("closeout finalization archive status passed must be a boolean");
  for (const field of [
    "finalizationArchive",
    "summary",
    "report",
    "archive",
    "status",
    "finalizationStatus",
    "broadcastReceipt",
    "broadcastPackage",
    "submitResult",
  ]) {
    if (typeof value[field] !== "string") {
      failures.push(`closeout finalization archive status ${field} must be a string`);
    }
  }
  if (value.signer !== null && typeof value.signer !== "string") {
    failures.push("closeout finalization archive status signer must be a string or null");
  }
  if (value.chainId !== null && typeof value.chainId !== "number") {
    failures.push("closeout finalization archive status chainId must be a number or null");
  }
  if (typeof value.transactions !== "number") {
    failures.push("closeout finalization archive status transactions must be a number");
  }
  if (!Array.isArray(value.checks)) {
    failures.push("closeout finalization archive status checks must be an array");
    return;
  }

  for (const check of value.checks as unknown[]) validateCheckShape(check, failures);
}

function validateCheckShape(
  value: unknown,
  failures: string[],
): value is AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusCheck {
  if (!isRecord(value)) {
    failures.push("closeout finalization archive status check must be an object");
    return false;
  }
  if (value.name !== "broadcast-closeout-finalization-archive") {
    failures.push("closeout finalization archive status check name is unsupported");
  }
  if (typeof value.passed !== "boolean") {
    failures.push("closeout finalization archive status check passed must be a boolean");
  }
  if (!Array.isArray(value.failures) || value.failures.some((failure) => typeof failure !== "string")) {
    failures.push("closeout finalization archive status check failures must be a string array");
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
