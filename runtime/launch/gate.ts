import { createHash } from "node:crypto";

import { verifyReadinessCheckpoint } from "../base/checkpoint.js";
import { verifyBaseSepoliaReleaseStatusSnapshot } from "../release/status.js";
import { validateBaseSecurityEvidenceReport } from "../security/evidence.js";
import { validateHealthReport } from "./health.js";

import type { BaseSepoliaHealthReport } from "./health.js";
import type { BaseSepoliaLocalPreflightReport } from "../base/localPreflight.js";
import type { EconomicPayoutSummaryVerification } from "../economics/summaryVerify.js";

export type BaseSepoliaLaunchDecision = "go" | "no-go";

export interface BaseSepoliaLaunchGateCheck {
  id: string;
  label: string;
  passed: boolean;
  failures: string[];
}

export interface BaseSepoliaLaunchGateReport {
  schemaVersion: 1;
  generatedAt: string;
  manifestPath: string;
  manifestSha256: string;
  releaseStatusPath: string;
  commitSha: string | null;
  readinessRunUrl: string | null;
  decision: BaseSepoliaLaunchDecision;
  passed: boolean;
  summary: {
    checks: number;
    passed: number;
    failed: number;
  };
  checks: BaseSepoliaLaunchGateCheck[];
}

export interface CreateBaseSepoliaLaunchGateReportParams {
  generatedAt?: string | undefined;
  manifestPath: string;
  manifestContents: string;
  checkpoint: unknown;
  releaseStatusPath: string;
  releaseStatusJson: string;
  health: unknown;
  localPreflight?: unknown;
  securityEvidence?: unknown;
  economicPayoutSummaryVerification?: unknown;
}

export function createBaseSepoliaLaunchGateReport(
  params: CreateBaseSepoliaLaunchGateReportParams,
): BaseSepoliaLaunchGateReport {
  validateLaunchGateParams(params);
  validateHealthReport(params.health);

  const readiness = createReadinessCheck(params.checkpoint, params.manifestContents);
  const releaseStatus = createReleaseStatusCheck(params.releaseStatusJson);
  const health = createHealthCheck(params.health);
  const localPreflight = params.localPreflight === undefined
    ? undefined
    : createLocalPreflightCheck(params.localPreflight, params.manifestPath, params.releaseStatusPath);
  const securityEvidence = params.securityEvidence === undefined
    ? undefined
    : createSecurityEvidenceCheck(params.securityEvidence);
  const economicPayoutSummary = params.economicPayoutSummaryVerification === undefined
    ? undefined
    : createEconomicPayoutSummaryCheck(params.economicPayoutSummaryVerification);
  const manifestConsistency = createManifestConsistencyCheck(
    params.manifestPath,
    params.manifestContents,
    params.health,
  );
  const checks = [
    readiness,
    releaseStatus,
    ...(localPreflight === undefined ? [] : [localPreflight]),
    ...(securityEvidence === undefined ? [] : [securityEvidence]),
    ...(economicPayoutSummary === undefined ? [] : [economicPayoutSummary]),
    health,
    manifestConsistency,
  ];
  const failed = checks.filter((check) => !check.passed).length;
  const passed = checks.length - failed;

  return {
    schemaVersion: 1,
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    manifestPath: params.manifestPath,
    manifestSha256: createHash("sha256").update(params.manifestContents).digest("hex"),
    releaseStatusPath: params.releaseStatusPath,
    commitSha: readCommitSha(params.checkpoint),
    readinessRunUrl: readReadinessRunUrl(params.checkpoint),
    decision: failed === 0 ? "go" : "no-go",
    passed: failed === 0,
    summary: {
      checks: checks.length,
      passed,
      failed,
    },
    checks,
  };
}

