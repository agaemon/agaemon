import { validateHealthReport } from "../launch/health.js";
import { validateLaunchGateReport } from "../launch/gate.js";
import { verifyBaseSepoliaReleaseStatusSnapshot } from "../release/status.js";
import { validateOperatorDashboardSnapshot } from "./dashboard.js";
import { validateOperatorDashboardVerification } from "./dashboardVerify.js";

import type { EconomicPayoutSummaryVerification } from "../economics/summaryVerify.js";
import type { AgentOsEventIndex } from "../indexer/events.js";
import type { AgentOsEventIndexVerification } from "../indexer/verify.js";
import type { BaseSepoliaHealthReport } from "../launch/health.js";
import type { BaseSepoliaLaunchGateReport } from "../launch/gate.js";
import type { OperatorDashboardSnapshot } from "./dashboard.js";
import type { OperatorDashboardVerification } from "./dashboardVerify.js";

export const FUNDING_READY_OPERATOR_DEMO_OBJECTIVE =
  "AgentOS Kernel becomes a credible funding-ready AI x blockchain proof.";

export interface FundingReadyOperatorDemoSource {
  path: string;
}

export interface FundingReadyOperatorDemoCheck {
  id: string;
  label: string;
  passed: boolean;
  failures: string[];
  source?: FundingReadyOperatorDemoSource | undefined;
}

export interface FundingReadyEconomicAbuseSignalSummary {
  count: number;
  amountWei: string;
}

export interface FundingReadyOperatorDemoReport {
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
  evidence: {
    launchGate: FundingReadyOperatorDemoSource;
    health: FundingReadyOperatorDemoSource;
    releaseStatus: FundingReadyOperatorDemoSource;
    eventIndex: FundingReadyOperatorDemoSource;
    eventIndexVerification: FundingReadyOperatorDemoSource;
    economicPayoutSummaryVerification: FundingReadyOperatorDemoSource;
    memoryStorageBinding?: FundingReadyOperatorDemoSource | undefined;
    memoryStorageBindingVerification?: FundingReadyOperatorDemoSource | undefined;
    memoryStorageMigrationVerification?: FundingReadyOperatorDemoSource | undefined;
    dashboard: FundingReadyOperatorDemoSource;
    dashboardVerification: FundingReadyOperatorDemoSource;
  };
  checks: FundingReadyOperatorDemoCheck[];
}

export interface VerifyFundingReadyOperatorDemoReportParams {
  saved: FundingReadyOperatorDemoReport;
  expected: FundingReadyOperatorDemoReport;
}

export interface FundingReadyOperatorDemoVerification {
  passed: boolean;
  failures: string[];
  expected: FundingReadyOperatorDemoReport;
}

export interface CreateFundingReadyOperatorDemoReportParams {
  generatedAt?: string | undefined;
  launchGatePath: string;
  launchGate: BaseSepoliaLaunchGateReport;
  healthPath: string;
  health: BaseSepoliaHealthReport;
  releaseStatusPath: string;
  releaseStatusJson: string;
  eventIndexPath: string;
  eventIndex: AgentOsEventIndex;
  eventIndexVerificationPath: string;
  eventIndexVerification: AgentOsEventIndexVerification;
  economicPayoutSummaryVerificationPath: string;
  economicPayoutSummaryVerification: EconomicPayoutSummaryVerification;
  dashboardPath: string;
  dashboard: OperatorDashboardSnapshot;
  dashboardVerificationPath: string;
  dashboardVerification: OperatorDashboardVerification;
}

