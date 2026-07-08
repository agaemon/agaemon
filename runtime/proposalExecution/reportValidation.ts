export function validateProposalExecutionBundleCliResult(value: unknown): void {
  const result = requireReportObject(value, "Proposal execution bundle result must be an object");
  requireReportBoolean(result.passed, "Proposal execution bundle result passed must be a boolean");
  requireStringArray(result.failures, "Proposal execution bundle result failures must be an array");
  validateOptionalApprovalVerification(result.approvalVerification, "Proposal execution bundle result approvalVerification");
  if (result.passed === true) {
    validateBundleArtifact(result.bundle, "Proposal execution bundle");
  } else if (result.bundle !== null) {
    validateBundleArtifact(result.bundle, "Proposal execution bundle");
  }
}

export function validateProposalExecutionBundleWriteSummary(value: unknown): void {
  const summary = requireReportObject(value, "Proposal execution bundle write summary must be an object");
  requireReportString(summary.output, "Proposal execution bundle write summary output must be a string");
  requireReportNumber(summary.transactions, "Proposal execution bundle write summary transactions must be a number");
  if (summary.passed !== true) throw new Error("Proposal execution bundle write summary passed must be true");
}

export function validateProposalExecutionBundleVerificationReport(value: unknown): void {
  const report = requireReportObject(value, "Proposal execution bundle verification report must be an object");
  requireReportBoolean(report.passed, "Proposal execution bundle verification report passed must be a boolean");
  requireStringArray(report.failures, "Proposal execution bundle verification report failures must be an array");
  validateOptionalApprovalVerification(
    report.approvalVerification,
    "Proposal execution bundle verification report approvalVerification",
  );
}

export function validateProposalExecutionPreflightReport(value: unknown): void {
  const report = requireReportObject(value, "Proposal execution preflight report must be an object");
  requireReportBoolean(report.passed, "Proposal execution preflight report passed must be a boolean");
  if (!Array.isArray(report.checks)) throw new Error("Proposal execution preflight report checks must be an array");
  report.checks.forEach((check, index) =>
    validateCheck(check, `Proposal execution preflight report checks[${index}]`));
}

export function validateProposalExecutionPreviewCliResult(value: unknown): void {
  const result = requireReportObject(value, "Proposal execution preview result must be an object");
  requireReportBoolean(result.passed, "Proposal execution preview result passed must be a boolean");
  requireStringArray(result.failures, "Proposal execution preview result failures must be an array");
  if (result.passed === true) {
    validatePreviewArtifact(result.preview, "Proposal execution preview");
  } else if (result.preview !== null) {
    validatePreviewArtifact(result.preview, "Proposal execution preview");
  }
}

export function validateProposalExecutionPreviewWriteSummary(value: unknown): void {
  const summary = requireReportObject(value, "Proposal execution preview write summary must be an object");
  requireReportString(summary.output, "Proposal execution preview write summary output must be a string");
  requireReportNumber(summary.transactions, "Proposal execution preview write summary transactions must be a number");
  if (summary.written !== true) throw new Error("Proposal execution preview write summary written must be true");
}

export function validateProposalExecutionPreviewVerificationReport(value: unknown): void {
  validateVerificationReport(value, "Proposal execution preview verification report");
}

export function validateProposalExecutionRunbookCliResult(value: unknown): void {
  const result = requireReportObject(value, "Proposal execution runbook result must be an object");
  requireReportBoolean(result.passed, "Proposal execution runbook result passed must be a boolean");
  requireStringArray(result.failures, "Proposal execution runbook result failures must be an array");
  requireReportStringValue(result.markdown, "Proposal execution runbook markdown must be a string");
  requireReportNumber(result.transactions, "Proposal execution runbook transactions must be a number");
}

export function validateProposalExecutionRunbookWriteSummary(value: unknown): void {
  const summary = requireReportObject(value, "Proposal execution runbook write summary must be an object");
  requireReportString(summary.preview, "Proposal execution runbook write summary preview must be a string");
  requireReportString(summary.output, "Proposal execution runbook write summary output must be a string");
  requireReportNumber(summary.transactions, "Proposal execution runbook write summary transactions must be a number");
  if (summary.written !== true) throw new Error("Proposal execution runbook write summary written must be true");
}

export function validateProposalExecutionRunbookVerificationReport(value: unknown): void {
  validateVerificationReport(value, "Proposal execution runbook verification report");
}

