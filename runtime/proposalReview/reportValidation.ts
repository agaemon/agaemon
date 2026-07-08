export function validateProposalReviewManifestCliArtifact(value: unknown): void {
  const artifact = requireReportObject(value, "Proposal review manifest must be an object");
  requireReportString(artifact.generatedAt, "Proposal review manifest generatedAt must be a string");
  validatePathObject(artifact.proposal, "Proposal review manifest proposal");
  validatePathObject(artifact.summary, "Proposal review manifest summary");
  validateManifestPreflight(artifact.preflight, "Proposal review manifest preflight");
}

export function validateProposalReviewManifestCliWriteSummary(value: unknown): void {
  const summary = requireReportObject(value, "Proposal review manifest write summary must be an object");
  requireReportString(summary.output, "Proposal review manifest write summary output must be a string");
  requireReportString(summary.proposal, "Proposal review manifest write summary proposal must be a string");
  requireReportString(summary.summary, "Proposal review manifest write summary summary must be a string");
  requireReportBoolean(summary.passed, "Proposal review manifest write summary passed must be a boolean");
  requireReportString(summary.generatedAt, "Proposal review manifest write summary generatedAt must be a string");
}

export function validateProposalReviewPackageCliResult(value: unknown): void {
  const result = requireReportObject(value, "Proposal review package result must be an object");
  requireReportString(result.proposal, "Proposal review package proposal must be a string");
  const summary = requireReportObject(result.summary, "Proposal review package summary must be an object");
  requireReportString(summary.path, "Proposal review package summary path must be a string");
  requireReportString(summary.markdown, "Proposal review package summary markdown must be a string");
  requireReportString(result.manifestPath, "Proposal review package manifestPath must be a string");
  requireReportBoolean(result.passed, "Proposal review package passed must be a boolean");
  requireStringArray(result.failures, "Proposal review package failures must be an array");
  if (result.passed === true) {
    requireReportObject(result.manifest, "Proposal review package manifest must be an object when passed");
  } else if (result.manifest !== null) {
    requireReportObject(result.manifest, "Proposal review package manifest must be an object or null");
  }
}

export function validateProposalReviewApprovalCliResult(value: unknown): void {
  const result = requireReportObject(value, "Proposal review approval result must be an object");
  requireReportBoolean(result.passed, "Proposal review approval result passed must be a boolean");
  requireStringArray(result.failures, "Proposal review approval result failures must be an array");
  validateVerificationReport(result.manifestVerification, "Proposal review approval result manifestVerification");
  if (result.passed === true) {
    validateApprovalArtifact(result.approval, "Proposal review approval");
  } else if (result.approval !== null) {
    validateApprovalArtifact(result.approval, "Proposal review approval");
  }
}

export function validateProposalReviewPreflightCliReport(value: unknown): void {
  validatePreflightReport(value, "Proposal review preflight report");
}

export function validateProposalReviewVerificationCliReport(value: unknown, label: string): void {
  validateVerificationReport(value, label);
}

export function validateProposalReviewApprovalVerificationCliReport(value: unknown): void {
  const report = requireReportObject(value, "Proposal review approval verification report must be an object");
  requireReportBoolean(report.passed, "Proposal review approval verification report passed must be a boolean");
  requireStringArray(report.failures, "Proposal review approval verification report failures must be an array");
  validateVerificationReport(
    report.manifestVerification,
    "Proposal review approval verification report manifestVerification",
  );
}

function validateApprovalArtifact(value: unknown, label: string): void {
  const artifact = requireReportObject(value, `${label} must be an object`);
  validatePathObject(artifact.manifest, `${label} manifest`);
  requireReportString(artifact.reviewer, `${label} reviewer must be a string`);
  requireReportString(artifact.decision, `${label} decision must be a string`);
}

function validatePreflightReport(value: unknown, label: string): void {
  const report = requireReportObject(value, `${label} must be an object`);
  requireReportBoolean(report.passed, `${label} passed must be a boolean`);
  if (report.failures !== undefined) requireStringArray(report.failures, `${label} failures must be an array`);
  if (!Array.isArray(report.checks)) throw new Error(`${label} checks must be an array`);
  report.checks.forEach((check, index) => validateCheck(check, `${label} checks[${index}]`));
}

function validateManifestPreflight(value: unknown, label: string): void {
  const report = requireReportObject(value, `${label} must be an object`);
  requireReportBoolean(report.passed, `${label} passed must be a boolean`);
  if (report.failures !== undefined) requireStringArray(report.failures, `${label} failures must be an array`);
}

function validateCheck(value: unknown, label: string): void {
  const check = requireReportObject(value, `${label} must be an object`);
  requireReportString(check.name, `${label} name must be a string`);
  requireReportBoolean(check.passed, `${label} passed must be a boolean`);
  requireStringArray(check.failures, `${label} failures must be an array`);
}

function validateVerificationReport(value: unknown, label: string): void {
  const report = requireReportObject(value, `${label} must be an object`);
  requireReportBoolean(report.passed, `${label} passed must be a boolean`);
  requireStringArray(report.failures, `${label} failures must be an array`);
}

function validatePathObject(value: unknown, label: string): void {
  const pathObject = requireReportObject(value, `${label} must be an object`);
  requireReportString(pathObject.path, `${label} path must be a string`);
}

function requireReportObject(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function requireReportString(value: unknown, message: string): void {
  if (typeof value !== "string" || value.length === 0) throw new Error(message);
}

function requireReportBoolean(value: unknown, message: string): void {
  if (typeof value !== "boolean") throw new Error(message);
}

function requireStringArray(value: unknown, message: string): void {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new Error(message);
}
