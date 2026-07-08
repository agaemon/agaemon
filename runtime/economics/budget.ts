export interface VerifyBudgetSpendParams {
  amountWei: bigint;
  maxActionWei: bigint;
  maxPeriodWei: bigint;
  periodSpentWei: bigint;
}

export interface BudgetSpendVerification {
  passed: boolean;
  failures: string[];
  amountWei: string;
  maxActionWei: string;
  maxPeriodWei: string;
  periodSpentWei: string;
  remainingPeriodWei: string;
}

export function verifyBudgetSpend(params: VerifyBudgetSpendParams): BudgetSpendVerification {
  const failures: string[] = [];

  if (params.amountWei <= 0n) failures.push("budget spend amount must be greater than zero");
  if (params.maxActionWei <= 0n) failures.push("max action budget must be greater than zero");
  if (params.maxPeriodWei <= 0n) failures.push("max period budget must be greater than zero");
  if (params.periodSpentWei < 0n) failures.push("period spent budget must not be negative");
  if (params.maxActionWei > 0n && params.amountWei > params.maxActionWei) {
    failures.push("budget spend exceeds max action amount");
  }

  const remaining = params.maxPeriodWei - params.periodSpentWei - params.amountWei;
  if (params.maxPeriodWei > 0n && params.periodSpentWei >= 0n && remaining < 0n) {
    failures.push("budget spend exceeds remaining period budget");
  }

  return {
    passed: failures.length === 0,
    failures,
    amountWei: params.amountWei.toString(),
    maxActionWei: params.maxActionWei.toString(),
    maxPeriodWei: params.maxPeriodWei.toString(),
    periodSpentWei: params.periodSpentWei.toString(),
    remainingPeriodWei: remaining > 0n ? remaining.toString() : "0",
  };
}
