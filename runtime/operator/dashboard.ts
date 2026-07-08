import {
  DEFAULT_AGENT_METADATA_URI,
  DEFAULT_AGENT_ROLE_LABEL,
} from "../base/deploymentManifest.js";
import { validateLaunchGateReport } from "../launch/gate.js";
import { validateHealthReport } from "../launch/health.js";
import { verifyBaseSepoliaReleaseStatusSnapshot } from "../release/status.js";

import type { DeploymentManifest } from "../base/deploymentManifest.js";
import type { BaseSepoliaLaunchGateReport } from "../launch/gate.js";
import type { BaseSepoliaHealthReport } from "../launch/health.js";
import type { AgentOsEventIndex } from "../indexer/events.js";
import type { AgentOsEventIndexVerification } from "../indexer/verify.js";
import type { EconomicPayoutSummary } from "../economics/summary.js";
import type { EconomicPayoutSummaryVerification } from "../economics/summaryVerify.js";

export interface OperatorDashboardSourceLink {
  path: string;
}

export interface OperatorDashboardSnapshot {
  schemaVersion: 1;
  generatedAt: string;
  launch: {
    decision: "go" | "no-go";
    passed: boolean;
    failedChecks: number;
    source: OperatorDashboardSourceLink;
  };
  health: {
    passed: boolean;
    failedChecks: number;
    warnings: number;
    source: OperatorDashboardSourceLink;
  };
  agent: {
    address: string;
    roleLabel: string;
    metadataURI: string;
    source: OperatorDashboardSourceLink;
  };
  release: {
    latestCommitSha: string | null;
    latestGeneratedAt: string | null;
    latestReadinessRunUrl: string | null;
    source: OperatorDashboardSourceLink;
  };
  eventIndex?: {
    verified: boolean;
    indexedEventCount: number;
    economicEventCount: number;
    economicContracts: { contract: string; eventCount: number }[];
    storeSha256?: string | undefined;
    source: OperatorDashboardSourceLink;
    verificationSource: OperatorDashboardSourceLink;
  } | undefined;
  economics?: {
    balances?: {
      ownerBalanceWei: string;
      agentBalanceWei: string;
      source: OperatorDashboardSourceLink;
    } | undefined;
    payoutSummary?: {
      totalAssignments: number;
      paidAssignments: number;
      unpaidAssignments: number;
      blockedAssignments: number;
      totalAmountWei: string;
      paidAmountWei: string;
      unpaidAmountWei: string;
      blockedAmountWei: string;
      lowestRemainingPeriodWei: string;
      verified: boolean;
      budgetFailureCount: number;
      abuseSignalCount: number;
      abuseSignalAmountWei: string;
      source: OperatorDashboardSourceLink;
      verificationSource?: OperatorDashboardSourceLink | undefined;
    } | undefined;
  } | undefined;
  memoryStorage?: {
    verified: boolean;
    memoryIdLabel: string;
    publisher: string;
    storageURI: string;
    contentHash: string;
    source: OperatorDashboardSourceLink;
    verificationSource: OperatorDashboardSourceLink;
    migration?: {
      verified: boolean;
      source: OperatorDashboardSourceLink;
      fromSource: OperatorDashboardSourceLink;
      toSource: OperatorDashboardSourceLink;
    } | undefined;
  } | undefined;
}

export interface OperatorDashboardMemoryStorageBindingReport {
  schemaVersion: 1;
  memoryIdLabel: string;
  binding: {
    record: {
      publisher: string;
      storageURI: string;
      contentHash: string;
    };
  };
  verification: {
    passed: boolean;
  };
}

export interface OperatorDashboardMemoryStorageBindingVerificationReport {
  schemaVersion: 1;
  passed: boolean;
}

export interface OperatorDashboardMemoryStorageMigrationVerificationReport {
  schemaVersion: 1;
  fromPath: string;
  toPath: string;
  passed: boolean;
}

