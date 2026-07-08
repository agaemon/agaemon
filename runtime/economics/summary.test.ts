import { describe, expect, it } from "vitest";

import { createEconomicPayoutSummary } from "./summary.js";

import type { CoordinationAssignmentPayoutReconciliationReason } from "../payouts/coordination.js";

const RECIPIENT = "0x0000000000000000000000000000000000000a11" as const;

describe("createEconomicPayoutSummary", () => {
  it("aggregates payout reconciliation evidence for operators", () => {
    expect(
      createEconomicPayoutSummary({
        reconciliations: [
          reconciliation({
            assignmentId: "1",
            status: "paid",
            reason: "assignment-payout-receipt-recorded",
            amountWei: "100",
            remainingPeriodWei: "900",
          }),
          reconciliation({
            assignmentId: "2",
            status: "unpaid",
            reason: "ready-for-payout",
            amountWei: "200",
            remainingPeriodWei: "700",
          }),
          reconciliation({
            assignmentId: "3",
            status: "blocked",
            reason: "payout-daily-limit-exceeded",
            amountWei: "300",
            remainingPeriodWei: "0",
            budgetFailures: ["budget spend exceeds remaining period budget"],
          }),
        ],
      }),
    ).toEqual({
      totalAssignments: 3,
      paidAssignments: 1,
      unpaidAssignments: 1,
      blockedAssignments: 1,
      totalAmountWei: "600",
      paidAmountWei: "100",
      unpaidAmountWei: "200",
      blockedAmountWei: "300",
      lowestRemainingPeriodWei: "0",
      reasons: [
        { reason: "assignment-payout-receipt-recorded", count: 1, amountWei: "100" },
        { reason: "payout-daily-limit-exceeded", count: 1, amountWei: "300" },
        { reason: "ready-for-payout", count: 1, amountWei: "200" },
      ],
      abuseSignals: {
        invalidAssignments: { count: 0, amountWei: "0", assignmentIds: [] },
        ruleOrBudgetBlocks: { count: 1, amountWei: "300", assignmentIds: ["3"] },
        evidenceMismatches: { count: 0, amountWei: "0", assignmentIds: [] },
        policyBlocks: { count: 0, amountWei: "0", assignmentIds: [] },
      },
      budgetFailures: [
        {
          assignmentId: "3",
          failures: ["budget spend exceeds remaining period budget"],
        },
      ],
    });
  });

  it("returns zero totals for an empty reconciliation set", () => {
    expect(createEconomicPayoutSummary({ reconciliations: [] })).toEqual({
      totalAssignments: 0,
      paidAssignments: 0,
      unpaidAssignments: 0,
      blockedAssignments: 0,
      totalAmountWei: "0",
      paidAmountWei: "0",
      unpaidAmountWei: "0",
      blockedAmountWei: "0",
      lowestRemainingPeriodWei: "0",
      reasons: [],
      abuseSignals: {
        invalidAssignments: { count: 0, amountWei: "0", assignmentIds: [] },
        ruleOrBudgetBlocks: { count: 0, amountWei: "0", assignmentIds: [] },
        evidenceMismatches: { count: 0, amountWei: "0", assignmentIds: [] },
        policyBlocks: { count: 0, amountWei: "0", assignmentIds: [] },
      },
      budgetFailures: [],
    });
  });

  it("groups payout abuse signals from reconciliation reasons", () => {
    expect(
      createEconomicPayoutSummary({
        reconciliations: [
          reconciliation({
            assignmentId: "invalid",
            status: "blocked",
            reason: "assignment-missing-result-evidence",
            amountWei: "25",
            remainingPeriodWei: "975",
          }),
          reconciliation({
            assignmentId: "mismatch",
            status: "blocked",
            reason: "payout-receipt-mismatch",
            amountWei: "50",
            remainingPeriodWei: "925",
          }),
          reconciliation({
            assignmentId: "policy",
            status: "blocked",
            reason: "policy-denied",
            amountWei: "75",
            remainingPeriodWei: "850",
          }),
        ],
      }).abuseSignals,
    ).toEqual({
      invalidAssignments: { count: 1, amountWei: "25", assignmentIds: ["invalid"] },
      ruleOrBudgetBlocks: { count: 0, amountWei: "0", assignmentIds: [] },
      evidenceMismatches: { count: 1, amountWei: "50", assignmentIds: ["mismatch"] },
      policyBlocks: { count: 1, amountWei: "75", assignmentIds: ["policy"] },
    });
  });
});

function reconciliation(params: {
  assignmentId: string;
  status: "paid" | "unpaid" | "blocked";
  reason: CoordinationAssignmentPayoutReconciliationReason;
  amountWei: string;
  remainingPeriodWei: string;
  budgetFailures?: string[] | undefined;
}) {
  return {
    assignmentId: params.assignmentId,
    recipient: RECIPIENT,
    status: params.status,
    reason: params.reason,
    evidenceSource: "payout-adapter-daily-bucket" as const,
    evidenceLimit: "PayoutRuleAdapter tracks daily totals per agent and recipient, not per assignment.",
    amountWei: params.amountWei,
    dailyPaidWei: "0",
    remainingDailyWei: params.remainingPeriodWei,
    receipt: null,
    rule: {
      maxActionValue: "500",
      maxDailyValue: "1000",
      enabled: true,
    },
    budget: {
      passed: params.budgetFailures === undefined || params.budgetFailures.length === 0,
      failures: params.budgetFailures ?? [],
      amountWei: params.amountWei,
      maxActionWei: "500",
      maxPeriodWei: "1000",
      periodSpentWei: "0",
      remainingPeriodWei: params.remainingPeriodWei,
    },
    policyDecision: { allowed: true, code: "Allowed" as const },
  };
}
