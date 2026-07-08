import { createHash } from "node:crypto";

import { validateHealthReport } from "./health.js";

import type { BaseSepoliaHealthReport } from "./health.js";

export interface BaseSepoliaHealthVerification {
  passed: boolean;
  failures: string[];
}

export interface VerifyBaseSepoliaHealthReportParams {
  manifestPath?: string | undefined;
  manifestContents?: string | undefined;
  releaseStatusPath?: string | undefined;
}

export function verifyBaseSepoliaHealthReport(
  report: unknown,
  params: VerifyBaseSepoliaHealthReportParams = {},
): BaseSepoliaHealthVerification {
  const failures: string[] = [];
  let health: BaseSepoliaHealthReport;
  try {
    validateHealthReport(report);
    health = report;
  } catch (error) {
    return {
      passed: false,
      failures: [error instanceof Error ? error.message : String(error)],
    };
  }

  if (!health.passed) failures.push("health report must be passed");
  if (params.manifestPath !== undefined && health.manifest.path !== params.manifestPath) {
    failures.push("health report manifest path does not match expected manifest path");
  }
  if (params.manifestContents !== undefined) {
    const manifestSha256 = createHash("sha256").update(params.manifestContents).digest("hex");
    if (health.manifest.sha256 !== manifestSha256) {
      failures.push("health report manifest SHA-256 does not match current manifest");
    }
  }
  if (params.releaseStatusPath !== undefined && health.release.statusPath !== params.releaseStatusPath) {
    failures.push("health report release status path does not match expected status path");
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}

export function formatBaseSepoliaHealthVerificationSummary(
  verification: BaseSepoliaHealthVerification,
): string {
  validateHealthVerification(verification);
  return [
    "Base Sepolia health verification",
    `passed: ${verification.passed}`,
    `failures: ${verification.failures.length}`,
    ...verification.failures.map((failure) => `- ${failure}`),
  ].join("\n");
}

export function validateHealthVerification(
  verification: unknown,
): asserts verification is BaseSepoliaHealthVerification {
  const record = requireRecord(verification, "health verification");
  if (typeof record.passed !== "boolean") throw new Error("health verification passed must be a boolean");
  if (!Array.isArray(record.failures)) throw new Error("health verification failures must be an array");
  record.failures.forEach((failure, index) => {
    if (typeof failure !== "string" || failure.length === 0) {
      throw new Error(`health verification failure ${index} must be a non-empty string`);
    }
  });
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}