export interface CreateOperatorDashboardSnapshotParams {
  generatedAt?: string | undefined;
  manifestPath: string;
  manifest: DeploymentManifest;
  launchGatePath: string;
  launchGate: BaseSepoliaLaunchGateReport;
  healthPath: string;
  health: BaseSepoliaHealthReport;
  releaseStatusPath: string;
  releaseStatusJson: string;
  eventIndexPath?: string | undefined;
  eventIndexVerificationPath?: string | undefined;
  eventIndex?: AgentOsEventIndex | undefined;
  eventIndexVerification?: AgentOsEventIndexVerification | undefined;
  economicPayoutSummaryPath?: string | undefined;
  economicPayoutSummary?: EconomicPayoutSummary | undefined;
  economicPayoutSummaryVerificationPath?: string | undefined;
  economicPayoutSummaryVerification?: EconomicPayoutSummaryVerification | undefined;
  memoryStorageBindingPath?: string | undefined;
  memoryStorageBinding?: OperatorDashboardMemoryStorageBindingReport | undefined;
  memoryStorageBindingVerificationPath?: string | undefined;
  memoryStorageBindingVerification?: OperatorDashboardMemoryStorageBindingVerificationReport | undefined;
  memoryStorageMigrationVerificationPath?: string | undefined;
  memoryStorageMigrationVerification?: OperatorDashboardMemoryStorageMigrationVerificationReport | undefined;
}

export function createOperatorDashboardSnapshot(
  params: CreateOperatorDashboardSnapshotParams,
): OperatorDashboardSnapshot {
  validateDashboardParams(params);
  validateLaunchGateReport(params.launchGate);
  validateHealthReport(params.health);
  const release = readLatestRelease(params.releaseStatusJson);
  const eventIndex = createEventIndexPanel(params);
  const economics = createEconomicsPanel(params);
  const memoryStorage = createMemoryStoragePanel(params);

  return {
    schemaVersion: 1,
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    launch: {
      decision: params.launchGate.decision,
      passed: params.launchGate.passed,
      failedChecks: params.launchGate.summary.failed,
      source: { path: params.launchGatePath },
    },
    health: {
      passed: params.health.passed,
      failedChecks: params.health.summary.failed,
      warnings: params.health.summary.warnings,
      source: { path: params.healthPath },
    },
    agent: {
      address: params.manifest.contracts.agentAccount,
      roleLabel: params.manifest.agentProfile?.roleLabel ?? DEFAULT_AGENT_ROLE_LABEL,
      metadataURI: params.manifest.agentProfile?.metadataURI ?? DEFAULT_AGENT_METADATA_URI,
      source: { path: params.manifestPath },
    },
    release: {
      latestCommitSha: release.latestCommitSha,
      latestGeneratedAt: release.latestGeneratedAt,
      latestReadinessRunUrl: release.latestReadinessRunUrl,
      source: { path: params.releaseStatusPath },
    },
    ...(eventIndex === undefined ? {} : { eventIndex }),
    ...(economics === undefined ? {} : { economics }),
    ...(memoryStorage === undefined ? {} : { memoryStorage }),
  };
}

