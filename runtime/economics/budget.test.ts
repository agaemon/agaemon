import { describe, expect, it } from "vitest";

import { verifyBudgetSpend } from "./budget.js";

describe("verifyBudgetSpend", () => {
  it("allows spend inside action and period limits", () => {
    expect(
      verifyBudgetSpend({
        amountWei: 100n,
        maxActionWei: 250n,
        maxPeriodWei: 1_000n,
        periodSpentWei: 400n,
      }),
    ).toEqual({
      passed: true,
      failures: [],
      amountWei: "100",
      maxActionWei: "250",
      maxPeriodWei: "1000",
      periodSpentWei: "400",
      remainingPeriodWei: "500",
    });
  });

  it("rejects zero spend", () => {
    expect(
      verifyBudgetSpend({
        amountWei: 0n,
        maxActionWei: 250n,
        maxPeriodWei: 1_000n,
        periodSpentWei: 400n,
      }),
    ).toMatchObject({
      passed: false,
      failures: ["budget spend amount must be greater than zero"],
    });
  });

  it("rejects spend above the action limit", () => {
    expect(
      verifyBudgetSpend({
        amountWei: 300n,
        maxActionWei: 250n,
        maxPeriodWei: 1_000n,
        periodSpentWei: 400n,
      }),
    ).toMatchObject({
      passed: false,
      failures: ["budget spend exceeds max action amount"],
    });
  });

  it("rejects spend above the remaining period budget", () => {
    expect(
      verifyBudgetSpend({
        amountWei: 700n,
        maxActionWei: 750n,
        maxPeriodWei: 1_000n,
        periodSpentWei: 400n,
      }),
    ).toEqual({
      passed: false,
      failures: ["budget spend exceeds remaining period budget"],
      amountWei: "700",
      maxActionWei: "750",
      maxPeriodWei: "1000",
      periodSpentWei: "400",
      remainingPeriodWei: "0",
    });
  });

  it("rejects invalid budget limits", () => {
    expect(
      verifyBudgetSpend({
        amountWei: 100n,
        maxActionWei: 0n,
        maxPeriodWei: 0n,
        periodSpentWei: -1n,
      }),
    ).toMatchObject({
      passed: false,
      failures: [
        "max action budget must be greater than zero",
        "max period budget must be greater than zero",
        "period spent budget must not be negative",
      ],
    });
  });
});
