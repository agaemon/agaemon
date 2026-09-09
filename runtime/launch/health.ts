import { createHash } from "node:crypto";

import { AGENT_ACCOUNT_REVOCATION_CHECKS } from "../agentCore/account.js";
import { parseDeploymentManifest } from "../base/deploymentManifest.js";
import { verifyBaseSepoliaReleaseStatusSnapshot } from "../release/status.js";

import type { DeploymentManifest } from "../base/deploymentManifest.js";
import type { DeploymentManifestVerifyReport } from "../base/manifestVerifier.js";

export type BaseSepoliaHealthSeverity = "critical" | "warning";

export interface BaseSepoliaHealthCheck {
  id: string;
  label: string;
  severity: BaseSepoliaHealthSeverity;
  passed: boolean;
  failures: string[];
  remediation: string;
}

export interface BaseSepoliaHealthReport {
  schemaVersion: 1;
  generatedAt: string;
  manifest: {
    path: string;
    sha256: string;
    network: string | null;
    chainId: number | null;
    contractCount: number;
    transactionCount: number;
  };
  release: {
    statusPath: string;
    latestCommitSha?: string | undefined;
    latestGeneratedAt?: string | undefined;
    latestReadinessRunUrl?: string | undefined;
  };
  operator?: OperatorAccountState | undefined;
  passed: boolean;
  summary: {
    checks: number;
    passed: number;
    failed: number;
    warnings: number;
  };
  checks: BaseSepoliaHealthCheck[];
}

export interface AgentAccountSafetyReport {
  chainId: number;
  agent: string;
  owner: string;
  paused: boolean;
  capabilities: string;
  policyEngine: string;
  reputationRegistry: string;
  reputation: string;
  checks: Record<string, boolean>;
}

export interface OperatorAccountState {
  owner: string;
  ownerBalanceWei: string;
  ownerPendingNonce: number;
  agentAccount: string;
  agentBalanceWei: string;
}

export interface CreateBaseSepoliaHealthReportParams {
  generatedAt?: string | undefined;
  maxReleaseAgeDays?: number | undefined;
  manifestPath: string;
  manifestContents: string;
  releaseStatusPath: string;
  releaseStatusJson: string;
  manifestVerification?: DeploymentManifestVerifyReport | undefined;
  agentAccountSafety?: unknown;
  operatorAccountState?: unknown;
}

const DEFAULT_MAX_RELEASE_AGE_DAYS = 14;

export function createBaseSepoliaHealthReport(
  params: CreateBaseSepoliaHealthReportParams,
): BaseSepoliaHealthReport {
  validateHealthParams(params);
  const generatedAt = params.generatedAt ?? new Date().toISOString();
  const manifestSha256 = createHash("sha256").update(params.manifestContents).digest("hex");
  const manifestResult = readManifest(params.manifestContents);
  const releaseResult = readReleaseStatus(params.releaseStatusJson);
  const checks: BaseSepoliaHealthCheck[] = [
    manifestShapeCheck(manifestResult),
    releaseStatusCheck(releaseResult),
    releaseManifestShaCheck(manifestSha256, releaseResult.status),
    releaseFreshnessCheck(generatedAt, params.maxReleaseAgeDays ?? DEFAULT_MAX_RELEASE_AGE_DAYS, releaseResult.status),
  ];

  if (params.manifestVerification !== undefined) {
    validateManifestVerification(params.manifestVerification);
    checks.push(liveManifestVerificationCheck(params.manifestVerification));
  }

  if (params.agentAccountSafety !== undefined) {
    validateAgentAccountSafetyReport(params.agentAccountSafety);
    checks.push(agentAccountSafetyCheck(params.agentAccountSafety, manifestResult.manifest));
  }

  if (params.operatorAccountState !== undefined) {
    validateOperatorAccountState(params.operatorAccountState);
    checks.push(operatorAccountStateCheck(params.operatorAccountState, manifestResult.manifest));
  }

  const failed = checks.filter((check) => !check.passed).length;
  const passed = checks.length - failed;

  return {
    schemaVersion: 1,
    generatedAt,
    manifest: {
      path: params.manifestPath,
      sha256: manifestSha256,
      network: manifestResult.manifest?.network ?? null,
      chainId: manifestResult.manifest?.chainId ?? null,
      contractCount: manifestResult.manifest === undefined ? 0 : countDefinedValues(manifestResult.manifest.contracts),
      transactionCount: manifestResult.manifest === undefined ? 0 : countDefinedValues(manifestResult.manifest.transactions),
    },
    release: {
      statusPath: params.releaseStatusPath,
      ...(releaseResult.status?.latestCommitSha === undefined ? {} : { latestCommitSha: releaseResult.status.latestCommitSha }),
      ...(releaseResult.status?.latestGeneratedAt === undefined ? {} : { latestGeneratedAt: releaseResult.status.latestGeneratedAt }),
      ...(releaseResult.status?.latestReadinessRunUrl === undefined ? {} : { latestReadinessRunUrl: releaseResult.status.latestReadinessRunUrl }),
    },
    ...(params.operatorAccountState === undefined ? {} : { operator: params.operatorAccountState }),
    passed: failed === 0,
    summary: {
      checks: checks.length,
      passed,
      failed,
      warnings: checks.filter((check) => !check.passed && check.severity === "warning").length,
    },
    checks,
  };
}