export function formatOperatorDashboardSnapshotSummary(snapshot: OperatorDashboardSnapshot): string {
  validateOperatorDashboardSnapshot(snapshot);
  return [
    "Operator dashboard snapshot",
    `generatedAt: ${snapshot.generatedAt}`,
    `launch: ${snapshot.launch.decision}`,
    `health: ${snapshot.health.passed ? "passed" : "failed"}`,
    `agent: ${snapshot.agent.address}`,
    `release: ${snapshot.release.latestCommitSha ?? "none"}`,
    ...(snapshot.eventIndex === undefined
      ? []
      : [
          `eventIndex: ${snapshot.eventIndex.verified ? "verified" : "unverified"} (${snapshot.eventIndex.indexedEventCount} events, ${snapshot.eventIndex.economicEventCount} economic)`,
          ...(snapshot.eventIndex.storeSha256 === undefined
            ? []
            : [`eventIndexStoreSha256: ${snapshot.eventIndex.storeSha256}`]),
        ]),
    ...(snapshot.economics === undefined
      ? []
      : [
          ...(snapshot.economics.balances === undefined
            ? []
            : [
                `economicBalances: owner=${snapshot.economics.balances.ownerBalanceWei} agent=${snapshot.economics.balances.agentBalanceWei}`,
              ]),
          ...(snapshot.economics.payoutSummary === undefined
            ? []
            : [
                `economicPayouts: ${snapshot.economics.payoutSummary.verified ? "verified" : "unverified"} total=${snapshot.economics.payoutSummary.totalAssignments} paid=${snapshot.economics.payoutSummary.paidAssignments} unpaid=${snapshot.economics.payoutSummary.unpaidAssignments} blocked=${snapshot.economics.payoutSummary.blockedAssignments} budgetFailures=${snapshot.economics.payoutSummary.budgetFailureCount} abuseSignals=${snapshot.economics.payoutSummary.abuseSignalCount} abuseSignalAmountWei=${snapshot.economics.payoutSummary.abuseSignalAmountWei}`,
              ]),
        ]),
    ...(snapshot.memoryStorage === undefined
      ? []
      : [
          `memoryStorage: ${snapshot.memoryStorage.verified ? "verified" : "unverified"} ${snapshot.memoryStorage.publisher} ${snapshot.memoryStorage.memoryIdLabel}`,
          ...(snapshot.memoryStorage.migration === undefined
            ? []
            : [
                `memoryMigration: ${snapshot.memoryStorage.migration.verified ? "verified" : "unverified"} ${snapshot.memoryStorage.migration.fromSource.path} -> ${snapshot.memoryStorage.migration.toSource.path}`,
              ]),
        ]),
  ].join("\n");
}

export function validateOperatorDashboardSnapshot(snapshot: unknown): asserts snapshot is OperatorDashboardSnapshot {
  const record = requireRecord(snapshot, "operator dashboard snapshot");
  if (record.schemaVersion !== 1) throw new Error("operator dashboard snapshot schemaVersion must be 1");
  requireString(record.generatedAt, "operator dashboard snapshot generatedAt");
  validateLaunchPanel(record.launch);
  validateHealthPanel(record.health);
  validateAgentPanel(record.agent);
  validateReleasePanel(record.release);
  if (record.eventIndex !== undefined) validateEventIndexPanel(record.eventIndex);
  if (record.economics !== undefined) validateEconomicsPanel(record.economics);
  if (record.memoryStorage !== undefined) validateMemoryStoragePanel(record.memoryStorage);
}

function createEventIndexPanel(params: CreateOperatorDashboardSnapshotParams): OperatorDashboardSnapshot["eventIndex"] {
  if (
    params.eventIndex === undefined ||
    params.eventIndexVerification === undefined ||
    params.eventIndexPath === undefined ||
    params.eventIndexVerificationPath === undefined
  ) {
    return undefined;
  }

  return {
    verified: params.eventIndexVerification.passed,
    indexedEventCount: params.eventIndex.replay.indexedEventCount,
    economicEventCount: params.eventIndex.economicEvents.eventCount,
    economicContracts: params.eventIndex.economicEvents.byContract,
    ...(params.eventIndexVerification.store?.sha256 === undefined
      ? {}
      : { storeSha256: params.eventIndexVerification.store.sha256 }),
    source: { path: params.eventIndexPath },
    verificationSource: { path: params.eventIndexVerificationPath },
  };
}

