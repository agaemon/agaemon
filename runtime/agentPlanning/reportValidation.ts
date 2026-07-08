export type AgentPlanningSourceField = "intent" | "plan";

export function validateAgentIntentPlanCliReport(value: unknown): void {
  const report = requireReportObject(value, "Intent plan report must be an object");
  requireReportString(report.objective, "Intent plan report objective must be a string");
  validateReportArray(report.steps, "Intent plan report steps", (step, index) =>
    validatePlanStep(step, `Intent plan report steps[${index}]`));
}

export function validateAgentProposalCliReport(
  value: unknown,
  label: string,
  sourceField: AgentPlanningSourceField,
): void {
  const report = requireReportObject(value, `${label} report must be an object`);
  requireDryRunMode(report.mode, `${label} report mode must be dry-run`);
  requireReportNumber(report.chainId, `${label} report chainId must be a number`);
  requireReportString(report.manifest, `${label} report manifest must be a string`);
  validateReportSource(report, label, sourceField);
  requireReportString(report.objective, `${label} report objective must be a string`);
  requireReportString(report.agent, `${label} report agent must be a string`);
  requireReportBoolean(report.executable, `${label} report executable must be a boolean`);
  validateReportArray(report.steps, `${label} report steps`, (step, index) =>
    validateProposalStep(step, `${label} report steps[${index}]`));
}

export function validateAgentProposalCliWriteSummary(
  value: unknown,
  label: string,
  sourceField: AgentPlanningSourceField,
): void {
  const summary = requireReportObject(value, `${label} write summary must be an object`);
  requireDryRunMode(summary.mode, `${label} write summary mode must be dry-run`);
  requireReportNumber(summary.chainId, `${label} write summary chainId must be a number`);
  requireReportString(summary.manifest, `${label} write summary manifest must be a string`);
  validateReportSource(summary, `${label} write summary`, sourceField);
  requireReportString(summary.output, `${label} write summary output must be a string`);
  requireReportBoolean(summary.executable, `${label} write summary executable must be a boolean`);
  requireReportNumber(summary.steps, `${label} write summary steps must be a number`);
  requireTrue(summary.written, `${label} write summary written must be true`);
}

function validateProposalStep(value: unknown, label: string): void {
  const step = requireReportObject(value, `${label} must be an object`);
  requireReportString(step.id, `${label} id must be a string`);
  requireReportString(step.title, `${label} title must be a string`);
  validateAction(step.action, `${label} action`);
  requireReportObject(step.decision, `${label} decision must be an object`);
  validateTransaction(step.transaction, `${label} transaction`);
}

function validatePlanStep(value: unknown, label: string): void {
  const step = requireReportObject(value, `${label} must be an object`);
  requireReportString(step.id, `${label} id must be a string`);
  requireReportString(step.title, `${label} title must be a string`);
  validateAction(step.action, `${label} action`);
}

function validateAction(value: unknown, label: string): void {
  const action = requireReportObject(value, `${label} must be an object`);
  requireReportString(action.capability, `${label} capability must be a string`);
  requireReportString(action.target, `${label} target must be a string`);
  requireReportString(action.valueWei, `${label} valueWei must be a string`);
  requireReportString(action.data, `${label} data must be a string`);
  requireReportBoolean(action.usesBorrowing, `${label} usesBorrowing must be a boolean`);
}

function validateTransaction(value: unknown, label: string): void {
  if (value === null) return;
  const transaction = requireReportObject(value, `${label} must be an object or null`);
  requireReportString(transaction.to, `${label} to must be a string`);
  requireReportString(transaction.value, `${label} value must be a string`);
  requireReportString(transaction.data, `${label} data must be a string`);
}

function validateReportSource(
  report: Record<string, unknown>,
  label: string,
  sourceField: AgentPlanningSourceField,
): void {
  requireReportString(report[sourceField], `${label} ${sourceField} must be a string`);
}

function validateReportArray(
  value: unknown,
  label: string,
  validateItem: (value: unknown, index: number) => void,
): void {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  value.forEach(validateItem);
}

function requireReportObject(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function requireReportString(value: unknown, message: string): void {
  if (typeof value !== "string" || value.length === 0) throw new Error(message);
}

function requireReportNumber(value: unknown, message: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(message);
}

function requireReportBoolean(value: unknown, message: string): void {
  if (typeof value !== "boolean") throw new Error(message);
}

function requireDryRunMode(value: unknown, message: string): void {
  if (value !== "dry-run") throw new Error(message);
}

function requireTrue(value: unknown, message: string): void {
  if (value !== true) throw new Error(message);
}
