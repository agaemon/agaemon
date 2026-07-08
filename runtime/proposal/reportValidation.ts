export function validateProposalSummaryCliReport(value: unknown): void {
  const report = requireReportObject(value, "Proposal summary report must be an object");
  requireReportBoolean(report.passed, "Proposal summary report passed must be a boolean");
  requireStringArray(report.failures, "Proposal summary report failures must be an array");
  requireReportString(report.markdown, "Proposal summary report markdown must be a string", { allowEmpty: true });
  validateNullableSource(report.source, "Proposal summary report source");
  validateNullableString(report.sourcePath, "Proposal summary report sourcePath");
  validateNullableBoolean(report.executable, "Proposal summary report executable");
  requireReportNumber(report.steps, "Proposal summary report steps must be a number");
  requireReportNumber(report.transactions, "Proposal summary report transactions must be a number");
}

export function validateProposalSummaryCliWriteSummary(value: unknown): void {
  const summary = requireReportObject(value, "Proposal summary write summary must be an object");
  requireReportString(summary.proposal, "Proposal summary write summary proposal must be a string");
  requireReportString(summary.output, "Proposal summary write summary output must be a string");
  validateSource(summary.source, "Proposal summary write summary source");
  requireReportString(summary.sourcePath, "Proposal summary write summary sourcePath must be a string");
  requireReportBoolean(summary.executable, "Proposal summary write summary executable must be a boolean");
  requireReportNumber(summary.steps, "Proposal summary write summary steps must be a number");
  requireReportNumber(summary.transactions, "Proposal summary write summary transactions must be a number");
  requireTrue(summary.written, "Proposal summary write summary written must be true");
}

export function validateProposalVerificationCliReport(value: unknown, label: string): void {
  const report = requireReportObject(value, `${label} must be an object`);
  requireReportBoolean(report.passed, `${label} passed must be a boolean`);
  requireStringArray(report.failures, `${label} failures must be an array`);
  validateOptionalMetadata(report, label);
}

export function validateProposalSummaryVerificationCliReport(value: unknown): void {
  const report = requireReportObject(value, "Proposal summary verification report must be an object");
  requireReportBoolean(report.passed, "Proposal summary verification report passed must be a boolean");
  requireStringArray(report.failures, "Proposal summary verification report failures must be an array");
  if (report.expected !== undefined) {
    requireReportString(report.expected, "Proposal summary verification report expected must be a string");
  }
}

function validateOptionalMetadata(report: Record<string, unknown>, label: string): void {
  if (report.source !== undefined) validateNullableSource(report.source, `${label} source`);
  if (report.sourcePath !== undefined) validateNullableString(report.sourcePath, `${label} sourcePath`);
  if (report.chainId !== undefined) validateNullableNumber(report.chainId, `${label} chainId`);
  if (report.executable !== undefined) validateNullableBoolean(report.executable, `${label} executable`);
  if (report.steps !== undefined) requireReportNumber(report.steps, `${label} steps must be a number`);
  if (report.transactions !== undefined) requireReportNumber(report.transactions, `${label} transactions must be a number`);
}

function requireReportObject(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function requireReportString(
  value: unknown,
  message: string,
  options: { allowEmpty?: boolean } = {},
): void {
  if (typeof value !== "string" || (!options.allowEmpty && value.length === 0)) throw new Error(message);
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

function validateSource(value: unknown, message: string): void {
  if (value !== "plan" && value !== "intent") throw new Error(`${message} must be plan or intent`);
}

function validateNullableSource(value: unknown, message: string): void {
  if (value === null) return;
  validateSource(value, message);
}

function validateNullableString(value: unknown, message: string): void {
  if (value !== null && typeof value !== "string") throw new Error(`${message} must be a string or null`);
}

function validateNullableBoolean(value: unknown, message: string): void {
  if (value !== null && typeof value !== "boolean") throw new Error(`${message} must be a boolean or null`);
}

function validateNullableNumber(value: unknown, message: string): void {
  if (value !== null && (typeof value !== "number" || !Number.isFinite(value))) {
    throw new Error(`${message} must be a number or null`);
  }
}

function requireTrue(value: unknown, message: string): void {
  if (value !== true) throw new Error(message);
}