function createEconomicsPanel(params: CreateOperatorDashboardSnapshotParams): OperatorDashboardSnapshot["economics"] {
  const balances = params.health.operator === undefined
    ? undefined
    : {
        ownerBalanceWei: params.health.operator.ownerBalanceWei,
        agentBalanceWei: params.health.operator.agentBalanceWei,
        source: { path: params.healthPath },
      };
  const payoutSummary = createEconomicPayoutSummaryPanel(params);
  if (balances === undefined && payoutSummary === undefined) return undefined;

  return {
    ...(balances === undefined ? {} : { balances }),
    ...(payoutSummary === undefined ? {} : { payoutSummary }),
  };
}

function createEconomicPayoutSummaryPanel(
  params: CreateOperatorDashboardSnapshotParams,
): NonNullable<OperatorDashboardSnapshot["economics"]>["payoutSummary"] {
  if (params.economicPayoutSummary === undefined || params.economicPayoutSummaryPath === undefined) return undefined;
  const summary = params.economicPayoutSummary;
  const abuseSignalTotals = sumEconomicPayoutAbuseSignals(summary);

  return {
    totalAssignments: summary.totalAssignments,
    paidAssignments: summary.paidAssignments,
    unpaidAssignments: summary.unpaidAssignments,
    blockedAssignments: summary.blockedAssignments,
    totalAmountWei: summary.totalAmountWei,
    paidAmountWei: summary.paidAmountWei,
    unpaidAmountWei: summary.unpaidAmountWei,
    blockedAmountWei: summary.blockedAmountWei,
    lowestRemainingPeriodWei: summary.lowestRemainingPeriodWei,
    verified: params.economicPayoutSummaryVerification?.passed ?? false,
    budgetFailureCount: summary.budgetFailures.length,
    abuseSignalCount: abuseSignalTotals.count,
    abuseSignalAmountWei: abuseSignalTotals.amountWei,
    source: { path: params.economicPayoutSummaryPath },
    ...(params.economicPayoutSummaryVerificationPath === undefined
      ? {}
      : { verificationSource: { path: params.economicPayoutSummaryVerificationPath } }),
  };
}

function sumEconomicPayoutAbuseSignals(summary: EconomicPayoutSummary): { count: number; amountWei: string } {
  const signals = [
    summary.abuseSignals.invalidAssignments,
    summary.abuseSignals.ruleOrBudgetBlocks,
    summary.abuseSignals.evidenceMismatches,
    summary.abuseSignals.policyBlocks,
  ];
  return {
    count: signals.reduce((total, signal) => total + signal.count, 0),
    amountWei: signals.reduce((total, signal) => total + BigInt(signal.amountWei), 0n).toString(),
  };
}

function createMemoryStoragePanel(params: CreateOperatorDashboardSnapshotParams): OperatorDashboardSnapshot["memoryStorage"] {
  if (
    params.memoryStorageBinding === undefined ||
    params.memoryStorageBindingVerification === undefined ||
    params.memoryStorageBindingPath === undefined ||
    params.memoryStorageBindingVerificationPath === undefined
  ) {
    return undefined;
  }
  validateMemoryStorageBindingReport(params.memoryStorageBinding);
  validateMemoryStorageBindingVerificationReport(params.memoryStorageBindingVerification);
  const migration = createMemoryStorageMigrationPanel(params);

  return {
    verified: params.memoryStorageBinding.verification.passed && params.memoryStorageBindingVerification.passed,
    memoryIdLabel: params.memoryStorageBinding.memoryIdLabel,
    publisher: params.memoryStorageBinding.binding.record.publisher,
    storageURI: params.memoryStorageBinding.binding.record.storageURI,
    contentHash: params.memoryStorageBinding.binding.record.contentHash,
    source: { path: params.memoryStorageBindingPath },
    verificationSource: { path: params.memoryStorageBindingVerificationPath },
    ...(migration === undefined ? {} : { migration }),
  };
}

