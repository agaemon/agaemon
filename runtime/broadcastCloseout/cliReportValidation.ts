export interface BroadcastCloseoutCliPassFail {
  [key: string]: unknown;
  passed: boolean;
  failures?: readonly string[] | undefined;
}

export interface BroadcastCloseoutCliResult extends BroadcastCloseoutCliPassFail {
  failures: readonly string[];
  report: { path: string; markdown: string };
  archive: { path: string; json: string };
  status: { path: string; json: string } | null;
}

export interface BroadcastCloseoutEvidenceSummaryResult extends BroadcastCloseoutCliPassFail {
  failures: readonly string[];
  markdown: string;
}

export function validateBroadcastCloseoutCliResult(value: unknown): asserts value is BroadcastCloseoutCliResult {
  validatePassFail(value, "Broadcast closeout result", { requireFailures: true });
  validateGeneratedFile(value.report, "Broadcast closeout result report", "markdown");
  validateGeneratedFile(value.archive, "Broadcast closeout result archive", "json");
  if (value.status !== null) validateGeneratedFile(value.status, "Broadcast closeout result status", "json");
}

export function validateBroadcastCloseoutStatusResult(value: unknown): asserts value is BroadcastCloseoutCliPassFail {
  validatePassFail(value, "Broadcast closeout status result", { requireFailures: false });
}

export function validateBroadcastCloseoutFormattedStatus(value: unknown): asserts value is string {
  if (typeof value !== "string") throw new Error("Broadcast closeout status formatted output must be a string");
}

export function validateBroadcastCloseoutVerificationResult(
  value: unknown,
  label: string,
): asserts value is BroadcastCloseoutCliPassFail {
  validatePassFail(value, label, { requireFailures: true });
}

export function validateBroadcastCloseoutEvidenceVerificationResult(
  value: unknown,
): asserts value is BroadcastCloseoutCliPassFail & { checks?: readonly unknown[] } {
  validatePassFail(value, "Broadcast closeout evidence verification result", { requireFailures: true });
  if (value.checks === undefined) return;
  if (!Array.isArray(value.checks)) {
    throw new Error("Broadcast closeout evidence verification result checks must be an array");
  }
  value.checks.forEach((check, index) => validateCheck(check, `Broadcast closeout evidence verification result check ${index}`));
}

export function validateBroadcastCloseoutEvidenceSummaryResult(
  value: unknown,
): asserts value is BroadcastCloseoutEvidenceSummaryResult {
  validatePassFail(value, "Broadcast closeout evidence summary result", { requireFailures: true });
  if (typeof value.markdown !== "string") {
    throw new Error("Broadcast closeout evidence summary result markdown must be a string");
  }
}

function validatePassFail(
  value: unknown,
  label: string,
  options: { requireFailures: boolean },
): asserts value is BroadcastCloseoutCliPassFail {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  if (typeof value.passed !== "boolean") throw new Error(`${label} passed must be a boolean`);
  if (options.requireFailures || value.failures !== undefined) validateFailures(value.failures, `${label} failures`);
}

function validateGeneratedFile(value: unknown, label: string, bodyField: "json" | "markdown"): void {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  if (typeof value.path !== "string" || value.path.trim().length === 0) {
    throw new Error(`${label} path must be a non-empty string`);
  }
  if (typeof value[bodyField] !== "string") throw new Error(`${label} ${bodyField} must be a string`);
}

function validateCheck(value: unknown, label: string): void {
  validatePassFail(value, label, { requireFailures: true });
  if (typeof value.name !== "string" || value.name.trim().length === 0) {
    throw new Error(`${label} name must be a non-empty string`);
  }
}

function validateFailures(value: unknown, label: string): asserts value is readonly string[] {
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
