import { FUNDING_READY_OPERATOR_DEMO_OBJECTIVE } from "./fundingReadyDemo.js";

export interface CreateFundingDemoEvidenceManifestParams {
  generatedAt?: string | undefined;
  artifactRoot?: string | undefined;
  deploymentManifestPath?: string | undefined;
  releaseStatusPath?: string | undefined;
}

export type FundingDemoEvidenceRole =
  | "source"
  | "local-check"
  | "read-only-check"
  | "verification"
  | "operator-view"
  | "proof";

export interface FundingDemoEvidenceEntry {
  id: string;
  label: string;
  path: string;
  role: FundingDemoEvidenceRole;
  required: true;
}

export interface FundingDemoEvidenceManifest {
  schemaVersion: 1;
  generatedAt: string;
  network: "base-sepolia";
  objective: string;
  artifactRoot: string;
  trustBoundary: {
    ai: "proposes";
    policy: "decides";
    accounts: "execute";
    mainnet: false;
    liveFunds: false;
  };
  evidence: FundingDemoEvidenceEntry[];
}

export interface VerifyFundingDemoEvidenceManifestParams {
  saved: FundingDemoEvidenceManifest;
  expected: FundingDemoEvidenceManifest;
  missingEvidencePaths?: readonly string[] | undefined;
}

export interface FundingDemoEvidenceManifestVerification {
  passed: boolean;
  failures: string[];
  expected: FundingDemoEvidenceManifest;
}

const DEFAULT_ARTIFACT_ROOT = "artifacts/funding-demo";
const DEFAULT_DEPLOYMENT_MANIFEST_PATH = "deployments/base-sepolia/latest.json";
const DEFAULT_RELEASE_STATUS_PATH = "docs/releases/latest.json";

export function createFundingDemoEvidenceManifest(
  params: CreateFundingDemoEvidenceManifestParams = {},
): FundingDemoEvidenceManifest {
  const artifactRoot = trimTrailingSlash(params.artifactRoot ?? DEFAULT_ARTIFACT_ROOT);

  return {
    schemaVersion: 1,
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    network: "base-sepolia",
    objective: FUNDING_READY_OPERATOR_DEMO_OBJECTIVE,
    artifactRoot,
    trustBoundary: {
      ai: "proposes",
      policy: "decides",
      accounts: "execute",
      mainnet: false,
      liveFunds: false,
    },
    evidence: [
      entry("deployment-manifest", "Base Sepolia deployment manifest", params.deploymentManifestPath ?? DEFAULT_DEPLOYMENT_MANIFEST_PATH, "source"),
      entry("release-status", "Release status", params.releaseStatusPath ?? DEFAULT_RELEASE_STATUS_PATH, "source"),
      artifactEntry(artifactRoot, "security-evidence", "Security evidence", "base-security-evidence.json", "local-check"),
      artifactEntry(artifactRoot, "local-preflight", "Local preflight", "base-sepolia-local-preflight.json", "local-check"),
      artifactEntry(artifactRoot, "readiness-checkpoint", "Readiness checkpoint", "base-sepolia-readiness-checkpoint.json", "read-only-check"),
      artifactEntry(artifactRoot, "agent-account-safety", "Agent account safety", "base-agent-account-safety.json", "local-check"),
      artifactEntry(artifactRoot, "health", "Health report", "base-sepolia-health.json", "read-only-check"),
      artifactEntry(artifactRoot, "health-verification", "Health verification", "base-sepolia-health-verification.json", "verification"),
      artifactEntry(artifactRoot, "payout-reconciliations", "Payout reconciliations", "coordination-payout-reconciliations.json", "local-check"),
      artifactEntry(artifactRoot, "economic-payout-summary", "Economic payout summary", "economic-payout-summary.json", "operator-view"),
      artifactEntry(artifactRoot, "economic-payout-summary-verification", "Economic payout summary verification", "economic-payout-summary-verification.json", "verification"),
      artifactEntry(artifactRoot, "launch-gate", "Launch gate", "base-sepolia-launch-gate.json", "proof"),
      artifactEntry(artifactRoot, "launch-gate-verification", "Launch gate verification", "base-sepolia-launch-gate-verification.json", "verification"),
      artifactEntry(artifactRoot, "event-index", "Event index", "base-event-index.json", "read-only-check"),
      artifactEntry(artifactRoot, "event-index-verification", "Event index verification", "base-event-index-verification.json", "verification"),
      artifactEntry(artifactRoot, "memory-storage-binding", "Memory storage binding", "memory-storage-binding.json", "local-check"),
      artifactEntry(artifactRoot, "memory-storage-binding-verification", "Memory storage binding verification", "memory-storage-binding-verification.json", "verification"),
      artifactEntry(artifactRoot, "memory-storage-binding-migrated", "Migrated memory storage binding", "memory-storage-binding-migrated.json", "local-check"),
      artifactEntry(artifactRoot, "memory-storage-migration-verification", "Memory storage migration verification", "memory-storage-migration-verification.json", "verification"),
      artifactEntry(artifactRoot, "operator-dashboard", "Operator dashboard", "operator-dashboard.json", "operator-view"),
      artifactEntry(artifactRoot, "operator-dashboard-html", "Operator dashboard HTML", "operator-dashboard.html", "operator-view"),
      artifactEntry(artifactRoot, "operator-dashboard-verification", "Operator dashboard verification", "operator-dashboard-verification.json", "verification"),
      artifactEntry(artifactRoot, "funding-proof", "Funding-ready proof", "funding-ready-demo.json", "proof"),
      artifactEntry(artifactRoot, "funding-proof-verification", "Funding-ready proof verification", "funding-ready-demo-verification.json", "verification"),
      artifactEntry(artifactRoot, "review-index", "Funding demo review index", "index.html", "operator-view"),
      artifactEntry(artifactRoot, "review-index-verification", "Funding demo review index verification", "index-verification.json", "verification"),
    ],
  };
}