function createMemoryStorageMigrationPanel(
  params: CreateOperatorDashboardSnapshotParams,
): NonNullable<OperatorDashboardSnapshot["memoryStorage"]>["migration"] {
  if (
    params.memoryStorageMigrationVerification === undefined ||
    params.memoryStorageMigrationVerificationPath === undefined
  ) {
    return undefined;
  }
  validateMemoryStorageMigrationVerificationReport(params.memoryStorageMigrationVerification);

  return {
    verified: params.memoryStorageMigrationVerification.passed,
    source: { path: params.memoryStorageMigrationVerificationPath },
    fromSource: { path: params.memoryStorageMigrationVerification.fromPath },
    toSource: { path: params.memoryStorageMigrationVerification.toPath },
  };
}

function readLatestRelease(json: string): {
  latestCommitSha: string | null;
  latestGeneratedAt: string | null;
  latestReadinessRunUrl: string | null;
} {
  const verification = verifyBaseSepoliaReleaseStatusSnapshot(json);
  if (!verification.passed) {
    throw new Error(`release status is invalid: ${verification.failures.join("; ")}`);
  }

  const latest = (JSON.parse(json) as { latest: null | Record<string, unknown> }).latest;
  if (latest === null) {
    return {
      latestCommitSha: null,
      latestGeneratedAt: null,
      latestReadinessRunUrl: null,
    };
  }

  return {
    latestCommitSha: String(latest.commitSha),
    latestGeneratedAt: String(latest.generatedAt),
    latestReadinessRunUrl: String(latest.readinessRunUrl),
  };
}

function validateDashboardParams(params: unknown): asserts params is CreateOperatorDashboardSnapshotParams {
  const record = requireRecord(params, "operator dashboard params");
  requireString(record.manifestPath, "manifest path");
  requireRecord(record.manifest, "manifest");
  requireString(record.launchGatePath, "launch gate path");
  requireString(record.healthPath, "health path");
  requireString(record.releaseStatusPath, "release status path");
  requireString(record.releaseStatusJson, "release status JSON");
  if (record.generatedAt !== undefined) requireString(record.generatedAt, "generatedAt");
  if (record.economicPayoutSummaryPath !== undefined) requireString(record.economicPayoutSummaryPath, "economic payout summary path");
  if (record.economicPayoutSummary !== undefined) requireRecord(record.economicPayoutSummary, "economic payout summary");
  if (record.economicPayoutSummaryVerificationPath !== undefined) {
    requireString(record.economicPayoutSummaryVerificationPath, "economic payout summary verification path");
  }
  if (record.economicPayoutSummaryVerification !== undefined) {
    requireRecord(record.economicPayoutSummaryVerification, "economic payout summary verification");
  }
  if (record.memoryStorageBindingPath !== undefined) requireString(record.memoryStorageBindingPath, "memory storage binding path");
  if (record.memoryStorageBinding !== undefined) requireRecord(record.memoryStorageBinding, "memory storage binding");
  if (record.memoryStorageBindingVerificationPath !== undefined) {
    requireString(record.memoryStorageBindingVerificationPath, "memory storage binding verification path");
  }
  if (record.memoryStorageBindingVerification !== undefined) {
    requireRecord(record.memoryStorageBindingVerification, "memory storage binding verification");
  }
  if (record.memoryStorageMigrationVerificationPath !== undefined) {
    requireString(record.memoryStorageMigrationVerificationPath, "memory storage migration verification path");
  }
  if (record.memoryStorageMigrationVerification !== undefined) {
    requireRecord(record.memoryStorageMigrationVerification, "memory storage migration verification");
  }
}

function validateLaunchPanel(value: unknown): void {
  const record = requireRecord(value, "dashboard launch panel");
  if (record.decision !== "go" && record.decision !== "no-go") throw new Error("dashboard launch decision must be go or no-go");
  requireBoolean(record.passed, "dashboard launch passed");
  requireNonNegativeInteger(record.failedChecks, "dashboard launch failedChecks");
  validateSource(record.source, "dashboard launch source");
}