export function formatBaseSepoliaHealthSummary(report: BaseSepoliaHealthReport): string {
  validateHealthReport(report);
  return [
    "Base Sepolia health",
    `generatedAt: ${report.generatedAt}`,
    `manifest: ${report.manifest.path}`,
    `releaseStatus: ${report.release.statusPath}`,
    `checks: ${report.summary.checks}`,
    `passed: ${report.summary.passed}`,
    `failed: ${report.summary.failed}`,
    `warnings: ${report.summary.warnings}`,
    `overall: ${report.passed ? "passed" : "failed"}`,
    ...report.checks.map((check) => `- ${check.id}: ${check.passed ? "passed" : "failed"} (${check.severity})`),
  ].join("\n");
}

export function validateHealthReport(report: unknown): asserts report is BaseSepoliaHealthReport {
  const record = requireRecord(report, "health report");
  if (record.schemaVersion !== 1) throw new Error("health report schemaVersion must be 1");
  if (typeof record.generatedAt !== "string" || Number.isNaN(Date.parse(record.generatedAt))) {
    throw new Error("health report generatedAt must be a valid timestamp");
  }
  validateHealthManifest(record.manifest);
  validateHealthRelease(record.release);
  if (record.operator !== undefined) validateOperatorAccountState(record.operator);
  if (typeof record.passed !== "boolean") throw new Error("health report passed must be a boolean");
  validateHealthSummary(record.summary);
  if (!Array.isArray(record.checks)) throw new Error("health report checks must be an array");
  record.checks.forEach(validateHealthCheck);
}

function readManifest(contents: string): { manifest?: DeploymentManifest | undefined; failures: string[] } {
  try {
    return {
      manifest: parseDeploymentManifest(JSON.parse(contents) as unknown),
      failures: [],
    };
  } catch (error) {
    return {
      failures: [error instanceof Error ? error.message : String(error)],
    };
  }
}

function readReleaseStatus(json: string): {
  verificationFailures: string[];
  status?: {
    latestManifestSha256?: string | undefined;
    latestGeneratedAt?: string | undefined;
    latestCommitSha?: string | undefined;
    latestReadinessRunUrl?: string | undefined;
  } | undefined;
} {
  const verification = verifyBaseSepoliaReleaseStatusSnapshot(json);
  if (!verification.passed) {
    return { verificationFailures: verification.failures };
  }

  const snapshot = JSON.parse(json) as { latest: null | Record<string, unknown> };
  const latest = snapshot.latest;
  if (latest === null) return { verificationFailures: [], status: {} };

  return {
    verificationFailures: [],
    status: {
      latestManifestSha256: String(latest.manifestSha256),
      latestGeneratedAt: String(latest.generatedAt),
      latestCommitSha: String(latest.commitSha),
      latestReadinessRunUrl: String(latest.readinessRunUrl),
    },
  };
}

function manifestShapeCheck(result: { failures: string[] }): BaseSepoliaHealthCheck {
  return {
    id: "manifest-shape",
    label: "Deployment manifest shape",
    severity: "critical",
    passed: result.failures.length === 0,
    failures: result.failures,
    remediation: "Regenerate deployments/base-sepolia/latest.json from the deployment scripts.",
  };
}

function releaseStatusCheck(result: { verificationFailures: string[] }): BaseSepoliaHealthCheck {
  return {
    id: "release-status-schema",
    label: "Release status schema",
    severity: "critical",
    passed: result.verificationFailures.length === 0,
    failures: result.verificationFailures,
    remediation: "Regenerate docs/releases/latest.json with base:release-status.",
  };
}

function releaseManifestShaCheck(
  manifestSha256: string,
  status: { latestManifestSha256?: string | undefined } | undefined,
): BaseSepoliaHealthCheck {
  const failures = status?.latestManifestSha256 === undefined || status.latestManifestSha256 === manifestSha256
    ? []
    : ["release manifest SHA-256 does not match current manifest"];

  return {
    id: "release-manifest-sha",
    label: "Release manifest SHA-256",
    severity: "critical",
    passed: failures.length === 0,
    failures,
    remediation: "Run the release evidence sequence against the current deployment manifest.",
  };
}

