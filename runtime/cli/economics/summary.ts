import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createEconomicPayoutSummary } from "../../economics/summary.js";

import type { EconomicPayoutSummary } from "../../economics/summary.js";
import type { CoordinationAssignmentPayoutReconciliation } from "../../payouts/coordination.js";

const DEFAULT_RECONCILIATIONS_PATH = "artifacts/coordination-payout-reconciliations.json";

export type EconomicPayoutSummaryCliFormat = "json" | "summary";

export interface EconomicPayoutSummaryCliArgs {
  reconciliationsPath: string;
  outputPath?: string | undefined;
  format: EconomicPayoutSummaryCliFormat;
}

export interface EconomicPayoutSummaryCliOptions {
  argv?: readonly string[] | undefined;
  env?: Record<string, string | undefined> | undefined;
  writeOutput?: (output: string) => void;
  readText?: (path: string) => Promise<string>;
  writeText?: (path: string, contents: string) => Promise<void>;
  mkdirp?: (path: string) => Promise<void>;
  createSummary?: (params: { reconciliations: CoordinationAssignmentPayoutReconciliation[] }) => EconomicPayoutSummary;
}

if (isEconomicPayoutSummaryDirectRun(import.meta.url, process.argv)) await runEconomicPayoutSummaryCli();

export async function runEconomicPayoutSummaryCli(options: EconomicPayoutSummaryCliOptions = {}): Promise<void> {
  validateOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const writeText = options.writeText ?? writeFile;
  const mkdirp = options.mkdirp ?? ((path: string) => mkdir(path, { recursive: true }));
  const createSummary = options.createSummary ?? createEconomicPayoutSummary;

  validateStringArray(argv, "CLI argv must be an array of strings");
  validateOutputWriter(writeOutput);
  const args = parseEconomicPayoutSummaryCliArgs(argv);
  const reconciliations = readReconciliations(await readText(args.reconciliationsPath));
  const summary = createSummary({ reconciliations });

  if (args.outputPath !== undefined) {
    await mkdirp(dirname(args.outputPath));
    await writeText(args.outputPath, `${JSON.stringify(summary, null, 2)}\n`);
  }

  writeOutput(formatEconomicPayoutSummaryCliOutput(summary, args.format));
}

export function parseEconomicPayoutSummaryCliArgs(argv: readonly string[]): EconomicPayoutSummaryCliArgs {
  validateStringArray(argv, "CLI argv must be an array of strings");
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (isValueFlag(arg)) {
      setOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }
    const equals = arg.match(/^(--reconciliations|--output|--format)=(.*)$/u);
    if (equals !== null) {
      setOption(values, equals[1]!, equals[2]!);
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }

  return {
    reconciliationsPath: values.get("--reconciliations") ?? DEFAULT_RECONCILIATIONS_PATH,
    ...(values.has("--output") ? { outputPath: values.get("--output")! } : {}),
    format: readFormat(values.get("--format") ?? "json"),
  };
}

export function formatEconomicPayoutSummaryCliOutput(
  summary: EconomicPayoutSummary,
  format: EconomicPayoutSummaryCliFormat,
): string {
  validateFormat(format);
  validateEconomicPayoutSummary(summary);
  if (format === "json") return JSON.stringify(summary, null, 2);
  return [
    "Economic payout summary",
    `totalAssignments: ${summary.totalAssignments}`,
    `paid: ${summary.paidAssignments} (${summary.paidAmountWei})`,
    `unpaid: ${summary.unpaidAssignments} (${summary.unpaidAmountWei})`,
    `blocked: ${summary.blockedAssignments} (${summary.blockedAmountWei})`,
    `lowestRemainingPeriodWei: ${summary.lowestRemainingPeriodWei}`,
    `reasons: ${summary.reasons.length}`,
    `abuseSignals: ${countAbuseSignals(summary)}`,
    `budgetFailures: ${summary.budgetFailures.length}`,
  ].join("\n");
}

export function isEconomicPayoutSummaryDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateStringArray(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function readReconciliations(json: string): CoordinationAssignmentPayoutReconciliation[] {
  const parsed = JSON.parse(json) as unknown;
  if (!Array.isArray(parsed)) throw new Error("payout reconciliations must be a JSON array");
  return parsed as CoordinationAssignmentPayoutReconciliation[];
}

function isValueFlag(arg: string): boolean {
  return arg === "--reconciliations" || arg === "--output" || arg === "--format";
}

function setOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function readFormat(value: string): EconomicPayoutSummaryCliFormat {
  validateFormat(value, "--format must be json or summary");
  return value;
}

function validateFormat(
  value: unknown,
  message = "Economic payout summary output format must be json or summary",
): asserts value is EconomicPayoutSummaryCliFormat {
  if (value !== "json" && value !== "summary") throw new Error(message);
}

function validateOptions(options: unknown): asserts options is EconomicPayoutSummaryCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Economic payout summary options must be an object");
  }
}

function validateStringArray(value: unknown, message: string): asserts value is readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) throw new Error(message);
}

function validateOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}

function validateEconomicPayoutSummary(summary: unknown): asserts summary is EconomicPayoutSummary {
  const record = requireRecord(summary, "economic payout summary");
  requireNonNegativeInteger(record.totalAssignments, "economic payout totalAssignments");
  requireNonNegativeInteger(record.paidAssignments, "economic payout paidAssignments");
  requireNonNegativeInteger(record.unpaidAssignments, "economic payout unpaidAssignments");
  requireNonNegativeInteger(record.blockedAssignments, "economic payout blockedAssignments");
  requireString(record.totalAmountWei, "economic payout totalAmountWei");
  requireString(record.paidAmountWei, "economic payout paidAmountWei");
  requireString(record.unpaidAmountWei, "economic payout unpaidAmountWei");
  requireString(record.blockedAmountWei, "economic payout blockedAmountWei");
  requireString(record.lowestRemainingPeriodWei, "economic payout lowestRemainingPeriodWei");
  if (!Array.isArray(record.reasons)) throw new Error("economic payout reasons must be an array");
  validateAbuseSignals(record.abuseSignals);
  if (!Array.isArray(record.budgetFailures)) throw new Error("economic payout budgetFailures must be an array");
}

function countAbuseSignals(summary: EconomicPayoutSummary): number {
  return summary.abuseSignals.invalidAssignments.count
    + summary.abuseSignals.ruleOrBudgetBlocks.count
    + summary.abuseSignals.evidenceMismatches.count
    + summary.abuseSignals.policyBlocks.count;
}

function validateAbuseSignals(value: unknown): void {
  const record = requireRecord(value, "economic payout abuseSignals");
  validateAbuseSignal(record.invalidAssignments, "economic payout abuseSignals.invalidAssignments");
  validateAbuseSignal(record.ruleOrBudgetBlocks, "economic payout abuseSignals.ruleOrBudgetBlocks");
  validateAbuseSignal(record.evidenceMismatches, "economic payout abuseSignals.evidenceMismatches");
  validateAbuseSignal(record.policyBlocks, "economic payout abuseSignals.policyBlocks");
}

function validateAbuseSignal(value: unknown, label: string): void {
  const record = requireRecord(value, label);
  requireNonNegativeInteger(record.count, `${label} count`);
  requireString(record.amountWei, `${label} amountWei`);
  if (!Array.isArray(record.assignmentIds) || record.assignmentIds.some((entry) => typeof entry !== "string")) {
    throw new Error(`${label} assignmentIds must be an array of strings`);
  }
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): void {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);
}

function requireNonNegativeInteger(value: unknown, label: string): void {
  if (!Number.isInteger(value) || Number(value) < 0) throw new Error(`${label} must be a non-negative integer`);
}