function validateHealthPanel(value: unknown): void {
  const record = requireRecord(value, "dashboard health panel");
  requireBoolean(record.passed, "dashboard health passed");
  requireNonNegativeInteger(record.failedChecks, "dashboard health failedChecks");
  requireNonNegativeInteger(record.warnings, "dashboard health warnings");
  validateSource(record.source, "dashboard health source");
}

function validateAgentPanel(value: unknown): void {
  const record = requireRecord(value, "dashboard agent panel");
  requireString(record.address, "dashboard agent address");
  requireString(record.roleLabel, "dashboard agent roleLabel");
  requireString(record.metadataURI, "dashboard agent metadataURI");
  validateSource(record.source, "dashboard agent source");
}

function validateReleasePanel(value: unknown): void {
  const record = requireRecord(value, "dashboard release panel");
  if (record.latestCommitSha !== null) requireString(record.latestCommitSha, "dashboard release latestCommitSha");
  if (record.latestGeneratedAt !== null) requireString(record.latestGeneratedAt, "dashboard release latestGeneratedAt");
  if (record.latestReadinessRunUrl !== null) {
    requireString(record.latestReadinessRunUrl, "dashboard release latestReadinessRunUrl");
  }
  validateSource(record.source, "dashboard release source");
}

function validateEventIndexPanel(value: unknown): void {
  const record = requireRecord(value, "dashboard event index panel");
  requireBoolean(record.verified, "dashboard event index verified");
  requireNonNegativeInteger(record.indexedEventCount, "dashboard event index indexedEventCount");
  requireNonNegativeInteger(record.economicEventCount, "dashboard event index economicEventCount");
  validateEconomicContracts(record.economicContracts);
  if (record.storeSha256 !== undefined) requireString(record.storeSha256, "dashboard event index storeSha256");
  validateSource(record.source, "dashboard event index source");
  validateSource(record.verificationSource, "dashboard event index verificationSource");
}

function validateEconomicContracts(value: unknown): void {
  if (!Array.isArray(value)) throw new Error("dashboard event index economicContracts must be an array");
  for (const entry of value) {
    const record = requireRecord(entry, "dashboard event index economic contract");
    requireString(record.contract, "dashboard event index economic contract name");
    requireNonNegativeInteger(record.eventCount, "dashboard event index economic contract eventCount");
  }
}

function validateEconomicsPanel(value: unknown): void {
  const record = requireRecord(value, "dashboard economics panel");
  if (record.balances === undefined && record.payoutSummary === undefined) {
    throw new Error("dashboard economics panel must include balances or payoutSummary");
  }
  if (record.balances !== undefined) validateEconomicBalancesPanel(record.balances);
  if (record.payoutSummary !== undefined) validateEconomicPayoutSummaryPanel(record.payoutSummary);
}

function validateEconomicBalancesPanel(value: unknown): void {
  const record = requireRecord(value, "dashboard economic balances panel");
  requireString(record.ownerBalanceWei, "dashboard economic ownerBalanceWei");
  requireString(record.agentBalanceWei, "dashboard economic agentBalanceWei");
  validateSource(record.source, "dashboard economic balances source");
}

