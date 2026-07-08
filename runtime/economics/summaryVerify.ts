import { createEconomicPayoutSummary } from "./summary.js";

import type { EconomicPayoutSummary } from "./summary.js";
import type { CoordinationAssignmentPayoutReconciliation } from "../payouts/coordination.js";

export interface VerifyEconomicPayoutSummaryParams {
  saved: EconomicPayoutSummary;
  reconciliations: CoordinationAssignmentPayoutReconciliation[];
}

export interface EconomicPayoutSummaryVerification {
  passed: boolean;
  failures: string[];
  expected: EconomicPayoutSummary;
}

export function verifyEconomicPayoutSummary(
  params: VerifyEconomicPayoutSummaryParams,
): EconomicPayoutSummaryVerification {
  const expected = createEconomicPayoutSummary({ reconciliations: params.reconciliations });
  const failures = JSON.stringify(params.saved, null, 2) === JSON.stringify(expected, null, 2)
    ? []
    : ["economic payout summary is stale"];

  return {
    passed: failures.length === 0,
    failures,
    expected,
  };
}

export function formatEconomicPayoutSummaryVerificationSummary(
  verification: EconomicPayoutSummaryVerification,
): string {
  return [
    "Economic payout summary verification",
    `passed: ${verification.passed}`,
    `failures: ${verification.failures.length}`,
    ...verification.failures.map((failure) => `- ${failure}`),
  ].join("\n");
}
