export interface SecurityEvidenceSource {
  path: string;
  contents: string;
}

export interface BaseSecurityEvidenceCheck {
  id: string;
  label: string;
  passed: boolean;
  failures: string[];
}

export interface BaseSecurityEvidenceReport {
  schemaVersion: 1;
  generatedAt: string;
  passed: boolean;
  summary: {
    checks: number;
    passed: number;
    failed: number;
  };
  fuzzTests: {
    count: number;
    paths: string[];
  };
  invariantTests: {
    count: number;
    paths: string[];
  };
  runtimeFixtures: {
    count: number;
    paths: string[];
  };
  runtimeFixtureCategories: RuntimeFixtureCategories;
  checks: BaseSecurityEvidenceCheck[];
}

export interface RuntimeFixtureCategories {
  staleArtifacts: SecurityEvidenceCoverage;
  malformedInputs: SecurityEvidenceCoverage;
  editedEvidence: SecurityEvidenceCoverage;
  mismatchDrift: SecurityEvidenceCoverage;
  unsupportedChainOrManifest: SecurityEvidenceCoverage;
}

export interface SecurityEvidenceCoverage {
  count: number;
  paths: string[];
}

export interface CreateBaseSecurityEvidenceReportParams {
  generatedAt?: string | undefined;
  solidityTests: readonly SecurityEvidenceSource[];
  runtimeTests: readonly SecurityEvidenceSource[];
}