export function formatFundingDemoEvidenceManifestSummary(manifest: FundingDemoEvidenceManifest): string {
  validateFundingDemoEvidenceManifest(manifest);
  return [
    "Funding demo evidence manifest",
    `network: ${manifest.network}`,
    `artifactRoot: ${manifest.artifactRoot}`,
    `evidence: ${manifest.evidence.length} files`,
    "trustBoundary: AI proposes, policy decides, accounts execute",
  ].join("\n");
}

export function verifyFundingDemoEvidenceManifest(
  params: VerifyFundingDemoEvidenceManifestParams,
): FundingDemoEvidenceManifestVerification {
  validateFundingDemoEvidenceManifest(params.saved);
  validateFundingDemoEvidenceManifest(params.expected);
  const staleFailures = JSON.stringify(withoutGeneratedAt(params.saved), null, 2) ===
    JSON.stringify(withoutGeneratedAt(params.expected), null, 2)
    ? []
    : ["funding demo evidence manifest is stale"];
  const missingEvidenceFailures = [...new Set(params.missingEvidencePaths ?? [])]
    .map((path) => `required evidence artifact is missing: ${path}`);
  const failures = [...staleFailures, ...missingEvidenceFailures];

  return {
    passed: failures.length === 0,
    failures,
    expected: params.expected,
  };
}

export function formatFundingDemoEvidenceManifestVerificationSummary(
  verification: FundingDemoEvidenceManifestVerification,
): string {
  validateFundingDemoEvidenceManifestVerification(verification);
  return [
    "Funding demo evidence manifest verification",
    `passed: ${verification.passed}`,
    `failures: ${verification.failures.length}`,
    ...verification.failures.map((failure) => `- ${failure}`),
  ].join("\n");
}

export function validateFundingDemoEvidenceManifestVerification(
  verification: unknown,
): asserts verification is FundingDemoEvidenceManifestVerification {
  const record = requireRecord(verification, "funding demo evidence manifest verification");
  requireBoolean(record.passed, "funding demo evidence manifest verification passed");
  if (!Array.isArray(record.failures) || record.failures.some((failure) => typeof failure !== "string")) {
    throw new Error("funding demo evidence manifest verification failures must be an array of strings");
  }
  validateFundingDemoEvidenceManifest(record.expected);
}

export function validateFundingDemoEvidenceManifest(
  manifest: unknown,
): asserts manifest is FundingDemoEvidenceManifest {
  const record = requireRecord(manifest, "funding demo evidence manifest");
  if (record.schemaVersion !== 1) throw new Error("funding demo evidence manifest schemaVersion must be 1");
  requireString(record.generatedAt, "funding demo evidence manifest generatedAt");
  if (record.network !== "base-sepolia") throw new Error("funding demo evidence manifest network must be base-sepolia");
  if (record.objective !== FUNDING_READY_OPERATOR_DEMO_OBJECTIVE) {
    throw new Error("funding demo evidence manifest objective is not supported");
  }
  requireString(record.artifactRoot, "funding demo evidence manifest artifactRoot");
  validateTrustBoundary(record.trustBoundary);
  if (!Array.isArray(record.evidence)) throw new Error("funding demo evidence manifest evidence must be an array");
  record.evidence.forEach(validateEvidenceEntry);
}

function artifactEntry(
  artifactRoot: string,
  id: string,
  label: string,
  filename: string,
  role: FundingDemoEvidenceRole,
): FundingDemoEvidenceEntry {
  return entry(id, label, `${artifactRoot}/${filename}`, role);
}

function entry(
  id: string,
  label: string,
  path: string,
  role: FundingDemoEvidenceRole,
): FundingDemoEvidenceEntry {
  return { id, label, path, role, required: true };
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function withoutGeneratedAt(
  manifest: FundingDemoEvidenceManifest,
): Omit<FundingDemoEvidenceManifest, "generatedAt"> {
  const { generatedAt: _generatedAt, ...rest } = manifest;
  return rest;
}

function validateTrustBoundary(value: unknown): void {
  const record = requireRecord(value, "funding demo evidence manifest trustBoundary");
  if (record.ai !== "proposes") throw new Error("funding demo evidence manifest trustBoundary ai must be proposes");
  if (record.policy !== "decides") {
    throw new Error("funding demo evidence manifest trustBoundary policy must be decides");
  }
  if (record.accounts !== "execute") {
    throw new Error("funding demo evidence manifest trustBoundary accounts must be execute");
  }
  if (record.mainnet !== false) {
    throw new Error("funding demo evidence manifest trustBoundary mainnet must be false");
  }
  if (record.liveFunds !== false) {
    throw new Error("funding demo evidence manifest trustBoundary liveFunds must be false");
  }
}

function validateEvidenceEntry(value: unknown): void {
  const record = requireRecord(value, "funding demo evidence manifest evidence entry");
  requireString(record.id, "funding demo evidence manifest evidence entry id");
  requireString(record.label, "funding demo evidence manifest evidence entry label");
  requireString(record.path, "funding demo evidence manifest evidence entry path");
  validateEvidenceRole(record.role);
  if (record.required !== true) throw new Error("funding demo evidence manifest evidence entry required must be true");
}

function validateEvidenceRole(value: unknown): asserts value is FundingDemoEvidenceRole {
  if (
    value !== "source" &&
    value !== "local-check" &&
    value !== "read-only-check" &&
    value !== "verification" &&
    value !== "operator-view" &&
    value !== "proof"
  ) {
    throw new Error("funding demo evidence manifest evidence entry role is not supported");
  }
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