export function validateProposalExecutionManifestArtifact(value: unknown): void {
  const manifest = requireReportObject(value, "Proposal execution manifest must be an object");
  requireReportString(manifest.generatedAt, "Proposal execution manifest generatedAt must be a string");
  validatePathObject(manifest.preview, "Proposal execution manifest preview");
  validatePathObject(manifest.runbook, "Proposal execution manifest runbook");
  validatePathObject(manifest.bundle, "Proposal execution manifest bundle");
  const preflight = requireReportObject(manifest.preflight, "Proposal execution manifest preflight must be an object");
  requireReportBoolean(preflight.passed, "Proposal execution manifest preflight passed must be a boolean");
}

export function validateProposalExecutionManifestWriteSummary(value: unknown): void {
  const summary = requireReportObject(value, "Proposal execution manifest write summary must be an object");
  requireReportString(summary.output, "Proposal execution manifest write summary output must be a string");
  requireReportString(summary.preview, "Proposal execution manifest write summary preview must be a string");
  requireReportString(summary.runbook, "Proposal execution manifest write summary runbook must be a string");
  requireReportString(summary.bundle, "Proposal execution manifest write summary bundle must be a string");
  requireReportBoolean(summary.passed, "Proposal execution manifest write summary passed must be a boolean");
  requireReportString(summary.generatedAt, "Proposal execution manifest write summary generatedAt must be a string");
}

export function validateProposalExecutionPackageCliResult(value: unknown): void {
  const result = requireReportObject(value, "Proposal execution package result must be an object");
  validateGeneratedTextArtifact(result.preview, "Proposal execution package preview", "json");
  validateGeneratedTextArtifact(result.runbook, "Proposal execution package runbook", "markdown");
  requireReportBoolean(result.passed, "Proposal execution package result passed must be a boolean");
  requireStringArray(result.failures, "Proposal execution package result failures must be an array");
}

export function validateProposalExecutionHandoffCliResult(value: unknown): void {
  const result = requireReportObject(value, "Proposal execution handoff result must be an object");
  validateGeneratedTextArtifact(result.preview, "Proposal execution handoff preview", "json");
  validateGeneratedTextArtifact(result.runbook, "Proposal execution handoff runbook", "markdown");
  validateGeneratedTextArtifact(result.executionManifest, "Proposal execution handoff executionManifest", "json");
  requireReportBoolean(result.passed, "Proposal execution handoff result passed must be a boolean");
  requireStringArray(result.failures, "Proposal execution handoff result failures must be an array");
}

export function validateProposalExecutionManifestVerificationReport(value: unknown): void {
  validateVerificationReport(value, "Proposal execution manifest verification report");
}

export function validateProposalExecutionPackageVerificationReport(value: unknown): void {
  validateVerificationReport(value, "Proposal execution package verification report");
}

export function validateProposalExecutionHandoffVerificationReport(value: unknown): void {
  validateVerificationReport(value, "Proposal execution handoff verification report");
}

export function validateProposalExecutionReadinessReport(value: unknown): void {
  const report = requireReportObject(value, "Proposal execution readiness report must be an object");
  requireReportBoolean(report.passed, "Proposal execution readiness report passed must be a boolean");
  requireStringArray(report.failures, "Proposal execution readiness report failures must be an array");
  if (!Array.isArray(report.checks)) throw new Error("Proposal execution readiness report checks must be an array");
  report.checks.forEach((check, index) =>
    validateCheck(check, `Proposal execution readiness report checks[${index}]`));
  validateOptionalString(report.signer, "Proposal execution readiness report signer");
  validateOptionalNumber(report.expectedChainId, "Proposal execution readiness report expectedChainId");
  validateOptionalNullableNumber(report.connectedChainId, "Proposal execution readiness report connectedChainId");
  validateOptionalNullableNumber(report.pendingNonce, "Proposal execution readiness report pendingNonce");
  if (report.transactions !== undefined && !Array.isArray(report.transactions)) {
    throw new Error("Proposal execution readiness report transactions must be an array");
  }
}

export function validateProposalExecutionReadinessVerificationReport(value: unknown): void {
  validateVerificationReport(value, "Proposal execution readiness verification report");
}

export function validateProposalExecutionSigningPayloadCliResult(value: unknown): void {
  const result = requireReportObject(value, "Proposal execution signing payload result must be an object");
  requireReportBoolean(result.passed, "Proposal execution signing payload result passed must be a boolean");
  requireStringArray(result.failures, "Proposal execution signing payload result failures must be an array");
  validateVerificationReport(result.verification, "Proposal execution signing payload verification");
  if (result.passed === true) {
    validateSigningPayload(result.payload);
  } else if (result.payload !== null) {
    validateSigningPayload(result.payload);
  }
}