export function createFundingReadyOperatorDemoReport(
  params: CreateFundingReadyOperatorDemoReportParams,
): FundingReadyOperatorDemoReport {
  validateFundingReadyOperatorDemoParams(params);
  const generatedAt = params.generatedAt ?? new Date().toISOString();
  const checks = [
    createLaunchGateCheck(params.launchGate, params.launchGatePath),
    createHealthCheck(params.health, params.healthPath),
    createReleaseStatusCheck(params.releaseStatusJson, params.releaseStatusPath),
    createEventIndexCheck(params.eventIndex, params.eventIndexVerification, params.eventIndexVerificationPath),
    createEconomicEvidenceCheck(
      params.economicPayoutSummaryVerification,
      params.dashboard,
      params.economicPayoutSummaryVerificationPath,
    ),
    createDashboardCheck(params.dashboard, params.dashboardVerification, params.dashboardVerificationPath),
    createTrustBoundaryCheck(params.health, params.dashboard),
  ];
  const failed = checks.filter((check) => !check.passed).length;
  const passed = checks.length - failed;

  return {
    schemaVersion: 1,
    generatedAt,
    network: "base-sepolia",
    objective: FUNDING_READY_OPERATOR_DEMO_OBJECTIVE,
    passed: failed === 0,
    summary: {
      checks: checks.length,
      passed,
      failed,
    },
    economicAbuseSignals: {
      count: params.dashboard.economics?.payoutSummary?.abuseSignalCount ?? 0,
      amountWei: params.dashboard.economics?.payoutSummary?.abuseSignalAmountWei ?? "0",
    },
    trustBoundary: {
      ai: "proposes",
      policy: "decides",
      accounts: "execute",
      mainnet: false,
      liveFunds: false,
    },
    evidence: {
      launchGate: { path: params.launchGatePath },
      health: { path: params.healthPath },
      releaseStatus: { path: params.releaseStatusPath },
      eventIndex: { path: params.eventIndexPath },
      eventIndexVerification: { path: params.eventIndexVerificationPath },
      economicPayoutSummaryVerification: { path: params.economicPayoutSummaryVerificationPath },
      ...(params.dashboard.memoryStorage === undefined
        ? {}
        : {
            memoryStorageBinding: { path: params.dashboard.memoryStorage.source.path },
            memoryStorageBindingVerification: { path: params.dashboard.memoryStorage.verificationSource.path },
            ...(params.dashboard.memoryStorage.migration === undefined
              ? {}
              : {
                  memoryStorageMigrationVerification: {
                    path: params.dashboard.memoryStorage.migration.source.path,
                  },
                }),
          }),
      dashboard: { path: params.dashboardPath },
      dashboardVerification: { path: params.dashboardVerificationPath },
    },
    checks,
  };
}

export function formatFundingReadyOperatorDemoSummary(report: FundingReadyOperatorDemoReport): string {
  validateFundingReadyOperatorDemoReport(report);
  return [
    "AgentOS funding-ready operator demo",
    `objective: ${report.objective}`,
    `network: ${report.network}`,
    `overall: ${report.passed ? "passed" : "failed"}`,
    `checks: ${report.summary.passed} passed, ${report.summary.failed} failed`,
    `economicAbuseSignals: count=${report.economicAbuseSignals.count} amountWei=${report.economicAbuseSignals.amountWei}`,
    "trustBoundary: AI proposes, policy decides, accounts execute",
    ...report.checks.map((check) => `- ${check.id}: ${check.passed ? "passed" : "failed"}`),
    ...report.checks.flatMap((check) => check.failures.map((failure) => `  - ${check.id}: ${failure}`)),
  ].join("\n");
}

export function verifyFundingReadyOperatorDemoReport(
  params: VerifyFundingReadyOperatorDemoReportParams,
): FundingReadyOperatorDemoVerification {
  validateFundingReadyOperatorDemoReport(params.saved);
  validateFundingReadyOperatorDemoReport(params.expected);
  const failures = JSON.stringify(withoutGeneratedAt(params.saved), null, 2) ===
    JSON.stringify(withoutGeneratedAt(params.expected), null, 2)
    ? []
    : ["funding-ready operator demo proof is stale"];

  return {
    passed: failures.length === 0,
    failures,
    expected: params.expected,
  };
}

export function formatFundingReadyOperatorDemoVerificationSummary(
  verification: FundingReadyOperatorDemoVerification,
): string {
  validateFundingReadyOperatorDemoVerification(verification);
  return [
    "Funding-ready operator demo verification",
    `passed: ${verification.passed}`,
    `failures: ${verification.failures.length}`,
    ...verification.failures.map((failure) => `- ${failure}`),
  ].join("\n");
}

export function validateFundingReadyOperatorDemoVerification(
  verification: unknown,
): asserts verification is FundingReadyOperatorDemoVerification {
  const record = requireRecord(verification, "funding-ready operator demo verification");
  requireBoolean(record.passed, "funding-ready operator demo verification passed");
  if (!Array.isArray(record.failures) || record.failures.some((failure) => typeof failure !== "string")) {
    throw new Error("funding-ready operator demo verification failures must be an array of strings");
  }
  validateFundingReadyOperatorDemoReport(record.expected);
}

