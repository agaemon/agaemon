import { isDeepStrictEqual } from "node:util";

import { isAddress } from "viem";

import { verifyAgentProposalExecutionHandoff } from "./handoffVerify.js";

import type { AgentProposalExecutionBundle } from "./bundle.js";
import type {
  AgentProposalExecutionHandoffVerification,
  VerifyAgentProposalExecutionHandoffParams,
} from "./handoffVerify.js";

export interface VerifyAgentProposalExecutionReadinessParams extends VerifyAgentProposalExecutionHandoffParams {
  readinessJson: string;
}

export interface AgentProposalExecutionReadinessVerification {
  passed: boolean;
  failures: string[];
  handoffVerification: AgentProposalExecutionHandoffVerification;
}

export function verifyAgentProposalExecutionReadiness(
  params: VerifyAgentProposalExecutionReadinessParams,
): AgentProposalExecutionReadinessVerification {
  const handoffVerification = verifyAgentProposalExecutionHandoff(params);
  const failures = [...handoffVerification.failures];
  let readiness: unknown;
  try {
    readiness = JSON.parse(params.readinessJson);
  } catch (error) {
    return {
      passed: false,
      failures: [`readiness JSON is malformed: ${error instanceof Error ? error.message : String(error)}`],
      handoffVerification,
    };
  }

  if (!isRecord(readiness)) {
    return {
      passed: false,
      failures: uniqueFailures([...failures, "readiness report must be a JSON object"]),
      handoffVerification,
    };
  }

  const bundle = JSON.parse(params.bundleJson) as AgentProposalExecutionBundle;
  validateReadinessShape(readiness, bundle, failures);

  if (!isDeepStrictEqual(readiness.handoffVerification, handoffVerification)) {
    failures.push("saved handoff verification does not match current handoff verification");
  }

  return {
    passed: failures.length === 0,
    failures: uniqueFailures(failures),
    handoffVerification,
  };
}

function validateReadinessShape(
  readiness: Record<string, unknown>,
  bundle: AgentProposalExecutionBundle,
  failures: string[],
): void {
  if (readiness.passed !== true) failures.push("readiness passed must be true");
  if (!Array.isArray(readiness.failures) || readiness.failures.length !== 0) {
    failures.push("readiness failures must be empty");
  }
  validateChecks(readiness.checks, failures);
  if (typeof readiness.signer !== "string" || !isAddress(readiness.signer)) {
    failures.push("readiness signer must be an address");
  }
  if (readiness.expectedChainId !== bundle.chainId) {
    failures.push("readiness expectedChainId must match bundle chainId");
  }
  if (readiness.connectedChainId !== readiness.expectedChainId) {
    failures.push("readiness connectedChainId must match expectedChainId");
  }
  if (!isNonNegativeInteger(readiness.pendingNonce)) {
    failures.push("readiness pendingNonce must be a non-negative integer");
  }
  validateTransactions(readiness.transactions, bundle, failures);
}

function validateChecks(value: unknown, failures: string[]): void {
  const expectedNames = ["execution-handoff", "chain", "nonce", "gas-estimates"];
  if (!Array.isArray(value)) {
    failures.push("readiness checks must be an array");
    return;
  }
  const names = value.map((check) => isRecord(check) ? check.name : undefined);
  if (!isDeepStrictEqual(names, expectedNames)) failures.push("readiness checks must match expected check order");
  value.forEach((check, index) => {
    if (!isRecord(check)) {
      failures.push(`readiness checks[${index}] must be an object`);
      return;
    }
    if (check.passed !== true) failures.push(`readiness checks[${index}].passed must be true`);
    if (!Array.isArray(check.failures) || check.failures.length !== 0) {
      failures.push(`readiness checks[${index}].failures must be empty`);
    }
  });
}

function validateTransactions(value: unknown, bundle: AgentProposalExecutionBundle, failures: string[]): void {
  if (!Array.isArray(value)) {
    failures.push("readiness transactions must be an array");
    return;
  }
  if (value.length !== bundle.transactions.length) {
    failures.push("readiness transaction count must match bundle transaction count");
  }
  bundle.transactions.forEach((transaction, index) => {
    const readinessTransaction = value[index];
    if (!isRecord(readinessTransaction)) {
      failures.push(`readiness transaction ${index} must be an object`);
      return;
    }
    if (readinessTransaction.index !== index) failures.push(`readiness transaction ${index} index must match position`);
    if (readinessTransaction.stepId !== transaction.stepId) failures.push(`readiness transaction ${index} stepId must match bundle`);
    if (readinessTransaction.title !== transaction.title) failures.push(`readiness transaction ${index} title must match bundle`);
    if (readinessTransaction.to !== transaction.to) failures.push(`readiness transaction ${index} to must match bundle`);
    if (readinessTransaction.value !== transaction.value) failures.push(`readiness transaction ${index} value must match bundle`);
    if (readinessTransaction.data !== transaction.data) failures.push(`readiness transaction ${index} data must match bundle`);
    if (!isPositiveIntegerString(readinessTransaction.gasEstimate)) {
      failures.push(`readiness transaction ${index} gasEstimate must be a positive integer string`);
    }
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPositiveIntegerString(value: unknown): value is string {
  return typeof value === "string" && /^[1-9][0-9]*$/.test(value);
}

function uniqueFailures(failures: string[]): string[] {
  return [...new Set(failures)];
}
