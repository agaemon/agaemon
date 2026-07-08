import { validateFundingDemoEvidenceManifestVerification } from "./fundingDemoEvidenceManifest.js";
import { validateFundingDemoReviewIndexVerification } from "./fundingDemoReviewIndex.js";
import {
  FUNDING_READY_OPERATOR_DEMO_OBJECTIVE,
  validateFundingReadyOperatorDemoReport,
  validateFundingReadyOperatorDemoVerification,
} from "./fundingReadyDemo.js";

import type { FundingDemoEvidenceManifestVerification } from "./fundingDemoEvidenceManifest.js";
import type { FundingDemoReviewIndexVerification } from "./fundingDemoReviewIndex.js";
import type {
  FundingReadyEconomicAbuseSignalSummary,
  FundingReadyOperatorDemoReport,
  FundingReadyOperatorDemoVerification,
} from "./fundingReadyDemo.js";

export type FundingDemoStatusCheckId =
  | "funding-proof"
  | "funding-proof-verification"
  | "review-index-verification"
  | "evidence-manifest-verification";

export interface FundingDemoStatusSource {
  path: string;
}

export interface FundingDemoStatusCheck {
  id: FundingDemoStatusCheckId;
  label: string;
  passed: boolean;
  source: FundingDemoStatusSource;
  failures: string[];
}

export interface FundingDemoStatus {
  schemaVersion: 1;
  generatedAt: string;
  network: "base-sepolia";
  objective: string;
  passed: boolean;
  summary: {
    checks: number;
    passed: number;
    failed: number;
  };
  economicAbuseSignals: FundingReadyEconomicAbuseSignalSummary;
  trustBoundary: {
    ai: "proposes";
    policy: "decides";
    accounts: "execute";
    mainnet: false;
    liveFunds: false;
  };
  checks: FundingDemoStatusCheck[];
}

export interface CreateFundingDemoStatusParams {
  generatedAt?: string | undefined;
  fundingProof: FundingReadyOperatorDemoReport;
  fundingProofVerification: FundingReadyOperatorDemoVerification;
  reviewIndexVerification: FundingDemoReviewIndexVerification;
  evidenceManifestVerification: FundingDemoEvidenceManifestVerification;
  sources?: Partial<Record<FundingDemoStatusCheckId, FundingDemoStatusSource>> | undefined;
}

export interface VerifyFundingDemoStatusParams {
  saved: FundingDemoStatus;
  expected: FundingDemoStatus;
}

export interface FundingDemoStatusVerification {
  passed: boolean;
  failures: string[];
  expected: FundingDemoStatus;
}

const DEFAULT_SOURCES: Record<FundingDemoStatusCheckId, FundingDemoStatusSource> = {
  "funding-proof": { path: "artifacts/funding-demo/funding-ready-demo.json" },
  "funding-proof-verification": { path: "artifacts/funding-demo/funding-ready-demo-verification.json" },
  "review-index-verification": { path: "artifacts/funding-demo/index-verification.json" },
  "evidence-manifest-verification": { path: "artifacts/funding-demo/evidence-manifest-verification.json" },
};

