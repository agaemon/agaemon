import { describe, expect, it } from "vitest";

import { createEconomicPayoutSummary } from "../../economics/summary.js";
import {
  formatEconomicPayoutSummaryVerifyCliOutput,
  parseEconomicPayoutSummaryVerifyCliArgs,
  runEconomicPayoutSummaryVerifyCli,
} from "./summaryVerify.js";

import type { CoordinationAssignmentPayoutReconciliation } from "../../payouts/coordination.js";
import type { EconomicPayoutSummaryVerification } from "../../economics/summaryVerify.js";

const RECONCILIATIONS: CoordinationAssignmentPayoutReconciliation[] = [
  reconciliation({
    assignmentId: "1",
    status: "paid",
    reason: "assignment-payout-receipt-recorded",
    amountWei: "100",
    remainingPeriodWei: "900",
  }),
];
const SUMMARY = createEconomicPayoutSummary({ reconciliations: RECONCILIATIONS });

describe("parseEconomicPayoutSummaryVerifyCliArgs", () => {
  it("parses summary, reconciliation input, output, and format paths", () => {
    expect(parseEconomicPayoutSummaryVerifyCliArgs([
      "--summary",
      "artifacts/custom-economic-payout-summary.json",
      "--reconciliations=artifacts/custom-reconciliations.json",
      "--output",
      "artifacts/custom-economic-payout-summary-verification.json",
      "--format",
      "summary",
    ])).toEqual({
      summaryPath: "artifacts/custom-economic-payout-summary.json",
      reconciliationsPath: "artifacts/custom-reconciliations.json",
      outputPath: "artifacts/custom-economic-payout-summary-verification.json",
      format: "summary",
    });
  });
});

describe("runEconomicPayoutSummaryVerifyCli", () => {
  it("verifies a saved local summary without RPC or PRIVATE_KEY", async () => {
    const outputs: string[] = [];
    const writes: unknown[] = [];
    const env: Record<string, string | undefined> = {};

    await runEconomicPayoutSummaryVerifyCli({
      argv: ["--output", "artifacts/economic-payout-summary-verification.json", "--format", "summary"],
      env,
      writeOutput: (output) => outputs.push(output),
      readText: async (path) => path.endsWith("reconciliations.json")
        ? JSON.stringify(RECONCILIATIONS)
        : JSON.stringify(SUMMARY),
      writeText: async (path, contents) => { writes.push({ path, contents }); },
    });

    expect(writes).toEqual([
      {
        path: "artifacts/economic-payout-summary-verification.json",
        contents: `${JSON.stringify({
          passed: true,
          failures: [],
          expected: SUMMARY,
        }, null, 2)}\n`,
      },
    ]);
    expect(outputs[0]).toContain("passed: true");
    expect(env.BASE_SEPOLIA_RPC_URL).toBeUndefined();
    expect(env.PRIVATE_KEY).toBeUndefined();
  });

  it("sets a failing exit code when the saved summary is stale", async () => {
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await runEconomicPayoutSummaryVerifyCli({
      argv: ["--format", "summary"],
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async (path) => path.endsWith("reconciliations.json")
        ? JSON.stringify(RECONCILIATIONS)
        : JSON.stringify({ ...SUMMARY, paidAssignments: 0 }),
    });

    expect(outputs[0]).toContain("economic payout summary is stale");
    expect(exitCodes).toEqual([1]);
  });
});

describe("formatEconomicPayoutSummaryVerifyCliOutput", () => {
  it("formats JSON and summary output", () => {
    const verification: EconomicPayoutSummaryVerification = {
      passed: true,
      failures: [],
      expected: SUMMARY,
    };

    expect(formatEconomicPayoutSummaryVerifyCliOutput(verification, "json")).toContain("\"passed\": true");
    expect(formatEconomicPayoutSummaryVerifyCliOutput(verification, "summary")).toContain("passed: true");
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
