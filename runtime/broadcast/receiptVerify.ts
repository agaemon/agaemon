import { isDeepStrictEqual } from "node:util";

import { createAgentProposalExecutionBroadcastReceipt } from "./receipt.js";

import type {
  AgentProposalExecutionBroadcastReceipt,
  CreateAgentProposalExecutionBroadcastReceiptParams,
} from "./receipt.js";
import type { AgentProposalExecutionBroadcastSubmitResult } from "./submit.js";

export interface VerifyAgentProposalExecutionBroadcastReceiptParams
  extends Omit<CreateAgentProposalExecutionBroadcastReceiptParams, "submitResult"> {
  broadcastReceiptPath: string;
  broadcastReceiptJson: string;
  submitResultPath: string;
  submitResultJson: string;
}

export interface AgentProposalExecutionBroadcastReceiptVerification {
  passed: boolean;
  failures: string[];
}

export function verifyAgentProposalExecutionBroadcastReceipt(
  params: VerifyAgentProposalExecutionBroadcastReceiptParams,
): AgentProposalExecutionBroadcastReceiptVerification {
  const failures: string[] = [];
  const savedReceipt = parseBroadcastReceipt(params.broadcastReceiptJson, failures);
  const submitResult = parseSubmitResult(params.submitResultJson, failures);
  if (submitResult === null) {
    return {
      passed: false,
      failures: uniqueFailures(failures),
    };
  }

  const receiptResult = createAgentProposalExecutionBroadcastReceipt({
    ...params,
    submitResult,
    generatedAt: params.generatedAt ?? savedReceipt?.generatedAt,
  });
  failures.push(...receiptResult.failures);
  if (savedReceipt !== null && receiptResult.receipt !== null && !isDeepStrictEqual(savedReceipt, receiptResult.receipt)) {
    failures.push("broadcast receipt JSON does not match current broadcast receipt");
  }

  return {
    passed: failures.length === 0,
    failures: uniqueFailures(failures),
  };
}

function parseBroadcastReceipt(json: string, failures: string[]): AgentProposalExecutionBroadcastReceipt | null {
  try {
    const value = JSON.parse(json);
    if (!isRecord(value)) {
      failures.push("broadcast receipt must be a JSON object");
      return null;
    }
    if (value.schemaVersion !== 1) failures.push("broadcast receipt schemaVersion must be 1");
    if (typeof value.generatedAt !== "string" || Number.isNaN(Date.parse(value.generatedAt))) {
      failures.push("broadcast receipt generatedAt must be a valid timestamp");
    }
    return value as unknown as AgentProposalExecutionBroadcastReceipt;
  } catch (error) {
    failures.push(`broadcast receipt JSON is malformed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function parseSubmitResult(json: string, failures: string[]): AgentProposalExecutionBroadcastSubmitResult | null {
  try {
    const value = JSON.parse(json);
    if (!isRecord(value)) {
      failures.push("submit result must be a JSON object");
      return null;
    }
    return value as unknown as AgentProposalExecutionBroadcastSubmitResult;
  } catch (error) {
    failures.push(`submit result JSON is malformed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function uniqueFailures(failures: string[]): string[] {
  return [...new Set(failures)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
