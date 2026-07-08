import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyPackageStatusSummary } from "../../../../../broadcastCloseout/finalizationArchive/statusSummaryPackage/statusSummary/verify.js";

export interface BroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusSummaryVerifyCliArgs {
  finalizationArchiveStatusSummaryPackageStatusSummaryPath: string;
  finalizationArchiveStatusSummaryPackageStatusPath: string;
  finalizationArchiveStatusSummaryPackagePath: string;
  finalizationArchiveStatusSummaryPath: string;
  finalizationArchiveStatusPath: string;
  finalizationArchivePath: string;
  reportPath: string;
  archivePath: string;
  statusPath: string;
  summaryPath: string;
  finalizationStatusPath: string;
  broadcastReceiptPath: string;
  broadcastPackagePath: string;
  submitResultPath: string;
}

export interface BroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusSummaryVerifyCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifySummary?: (params: unknown) => BroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusSummaryVerifyCliResult;
}

interface BroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusSummaryVerifyCliResult {
  passed: boolean;
  failures: readonly string[];
  expected?: string;
}

if (isBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusSummaryVerifyDirectRun(import.meta.url, process.argv)) {
  await runBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusSummaryVerifyCli();
}

export async function runBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusSummaryVerifyCli(
  options: BroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusSummaryVerifyCliOptions = {},
): Promise<void> {
  validateOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const verifySummary = options.verifySummary ?? ((params: unknown) =>
    verifyPackageStatusSummary(
      params as Parameters<typeof verifyPackageStatusSummary>[0],
    ) as BroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusSummaryVerifyCliResult);

  validateOutputWriter(writeOutput);
  validateArgv(argv);
  const args = parseBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusSummaryVerifyCliArgs(argv);
  validateTextReader(readText);
  validateSummaryVerifier(verifySummary);

  const verification = verifySummary({
    finalizationArchiveStatusSummaryPackageStatusSummaryMarkdown: await readText(
      args.finalizationArchiveStatusSummaryPackageStatusSummaryPath,
    ),
    finalizationArchiveStatusSummaryPackageStatusPath: args.finalizationArchiveStatusSummaryPackageStatusPath,
    finalizationArchiveStatusSummaryPackageStatusJson: await readText(
      args.finalizationArchiveStatusSummaryPackageStatusPath,
    ),
    finalizationArchiveStatusSummaryPackagePath: args.finalizationArchiveStatusSummaryPackagePath,
    finalizationArchiveStatusSummaryPackageJson: await readText(args.finalizationArchiveStatusSummaryPackagePath),
    finalizationArchiveStatusSummaryPath: args.finalizationArchiveStatusSummaryPath,
    finalizationArchiveStatusSummaryMarkdown: await readText(args.finalizationArchiveStatusSummaryPath),
    finalizationArchiveStatusPath: args.finalizationArchiveStatusPath,
    finalizationArchiveStatusJson: await readText(args.finalizationArchiveStatusPath),
    finalizationArchivePath: args.finalizationArchivePath,
    finalizationArchiveJson: await readText(args.finalizationArchivePath),
    reportPath: args.reportPath,
    reportMarkdown: await readText(args.reportPath),
    archivePath: args.archivePath,
    archiveJson: await readText(args.archivePath),
    statusPath: args.statusPath,
    statusJson: await readText(args.statusPath),
    summaryPath: args.summaryPath,
    summaryMarkdown: await readText(args.summaryPath),
    finalizationStatusPath: args.finalizationStatusPath,
    finalizationStatusJson: await readText(args.finalizationStatusPath),
    broadcastReceiptPath: args.broadcastReceiptPath,
    broadcastReceiptJson: await readText(args.broadcastReceiptPath),
    broadcastPackagePath: args.broadcastPackagePath,
    broadcastPackageJson: await readText(args.broadcastPackagePath),
    submitResultPath: args.submitResultPath,
    submitResultJson: await readText(args.submitResultPath),
  });

  writeOutput(JSON.stringify({
    finalizationArchiveStatusSummaryPackageStatusSummary:
      args.finalizationArchiveStatusSummaryPackageStatusSummaryPath,
    finalizationArchiveStatusSummaryPackageStatus: args.finalizationArchiveStatusSummaryPackageStatusPath,
    finalizationArchiveStatusSummaryPackage: args.finalizationArchiveStatusSummaryPackagePath,
    finalizationArchiveStatusSummary: args.finalizationArchiveStatusSummaryPath,
    finalizationArchiveStatus: args.finalizationArchiveStatusPath,
    finalizationArchive: args.finalizationArchivePath,
    report: args.reportPath,
    archive: args.archivePath,
    status: args.statusPath,
    summary: args.summaryPath,
    finalizationStatus: args.finalizationStatusPath,
    broadcastReceipt: args.broadcastReceiptPath,
    broadcastPackage: args.broadcastPackagePath,
    submitResult: args.submitResultPath,
    ...verification,
  }, null, 2));

  if (!verification.passed) {
    validateExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusSummaryVerifyCliArgs(
  argv: readonly string[],
): BroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusSummaryVerifyCliArgs {
  validateArgv(argv);
  const values = parseValues(argv, [
    "--finalization-archive-status-summary-package-status-summary",
    "--finalization-archive-status-summary-package-status",
    "--finalization-archive-status-summary-package",
    "--finalization-archive-status-summary",
    "--finalization-archive-status",
    "--finalization-archive",
    "--finalization-status",
    "--broadcast-receipt",
    "--broadcast-package",
    "--submit-result",
    "--report",
    "--archive",
    "--status",
    "--summary",
  ]);
  return {
    finalizationArchiveStatusSummaryPackageStatusSummaryPath: readRequired(
      values,
      "--finalization-archive-status-summary-package-status-summary",
    ),
    finalizationArchiveStatusSummaryPackageStatusPath: readRequired(
      values,
      "--finalization-archive-status-summary-package-status",
    ),
    finalizationArchiveStatusSummaryPackagePath: readRequired(
      values,
      "--finalization-archive-status-summary-package",
    ),
    finalizationArchiveStatusSummaryPath: readRequired(values, "--finalization-archive-status-summary"),
    finalizationArchiveStatusPath: readRequired(values, "--finalization-archive-status"),
    finalizationArchivePath: readRequired(values, "--finalization-archive"),
    reportPath: readRequired(values, "--report"),
    archivePath: readRequired(values, "--archive"),
    statusPath: readRequired(values, "--status"),
    summaryPath: readRequired(values, "--summary"),
    finalizationStatusPath: readRequired(values, "--finalization-status"),
    broadcastReceiptPath: readRequired(values, "--broadcast-receipt"),
    broadcastPackagePath: readRequired(values, "--broadcast-package"),
    submitResultPath: readRequired(values, "--submit-result"),
  };
}

export function isBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusSummaryVerifyDirectRun(
  moduleUrl: string,
  argv: readonly string[],
): boolean {
  validateArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function parseValues(argv: readonly string[], flags: readonly string[]): Map<string, string> {
  const values = new Map<string, string>();
  const pattern = new RegExp(`^(${flags.join("|")})=(.*)$`, "u");

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (flags.includes(arg)) {
      setOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }
    const equals = arg.match(pattern);
    if (equals !== null) {
      setOption(values, equals[1]!, equals[2]!);
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }
  return values;
}

function readRequired(values: Map<string, string>, flag: string): string {
  const value = values.get(flag);
  if (value === undefined) throw new Error(`${flag} is required`);
  return value;
}

function setOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function validateOptions(options: unknown): asserts options is BroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusSummaryVerifyCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Broadcast closeout finalization archive status summary package status summary verify options must be an object");
  }
}

function validateArgv(argv: unknown, message = "CLI argv must be an array of strings"): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) throw new Error(message);
}

function validateOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}

function validateExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") throw new Error("Exit code setter must be a function");
}

function validateTextReader(readText: unknown): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") throw new Error("Text reader must be a function");
}

function validateSummaryVerifier(
  verifySummary: unknown,
): asserts verifySummary is (params: unknown) => BroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusSummaryVerifyCliResult {
  if (typeof verifySummary !== "function") {
    throw new Error("Broadcast closeout finalization archive status summary package status summary verifier must be a function");
  }
}
