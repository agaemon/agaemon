import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createFundingDemoPayoutReconciliations } from "../../economics/fundingDemoReconciliations.js";

import type { CoordinationAssignmentPayoutReconciliation } from "../../payouts/coordination.js";

export type FundingDemoPayoutReconciliationsCliFormat = "json" | "summary";

export interface FundingDemoPayoutReconciliationsCliArgs {
  outputPath?: string | undefined;
  format: FundingDemoPayoutReconciliationsCliFormat;
}

export interface FundingDemoPayoutReconciliationsCliOptions {
  argv?: readonly string[] | undefined;
  env?: Record<string, string | undefined> | undefined;
  writeOutput?: (output: string) => void;
  writeText?: (path: string, contents: string) => Promise<void>;
  mkdirp?: (path: string) => Promise<void>;
  createRows?: () => CoordinationAssignmentPayoutReconciliation[];
}

if (isFundingDemoPayoutReconciliationsDirectRun(import.meta.url, process.argv)) {
  await runFundingDemoPayoutReconciliationsCli();
}

export async function runFundingDemoPayoutReconciliationsCli(
  options: FundingDemoPayoutReconciliationsCliOptions = {},
): Promise<void> {
  validateOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const writeText = options.writeText ?? writeFile;
  const mkdirp = options.mkdirp ?? ((path: string) => mkdir(path, { recursive: true }));
  const createRows = options.createRows ?? createFundingDemoPayoutReconciliations;

  validateStringArray(argv, "CLI argv must be an array of strings");
  validateOutputWriter(writeOutput);
  validateTextWriter(writeText);
  validateDirectoryCreator(mkdirp);
  validateRowsCreator(createRows);

  const args = parseFundingDemoPayoutReconciliationsCliArgs(argv);
  const rows = createRows();

  if (args.outputPath !== undefined) {
    await mkdirp(dirname(args.outputPath));
    await writeText(args.outputPath, `${JSON.stringify(rows, null, 2)}\n`);
  }

  writeOutput(formatFundingDemoPayoutReconciliationsCliOutput(rows, args.format));
}

export function parseFundingDemoPayoutReconciliationsCliArgs(
  argv: readonly string[],
): FundingDemoPayoutReconciliationsCliArgs {
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
    const equals = arg.match(/^(--output|--format)=(.*)$/u);
    if (equals !== null) {
      setOption(values, equals[1]!, equals[2]!);
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }

  return {
    ...(values.has("--output") ? { outputPath: values.get("--output")! } : {}),
    format: readFormat(values.get("--format") ?? "json"),
  };
}

export function formatFundingDemoPayoutReconciliationsCliOutput(
  rows: readonly Pick<CoordinationAssignmentPayoutReconciliation, "assignmentId" | "status" | "reason" | "amountWei">[],
  format: FundingDemoPayoutReconciliationsCliFormat,
): string {
  validateFormat(format);
  if (format === "json") return JSON.stringify(rows, null, 2);
  const paid = rows.filter((row) => row.status === "paid").length;
  const unpaid = rows.filter((row) => row.status === "unpaid").length;
  const blocked = rows.filter((row) => row.status === "blocked").length;

  return [
    "Funding demo payout reconciliations",
    `totalAssignments: ${rows.length}`,
    `paid: ${paid}`,
    `unpaid: ${unpaid}`,
    `blocked: ${blocked}`,
  ].join("\n");
}

export function isFundingDemoPayoutReconciliationsDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateStringArray(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function isValueFlag(arg: string): boolean {
  return arg === "--output" || arg === "--format";
}

function setOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function readFormat(value: string): FundingDemoPayoutReconciliationsCliFormat {
  validateFormat(value, "--format must be json or summary");
  return value;
}

function validateFormat(
  value: unknown,
  message = "Funding demo payout reconciliations output format must be json or summary",
): asserts value is FundingDemoPayoutReconciliationsCliFormat {
  if (value !== "json" && value !== "summary") throw new Error(message);
}

function validateOptions(options: unknown): asserts options is FundingDemoPayoutReconciliationsCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Funding demo payout reconciliations options must be an object");
  }
}

function validateStringArray(value: unknown, message: string): asserts value is readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) throw new Error(message);
}

function validateOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}

function validateTextWriter(writeText: unknown): asserts writeText is (path: string, contents: string) => Promise<void> {
  if (typeof writeText !== "function") throw new Error("Text writer must be a function");
}

function validateDirectoryCreator(mkdirp: unknown): asserts mkdirp is (path: string) => Promise<void> {
  if (typeof mkdirp !== "function") throw new Error("Directory creator must be a function");
}

function validateRowsCreator(createRows: unknown): asserts createRows is () => CoordinationAssignmentPayoutReconciliation[] {
  if (typeof createRows !== "function") throw new Error("Funding demo payout reconciliations creator must be a function");
}