function releaseFreshnessCheck(
  generatedAt: string,
  maxReleaseAgeDays: number,
  status: { latestGeneratedAt?: string | undefined } | undefined,
): BaseSepoliaHealthCheck {
  const failures: string[] = [];
  if (status?.latestGeneratedAt !== undefined) {
    const ageMs = Date.parse(generatedAt) - Date.parse(status.latestGeneratedAt);
    const ageDays = ageMs / (24 * 60 * 60 * 1000);
    if (ageDays > maxReleaseAgeDays) {
      failures.push(`latest release evidence is older than ${maxReleaseAgeDays} days`);
    }
  }

  return {
    id: "release-freshness",
    label: "Release evidence freshness",
    severity: "warning",
    passed: failures.length === 0,
    failures,
    remediation: "Refresh release evidence or record why launch proceeds with an older readiness run.",
  };
}

function liveManifestVerificationCheck(report: DeploymentManifestVerifyReport): BaseSepoliaHealthCheck {
  const failures = report.summary.passed
    ? []
    : [`live manifest verification failed ${report.summary.failedChecks} check${report.summary.failedChecks === 1 ? "" : "s"}`];

  return {
    id: "live-manifest-verification",
    label: "Live manifest verification",
    severity: "critical",
    passed: failures.length === 0,
    failures,
    remediation: "Run base:manifest-verify and resolve failed deployed bytecode, chain, or receipt checks.",
  };
}

function agentAccountSafetyCheck(
  report: AgentAccountSafetyReport,
  manifest: DeploymentManifest | undefined,
): BaseSepoliaHealthCheck {
  const failures: string[] = [];
  if (report.paused) failures.push("agent account must be unpaused");

  for (const [name, passed] of Object.entries(report.checks)) {
    if (!passed) failures.push(`agent account safety check ${name} failed`);
  }

  if (manifest !== undefined) {
    if (report.chainId !== manifest.chainId) failures.push("agent account safety chainId does not match manifest");
    if (report.agent !== manifest.contracts.agentAccount) {
      failures.push("agent account safety agent does not match manifest agentAccount");
    }
    if (report.owner !== manifest.owner) failures.push("agent account safety owner does not match manifest owner");
    if (report.capabilities !== manifest.contracts.capabilityRegistry) {
      failures.push("agent account safety capabilities does not match manifest capabilityRegistry");
    }
    if (report.policyEngine !== manifest.contracts.policyEngine) {
      failures.push("agent account safety policyEngine does not match manifest policyEngine");
    }
    if (report.reputationRegistry !== manifest.contracts.reputationRegistry) {
      failures.push("agent account safety reputationRegistry does not match manifest reputationRegistry");
    }
  }

  return {
    id: "agent-account-safety",
    label: "Agent account safety",
    severity: "critical",
    passed: failures.length === 0,
    failures,
    remediation: "Run base:agent-account-safety-check and resolve failed account ownership, delegate, pause, capability, policy, or registry checks.",
  };
}

function operatorAccountStateCheck(
  state: OperatorAccountState,
  manifest: DeploymentManifest | undefined,
): BaseSepoliaHealthCheck {
  const failures: string[] = [];
  if (BigInt(state.ownerBalanceWei) === 0n) failures.push("manifest owner balance is zero");

  if (manifest !== undefined) {
    if (state.owner !== manifest.owner) failures.push("operator account state owner does not match manifest owner");
    if (state.agentAccount !== manifest.contracts.agentAccount) {
      failures.push("operator account state agentAccount does not match manifest agentAccount");
    }
  }

  return {
    id: "operator-account-state",
    label: "Operator account state",
    severity: "warning",
    passed: failures.length === 0,
    failures,
    remediation: "Fund the manifest owner for emergency gas or refresh the deployment manifest if owner or agent account state drifted.",
  };
}

function validateHealthParams(params: unknown): asserts params is CreateBaseSepoliaHealthReportParams {
  const record = requireRecord(params, "health params");
  requireString(record.manifestPath, "manifest path");
  requireString(record.manifestContents, "manifest contents");
  requireString(record.releaseStatusPath, "release status path");
  requireString(record.releaseStatusJson, "release status JSON");
  if (record.generatedAt !== undefined && typeof record.generatedAt !== "string") {
    throw new Error("generatedAt must be a string");
  }
  if (
    record.maxReleaseAgeDays !== undefined &&
    (!Number.isFinite(record.maxReleaseAgeDays) || Number(record.maxReleaseAgeDays) <= 0)
  ) {
    throw new Error("maxReleaseAgeDays must be a positive number");
  }
}

