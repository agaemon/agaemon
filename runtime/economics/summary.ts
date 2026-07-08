import type {
  CoordinationAssignmentPayoutReconciliation,
  CoordinationAssignmentPayoutReconciliationReason,
  CoordinationAssignmentPayoutReconciliationStatus,
} from "../payouts/coordination.js";

export interface CreateEconomicPayoutSummaryParams {
  reconciliations: CoordinationAssignmentPayoutReconciliation[];
}

export interface EconomicPayoutSummaryReason {
  reason: CoordinationAssignmentPayoutReconciliationReason;
  count: number;
  amountWei: string;
}

export interface EconomicPayoutBudgetFailure {
  assignmentId: string;
  failures: string[];
}

export interface EconomicPayoutAbuseSignal {
  count: number;
  amountWei: string;
  assignmentIds: string[];
}

export interface EconomicPayoutAbuseSignals {
  invalidAssignments: EconomicPayoutAbuseSignal;
  ruleOrBudgetBlocks: EconomicPayoutAbuseSignal;
  evidenceMismatches: EconomicPayoutAbuseSignal;
  policyBlocks: EconomicPayoutAbuseSignal;
}

export interface EconomicPayoutSummary {
  totalAssignments: number;
  paidAssignments: number;
  unpaidAssignments: number;
  blockedAssignments: number;
  totalAmountWei: string;
  paidAmountWei: string;
  unpaidAmountWei: string;
  blockedAmountWei: string;
  lowestRemainingPeriodWei: string;
  reasons: EconomicPayoutSummaryReason[];
  abuseSignals: EconomicPayoutAbuseSignals;
  budgetFailures: EconomicPayoutBudgetFailure[];
}

export function createEconomicPayoutSummary(params: CreateEconomicPayoutSummaryParams): EconomicPayoutSummary {
  const amounts = {
    total: 0n,
    paid: 0n,
    unpaid: 0n,
    blocked: 0n,
  };
  const counts: Record<CoordinationAssignmentPayoutReconciliationStatus, number> = {
    paid: 0,
    unpaid: 0,
    blocked: 0,
  };
  const reasons = new Map<CoordinationAssignmentPayoutReconciliationReason, { count: number; amountWei: bigint }>();
  const budgetFailures: EconomicPayoutBudgetFailure[] = [];
  const abuseSignals = createEmptyAbuseSignals();
  let lowestRemainingPeriodWei: bigint | null = null;

  for (const reconciliation of params.reconciliations) {
    const amountWei = BigInt(reconciliation.amountWei);
    const remainingPeriodWei = BigInt(reconciliation.budget.remainingPeriodWei);
    amounts.total += amountWei;
    amounts[reconciliation.status] += amountWei;
    counts[reconciliation.status] += 1;
    lowestRemainingPeriodWei = lowestRemainingPeriodWei === null || remainingPeriodWei < lowestRemainingPeriodWei
      ? remainingPeriodWei
      : lowestRemainingPeriodWei;

    const reason = reasons.get(reconciliation.reason) ?? { count: 0, amountWei: 0n };
    reason.count += 1;
    reason.amountWei += amountWei;
    reasons.set(reconciliation.reason, reason);

    if (reconciliation.budget.failures.length > 0) {
      budgetFailures.push({
        assignmentId: reconciliation.assignmentId,
        failures: reconciliation.budget.failures,
      });
    }
    addAbuseSignal(abuseSignals, reconciliation.reason, reconciliation.assignmentId, amountWei);
  }

  return {
    totalAssignments: params.reconciliations.length,
    paidAssignments: counts.paid,
    unpaidAssignments: counts.unpaid,
    blockedAssignments: counts.blocked,
    totalAmountWei: amounts.total.toString(),
    paidAmountWei: amounts.paid.toString(),
    unpaidAmountWei: amounts.unpaid.toString(),
    blockedAmountWei: amounts.blocked.toString(),
    lowestRemainingPeriodWei: lowestRemainingPeriodWei?.toString() ?? "0",
    reasons: [...reasons.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([reason, summary]) => ({
        reason,
        count: summary.count,
        amountWei: summary.amountWei.toString(),
      })),
    abuseSignals: serializeAbuseSignals(abuseSignals),
    budgetFailures,
  };
}

type AbuseSignalKey = keyof EconomicPayoutAbuseSignals;

type MutableAbuseSignal = {
  count: number;
  amountWei: bigint;
  assignmentIds: string[];
};

function createEmptyAbuseSignals(): Record<AbuseSignalKey, MutableAbuseSignal> {
  return {
    invalidAssignments: createEmptyAbuseSignal(),
    ruleOrBudgetBlocks: createEmptyAbuseSignal(),
    evidenceMismatches: createEmptyAbuseSignal(),
    policyBlocks: createEmptyAbuseSignal(),
  };
}

function createEmptyAbuseSignal(): MutableAbuseSignal {
  return {
    count: 0,
    amountWei: 0n,
    assignmentIds: [],
  };
}

function addAbuseSignal(
  signals: Record<AbuseSignalKey, MutableAbuseSignal>,
  reason: CoordinationAssignmentPayoutReconciliationReason,
  assignmentId: string,
  amountWei: bigint,
): void {
  const key = readAbuseSignalKey(reason);
  if (key === null) return;
  signals[key].count += 1;
  signals[key].amountWei += amountWei;
  signals[key].assignmentIds.push(assignmentId);
}

function readAbuseSignalKey(reason: CoordinationAssignmentPayoutReconciliationReason): AbuseSignalKey | null {
  switch (reason) {
    case "assignment-not-completed":
    case "assignment-not-completed-by-assignee":
    case "assignment-missing-result-evidence":
    case "invalid-payout-amount":
      return "invalidAssignments";
    case "payout-rule-disabled":
    case "payout-action-limit-exceeded":
    case "payout-daily-limit-exceeded":
      return "ruleOrBudgetBlocks";
    case "payout-evidence-ambiguous":
    case "payout-receipt-mismatch":
      return "evidenceMismatches";
    case "policy-not-simulated":
    case "policy-denied":
      return "policyBlocks";
    case "ready-for-payout":
    case "assignment-payout-receipt-recorded":
    case "daily-payout-exact-amount":
      return null;
  }
}

function serializeAbuseSignals(
  signals: Record<AbuseSignalKey, MutableAbuseSignal>,
): EconomicPayoutAbuseSignals {
  return {
    invalidAssignments: serializeAbuseSignal(signals.invalidAssignments),
    ruleOrBudgetBlocks: serializeAbuseSignal(signals.ruleOrBudgetBlocks),
    evidenceMismatches: serializeAbuseSignal(signals.evidenceMismatches),
    policyBlocks: serializeAbuseSignal(signals.policyBlocks),
  };
}

function serializeAbuseSignal(signal: MutableAbuseSignal): EconomicPayoutAbuseSignal {
  return {
    count: signal.count,
    amountWei: signal.amountWei.toString(),
    assignmentIds: signal.assignmentIds,
  };
}
