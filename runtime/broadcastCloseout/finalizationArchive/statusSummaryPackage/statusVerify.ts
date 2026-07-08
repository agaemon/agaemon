import { isDeepStrictEqual } from "node:util";

import { createAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatus } from "./status.js";

import type {
  AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatus,
  AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusCheck,
} from "./status.js";
import type {
  VerifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageParams,
} from "./packageVerify.js";

export interface VerifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusParams
  extends VerifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageParams {
  finalizationArchiveStatusSummaryPackageStatusJson: string;
}

export interface AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusVerification {
  passed: boolean;
  failures: string[];
}

export function verifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatus(
  params: VerifyAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusParams,
): AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusVerification {
  const failures: string[] = [];
  const savedStatus = parseStatus(params.finalizationArchiveStatusSummaryPackageStatusJson, failures);
  if (savedStatus === null) return { passed: false, failures };

  const currentStatus = createAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatus(params);
  if (!currentStatus.passed) failures.push(...currentStatus.checks.flatMap((check) => check.failures));
  if (!isDeepStrictEqual(savedStatus, currentStatus)) {
    failures.push(
      "closeout finalization archive status summary package status JSON does not match current finalization archive status summary package evidence",
    );
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}

function parseStatus(
  json: string,
  failures: string[],
): AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatus | null {
  try {
    const value = JSON.parse(json);
    if (!isRecord(value)) {
      failures.push("closeout finalization archive status summary package status must be a JSON object");
      return null;
    }
    validateStatusShape(value, failures);
    return value as unknown as AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatus;
  } catch (error) {
    failures.push(
      `closeout finalization archive status summary package status JSON is malformed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}

function validateStatusShape(value: Record<string, unknown>, failures: string[]): void {
  if (typeof value.passed !== "boolean") {
    failures.push("closeout finalization archive status summary package status passed must be a boolean");
  }
  for (const field of [
    "finalizationArchiveStatusSummaryPackage",
    "finalizationArchiveStatusSummary",
    "finalizationArchiveStatus",
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
      failures.push(`closeout finalization archive status summary package status ${field} must be a string`);
    }
  }
  if (value.signer !== null && typeof value.signer !== "string") {
    failures.push("closeout finalization archive status summary package status signer must be a string or null");
  }
  if (value.chainId !== null && typeof value.chainId !== "number") {
    failures.push("closeout finalization archive status summary package status chainId must be a number or null");
  }
  if (typeof value.transactions !== "number") {
    failures.push("closeout finalization archive status summary package status transactions must be a number");
  }
  if (!Array.isArray(value.checks)) {
    failures.push("closeout finalization archive status summary package status checks must be an array");
    return;
  }

  for (const check of value.checks as unknown[]) validateCheckShape(check, failures);
}

function validateCheckShape(
  value: unknown,
  failures: string[],
): value is AgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusCheck {
  if (!isRecord(value)) {
    failures.push("closeout finalization archive status summary package status check must be an object");
    return false;
  }
  if (value.name !== "broadcast-closeout-finalization-archive-status-summary-package") {
    failures.push("closeout finalization archive status summary package status check name is unsupported");
  }
  if (typeof value.passed !== "boolean") {
    failures.push("closeout finalization archive status summary package status check passed must be a boolean");
  }
  if (!Array.isArray(value.failures) || value.failures.some((failure) => typeof failure !== "string")) {
    failures.push("closeout finalization archive status summary package status check failures must be a string array");
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
