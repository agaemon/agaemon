import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateBroadcastCliReportResult } from "../../broadcast/cliReportValidation.js";
import { createAgentProposalExecutionBroadcastReport } from "../../broadcast/report.js";

export interface BroadcastReportCliArgs {
  broadcastReceiptPath: string;
  broadcastPackagePath: string;
  submitResultPath: string;
  outputPath?: string | undefined;
}

export interface BroadcastReportCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  createReport?: (params: unknown) => BroadcastReportCliResult;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

interface BroadcastReportCliResult {
  passed: boolean;
  failures: readonly string[];
  markdown: string;
  transactions: number;
}

if (isBroadcastReportDirectRun(import.meta.url, process.argv)) await runBroadcastReportCli();

export async function runBroadcastReportCli(options: BroadcastReportCliOptions = {}): Promise<void> {
  validateBroadcastReportOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const createReport = options.createReport ?? ((params: unknown) =>
    createAgentProposalExecutionBroadcastReport(
      params as Parameters<typeof createAgentProposalExecutionBroadcastReport>[0],
    ) as BroadcastReportCliResult);
  const mkdirp = options.mkdirp ?? (async (dir: string) => {
    await mkdir(dir, { recursive: true });
  });
  const writeText = options.writeText ?? writeFile;

  validateBroadcastReportOutputWriter(writeOutput);
  validateBroadcastReportArgv(argv);
  const args = parseBroadcastReportCliArgs(argv);
  validateBroadcastReportTextReader(readText);
  validateBroadcastReportCreator(createReport);

  const result = createReport({
    broadcastReceiptPath: args.broadcastReceiptPath,
    broadcastReceiptJson: await readText(args.broadcastReceiptPath),
    broadcastPackagePath: args.broadcastPackagePath,
    broadcastPackageJson: await readText(args.broadcastPackagePath),
    submitResultPath: args.submitResultPath,
    submitResultJson: await readText(args.submitResultPath),
  });
  validateBroadcastCliReportResult(result);

  if (result.passed && args.outputPath !== undefined) {
    validateBroadcastReportDirectoryCreator(mkdirp);
    validateBroadcastReportTextWriter(writeText);
    await mkdirp(dirname(args.outputPath));
    await writeText(args.outputPath, result.markdown);
  }

  writeOutput(JSON.stringify({
    broadcastReceipt: args.broadcastReceiptPath,
    broadcastPackage: args.broadcastPackagePath,
    submitResult: args.submitResultPath,
    output: args.outputPath,
    passed: result.passed,
    failures: result.failures,
    transactions: result.transactions,
  }, null, 2));

  if (!result.passed) {
    validateBroadcastReportExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseBroadcastReportCliArgs(argv: readonly string[]): BroadcastReportCliArgs {
  validateBroadcastReportArgv(argv);
  const values = new Map<string, string>();
  const flags = ["--broadcast-receipt", "--broadcast-package", "--submit-result", "--output"] as const;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if ((flags as readonly string[]).includes(arg)) {
      setBroadcastReportOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(/^(--broadcast-receipt|--broadcast-package|--submit-result|--output)=(.*)$/u);
    if (equals !== null) {
      setBroadcastReportOption(values, equals[1]!, equals[2]!);
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  const broadcastReceiptPath = values.get("--broadcast-receipt");
  if (broadcastReceiptPath === undefined) throw new Error("--broadcast-receipt is required");
  const broadcastPackagePath = values.get("--broadcast-package");
  if (broadcastPackagePath === undefined) throw new Error("--broadcast-package is required");
  const submitResultPath = values.get("--submit-result");
  if (submitResultPath === undefined) throw new Error("--submit-result is required");

  return {
    broadcastReceiptPath,
    broadcastPackagePath,
    submitResultPath,
    ...(values.has("--output") ? { outputPath: values.get("--output")! } : {}),
  };
}

export function isBroadcastReportDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateBroadcastReportArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function setBroadcastReportOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function validateBroadcastReportOptions(options: unknown): asserts options is BroadcastReportCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Broadcast report options must be an object");
  }
}

function validateBroadcastReportArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) throw new Error(message);
}

function validateBroadcastReportOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}

function validateBroadcastReportExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") throw new Error("Exit code setter must be a function");
}

function validateBroadcastReportTextReader(readText: unknown): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") throw new Error("Text reader must be a function");
}

function validateBroadcastReportCreator(
  createReport: unknown,
): asserts createReport is (params: unknown) => BroadcastReportCliResult {
  if (typeof createReport !== "function") throw new Error("Broadcast report creator must be a function");
}

function validateBroadcastReportDirectoryCreator(mkdirp: unknown): asserts mkdirp is (dir: string) => Promise<void> {
  if (typeof mkdirp !== "function") throw new Error("Directory creator must be a function");
}

function validateBroadcastReportTextWriter(
  writeText: unknown,
): asserts writeText is (path: string, contents: string) => Promise<void> {
  if (typeof writeText !== "function") throw new Error("Text writer must be a function");
}
