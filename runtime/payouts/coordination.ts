import { getAddress, zeroHash } from "viem";
import type { Address, Hex } from "viem";

import type { AgentAction } from "../core/action.js";
import { ASSIGNMENT_STATUS } from "../agentCore/coordination.js";
import { createPayoutRuleAction } from "./rule.js";
import type { PolicyDecision } from "../core/policy.js";
import { verifyBudgetSpend } from "../economics/budget.js";
import type { BudgetSpendVerification } from "../economics/budget.js";

export interface CoordinationAssignmentPayoutAssignment {
  assignee: Address;
  statusCode: number;
  completedBy: Address;
  resultHash: Hex;
}

export interface CreateCoordinationAssignmentPayoutActionParams {
  assignmentId: bigint;
  assignment: CoordinationAssignmentPayoutAssignment;
  adapter: Address;
  amountWei: bigint;
}

export type CoordinationAssignmentPayoutReconciliationStatus = "paid" | "unpaid" | "blocked";

export type CoordinationAssignmentPayoutReconciliationReason =
  | "ready-for-payout"
  | "assignment-payout-receipt-recorded"
  | "daily-payout-exact-amount"
  | "assignment-not-completed"
  | "assignment-not-completed-by-assignee"
  | "assignment-missing-result-evidence"
  | "invalid-payout-amount"
  | "payout-rule-disabled"
  | "payout-action-limit-exceeded"
  | "payout-daily-limit-exceeded"
  | "payout-evidence-ambiguous"
  | "payout-receipt-mismatch"
  | "policy-not-simulated"
  | "policy-denied";

export interface CoordinationAssignmentPayoutRuleState {
  maxActionValue: bigint;
  maxDailyValue: bigint;
  enabled: boolean;
  dailyPaid: bigint;
}

export interface ReconcileCoordinationAssignmentPayoutParams {
  assignmentId: bigint;
  assignment: CoordinationAssignmentPayoutAssignment;
  amountWei: bigint;
  payoutRule: CoordinationAssignmentPayoutRuleState;
  payoutReceipt?: CoordinationAssignmentPayoutReceiptState | null | undefined;
  policyDecision: PolicyDecision | null;
}

export interface CoordinationAssignmentPayoutReceiptState {
  agent: Address;
  recipient: Address;
  amountWei: bigint;
  payoutTxHash: Hex;
  blockNumber: bigint;
  timestamp: bigint;
  recorded: boolean;
}

export interface CoordinationAssignmentPayoutReconciliation {
  assignmentId: string;
  recipient: Address;
  status: CoordinationAssignmentPayoutReconciliationStatus;
  reason: CoordinationAssignmentPayoutReconciliationReason;
  evidenceSource: "coordination-payout-receipt-registry" | "payout-adapter-daily-bucket";
  evidenceLimit: string;
  amountWei: string;
  dailyPaidWei: string;
  remainingDailyWei: string;
  receipt: {
    agent: Address;
    recipient: Address;
    amountWei: string;
    payoutTxHash: Hex;
    blockNumber: string;
    timestamp: string;
    recorded: boolean;
  } | null;
  rule: {
    maxActionValue: string;
    maxDailyValue: string;
    enabled: boolean;
  };
  budget: BudgetSpendVerification;
  policyDecision: PolicyDecision | null;
}

export function createCoordinationAssignmentPayoutAction(
  params: CreateCoordinationAssignmentPayoutActionParams,
): AgentAction {
  if (params.amountWei <= 0n) {
    throw new Error("coordination payout amount must be greater than zero");
  }

  if (params.assignment.statusCode !== ASSIGNMENT_STATUS.Completed) {
    throw new Error(`assignment ${params.assignmentId} is not completed`);
  }

  if (getAddress(params.assignment.completedBy) !== getAddress(params.assignment.assignee)) {
    throw new Error(`assignment ${params.assignmentId} was not completed by the assignee`);
  }

  if (params.assignment.resultHash === zeroHash) {
    throw new Error(`assignment ${params.assignmentId} has no result evidence`);
  }

  return createPayoutRuleAction({
    adapter: params.adapter,
    recipient: params.assignment.assignee,
    amountWei: params.amountWei,
  });
}

