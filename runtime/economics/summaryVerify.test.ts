import { describe, expect, it } from "vitest";

import { createEconomicPayoutSummary } from "./summary.js";
import {
  formatEconomicPayoutSummaryVerificationSummary,
  verifyEconomicPayoutSummary,
} from "./summaryVerify.js";

import type { CoordinationAssignmentPayoutReconciliation } from "../payouts/coordination.js";

const RECONCILIATIONS: CoordinationAssignmentPayoutReconciliation[] = [
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
];

describe("verifyEconomicPayoutSummary", () => {
  it("passes when the saved summary matches reconciliation evidence", () => {
    const saved = createEconomicPayoutSummary({ reconciliations: RECONCILIATIONS });
    const verification = verifyEconomicPayoutSummary({
      saved,
      reconciliations: RECONCILIATIONS,
    });

    expect(verification).toEqual({
      passed: true,
      failures: [],
      expected: saved,
    });
    expect(formatEconomicPayoutSummaryVerificationSummary(verification)).toContain("passed: true");
  });

  it("fails when the saved summary is stale", () => {
    const saved = createEconomicPayoutSummary({ reconciliations: RECONCILIATIONS });
    const stale = { ...saved, paidAssignments: 0 };
    const verification = verifyEconomicPayoutSummary({
      saved: stale,
      reconciliations: RECONCILIATIONS,
    });

    expect(verification.passed).toBe(false);
    expect(verification.failures).toEqual(["economic payout summary is stale"]);
    expect(verification.expected).toEqual(saved);
  });
});

function reconciliation(params: {
  assignmentId: string;
  status: CoordinationAssignmentPayoutReconciliation["status"];
  reason: CoordinationAssignmentPayoutReconciliation["reason"];
  amountWei: string;
  remainingPeriodWei: string;
}): CoordinationAssignmentPayoutReconciliation {
  return {
    assignmentId: params.assignmentId,
    recipient: "0x0000000000000000000000000000000000000a11",
    status: params.status,
    reason: params.reason,
    evidenceSource: "payout-adapter-daily-bucket",
    evidenceLimit: "test",
    amountWei: params.amountWei,
    dailyPaidWei: "0",
    remainingDailyWei: "1000",
    receipt: null,
    rule: {
      maxActionValue: "1000",
      maxDailyValue: "1000",
      enabled: true,
    },
    budget: {
      passed: true,
      amountWei: params.amountWei,
      maxActionWei: "1000",
      maxPeriodWei: "1000",
      periodSpentWei: "0",
      remainingPeriodWei: params.remainingPeriodWei,
      failures: [],
    },
    policyDecision: { allowed: true, code: "Allowed" },
  };
}