export function createFundingDemoStatus(params: CreateFundingDemoStatusParams): FundingDemoStatus {
  validateFundingDemoStatusParams(params);
  const sources = { ...DEFAULT_SOURCES, ...params.sources };
  const checks: FundingDemoStatusCheck[] = [
    createCheck({
      id: "funding-proof",
      label: "Funding-ready proof",
      passed: params.fundingProof.passed,
      source: sources["funding-proof"],
      failures: collectFundingProofFailures(params.fundingProof),
    }),
    createCheck({
      id: "funding-proof-verification",
      label: "Funding-ready proof verification",
      passed: params.fundingProofVerification.passed,
      source: sources["funding-proof-verification"],
      failures: params.fundingProofVerification.failures,
    }),
    createCheck({
      id: "review-index-verification",
      label: "Funding demo review index verification",
      passed: params.reviewIndexVerification.passed,
      source: sources["review-index-verification"],
      failures: params.reviewIndexVerification.failures,
    }),
    createCheck({
      id: "evidence-manifest-verification",
      label: "Funding demo evidence manifest verification",
      passed: params.evidenceManifestVerification.passed,
      source: sources["evidence-manifest-verification"],
      failures: params.evidenceManifestVerification.failures,
    }),
  ];
  const failed = checks.filter((check) => !check.passed).length;
  const passed = checks.length - failed;

  return {
    schemaVersion: 1,
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    network: "base-sepolia",
    objective: FUNDING_READY_OPERATOR_DEMO_OBJECTIVE,
    passed: failed === 0,
    summary: { checks: checks.length, passed, failed },
    economicAbuseSignals: { ...params.fundingProof.economicAbuseSignals },
    trustBoundary: {
      ai: "proposes",
      policy: "decides",
      accounts: "execute",
      mainnet: false,
      liveFunds: false,
    },
    checks,
  };
}

export function formatFundingDemoStatusSummary(status: FundingDemoStatus): string {
  validateFundingDemoStatus(status);
  return [
    "Funding demo status",
    `network: ${status.network}`,
    `overall: ${status.passed ? "passed" : "failed"}`,
    `checks: ${status.summary.passed} passed, ${status.summary.failed} failed`,
    `economicAbuseSignals: count=${status.economicAbuseSignals.count} amountWei=${status.economicAbuseSignals.amountWei}`,
    ...status.checks.map((check) => `- ${check.id}: ${check.passed ? "passed" : "failed"}`),
    ...status.checks.flatMap((check) => check.failures.map((failure) => `  - ${check.id}: ${failure}`)),
    "trustBoundary: AI proposes, policy decides, accounts execute",
  ].join("\n");
}

export function verifyFundingDemoStatus(params: VerifyFundingDemoStatusParams): FundingDemoStatusVerification {
  validateFundingDemoStatus(params.saved);
  validateFundingDemoStatus(params.expected);
  const failures = JSON.stringify(withoutGeneratedAt(params.saved), null, 2) ===
    JSON.stringify(withoutGeneratedAt(params.expected), null, 2)
    ? []
    : ["funding demo status is stale"];

  return {
    passed: failures.length === 0,
    failures,
    expected: params.expected,
  };
}

export function formatFundingDemoStatusVerificationSummary(
  verification: FundingDemoStatusVerification,
): string {
  validateFundingDemoStatusVerification(verification);
  return [
    "Funding demo status verification",
    `passed: ${verification.passed}`,
    `failures: ${verification.failures.length}`,
    ...verification.failures.map((failure) => `- ${failure}`),
  ].join("\n");
}

export function validateFundingDemoStatusVerification(
  verification: unknown,
): asserts verification is FundingDemoStatusVerification {
  const record = requireRecord(verification, "funding demo status verification");
  requireBoolean(record.passed, "funding demo status verification passed");
  if (!Array.isArray(record.failures) || record.failures.some((failure) => typeof failure !== "string")) {
    throw new Error("funding demo status verification failures must be an array of strings");
  }
  validateFundingDemoStatus(record.expected);
}

export function validateFundingDemoStatus(status: unknown): asserts status is FundingDemoStatus {
  const record = requireRecord(status, "funding demo status");
  if (record.schemaVersion !== 1) throw new Error("funding demo status schemaVersion must be 1");
  requireString(record.generatedAt, "funding demo status generatedAt");
  if (record.network !== "base-sepolia") throw new Error("funding demo status network must be base-sepolia");
  if (record.objective !== FUNDING_READY_OPERATOR_DEMO_OBJECTIVE) {
    throw new Error("funding demo status objective is not supported");
  }
  requireBoolean(record.passed, "funding demo status passed");
  validateSummary(record.summary);
  validateEconomicAbuseSignalSummary(record.economicAbuseSignals, "funding demo status economicAbuseSignals");
  validateTrustBoundary(record.trustBoundary);
  if (!Array.isArray(record.checks)) throw new Error("funding demo status checks must be an array");
  record.checks.forEach(validateCheck);
}

