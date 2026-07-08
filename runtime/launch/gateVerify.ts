import { createHash } from "node:crypto";

import { validateBaseSecurityEvidenceReport } from "../security/evidence.js";
import { validateLaunchGateReport } from "./gate.js";
import { validateHealthReport } from "./health.js";

import type { BaseSepoliaLaunchGateReport } from "./gate.js";
import type { BaseSepoliaHealthReport } from "./health.js";
import type { BaseSepoliaLocalPreflightReport } from "../base/localPreflight.js";
import type { EconomicPayoutSummaryVerification } from "../economics/summaryVerify.js";

export interface BaseSepoliaLaunchGateVerification {
  passed: boolean;
  failures: string[];
}

export interface VerifyBaseSepoliaLaunchGateReportParams {
  manifestContents?: string | undefined;
  health?: unknown;
  localPreflight?: unknown;
  securityEvidence?: unknown;
  economicPayoutSummaryVerification?: unknown;
}

export function verifyBaseSepoliaLaunchGateReport(
  report: unknown,
  params: VerifyBaseSepoliaLaunchGateReportParams = {},
): BaseSepoliaLaunchGateVerification {
  const failures: string[] = [];
  let gate: BaseSepoliaLaunchGateReport;
  try {
    validateLaunchGateReport(report);
    gate = report;
  } catch (error) {
    return {
      passed: false,
      failures: [error instanceof Error ? error.message : String(error)],
    };
  }

  if (!gate.passed) failures.push("launch gate report must be passed");
  if (gate.decision !== "go") failures.push("launch gate decision must be go");
  if (params.manifestContents !== undefined) {
    const manifestSha256 = createHash("sha256").update(params.manifestContents).digest("hex");
    if (gate.manifestSha256 !== manifestSha256) {
      failures.push("launch gate manifest SHA-256 does not match current manifest");
    }
  }
  if (params.health !== undefined) {
    let health: BaseSepoliaHealthReport;
    try {
      validateHealthReport(params.health);
      health = params.health;
    } catch (error) {
      failures.push(`health report invalid: ${error instanceof Error ? error.message : String(error)}`);
      return { passed: false, failures };
    }

    if (gate.manifestPath !== health.manifest.path) {
      failures.push("launch gate manifest path does not match health report manifest");
    }
    if (gate.manifestSha256 !== health.manifest.sha256) {
      failures.push("launch gate manifest SHA-256 does not match health report manifest");
    }
    if (gate.releaseStatusPath !== health.release.statusPath) {
      failures.push("launch gate release status path does not match health report release status");
    }
  }
  if (params.localPreflight !== undefined) {
    let localPreflight: BaseSepoliaLocalPreflightReport & { manifest?: string; status?: string };
    try {
      validateLocalPreflightReport(params.localPreflight);
      localPreflight = params.localPreflight;
    } catch (error) {
      failures.push(`local preflight report invalid: ${error instanceof Error ? error.message : String(error)}`);
      return { passed: false, failures };
    }

    const localPreflightCheck = gate.checks.find((check) => check.id === "local-preflight");
    if (localPreflightCheck === undefined) {
      failures.push("launch gate report must include a local-preflight check");
    } else if (!localPreflightCheck.passed) {
      failures.push("launch gate local-preflight check must be passed");
    }
    if (!localPreflight.passed) failures.push("local preflight report must be passed");
    if (localPreflight.manifest !== undefined && localPreflight.manifest !== gate.manifestPath) {
      failures.push("local preflight manifest path does not match launch gate manifest path");
    }
    if (localPreflight.status !== undefined && localPreflight.status !== gate.releaseStatusPath) {
      failures.push("local preflight status path does not match launch gate release status path");
    }
  }
  if (params.securityEvidence !== undefined) {
    try {
      validateBaseSecurityEvidenceReport(params.securityEvidence);
    } catch (error) {
      failures.push(`security evidence report invalid: ${error instanceof Error ? error.message : String(error)}`);
      return { passed: false, failures };
    }

    const securityEvidenceCheck = gate.checks.find((check) => check.id === "security-evidence");
    if (securityEvidenceCheck === undefined) {
      failures.push("launch gate report must include a security-evidence check");
    } else if (!securityEvidenceCheck.passed) {
      failures.push("launch gate security-evidence check must be passed");
    }
    if (!params.securityEvidence.passed) failures.push("security evidence report must be passed");
  }
  if (params.economicPayoutSummaryVerification !== undefined) {
    let economicPayoutSummaryVerification: EconomicPayoutSummaryVerification;
    try {
      validateEconomicPayoutSummaryVerification(params.economicPayoutSummaryVerification);
      economicPayoutSummaryVerification = params.economicPayoutSummaryVerification;
    } catch (error) {
      failures.push(
        `economic payout summary verification invalid: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { passed: false, failures };
    }

    const economicCheck = gate.checks.find((check) => check.id === "economic-payout-summary");
    if (economicCheck === undefined) {
      failures.push("launch gate report must include an economic-payout-summary check");
    } else if (!economicCheck.passed) {
      failures.push("launch gate economic-payout-summary check must be passed");
    }
    if (!economicPayoutSummaryVerification.passed) {
      failures.push("economic payout summary verification must be passed");
    }
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}

function validateEconomicPayoutSummaryVerification(
  report: unknown,
): asserts report is EconomicPayoutSummaryVerification {
  const record = requireRecord(report, "economic payout summary verification");
  if (typeof record.passed !== "boolean") {
    throw new Error("economic payout summary verification passed must be a boolean");
  }
  if (!Array.isArray(record.failures)) {
    throw new Error("economic payout summary verification failures must be an array");
  }
  record.failures.forEach((failure, index) => {
    requireString(failure, `economic payout summary verification failure ${index}`);
  });
}

function validateLocalPreflightReport(
  report: unknown,
): asserts report is BaseSepoliaLocalPreflightReport & { manifest?: string; status?: string } {
  const record = requireRecord(report, "local preflight report");
  if (typeof record.passed !== "boolean") throw new Error("local preflight report passed must be a boolean");
  if (!Array.isArray(record.checks)) throw new Error("local preflight report checks must be an array");
  record.checks.forEach(validateLocalPreflightCheck);
  if (record.manifest !== undefined) requireString(record.manifest, "local preflight report manifest");
  if (record.status !== undefined) requireString(record.status, "local preflight report status");
}

function validateLocalPreflightCheck(value: unknown, index: number): void {
  const record = requireRecord(value, `local preflight report check ${index}`);
  requireString(record.name, `local preflight report check ${index} name`);
  if (typeof record.passed !== "boolean") {
    throw new Error(`local preflight report check ${index} passed must be a boolean`);
  }
  if (!Array.isArray(record.failures)) throw new Error(`local preflight report check ${index} failures must be an array`);
  record.failures.forEach((failure, failureIndex) => {
    requireString(failure, `local preflight report check ${index} failure ${failureIndex}`);
  });
}

export function formatBaseSepoliaLaunchGateVerificationSummary(
  verification: BaseSepoliaLaunchGateVerification,
): string {
  validateLaunchGateVerification(verification);
  return [
    "Base Sepolia launch gate verification",
    `passed: ${verification.passed}`,
    `failures: ${verification.failures.length}`,
    ...verification.failures.map((failure) => `- ${failure}`),
  ].join("\n");
}

export function validateLaunchGateVerification(
  verification: unknown,
): asserts verification is BaseSepoliaLaunchGateVerification {
  const record = requireRecord(verification, "launch gate verification");
  if (typeof record.passed !== "boolean") throw new Error("launch gate verification passed must be a boolean");
  if (!Array.isArray(record.failures)) throw new Error("launch gate verification failures must be an array");
  record.failures.forEach((failure, index) => {
    if (typeof failure !== "string" || failure.length === 0) {
      throw new Error(`launch gate verification failure ${index} must be a non-empty string`);
    }
  });
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} must be a non-empty string`);
  return value;
}
