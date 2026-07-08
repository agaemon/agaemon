export interface BroadcastCliPassFailResult {
  [key: string]: unknown;
  passed: boolean;
  failures: readonly string[];
}

export interface BroadcastCliPreflightReport extends BroadcastCliPassFailResult {
  checks: readonly unknown[];
}

export interface BroadcastCliPackageResult extends BroadcastCliPassFailResult {
  package: unknown;
}

export interface BroadcastCliSubmittedTransaction {
  index: number;
  hash: string;
  blockNumber: string;
  status: "success" | "reverted";
}

export interface BroadcastCliSubmitResult extends BroadcastCliPassFailResult {
  mode: "dry-run" | "send";
  submitted: readonly BroadcastCliSubmittedTransaction[];
}

export interface BroadcastCliReceiptResult extends BroadcastCliPassFailResult {
  receipt: unknown;
}

export interface BroadcastCliReportResult extends BroadcastCliPassFailResult {
  markdown: string;
  transactions: number;
}

export interface BroadcastCliArchiveManifest {
  schemaVersion: 1;
  generatedAt: string;
  report: { path: string };
  receipt: { path: string };
  broadcastPackage: { path: string };
  submitResult: { path: string };
  verification: BroadcastCliPassFailResult;
}

export function validateBroadcastCliPreflightReport(value: unknown): asserts value is BroadcastCliPreflightReport {
  validateBroadcastCliPassFail(value, "Broadcast preflight report");
  if (!Array.isArray(value.checks)) throw new Error("Broadcast preflight report checks must be an array");
  value.checks.forEach((check, index) => validateBroadcastCliCheck(check, `Broadcast preflight report check ${index}`));
}

export function validateBroadcastCliPackageResult(value: unknown): asserts value is BroadcastCliPackageResult {
  validateBroadcastCliPassFail(value, "Broadcast package result");
  if (value.passed && !isRecord(value.package)) throw new Error("Broadcast package result package must be an object");
}

export function validateBroadcastCliVerificationResult(value: unknown, label: string): asserts value is BroadcastCliPassFailResult {
  validateBroadcastCliPassFail(value, label);
}

export function validateBroadcastCliSubmitResult(value: unknown): asserts value is BroadcastCliSubmitResult {
  validateBroadcastCliPassFail(value, "Broadcast submit result");
  if (value.mode !== "dry-run" && value.mode !== "send") {
    throw new Error("Broadcast submit result mode must be dry-run or send");
  }
  if (!Array.isArray(value.submitted)) {
    throw new Error("Broadcast submit result submitted transactions must be an array");
  }
  value.submitted.forEach((transaction, index) => validateBroadcastCliSubmittedTransaction(transaction, index));
}

export function validateBroadcastCliReceiptResult(value: unknown): asserts value is BroadcastCliReceiptResult {
  validateBroadcastCliPassFail(value, "Broadcast receipt result");
  if (value.passed && !isRecord(value.receipt)) throw new Error("Broadcast receipt result receipt must be an object");
}

export function validateBroadcastCliReportResult(value: unknown): asserts value is BroadcastCliReportResult {
  validateBroadcastCliPassFail(value, "Broadcast report result");
  if (typeof value.markdown !== "string") throw new Error("Broadcast report result markdown must be a string");
  if (typeof value.transactions !== "number" || !Number.isInteger(value.transactions) || value.transactions < 0) {
    throw new Error("Broadcast report result transactions must be a non-negative integer");
  }
}

export function validateBroadcastCliArchiveManifest(value: unknown): asserts value is BroadcastCliArchiveManifest {
  if (!isRecord(value)) throw new Error("Broadcast archive manifest must be an object");
  if (value.schemaVersion !== 1) throw new Error("Broadcast archive manifest schemaVersion must be 1");
  if (typeof value.generatedAt !== "string" || Number.isNaN(Date.parse(value.generatedAt))) {
    throw new Error("Broadcast archive manifest generatedAt must be a valid timestamp");
  }
  validateBroadcastCliArchiveFile(value.report, "Broadcast archive manifest report");
  validateBroadcastCliArchiveFile(value.receipt, "Broadcast archive manifest receipt");
  validateBroadcastCliArchiveFile(value.broadcastPackage, "Broadcast archive manifest broadcastPackage");
  validateBroadcastCliArchiveFile(value.submitResult, "Broadcast archive manifest submitResult");
  validateBroadcastCliPassFail(value.verification, "Broadcast archive manifest verification");
}

function validateBroadcastCliPassFail(value: unknown, label: string): asserts value is BroadcastCliPassFailResult {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  if (typeof value.passed !== "boolean") throw new Error(`${label} passed must be a boolean`);
  validateBroadcastCliFailures(value.failures, `${label} failures`);
}

function validateBroadcastCliCheck(value: unknown, label: string): void {
  validateBroadcastCliPassFail(value, label);
  if (typeof value.name !== "string" || value.name.trim().length === 0) {
    throw new Error(`${label} name must be a non-empty string`);
  }
}

function validateBroadcastCliSubmittedTransaction(value: unknown, index: number): void {
  const label = `Broadcast submit result submitted transaction ${index}`;
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  if (typeof value.index !== "number" || !Number.isInteger(value.index) || value.index < 0) {
    throw new Error(`${label} index must be a non-negative integer`);
  }
  if (typeof value.hash !== "string" || value.hash.trim().length === 0) {
    throw new Error(`${label} hash must be a non-empty string`);
  }
  if (typeof value.blockNumber !== "string" || value.blockNumber.trim().length === 0) {
    throw new Error(`${label} blockNumber must be a non-empty string`);
  }
  if (value.status !== "success" && value.status !== "reverted") {
    throw new Error(`${label} status must be success or reverted`);
  }
}

function validateBroadcastCliArchiveFile(value: unknown, label: string): void {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  if (typeof value.path !== "string" || value.path.trim().length === 0) {
    throw new Error(`${label} path must be a non-empty string`);
  }
}

function validateBroadcastCliFailures(value: unknown, label: string): asserts value is readonly string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  value.forEach((failure, index) => {
    if (typeof failure !== "string" || failure.trim().length === 0) {
      throw new Error(`${label} ${index} must be a non-empty string`);
    }
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