function validateEconomicPayoutSummaryPanel(value: unknown): void {
  const record = requireRecord(value, "dashboard economic payout summary panel");
  requireNonNegativeInteger(record.totalAssignments, "dashboard economic payout totalAssignments");
  requireNonNegativeInteger(record.paidAssignments, "dashboard economic payout paidAssignments");
  requireNonNegativeInteger(record.unpaidAssignments, "dashboard economic payout unpaidAssignments");
  requireNonNegativeInteger(record.blockedAssignments, "dashboard economic payout blockedAssignments");
  requireString(record.totalAmountWei, "dashboard economic payout totalAmountWei");
  requireString(record.paidAmountWei, "dashboard economic payout paidAmountWei");
  requireString(record.unpaidAmountWei, "dashboard economic payout unpaidAmountWei");
  requireString(record.blockedAmountWei, "dashboard economic payout blockedAmountWei");
  requireString(record.lowestRemainingPeriodWei, "dashboard economic payout lowestRemainingPeriodWei");
  requireBoolean(record.verified, "dashboard economic payout verified");
  requireNonNegativeInteger(record.budgetFailureCount, "dashboard economic payout budgetFailureCount");
  requireNonNegativeInteger(record.abuseSignalCount, "dashboard economic payout abuseSignalCount");
  requireString(record.abuseSignalAmountWei, "dashboard economic payout abuseSignalAmountWei");
  validateSource(record.source, "dashboard economic payout source");
  if (record.verificationSource !== undefined) {
    validateSource(record.verificationSource, "dashboard economic payout verificationSource");
  }
}

function validateMemoryStoragePanel(value: unknown): void {
  const record = requireRecord(value, "dashboard memory storage panel");
  requireBoolean(record.verified, "dashboard memory storage verified");
  requireString(record.memoryIdLabel, "dashboard memory storage memoryIdLabel");
  requireString(record.publisher, "dashboard memory storage publisher");
  requireString(record.storageURI, "dashboard memory storage storageURI");
  requireString(record.contentHash, "dashboard memory storage contentHash");
  validateSource(record.source, "dashboard memory storage source");
  validateSource(record.verificationSource, "dashboard memory storage verificationSource");
  if (record.migration !== undefined) validateMemoryStorageMigrationPanel(record.migration);
}

function validateMemoryStorageMigrationPanel(value: unknown): void {
  const record = requireRecord(value, "dashboard memory storage migration panel");
  requireBoolean(record.verified, "dashboard memory storage migration verified");
  validateSource(record.source, "dashboard memory storage migration source");
  validateSource(record.fromSource, "dashboard memory storage migration fromSource");
  validateSource(record.toSource, "dashboard memory storage migration toSource");
}

function validateMemoryStorageBindingReport(value: unknown): asserts value is OperatorDashboardMemoryStorageBindingReport {
  const record = requireRecord(value, "memory storage binding report");
  if (record.schemaVersion !== 1) throw new Error("memory storage binding report schemaVersion must be 1");
  requireString(record.memoryIdLabel, "memory storage binding report memoryIdLabel");
  const binding = requireRecord(record.binding, "memory storage binding report binding");
  const bindingRecord = requireRecord(binding.record, "memory storage binding report record");
  requireString(bindingRecord.publisher, "memory storage binding report publisher");
  requireString(bindingRecord.storageURI, "memory storage binding report storageURI");
  requireString(bindingRecord.contentHash, "memory storage binding report contentHash");
  const verification = requireRecord(record.verification, "memory storage binding report verification");
  requireBoolean(verification.passed, "memory storage binding report verification passed");
}

function validateMemoryStorageBindingVerificationReport(
  value: unknown,
): asserts value is OperatorDashboardMemoryStorageBindingVerificationReport {
  const record = requireRecord(value, "memory storage binding verification report");
  if (record.schemaVersion !== 1) throw new Error("memory storage binding verification report schemaVersion must be 1");
  requireBoolean(record.passed, "memory storage binding verification passed");
}

function validateMemoryStorageMigrationVerificationReport(
  value: unknown,
): asserts value is OperatorDashboardMemoryStorageMigrationVerificationReport {
  const record = requireRecord(value, "memory storage migration verification report");
  if (record.schemaVersion !== 1) {
    throw new Error("memory storage migration verification report schemaVersion must be 1");
  }
  requireString(record.fromPath, "memory storage migration verification fromPath");
  requireString(record.toPath, "memory storage migration verification toPath");
  requireBoolean(record.passed, "memory storage migration verification passed");
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