export function formatBaseSepoliaLaunchGateSummary(report: BaseSepoliaLaunchGateReport): string {
  validateLaunchGateReport(report);
  return [
    "Base Sepolia launch gate",
    `generatedAt: ${report.generatedAt}`,
    `manifest: ${report.manifestPath}`,
    `manifestSha256: ${report.manifestSha256}`,
    `releaseStatus: ${report.releaseStatusPath}`,
    `commit: ${report.commitSha ?? "unknown"}`,
    `readinessRunUrl: ${report.readinessRunUrl ?? "not recorded"}`,
    `checks: ${report.summary.checks}`,
    `passed: ${report.summary.passed}`,
    `failed: ${report.summary.failed}`,
    `decision: ${report.decision}`,
    ...report.checks.map((check) => `- ${check.id}: ${check.passed ? "passed" : "failed"}`),
  ].join("\n");
}

export function validateLaunchGateReport(report: unknown): asserts report is BaseSepoliaLaunchGateReport {
  const record = requireRecord(report, "launch gate report");
  if (record.schemaVersion !== 1) throw new Error("launch gate report schemaVersion must be 1");
  requireString(record.generatedAt, "launch gate report generatedAt");
  requireString(record.manifestPath, "launch gate report manifestPath");
  requireString(record.manifestSha256, "launch gate report manifestSha256");
  requireString(record.releaseStatusPath, "launch gate report releaseStatusPath");
  if (record.commitSha !== null && typeof record.commitSha !== "string") {
    throw new Error("launch gate report commitSha must be a string or null");
  }
  if (record.readinessRunUrl !== null && typeof record.readinessRunUrl !== "string") {
    throw new Error("launch gate report readinessRunUrl must be a string or null");
  }
  if (record.decision !== "go" && record.decision !== "no-go") {
    throw new Error("launch gate report decision must be go or no-go");
  }
  if (typeof record.passed !== "boolean") throw new Error("launch gate report passed must be a boolean");
  validateLaunchGateSummary(record.summary);
  if (!Array.isArray(record.checks)) throw new Error("launch gate report checks must be an array");
  record.checks.forEach(validateLaunchGateCheck);
}

function createReadinessCheck(checkpoint: unknown, manifestContents: string): BaseSepoliaLaunchGateCheck {
  const verification = verifyReadinessCheckpoint(checkpoint, { manifestContents, requireRunUrl: true });
  const failures = [...verification.failures];
  const readiness = isRecord(checkpoint) && isRecord(checkpoint.readiness) ? checkpoint.readiness : undefined;
  if (readiness !== undefined && isRecord(readiness.summary) && readiness.summary.overall !== "passed") {
    failures.push("readiness overall must be passed");
  }

  return {
    id: "readiness-checkpoint",
    label: "Readiness checkpoint",
    passed: failures.length === 0,
    failures,
  };
}

function createReleaseStatusCheck(statusJson: string): BaseSepoliaLaunchGateCheck {
  const verification = verifyBaseSepoliaReleaseStatusSnapshot(statusJson);
  return {
    id: "release-status",
    label: "Release status",
    passed: verification.passed,
    failures: verification.failures,
  };
}

function createHealthCheck(health: BaseSepoliaHealthReport): BaseSepoliaLaunchGateCheck {
  const failures = health.passed
    ? []
    : [`health report failed ${health.summary.failed} check${health.summary.failed === 1 ? "" : "s"}`];
  return {
    id: "health",
    label: "Health report",
    passed: failures.length === 0,
    failures,
  };
}

function createLocalPreflightCheck(
  report: unknown,
  manifestPath: string,
  releaseStatusPath: string,
): BaseSepoliaLaunchGateCheck {
  validateLocalPreflightReport(report);
  const failures: string[] = [];
  if (!report.passed) {
    const failedChecks = report.checks.filter((check) => !check.passed).length;
    failures.push(
      failedChecks === 0
        ? "local preflight report failed"
        : `local preflight report failed ${failedChecks} check${failedChecks === 1 ? "" : "s"}`,
    );
  }
  if (report.manifest !== undefined && report.manifest !== manifestPath) {
    failures.push("local preflight manifest path does not match launch manifest path");
  }
  if (report.status !== undefined && report.status !== releaseStatusPath) {
    failures.push("local preflight status path does not match launch release status path");
  }

  return {
    id: "local-preflight",
    label: "Local preflight",
    passed: failures.length === 0,
    failures,
  };
}