export function validateProposalExecutionSigningPayloadVerificationReport(value: unknown): void {
  validateVerificationReport(value, "Proposal execution signing payload verification report");
}

export function validateProposalExecutionSigningPayloadPreflightReport(value: unknown): void {
  const report = requireReportObject(value, "Proposal execution signing payload preflight report must be an object");
  requireReportBoolean(report.passed, "Proposal execution signing payload preflight report passed must be a boolean");
  if (!Array.isArray(report.checks)) {
    throw new Error("Proposal execution signing payload preflight report checks must be an array");
  }
  report.checks.forEach((check, index) =>
    validateCheck(check, `Proposal execution signing payload preflight report checks[${index}]`));
}

export function validateProposalExecutionSignedPayloadVerificationReport(value: unknown): void {
  validateVerificationReport(value, "Proposal execution signed payload verification report");
}

function validateBundleArtifact(value: unknown, label: string): void {
  const bundle = requireReportObject(value, `${label} must be an object`);
  if (!Array.isArray(bundle.transactions)) throw new Error(`${label} transactions must be an array`);
}

function validatePreviewArtifact(value: unknown, label: string): void {
  const preview = requireReportObject(value, `${label} must be an object`);
  if (!Array.isArray(preview.transactions)) throw new Error(`${label} transactions must be an array`);
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

function validateGeneratedTextArtifact(value: unknown, label: string, bodyField: "json" | "markdown"): void {
  const artifact = requireReportObject(value, `${label} must be an object`);
  requireReportString(artifact.path, `${label} path must be a string`);
  requireReportStringValue(artifact[bodyField], `${label} ${bodyField} must be a string`);
}

function validateSigningPayload(value: unknown): void {
  const payload = requireReportObject(value, "Proposal execution signing payload must be an object");
  if (payload.schemaVersion !== undefined && payload.schemaVersion !== 1) {
    throw new Error("Proposal execution signing payload schemaVersion must be 1");
  }
  validateOptionalString(payload.signer, "Proposal execution signing payload signer");
  validateOptionalNumber(payload.chainId, "Proposal execution signing payload chainId");
  if (payload.readiness !== undefined) validatePathObject(payload.readiness, "Proposal execution signing payload readiness");
  if (payload.bundle !== undefined) validatePathObject(payload.bundle, "Proposal execution signing payload bundle");
  validateOptionalNumber(payload.nonceStart, "Proposal execution signing payload nonceStart");
  if (!Array.isArray(payload.transactions)) {
    throw new Error("Proposal execution signing payload transactions must be an array");
  }
}

function validateOptionalApprovalVerification(value: unknown, label: string): void {
  if (value === undefined) return;
  const verification = requireReportObject(value, `${label} must be an object`);
  if (verification.passed !== undefined) requireReportBoolean(verification.passed, `${label} passed must be a boolean`);
  if (verification.failures !== undefined) requireStringArray(verification.failures, `${label} failures must be an array`);
}

function validateCheck(value: unknown, label: string): void {
  const check = requireReportObject(value, `${label} must be an object`);
  requireReportString(check.name, `${label} name must be a string`);
  requireReportBoolean(check.passed, `${label} passed must be a boolean`);
  requireStringArray(check.failures, `${label} failures must be an array`);
}

function requireReportObject(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function requireReportString(value: unknown, message: string): void {
  if (typeof value !== "string" || value.length === 0) throw new Error(message);
}

function requireReportStringValue(value: unknown, message: string): void {
  if (typeof value !== "string") throw new Error(message);
}

function requireReportNumber(value: unknown, message: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(message);
}

function requireReportBoolean(value: unknown, message: string): void {
  if (typeof value !== "boolean") throw new Error(message);
}

function requireStringArray(value: unknown, message: string): void {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new Error(message);
}

function validateOptionalString(value: unknown, label: string): void {
  if (value !== undefined) requireReportString(value, `${label} must be a string`);
}

function validateOptionalNumber(value: unknown, label: string): void {
  if (value !== undefined) requireReportNumber(value, `${label} must be a number`);
}

function validateOptionalNullableNumber(value: unknown, label: string): void {
  if (value !== undefined && value !== null) requireReportNumber(value, `${label} must be a number or null`);
}
