export function requireReportObject(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

export function requireReportString(value: unknown, message: string): void {
  if (typeof value !== "string" || value.length === 0) throw new Error(message);
}

export function requireReportNumber(value: unknown, message: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(message);
}

export function requireReportBoolean(value: unknown, message: string): void {
  if (typeof value !== "boolean") throw new Error(message);
}

export function validateReportTransaction(value: unknown, label: string): void {
  if (value === null) return;
  const transaction = requireReportObject(value, `${label} transaction must be an object or null`);
  requireReportString(transaction.to, `${label} transaction to must be a string`);
  requireReportString(transaction.value, `${label} transaction value must be a string`);
  requireReportString(transaction.data, `${label} transaction data must be a string`);
}

export function validateReportReceipt(value: unknown, label: string): void {
  const receipt = requireReportObject(value, `${label} receipt must be an object`);
  requireReportString(receipt.blockNumber, `${label} receipt blockNumber must be a string`);
  requireReportString(receipt.status, `${label} receipt status must be a string`);
}

export function validateReportChecks(value: unknown, label: string): void {
  const checks = requireReportObject(value, `${label} checks must be an object`);
  if (Object.values(checks).some((check) => typeof check !== "boolean")) {
    throw new Error(`${label} checks values must be booleans`);
  }
}

export function validateReportDecision(value: unknown, label: string): void {
  requireReportObject(value, `${label} decision must be an object`);
}
