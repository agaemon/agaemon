import { describe, expect, it } from "vitest";

import {
  formatFundingDemoPayoutReconciliationsCliOutput,
  parseFundingDemoPayoutReconciliationsCliArgs,
  runFundingDemoPayoutReconciliationsCli,
} from "./fundingDemoReconciliations.js";
import type { CoordinationAssignmentPayoutReconciliation } from "../../payouts/coordination.js";

describe("parseFundingDemoPayoutReconciliationsCliArgs", () => {
  it("parses output and format flags", () => {
    expect(parseFundingDemoPayoutReconciliationsCliArgs([
      "--output",
      "artifacts/funding-demo/coordination-payout-reconciliations.json",
      "--format=summary",
    ])).toEqual({
      outputPath: "artifacts/funding-demo/coordination-payout-reconciliations.json",
      format: "summary",
    });
  });
});

describe("runFundingDemoPayoutReconciliationsCli", () => {
  it("writes deterministic local reconciliation rows without RPC or signer env", async () => {
    const outputs: string[] = [];
    const writes: unknown[] = [];
    const env: Record<string, string | undefined> = {};

    await runFundingDemoPayoutReconciliationsCli({
      argv: ["--output", "artifacts/funding-demo/coordination-payout-reconciliations.json", "--format", "summary"],
      env,
      writeOutput: (output) => outputs.push(output),
      writeText: async (path, contents) => { writes.push({ path, rows: JSON.parse(contents).length }); },
      mkdirp: async (path) => { writes.push({ mkdir: path }); },
    });

    expect(writes).toEqual([
      { mkdir: "artifacts/funding-demo" },
      { path: "artifacts/funding-demo/coordination-payout-reconciliations.json", rows: 1 },
    ]);
    expect(outputs[0]).toContain("Funding demo payout reconciliations");
    expect(outputs[0]).toContain("paid: 1");
    expect(env.BASE_SEPOLIA_RPC_URL).toBeUndefined();
    expect(env.PRIVATE_KEY).toBeUndefined();
  });
});

describe("formatFundingDemoPayoutReconciliationsCliOutput", () => {
  it("formats JSON and summary output", () => {
    const rows: Array<Pick<CoordinationAssignmentPayoutReconciliation, "assignmentId" | "status" | "reason" | "amountWei">> = [{
      assignmentId: "1",
      status: "paid",
      reason: "assignment-payout-receipt-recorded",
      amountWei: "100",
    }];

    expect(formatFundingDemoPayoutReconciliationsCliOutput(rows, "json")).toContain("\"assignmentId\": \"1\"");
    expect(formatFundingDemoPayoutReconciliationsCliOutput(rows, "summary")).toContain("totalAssignments: 1");
  });
});