export function validateFundingReadyOperatorDemoReport(
  report: unknown,
): asserts report is FundingReadyOperatorDemoReport {
  const record = requireRecord(report, "funding-ready operator demo report");
  if (record.schemaVersion !== 1) throw new Error("funding-ready operator demo schemaVersion must be 1");
  requireString(record.generatedAt, "funding-ready operator demo generatedAt");
  if (record.network !== "base-sepolia") throw new Error("funding-ready operator demo network must be base-sepolia");
  if (record.objective !== FUNDING_READY_OPERATOR_DEMO_OBJECTIVE) {
    throw new Error("funding-ready operator demo objective is not supported");
  }
  requireBoolean(record.passed, "funding-ready operator demo passed");
  validateSummary(record.summary);
  validateEconomicAbuseSignalSummary(record.economicAbuseSignals, "funding-ready operator demo economicAbuseSignals");
  validateTrustBoundary(record.trustBoundary);
  validateEvidence(record.evidence);
  if (!Array.isArray(record.checks)) throw new Error("funding-ready operator demo checks must be an array");
  record.checks.forEach(validateCheck);
}

function validateFundingReadyOperatorDemoParams(params: CreateFundingReadyOperatorDemoReportParams): void {
  requireString(params.launchGatePath, "launch gate path");
  validateLaunchGateReport(params.launchGate);
  requireString(params.healthPath, "health path");
  validateHealthReport(params.health);
  requireString(params.releaseStatusPath, "release status path");
  requireString(params.releaseStatusJson, "release status JSON");
  requireString(params.eventIndexPath, "event index path");
  validateEventIndex(params.eventIndex);
  requireString(params.eventIndexVerificationPath, "event index verification path");
  validateEventIndexVerification(params.eventIndexVerification);
  requireString(params.economicPayoutSummaryVerificationPath, "economic payout summary verification path");
  validateEconomicPayoutSummaryVerification(params.economicPayoutSummaryVerification);
  requireString(params.dashboardPath, "dashboard path");
  validateOperatorDashboardSnapshot(params.dashboard);
  requireString(params.dashboardVerificationPath, "dashboard verification path");
  validateOperatorDashboardVerification(params.dashboardVerification);
}

function createLaunchGateCheck(
  launchGate: BaseSepoliaLaunchGateReport,
  sourcePath: string,
): FundingReadyOperatorDemoCheck {
  const failures = [
    ...(launchGate.decision === "go" ? [] : ["launch gate decision must be go"]),
    ...(launchGate.passed ? [] : ["launch gate report must be passed"]),
  ];

  return createCheck("launch-gate", "Launch gate is go", failures, sourcePath);
}

function createHealthCheck(health: BaseSepoliaHealthReport, sourcePath: string): FundingReadyOperatorDemoCheck {
  const failures = [
    ...(health.passed ? [] : ["health report must be passed"]),
    ...(health.manifest.network === "base-sepolia" ? [] : ["health manifest network must be base-sepolia"]),
    ...(health.manifest.chainId === 84532 ? [] : ["health manifest chainId must be 84532"]),
  ];

  return createCheck("health", "Monitoring and health evidence is passing", failures, sourcePath);
}

function createReleaseStatusCheck(releaseStatusJson: string, sourcePath: string): FundingReadyOperatorDemoCheck {
  const verification = verifyBaseSepoliaReleaseStatusSnapshot(releaseStatusJson);
  let latest: unknown;
  if (verification.passed) latest = (JSON.parse(releaseStatusJson) as { latest: unknown }).latest;
  const failures = [
    ...verification.failures,
    ...(verification.passed && latest === null ? ["release status must include a latest release"] : []),
  ];

  return createCheck("release-status", "Release status has a latest verified readiness run", failures, sourcePath);
}

function createEventIndexCheck(
  eventIndex: AgentOsEventIndex,
  eventIndexVerification: AgentOsEventIndexVerification,
  sourcePath: string,
): FundingReadyOperatorDemoCheck {
  const failures = [
    ...(eventIndexVerification.passed ? [] : ["event index verification must be passed"]),
    ...(eventIndex.manifest.network === "base-sepolia" ? [] : ["event index network must be base-sepolia"]),
    ...(eventIndex.manifest.chainId === 84532 ? [] : ["event index chainId must be 84532"]),
    ...(Number.isInteger(eventIndex.economicEvents.eventCount)
      ? []
      : ["event index must expose economic event count"]),
  ];

  return createCheck("event-index", "Indexed events are verified and economic events are visible", failures, sourcePath);
}