function validateFundingDemoStatusParams(params: CreateFundingDemoStatusParams): void {
  validateFundingReadyOperatorDemoReport(params.fundingProof);
  validateFundingReadyOperatorDemoVerification(params.fundingProofVerification);
  validateFundingDemoReviewIndexVerification(params.reviewIndexVerification);
  validateFundingDemoEvidenceManifestVerification(params.evidenceManifestVerification);
  if (params.sources !== undefined) {
    const sources = requireRecord(params.sources, "funding demo status sources");
    Object.values(sources).forEach(validateSource);
  }
}

function createCheck(check: FundingDemoStatusCheck): FundingDemoStatusCheck {
  validateCheck(check);
  return { ...check, failures: [...check.failures] };
}

function collectFundingProofFailures(report: FundingReadyOperatorDemoReport): string[] {
  const failures = report.checks.flatMap((check) => check.failures);
  return report.passed || failures.length > 0 ? failures : ["funding-ready proof failed"];
}

function withoutGeneratedAt(status: FundingDemoStatus): Omit<FundingDemoStatus, "generatedAt"> {
  const { generatedAt: _generatedAt, ...rest } = status;
  return rest;
}

function validateSummary(value: unknown): void {
  const record = requireRecord(value, "funding demo status summary");
  requireNonNegativeInteger(record.checks, "funding demo status summary checks");
  requireNonNegativeInteger(record.passed, "funding demo status summary passed");
  requireNonNegativeInteger(record.failed, "funding demo status summary failed");
}

function validateEconomicAbuseSignalSummary(value: unknown, label: string): void {
  const record = requireRecord(value, label);
  requireNonNegativeInteger(record.count, `${label} count`);
  requireString(record.amountWei, `${label} amountWei`);
}

function validateTrustBoundary(value: unknown): void {
  const record = requireRecord(value, "funding demo status trustBoundary");
  if (record.ai !== "proposes") throw new Error("funding demo status trustBoundary ai must be proposes");
  if (record.policy !== "decides") throw new Error("funding demo status trustBoundary policy must be decides");
  if (record.accounts !== "execute") throw new Error("funding demo status trustBoundary accounts must be execute");
  if (record.mainnet !== false) throw new Error("funding demo status trustBoundary mainnet must be false");
  if (record.liveFunds !== false) throw new Error("funding demo status trustBoundary liveFunds must be false");
}

function validateCheck(value: unknown): void {
  const record = requireRecord(value, "funding demo status check");
  validateCheckId(record.id);
  requireString(record.label, "funding demo status check label");
  requireBoolean(record.passed, "funding demo status check passed");
  validateSource(record.source);
  if (!Array.isArray(record.failures) || record.failures.some((failure) => typeof failure !== "string")) {
    throw new Error("funding demo status check failures must be an array of strings");
  }
}

function validateCheckId(value: unknown): asserts value is FundingDemoStatusCheckId {
  if (
    value !== "funding-proof" &&
    value !== "funding-proof-verification" &&
    value !== "review-index-verification" &&
    value !== "evidence-manifest-verification"
  ) {
    throw new Error("funding demo status check id is not supported");
  }
}

function validateSource(value: unknown): void {
  const record = requireRecord(value, "funding demo status source");
  requireString(record.path, "funding demo status source path");
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }

  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
}

function requireBoolean(value: unknown, label: string): asserts value is boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean`);
}

function requireNonNegativeInteger(value: unknown, label: string): void {
  if (!Number.isInteger(value) || Number(value) < 0) throw new Error(`${label} must be a non-negative integer`);
}