const fuzzTestPattern = /\bfunction\s+testFuzz[A-Za-z0-9_]*\s*\(/u;
const invariantTestPattern = /\bfunction\s+invariant[A-Za-z0-9_]*\s*\(/u;
const runtimeAdversarialFixturePattern = new RegExp(
  "\\b(malformed|stale|edited|decoded fields differ|does not match|unsupported chain|manifest drift)\\b",
  "iu",
);
const runtimeFixtureCategoryPatterns = {
  staleArtifacts: /\bstale\b/iu,
  malformedInputs: /\bmalformed\b/iu,
  editedEvidence: /\bedited\b/iu,
  mismatchDrift: new RegExp(
    "\\b(decoded fields differ|does not match|mismatch|signer drift|nonce drift|chain/nonce drift)\\b",
    "iu",
  ),
  unsupportedChainOrManifest: /\b(unsupported chain|manifest drift)\b/iu,
} as const;

export function createBaseSecurityEvidenceReport(
  params: CreateBaseSecurityEvidenceReportParams,
): BaseSecurityEvidenceReport {
  validateSecurityEvidenceParams(params);
  const fuzzPaths = findMatchingTestPaths(params.solidityTests, fuzzTestPattern);
  const invariantPaths = findMatchingTestPaths(params.solidityTests, invariantTestPattern);
  const runtimeFixturePaths = findMatchingTestPaths(params.runtimeTests, runtimeAdversarialFixturePattern);
  const runtimeFixtureCategories = createRuntimeFixtureCategories(params.runtimeTests);
  const adversarialCoveragePassed = fuzzPaths.length + invariantPaths.length > 0;
  const runtimeFixtureCoveragePassed = runtimeFixturePaths.length > 0;
  const checks: BaseSecurityEvidenceCheck[] = [
    {
      id: "forge-adversarial-coverage",
      label: "Foundry fuzz or invariant coverage",
      passed: adversarialCoveragePassed,
      failures: adversarialCoveragePassed ? [] : ["no Solidity fuzz or invariant tests found"],
    },
    {
      id: "runtime-adversarial-fixtures",
      label: "Runtime adversarial fixture coverage",
      passed: runtimeFixtureCoveragePassed,
      failures: runtimeFixtureCoveragePassed ? [] : ["no runtime adversarial fixtures found"],
    },
  ];
  const failed = checks.filter((check) => !check.passed).length;
  const passed = checks.length - failed;

  return {
    schemaVersion: 1,
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    passed: failed === 0,
    summary: {
      checks: checks.length,
      passed,
      failed,
    },
    fuzzTests: {
      count: fuzzPaths.length,
      paths: fuzzPaths,
    },
    invariantTests: {
      count: invariantPaths.length,
      paths: invariantPaths,
    },
    runtimeFixtures: {
      count: runtimeFixturePaths.length,
      paths: runtimeFixturePaths,
    },
    runtimeFixtureCategories,
    checks,
  };
}

export function formatBaseSecurityEvidenceSummary(report: BaseSecurityEvidenceReport): string {
  validateBaseSecurityEvidenceReport(report);
  return [
    "Base security evidence",
    `generatedAt: ${report.generatedAt}`,
    `checks: ${report.summary.checks}`,
    `passed: ${report.summary.passed}`,
    `failed: ${report.summary.failed}`,
    `fuzzTests: ${report.fuzzTests.count}`,
    `invariantTests: ${report.invariantTests.count}`,
    `runtimeFixtures: ${report.runtimeFixtures.count}`,
    "runtimeFixtureCategories:",
    `  staleArtifacts: ${report.runtimeFixtureCategories.staleArtifacts.count}`,
    `  malformedInputs: ${report.runtimeFixtureCategories.malformedInputs.count}`,
    `  editedEvidence: ${report.runtimeFixtureCategories.editedEvidence.count}`,
    `  mismatchDrift: ${report.runtimeFixtureCategories.mismatchDrift.count}`,
    `  unsupportedChainOrManifest: ${report.runtimeFixtureCategories.unsupportedChainOrManifest.count}`,
    `overall: ${report.passed ? "passed" : "failed"}`,
    ...report.checks.map((check) => `- ${check.id}: ${check.passed ? "passed" : "failed"}${formatFailures(check.failures)}`),
  ].join("\n");
}

export function validateBaseSecurityEvidenceReport(
  report: unknown,
): asserts report is BaseSecurityEvidenceReport {
  const record = requireRecord(report, "security evidence report");
  if (record.schemaVersion !== 1) throw new Error("security evidence report schemaVersion must be 1");
  requireString(record.generatedAt, "security evidence report generatedAt");
  if (typeof record.passed !== "boolean") throw new Error("security evidence report passed must be a boolean");
  validateSummary(record.summary);
  validateCoverage(record.fuzzTests, "fuzzTests");
  validateCoverage(record.invariantTests, "invariantTests");
  validateCoverage(record.runtimeFixtures, "runtimeFixtures");
  validateRuntimeFixtureCategories(record.runtimeFixtureCategories);
  if (!Array.isArray(record.checks)) throw new Error("security evidence report checks must be an array");
  record.checks.forEach(validateCheck);
}

function createRuntimeFixtureCategories(sources: readonly SecurityEvidenceSource[]): RuntimeFixtureCategories {
  return {
    staleArtifacts: createCoverage(sources, runtimeFixtureCategoryPatterns.staleArtifacts),
    malformedInputs: createCoverage(sources, runtimeFixtureCategoryPatterns.malformedInputs),
    editedEvidence: createCoverage(sources, runtimeFixtureCategoryPatterns.editedEvidence),
    mismatchDrift: createCoverage(sources, runtimeFixtureCategoryPatterns.mismatchDrift),
    unsupportedChainOrManifest: createCoverage(
      sources,
      runtimeFixtureCategoryPatterns.unsupportedChainOrManifest,
    ),
  };
}

function createCoverage(sources: readonly SecurityEvidenceSource[], pattern: RegExp): SecurityEvidenceCoverage {
  const paths = findMatchingTestPaths(sources, pattern);
  return {
    count: paths.length,
    paths,
  };
}

function findMatchingTestPaths(sources: readonly SecurityEvidenceSource[], pattern: RegExp): string[] {
  return sources
    .filter((source) => pattern.test(source.contents))
    .map((source) => source.path)
    .sort();
}

function formatFailures(failures: readonly string[]): string {
  return failures.length === 0 ? "" : ` (${failures.join("; ")})`;
}

function validateSecurityEvidenceParams(params: unknown): asserts params is CreateBaseSecurityEvidenceReportParams {
  const record = requireRecord(params, "security evidence params");
  if (record.generatedAt !== undefined) requireString(record.generatedAt, "security evidence generatedAt");
  if (!Array.isArray(record.solidityTests)) throw new Error("security evidence solidityTests must be an array");
  if (!Array.isArray(record.runtimeTests)) throw new Error("security evidence runtimeTests must be an array");
  record.solidityTests.forEach(validateSource);
  record.runtimeTests.forEach(validateSource);
}

function validateSource(source: unknown, index: number): void {
  const record = requireRecord(source, `security evidence source ${index}`);
  requireString(record.path, `security evidence source ${index} path`);
  requireString(record.contents, `security evidence source ${index} contents`);
}

function validateSummary(summary: unknown): void {
  const record = requireRecord(summary, "security evidence report summary");
  for (const field of ["checks", "passed", "failed"]) {
    if (!Number.isInteger(record[field]) || Number(record[field]) < 0) {
      throw new Error(`security evidence report summary ${field} must be a non-negative integer`);
    }
  }
}

function validateCoverage(coverage: unknown, field: string): void {
  const record = requireRecord(coverage, `security evidence report ${field}`);
  if (!Number.isInteger(record.count) || Number(record.count) < 0) {
    throw new Error(`security evidence report ${field} count must be a non-negative integer`);
  }
  if (!Array.isArray(record.paths)) throw new Error(`security evidence report ${field} paths must be an array`);
  record.paths.forEach((path, index) => {
    requireString(path, `security evidence report ${field} path ${index}`);
  });
}

function validateRuntimeFixtureCategories(categories: unknown): void {
  const record = requireRecord(categories, "security evidence report runtimeFixtureCategories");
  for (const field of [
    "staleArtifacts",
    "malformedInputs",
    "editedEvidence",
    "mismatchDrift",
    "unsupportedChainOrManifest",
  ]) {
    validateCoverage(record[field], `runtimeFixtureCategories.${field}`);
  }
}

function validateCheck(check: unknown, index: number): void {
  const record = requireRecord(check, `security evidence report check ${index}`);
  requireString(record.id, `security evidence report check ${index} id`);
  requireString(record.label, `security evidence report check ${index} label`);
  if (typeof record.passed !== "boolean") {
    throw new Error(`security evidence report check ${index} passed must be a boolean`);
  }
  if (!Array.isArray(record.failures)) {
    throw new Error(`security evidence report check ${index} failures must be an array`);
  }
  record.failures.forEach((failure, failureIndex) => {
    requireString(failure, `security evidence report check ${index} failure ${failureIndex}`);
  });
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}