function createEconomicEvidenceCheck(
  economicPayoutSummaryVerification: EconomicPayoutSummaryVerification,
  dashboard: OperatorDashboardSnapshot,
  sourcePath: string,
): FundingReadyOperatorDemoCheck {
  const expectedAbuseSignals = sumExpectedEconomicPayoutAbuseSignals(economicPayoutSummaryVerification);
  const dashboardPayoutSummary = dashboard.economics?.payoutSummary;
  const failures = [
    ...(economicPayoutSummaryVerification.passed ? [] : ["economic payout summary verification must be passed"]),
    ...(dashboardPayoutSummary?.verified === true
      ? []
      : ["dashboard economic payout summary must be verified"]),
    ...(dashboard.economics?.balances === undefined ? ["dashboard economic balances must be visible"] : []),
    ...(dashboardPayoutSummary?.abuseSignalCount === expectedAbuseSignals.count
      ? []
      : ["dashboard economic abuse-signal count must match verified summary"]),
    ...(dashboardPayoutSummary?.abuseSignalAmountWei === expectedAbuseSignals.amountWei
      ? []
      : ["dashboard economic abuse-signal amount must match verified summary"]),
  ];

  return createCheck("economic-evidence", "Economic evidence is verified and visible", failures, sourcePath);
}

function sumExpectedEconomicPayoutAbuseSignals(
  verification: EconomicPayoutSummaryVerification,
): { count: number; amountWei: string } {
  const signals = [
    verification.expected.abuseSignals.invalidAssignments,
    verification.expected.abuseSignals.ruleOrBudgetBlocks,
    verification.expected.abuseSignals.evidenceMismatches,
    verification.expected.abuseSignals.policyBlocks,
  ];
  return {
    count: signals.reduce((total, signal) => total + signal.count, 0),
    amountWei: signals.reduce((total, signal) => total + BigInt(signal.amountWei), 0n).toString(),
  };
}

function createDashboardCheck(
  dashboard: OperatorDashboardSnapshot,
  dashboardVerification: OperatorDashboardVerification,
  sourcePath: string,
): FundingReadyOperatorDemoCheck {
  const failures = [
    ...(dashboardVerification.passed ? [] : ["operator dashboard verification must be passed"]),
    ...(dashboard.launch.passed && dashboard.launch.decision === "go" ? [] : ["dashboard launch panel must be go"]),
    ...(dashboard.health.passed ? [] : ["dashboard health panel must be passed"]),
    ...(dashboard.eventIndex?.verified === true ? [] : ["dashboard event index panel must be verified"]),
    ...(dashboard.eventIndex?.economicEventCount !== undefined
      ? []
      : ["dashboard must expose indexed economic event count"]),
    ...(dashboard.memoryStorage?.verified === true ? [] : ["dashboard memory storage panel must be verified"]),
    ...(dashboard.memoryStorage?.migration === undefined || dashboard.memoryStorage.migration.verified
      ? []
      : ["dashboard memory storage migration must be verified"]),
  ];

  return createCheck("dashboard", "Operator dashboard presents the full proof", failures, sourcePath);
}

function createTrustBoundaryCheck(
  health: BaseSepoliaHealthReport,
  dashboard: OperatorDashboardSnapshot,
): FundingReadyOperatorDemoCheck {
  const failures = [
    ...(health.manifest.network === "base-sepolia" ? [] : ["demo must stay on Base Sepolia"]),
    ...(dashboard.launch.decision === "go" || dashboard.launch.decision === "no-go"
      ? []
      : ["AI must not be the launch decision authority"]),
  ];

  return createCheck("trust-boundary", "AI proposes, policy decides, accounts execute", failures);
}

function createCheck(
  id: string,
  label: string,
  failures: string[],
  sourcePath?: string | undefined,
): FundingReadyOperatorDemoCheck {
  return {
    id,
    label,
    passed: failures.length === 0,
    failures,
    ...(sourcePath === undefined ? {} : { source: { path: sourcePath } }),
  };
}

function validateEventIndex(index: AgentOsEventIndex): void {
  const record = requireRecord(index, "event index");
  if (record.schemaVersion !== 1) throw new Error("event index schemaVersion must be 1");
  const manifest = requireRecord(record.manifest, "event index manifest");
  requireString(manifest.network, "event index manifest network");
  if (!Number.isInteger(manifest.chainId)) throw new Error("event index manifest chainId must be an integer");
  const economicEvents = requireRecord(record.economicEvents, "event index economicEvents");
  requireNonNegativeInteger(economicEvents.eventCount, "event index economicEvents eventCount");
}

function validateEventIndexVerification(verification: AgentOsEventIndexVerification): void {
  const record = requireRecord(verification, "event index verification");
  requireBoolean(record.passed, "event index verification passed");
  if (!Array.isArray(record.failures) || record.failures.some((failure) => typeof failure !== "string")) {
    throw new Error("event index verification failures must be an array of strings");
  }
}