function createSecurityEvidenceCheck(report: unknown): BaseSepoliaLaunchGateCheck {
  validateBaseSecurityEvidenceReport(report);
  const failures = report.passed
    ? []
    : [`security evidence report failed ${report.summary.failed} check${report.summary.failed === 1 ? "" : "s"}`];
  return {
    id: "security-evidence",
    label: "Security evidence",
    passed: failures.length === 0,
    failures,
  };
}

function createEconomicPayoutSummaryCheck(report: unknown): BaseSepoliaLaunchGateCheck {
  validateEconomicPayoutSummaryVerification(report);
  const failures = report.passed
    ? []
    : report.failures.length === 0
      ? ["economic payout summary verification failed"]
      : report.failures.map((failure) => `economic payout summary verification failed: ${failure}`);
  return {
    id: "economic-payout-summary",
    label: "Economic payout summary",
    passed: failures.length === 0,
    failures,
  };
}

function createManifestConsistencyCheck(
  manifestPath: string,
  manifestContents: string,
  health: BaseSepoliaHealthReport,
): BaseSepoliaLaunchGateCheck {
  const manifestSha256 = createHash("sha256").update(manifestContents).digest("hex");
  const failures: string[] = [];
  if (health.manifest.path !== manifestPath) failures.push("health manifest path does not match launch manifest path");
  if (health.manifest.sha256 !== manifestSha256) failures.push("health manifest SHA-256 does not match launch manifest");

  return {
    id: "manifest-consistency",
    label: "Manifest consistency",
    passed: failures.length === 0,
    failures,
  };
}

function readCommitSha(checkpoint: unknown): string | null {
  if (!isRecord(checkpoint) || !isRecord(checkpoint.commit) || typeof checkpoint.commit.sha !== "string") return null;
  return checkpoint.commit.sha;
}

function readReadinessRunUrl(checkpoint: unknown): string | null {
  if (!isRecord(checkpoint) || !isRecord(checkpoint.readiness) || typeof checkpoint.readiness.runUrl !== "string") {
    return null;
  }
  return checkpoint.readiness.runUrl;
}

function validateLaunchGateParams(params: unknown): asserts params is CreateBaseSepoliaLaunchGateReportParams {
  const record = requireRecord(params, "launch gate params");
  requireString(record.manifestPath, "manifest path");
  requireString(record.manifestContents, "manifest contents");
  requireString(record.releaseStatusPath, "release status path");
  requireString(record.releaseStatusJson, "release status JSON");
  if (record.generatedAt !== undefined && typeof record.generatedAt !== "string") {
    throw new Error("generatedAt must be a string");
  }
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

function validateLaunchGateSummary(value: unknown): void {
  const record = requireRecord(value, "launch gate report summary");
  for (const field of ["checks", "passed", "failed"]) {
    if (!Number.isInteger(record[field]) || Number(record[field]) < 0) {
      throw new Error(`launch gate report summary ${field} must be a non-negative integer`);
    }
  }
}

function validateLaunchGateCheck(value: unknown, index: number): void {
  const record = requireRecord(value, `launch gate report check ${index}`);
  requireString(record.id, `launch gate report check ${index} id`);
  requireString(record.label, `launch gate report check ${index} label`);
  if (typeof record.passed !== "boolean") throw new Error(`launch gate report check ${index} passed must be a boolean`);
  if (!Array.isArray(record.failures)) throw new Error(`launch gate report check ${index} failures must be an array`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${field} must be an object`);
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} must be a non-empty string`);
  return value;
}