export function reconcileCoordinationAssignmentPayout(
  params: ReconcileCoordinationAssignmentPayoutParams,
): CoordinationAssignmentPayoutReconciliation {
  const base = createReconciliationResult(params);

  if (params.amountWei <= 0n) return { ...base, status: "blocked", reason: "invalid-payout-amount" };
  if (params.assignment.statusCode !== ASSIGNMENT_STATUS.Completed) {
    return { ...base, status: "blocked", reason: "assignment-not-completed" };
  }
  if (getAddress(params.assignment.completedBy) !== getAddress(params.assignment.assignee)) {
    return { ...base, status: "blocked", reason: "assignment-not-completed-by-assignee" };
  }
  if (params.assignment.resultHash === zeroHash) {
    return { ...base, status: "blocked", reason: "assignment-missing-result-evidence" };
  }

  if (params.payoutReceipt?.recorded === true) {
    if (
      getAddress(params.payoutReceipt.recipient) !== getAddress(params.assignment.assignee)
      || params.payoutReceipt.amountWei !== params.amountWei
    ) {
      return {
        ...base,
        evidenceSource: "coordination-payout-receipt-registry",
        status: "blocked",
        reason: "payout-receipt-mismatch",
      };
    }
    return {
      ...base,
      evidenceSource: "coordination-payout-receipt-registry",
      status: "paid",
      reason: "assignment-payout-receipt-recorded",
    };
  }

  if (params.payoutRule.dailyPaid === params.amountWei) {
    return { ...base, status: "paid", reason: "daily-payout-exact-amount" };
  }
  if (params.payoutRule.dailyPaid > params.amountWei) {
    return { ...base, status: "blocked", reason: "payout-evidence-ambiguous" };
  }

  if (!params.payoutRule.enabled) return { ...base, status: "blocked", reason: "payout-rule-disabled" };
  if (params.amountWei > params.payoutRule.maxActionValue) {
    return { ...base, status: "blocked", reason: "payout-action-limit-exceeded" };
  }
  if (params.payoutRule.dailyPaid + params.amountWei > params.payoutRule.maxDailyValue) {
    return { ...base, status: "blocked", reason: "payout-daily-limit-exceeded" };
  }
  if (params.policyDecision === null) return { ...base, status: "blocked", reason: "policy-not-simulated" };
  if (!params.policyDecision.allowed) return { ...base, status: "blocked", reason: "policy-denied" };

  return { ...base, status: "unpaid", reason: "ready-for-payout" };
}

function createReconciliationResult(
  params: ReconcileCoordinationAssignmentPayoutParams,
): Omit<CoordinationAssignmentPayoutReconciliation, "status" | "reason"> {
  const remainingDailyWei = params.payoutRule.maxDailyValue > params.payoutRule.dailyPaid
    ? params.payoutRule.maxDailyValue - params.payoutRule.dailyPaid
    : 0n;

  return {
    assignmentId: params.assignmentId.toString(),
    recipient: params.assignment.assignee,
    evidenceSource: "payout-adapter-daily-bucket",
    evidenceLimit: "PayoutRuleAdapter tracks daily totals per agent and recipient, not per assignment.",
    amountWei: params.amountWei.toString(),
    dailyPaidWei: params.payoutRule.dailyPaid.toString(),
    remainingDailyWei: remainingDailyWei.toString(),
    receipt: params.payoutReceipt === undefined || params.payoutReceipt === null
      ? null
      : {
          agent: params.payoutReceipt.agent,
          recipient: params.payoutReceipt.recipient,
          amountWei: params.payoutReceipt.amountWei.toString(),
          payoutTxHash: params.payoutReceipt.payoutTxHash,
          blockNumber: params.payoutReceipt.blockNumber.toString(),
          timestamp: params.payoutReceipt.timestamp.toString(),
          recorded: params.payoutReceipt.recorded,
        },
    rule: {
      maxActionValue: params.payoutRule.maxActionValue.toString(),
      maxDailyValue: params.payoutRule.maxDailyValue.toString(),
      enabled: params.payoutRule.enabled,
    },
    budget: verifyBudgetSpend({
      amountWei: params.amountWei,
      maxActionWei: params.payoutRule.maxActionValue,
      maxPeriodWei: params.payoutRule.maxDailyValue,
      periodSpentWei: params.payoutRule.dailyPaid,
    }),
    policyDecision: params.policyDecision,
  };
}