function validateEconomicPayoutSummaryVerification(verification: EconomicPayoutSummaryVerification): void {
  const record = requireRecord(verification, "economic payout summary verification");
  requireBoolean(record.passed, "economic payout summary verification passed");
  if (!Array.isArray(record.failures) || record.failures.some((failure) => typeof failure !== "string")) {
    throw new Error("economic payout summary verification failures must be an array of strings");
  }
}

function validateSummary(value: unknown): void {
  const record = requireRecord(value, "funding-ready operator demo summary");
  requireNonNegativeInteger(record.checks, "funding-ready operator demo summary checks");
  requireNonNegativeInteger(record.passed, "funding-ready operator demo summary passed");
  requireNonNegativeInteger(record.failed, "funding-ready operator demo summary failed");
}

function validateEconomicAbuseSignalSummary(value: unknown, label: string): void {
  const record = requireRecord(value, label);
  requireNonNegativeInteger(record.count, `${label} count`);
  requireString(record.amountWei, `${label} amountWei`);
}

function validateTrustBoundary(value: unknown): void {
  const record = requireRecord(value, "funding-ready operator demo trustBoundary");
  if (record.ai !== "proposes") throw new Error("funding-ready operator demo trustBoundary ai must be proposes");
  if (record.policy !== "decides") throw new Error("funding-ready operator demo trustBoundary policy must be decides");
  if (record.accounts !== "execute") {
    throw new Error("funding-ready operator demo trustBoundary accounts must be execute");
  }
  if (record.mainnet !== false) throw new Error("funding-ready operator demo trustBoundary mainnet must be false");
  if (record.liveFunds !== false) throw new Error("funding-ready operator demo trustBoundary liveFunds must be false");
}

function validateEvidence(value: unknown): void {
  const record = requireRecord(value, "funding-ready operator demo evidence");
  validateSource(record.launchGate, "funding-ready operator demo launchGate evidence");
  validateSource(record.health, "funding-ready operator demo health evidence");
  validateSource(record.releaseStatus, "funding-ready operator demo releaseStatus evidence");
  validateSource(record.eventIndex, "funding-ready operator demo eventIndex evidence");
  validateSource(record.eventIndexVerification, "funding-ready operator demo eventIndexVerification evidence");
  validateSource(
    record.economicPayoutSummaryVerification,
    "funding-ready operator demo economicPayoutSummaryVerification evidence",
  );
  if (record.memoryStorageBinding !== undefined) {
    validateSource(record.memoryStorageBinding, "funding-ready operator demo memoryStorageBinding evidence");
  }
  if (record.memoryStorageBindingVerification !== undefined) {
    validateSource(
      record.memoryStorageBindingVerification,
      "funding-ready operator demo memoryStorageBindingVerification evidence",
    );
  }
  if (record.memoryStorageMigrationVerification !== undefined) {
    validateSource(
      record.memoryStorageMigrationVerification,
      "funding-ready operator demo memoryStorageMigrationVerification evidence",
    );
  }
  validateSource(record.dashboard, "funding-ready operator demo dashboard evidence");
  validateSource(record.dashboardVerification, "funding-ready operator demo dashboardVerification evidence");
}

function validateCheck(value: unknown): void {
  const record = requireRecord(value, "funding-ready operator demo check");
  requireString(record.id, "funding-ready operator demo check id");
  requireString(record.label, "funding-ready operator demo check label");
  requireBoolean(record.passed, "funding-ready operator demo check passed");
  if (!Array.isArray(record.failures) || record.failures.some((failure) => typeof failure !== "string")) {
    throw new Error("funding-ready operator demo check failures must be an array of strings");
  }
  if (record.source !== undefined) validateSource(record.source, "funding-ready operator demo check source");
}

function validateSource(value: unknown, label: string): void {
  const record = requireRecord(value, label);
  requireString(record.path, `${label} path`);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }

  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);

  return value;
}

function requireBoolean(value: unknown, label: string): void {
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean`);
}

function requireNonNegativeInteger(value: unknown, label: string): void {
  if (!Number.isInteger(value) || Number(value) < 0) throw new Error(`${label} must be a non-negative integer`);
}

function withoutGeneratedAt(
  report: FundingReadyOperatorDemoReport,
): Omit<FundingReadyOperatorDemoReport, "generatedAt"> {
  const { generatedAt: _generatedAt, ...rest } = report;
  return rest;
}
