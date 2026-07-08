import { describe, expect, it } from "vitest";

import {
  formatEconomicPayoutSummaryCliOutput,
  parseEconomicPayoutSummaryCliArgs,
  runEconomicPayoutSummaryCli,
} from "./summary.js";

import type { CoordinationAssignmentPayoutReconciliation } from "../../payouts/coordination.js";
import type { EconomicPayoutSummary } from "../../economics/summary.js";

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
    status: "blocked",
    reason: "payout-daily-limit-exceeded",
    amountWei: "300",
    remainingPeriodWei: "0",
    failures: ["budget spend exceeds remaining period budget"],
  }),
];

describe("parseEconomicPayoutSummaryCliArgs", () => {
  it("parses reconciliation input, output, and format paths", () => {
    expect(parseEconomicPayoutSummaryCliArgs([
      "--reconciliations",
      "artifacts/custom-reconciliations.json",
      "--output=artifacts/custom-economic-payout-summary.json",
      "--format",
      "summary",
    ])).toEqual({
      reconciliationsPath: "artifacts/custom-reconciliations.json",
      outputPath: "artifacts/custom-economic-payout-summary.json",
      format: "summary",
    });
  });
});

describe("runEconomicPayoutSummaryCli", () => {
  it("writes a local economic payout summary without RPC or PRIVATE_KEY", async () => {
    const outputs: string[] = [];
    const writes: unknown[] = [];
    const env: Record<string, string | undefined> = {};

    await runEconomicPayoutSummaryCli({
      argv: ["--output", "artifacts/economic-payout-summary.json", "--format", "summary"],
      env,
      writeOutput: (output) => outputs.push(output),
      readText: async () => JSON.stringify(RECONCILIATIONS),
      writeText: async (path, contents) => { writes.push({ path, contents }); },
    });

    expect(writes).toEqual([
      {
        path: "artifacts/economic-payout-summary.json",
        contents: `${JSON.stringify({
          totalAssignments: 2,
          paidAssignments: 1,
          unpaidAssignments: 0,
          blockedAssignments: 1,
          totalAmountWei: "400",
          paidAmountWei: "100",
          unpaidAmountWei: "0",
          blockedAmountWei: "300",
          lowestRemainingPeriodWei: "0",
          reasons: [
            { reason: "assignment-payout-receipt-recorded", count: 1, amountWei: "100" },
            { reason: "payout-daily-limit-exceeded", count: 1, amountWei: "300" },
          ],
          abuseSignals: {
            invalidAssignments: { count: 0, amountWei: "0", assignmentIds: [] },
            ruleOrBudgetBlocks: { count: 1, amountWei: "300", assignmentIds: ["2"] },
            evidenceMismatches: { count: 0, amountWei: "0", assignmentIds: [] },
            policyBlocks: { count: 0, amountWei: "0", assignmentIds: [] },
          },
          budgetFailures: [
            {
              assignmentId: "2",
              failures: ["budget spend exceeds remaining period budget"],
            },
          ],
        }, null, 2)}\n`,
      },
    ]);
    expect(outputs[0]).toContain("totalAssignments: 2");
    expect(outputs[0]).toContain("budgetFailures: 1");
    expect(env.BASE_SEPOLIA_RPC_URL).toBeUndefined();
    expect(env.PRIVATE_KEY).toBeUndefined();
  });
});

describe("formatEconomicPayoutSummaryCliOutput", () => {
  it("formats JSON and summary output", () => {
    const summary: EconomicPayoutSummary = {
      totalAssignments: 2,
      paidAssignments: 1,
      unpaidAssignments: 0,
      blockedAssignments: 1,
      totalAmountWei: "400",
      paidAmountWei: "100",
      unpaidAmountWei: "0",
      blockedAmountWei: "300",
      lowestRemainingPeriodWei: "0",
      reasons: [
        { reason: "assignment-payout-receipt-recorded", count: 1, amountWei: "100" },
      ],
      abuseSignals: {
        invalidAssignments: { count: 0, amountWei: "0", assignmentIds: [] },
        ruleOrBudgetBlocks: { count: 0, amountWei: "0", assignmentIds: [] },
        evidenceMismatches: { count: 0, amountWei: "0", assignmentIds: [] },
        policyBlocks: { count: 0, amountWei: "0", assignmentIds: [] },
      },
      budgetFailures: [],
    };

    expect(formatEconomicPayoutSummaryCliOutput(summary, "json")).toContain("\"totalAssignments\": 2");
    expect(formatEconomicPayoutSummaryCliOutput(summary, "summary")).toContain("paid: 1 (100)");
    expect(formatEconomicPayoutSummaryCliOutput(summary, "summary")).toContain("abuseSignals: 0");
  });
});

function reconciliation(params: {
  assignmentId: string;
  status: CoordinationAssignmentPayoutReconciliation["status"];
  reason: CoordinationAssignmentPayoutReconciliation["reason"];
  amountWei: string;
  remainingPeriodWei: string;
  failures?: string[] | undefined;
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
      passed: params.failures === undefined,
      amountWei: params.amountWei,
      maxActionWei: "1000",
      maxPeriodWei: "1000",
      periodSpentWei: "0",
      remainingPeriodWei: params.remainingPeriodWei,
      failures: params.failures ?? [],
    },
    policyDecision: { allowed: true, code: "Allowed" },
  };
}
