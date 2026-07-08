import type { CoordinationAssignmentPayoutReconciliation } from "../payouts/coordination.js";

export function createFundingDemoPayoutReconciliations(): CoordinationAssignmentPayoutReconciliation[] {
  return [
    {
      assignmentId: "1",
      recipient: "0x0000000000000000000000000000000000000a11",
      status: "paid",
      reason: "assignment-payout-receipt-recorded",
      evidenceSource: "coordination-payout-receipt-registry",
      evidenceLimit: "Funding demo fixture uses local receipt evidence only.",
      amountWei: "100",
      dailyPaidWei: "100",
      remainingDailyWei: "900",
      receipt: {
        agent: "0x0000000000000000000000000000000000000a01",
        recipient: "0x0000000000000000000000000000000000000a11",
        amountWei: "100",
        payoutTxHash: `0x${"12".repeat(32)}`,
        blockNumber: "43258350",
        timestamp: "1793606400",
        recorded: true,
      },
      rule: {
        maxActionValue: "1000",
        maxDailyValue: "1000",
        enabled: true,
      },
      budget: {
        passed: true,
        amountWei: "100",
        maxActionWei: "1000",
        maxPeriodWei: "1000",
        periodSpentWei: "100",
        remainingPeriodWei: "900",
        failures: [],
      },
      policyDecision: { allowed: true, code: "Allowed" },
    },
  ];
}