function validateManifestVerification(report: unknown): asserts report is DeploymentManifestVerifyReport {
  const record = requireRecord(report, "manifest verification");
  const summary = requireRecord(record.summary, "manifest verification summary");
  if (typeof summary.passed !== "boolean") throw new Error("manifest verification summary passed must be a boolean");
  if (!Number.isInteger(summary.failedChecks) || Number(summary.failedChecks) < 0) {
    throw new Error("manifest verification summary failedChecks must be a non-negative integer");
  }
}

function validateAgentAccountSafetyReport(report: unknown): asserts report is AgentAccountSafetyReport {
  const record = requireRecord(report, "agent account safety");
  requireNumber(record.chainId, "agent account safety chainId");
  requireString(record.agent, "agent account safety agent");
  requireString(record.owner, "agent account safety owner");
  if (typeof record.paused !== "boolean") throw new Error("agent account safety paused must be a boolean");
  requireString(record.capabilities, "agent account safety capabilities");
  requireString(record.policyEngine, "agent account safety policyEngine");
  requireString(record.reputationRegistry, "agent account safety reputationRegistry");
  requireString(record.reputation, "agent account safety reputation");
  const checks = requireRecord(record.checks, "agent account safety checks");
  for (const name of AGENT_ACCOUNT_REVOCATION_CHECKS) {
    if (typeof checks[name] !== "boolean") {
      throw new Error(`Missing or invalid ${name}; regenerate account safety evidence`);
    }
  }
  for (const [name, value] of Object.entries(checks)) {
    if (typeof value !== "boolean") throw new Error(`agent account safety check ${name} must be a boolean`);
  }
}

function validateOperatorAccountState(state: unknown): asserts state is OperatorAccountState {
  const record = requireRecord(state, "operator account state");
  requireString(record.owner, "operator account state owner");
  requireDecimalString(record.ownerBalanceWei, "operator account state ownerBalanceWei");
  if (!Number.isInteger(record.ownerPendingNonce) || Number(record.ownerPendingNonce) < 0) {
    throw new Error("operator account state ownerPendingNonce must be a non-negative integer");
  }
  requireString(record.agentAccount, "operator account state agentAccount");
  requireDecimalString(record.agentBalanceWei, "operator account state agentBalanceWei");
}

function validateHealthManifest(value: unknown): void {
  const record = requireRecord(value, "health report manifest");
  requireString(record.path, "health report manifest path");
  requireString(record.sha256, "health report manifest sha256");
  if (record.network !== null && typeof record.network !== "string") {
    throw new Error("health report manifest network must be a string or null");
  }
  if (record.chainId !== null && !Number.isInteger(record.chainId)) {
    throw new Error("health report manifest chainId must be an integer or null");
  }
  if (!Number.isInteger(record.contractCount) || Number(record.contractCount) < 0) {
    throw new Error("health report manifest contractCount must be a non-negative integer");
  }
  if (!Number.isInteger(record.transactionCount) || Number(record.transactionCount) < 0) {
    throw new Error("health report manifest transactionCount must be a non-negative integer");
  }
}

function validateHealthRelease(value: unknown): void {
  const record = requireRecord(value, "health report release");
  requireString(record.statusPath, "health report release statusPath");
}

function validateHealthSummary(value: unknown): void {
  const record = requireRecord(value, "health report summary");
  for (const field of ["checks", "passed", "failed", "warnings"]) {
    if (!Number.isInteger(record[field]) || Number(record[field]) < 0) {
      throw new Error(`health report summary ${field} must be a non-negative integer`);
    }
  }
}

function validateHealthCheck(value: unknown, index: number): void {
  const record = requireRecord(value, `health report check ${index}`);
  requireString(record.id, `health report check ${index} id`);
  requireString(record.label, `health report check ${index} label`);
  if (record.severity !== "critical" && record.severity !== "warning") {
    throw new Error(`health report check ${index} severity must be critical or warning`);
  }
  if (typeof record.passed !== "boolean") throw new Error(`health report check ${index} passed must be a boolean`);
  if (!Array.isArray(record.failures)) throw new Error(`health report check ${index} failures must be an array`);
  record.failures.forEach((failure, failureIndex) => {
    requireString(failure, `health report check ${index} failure ${failureIndex}`);
  });
  requireString(record.remediation, `health report check ${index} remediation`);
}

function requireDecimalString(value: unknown, field: string): string {
  const text = requireString(value, field);
  if (!/^(0|[1-9][0-9]*)$/u.test(text)) {
    throw new Error(`${field} must be a non-negative decimal string`);
  }
  return text;
}

function countDefinedValues(value: Record<string, unknown>): number {
  return Object.values(value).filter((entry) => entry !== undefined).length;
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a number`);
  }
  return value;
}
