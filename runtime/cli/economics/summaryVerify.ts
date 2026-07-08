import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  formatEconomicPayoutSummaryVerificationSummary,
  verifyEconomicPayoutSummary,
} from "../../economics/summaryVerify.js";

import type { EconomicPayoutSummary } from "../../economics/summary.js";
import type { EconomicPayoutSummaryVerification } from "../../economics/summaryVerify.js";
import type { CoordinationAssignmentPayoutReconciliation } from "../../payouts/coordination.js";

const DEFAULT_SUMMARY_PATH = "artifacts/economic-payout-summary.json";
const DEFAULT_RECONCILIATIONS_PATH = "artifacts/coordination-payout-reconciliations.json";

export type EconomicPayoutSummaryVerifyCliFormat = "json" | "summary";

export interface EconomicPayoutSummaryVerifyCliArgs {
  summaryPath: string;
  reconciliationsPath: string;
  outputPath?: string | undefined;
  format: EconomicPayoutSummaryVerifyCliFormat;
}

export interface EconomicPayoutSummaryVerifyCliOptions {
  argv?: readonly string[] | undefined;
  env?: Record<string, string | undefined> | undefined;
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  writeText?: (path: string, contents: string) => Promise<void>;
  mkdirp?: (path: string) => Promise<void>;
  verifySummary?: (params: {
    saved: EconomicPayoutSummary;
    reconciliations: CoordinationAssignmentPayoutReconciliation[];
  }) => EconomicPayoutSummaryVerification;
}

if (isEconomicPayoutSummaryVerifyDirectRun(import.meta.url, process.argv)) {
  await runEconomicPayoutSummaryVerifyCli();
}

export async function runEconomicPayoutSummaryVerifyCli(
  options: EconomicPayoutSummaryVerifyCliOptions = {},
): Promise<void> {
  validateOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => { process.exitCode = code; });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const writeText = options.writeText ?? writeFile;
  const mkdirp = options.mkdirp ?? ((path: string) => mkdir(path, { recursive: true }));
  const verifySummary = options.verifySummary ?? verifyEconomicPayoutSummary;

  validateStringArray(argv, "CLI argv must be an array of strings");
  validateOutputWriter(writeOutput);
  const args = parseEconomicPayoutSummaryVerifyCliArgs(argv);
  const [summaryJson, reconciliationsJson] = await Promise.all([
    readText(args.summaryPath),
    readText(args.reconciliationsPath),
  ]);
  const verification = verifySummary({
    saved: JSON.parse(summaryJson) as EconomicPayoutSummary,
    reconciliations: readReconciliations(reconciliationsJson),
  });

  if (args.outputPath !== undefined) {
    await mkdirp(dirname(args.outputPath));
    await writeText(args.outputPath, `${JSON.stringify(verification, null, 2)}\n`);
  }

  writeOutput(formatEconomicPayoutSummaryVerifyCliOutput(verification, args.format));

  if (!verification.passed) {
    validateExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseEconomicPayoutSummaryVerifyCliArgs(
  argv: readonly string[],
): EconomicPayoutSummaryVerifyCliArgs {
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
    const equals = arg.match(/^(--summary|--reconciliations|--output|--format)=(.*)$/u);
    if (equals !== null) {
      setOption(values, equals[1]!, equals[2]!);
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }

  return {
    summaryPath: values.get("--summary") ?? DEFAULT_SUMMARY_PATH,
    reconciliationsPath: values.get("--reconciliations") ?? DEFAULT_RECONCILIATIONS_PATH,
    ...(values.has("--output") ? { outputPath: values.get("--output")! } : {}),
    format: readFormat(values.get("--format") ?? "json"),
  };
}

export function formatEconomicPayoutSummaryVerifyCliOutput(
  verification: EconomicPayoutSummaryVerification,
  format: EconomicPayoutSummaryVerifyCliFormat,
): string {
  validateFormat(format);
  return format === "summary"
    ? formatEconomicPayoutSummaryVerificationSummary(verification)
    : JSON.stringify(verification, null, 2);
}

export function isEconomicPayoutSummaryVerifyDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateStringArray(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function readReconciliations(json: string): CoordinationAssignmentPayoutReconciliation[] {
  const parsed = JSON.parse(json) as unknown;
  if (!Array.isArray(parsed)) throw new Error("payout reconciliations must be a JSON array");
  return parsed as CoordinationAssignmentPayoutReconciliation[];
}

function isValueFlag(arg: string): boolean {
  return arg === "--summary" || arg === "--reconciliations" || arg === "--output" || arg === "--format";
}

function setOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function readFormat(value: string): EconomicPayoutSummaryVerifyCliFormat {
  validateFormat(value, "--format must be json or summary");
  return value;
}

function validateFormat(
  value: unknown,
  message = "Economic payout summary verify output format must be json or summary",
): asserts value is EconomicPayoutSummaryVerifyCliFormat {
  if (value !== "json" && value !== "summary") throw new Error(message);
}

function validateOptions(options: unknown): asserts options is EconomicPayoutSummaryVerifyCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Economic payout summary verify options must be an object");
  }
}

function validateStringArray(value: unknown, message: string): asserts value is readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) throw new Error(message);
}

function validateOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}

function validateExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") throw new Error("Exit code setter must be a function");
}
