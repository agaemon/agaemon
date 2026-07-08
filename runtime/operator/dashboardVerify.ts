import { validateOperatorDashboardSnapshot } from "./dashboard.js";

import type { OperatorDashboardSnapshot } from "./dashboard.js";

export interface VerifyOperatorDashboardSnapshotParams {
  saved: OperatorDashboardSnapshot;
  expected: OperatorDashboardSnapshot;
}

export interface OperatorDashboardVerification {
  passed: boolean;
  failures: string[];
  expected: OperatorDashboardSnapshot;
}

export function verifyOperatorDashboardSnapshot(
  params: VerifyOperatorDashboardSnapshotParams,
): OperatorDashboardVerification {
  validateOperatorDashboardSnapshot(params.saved);
  validateOperatorDashboardSnapshot(params.expected);
  const failures = JSON.stringify(withoutGeneratedAt(params.saved), null, 2) ===
    JSON.stringify(withoutGeneratedAt(params.expected), null, 2)
    ? []
    : ["operator dashboard snapshot is stale"];

  return {
    passed: failures.length === 0,
    failures,
    expected: params.expected,
  };
}

function withoutGeneratedAt(snapshot: OperatorDashboardSnapshot): Omit<OperatorDashboardSnapshot, "generatedAt"> {
  const { generatedAt: _generatedAt, ...rest } = snapshot;
  return rest;
}

export function formatOperatorDashboardVerificationSummary(report: OperatorDashboardVerification): string {
  validateOperatorDashboardVerification(report);
  return [
    "Operator dashboard verification",
    `passed: ${report.passed}`,
    `failures: ${report.failures.length}`,
    ...report.failures.map((failure) => `- ${failure}`),
  ].join("\n");
}

export function validateOperatorDashboardVerification(report: unknown): asserts report is OperatorDashboardVerification {
  const record = requireRecord(report, "operator dashboard verification");
  if (typeof record.passed !== "boolean") throw new Error("operator dashboard verification passed must be a boolean");
  if (!Array.isArray(record.failures) || record.failures.some((failure) => typeof failure !== "string")) {
    throw new Error("operator dashboard verification failures must be an array of strings");
  }
  validateOperatorDashboardSnapshot(record.expected);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }

  return value as Record<string, unknown>;
}
