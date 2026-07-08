import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateBroadcastCloseoutVerificationResult } from "../../../broadcastCloseout/cliReportValidation.js";
import { verifyAgentProposalExecutionBroadcastCloseoutEvidenceSetSummary } from "../../../broadcastCloseout/evidenceSet/summaryVerify.js";

export interface BroadcastCloseoutEvidenceSetSummaryVerifyCliArgs {
  summaryPath: string;
  reportPath: string;
  archivePath: string;
  statusPath: string;
  broadcastReceiptPath: string;
  broadcastPackagePath: string;
  submitResultPath: string;
}

export interface BroadcastCloseoutEvidenceSetSummaryVerifyCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifySummary?: (params: unknown) => BroadcastCloseoutEvidenceSetSummaryVerifyCliResult;
}

interface BroadcastCloseoutEvidenceSetSummaryVerifyCliResult {
  passed: boolean;
  failures: readonly string[];
  expected?: string;
}

if (isBroadcastCloseoutEvidenceSetSummaryVerifyDirectRun(import.meta.url, process.argv)) {
  await runBroadcastCloseoutEvidenceSetSummaryVerifyCli();
}

export async function runBroadcastCloseoutEvidenceSetSummaryVerifyCli(
  options: BroadcastCloseoutEvidenceSetSummaryVerifyCliOptions = {},
): Promise<void> {
  validateOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const verifySummary = options.verifySummary ?? ((params: unknown) =>
    verifyAgentProposalExecutionBroadcastCloseoutEvidenceSetSummary(
      params as Parameters<typeof verifyAgentProposalExecutionBroadcastCloseoutEvidenceSetSummary>[0],
    ) as BroadcastCloseoutEvidenceSetSummaryVerifyCliResult);

  validateOutputWriter(writeOutput);
  validateArgv(argv);
  const args = parseBroadcastCloseoutEvidenceSetSummaryVerifyCliArgs(argv);
  validateTextReader(readText);
  validateSummaryVerifier(verifySummary);

  const verification = verifySummary({
    summaryMarkdown: await readText(args.summaryPath),
    reportPath: args.reportPath,
    reportMarkdown: await readText(args.reportPath),
    archivePath: args.archivePath,
    archiveJson: await readText(args.archivePath),
    statusPath: args.statusPath,
    statusJson: await readText(args.statusPath),
    broadcastReceiptPath: args.broadcastReceiptPath,
    broadcastReceiptJson: await readText(args.broadcastReceiptPath),
    broadcastPackagePath: args.broadcastPackagePath,
    broadcastPackageJson: await readText(args.broadcastPackagePath),
    submitResultPath: args.submitResultPath,
    submitResultJson: await readText(args.submitResultPath),
  });
  validateBroadcastCloseoutVerificationResult(
    verification,
    "Broadcast closeout evidence summary verification result",
  );

  writeOutput(JSON.stringify({
    summary: args.summaryPath,
    report: args.reportPath,
    archive: args.archivePath,
    status: args.statusPath,
    broadcastReceipt: args.broadcastReceiptPath,
    broadcastPackage: args.broadcastPackagePath,
    submitResult: args.submitResultPath,
    passed: verification.passed,
    failures: verification.failures,
  }, null, 2));

  if (!verification.passed) {
    validateExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseBroadcastCloseoutEvidenceSetSummaryVerifyCliArgs(
  argv: readonly string[],
): BroadcastCloseoutEvidenceSetSummaryVerifyCliArgs {
  validateArgv(argv);
  const values = parseValues(argv, [
    "--summary",
    "--report",
    "--archive",
    "--status",
    "--broadcast-receipt",
    "--broadcast-package",
    "--submit-result",
  ]);
  return {
    summaryPath: readRequired(values, "--summary"),
    reportPath: readRequired(values, "--report"),
    archivePath: readRequired(values, "--archive"),
    statusPath: readRequired(values, "--status"),
    broadcastReceiptPath: readRequired(values, "--broadcast-receipt"),
    broadcastPackagePath: readRequired(values, "--broadcast-package"),
    submitResultPath: readRequired(values, "--submit-result"),
  };
}

export function isBroadcastCloseoutEvidenceSetSummaryVerifyDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
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

function validateOptions(options: unknown): asserts options is BroadcastCloseoutEvidenceSetSummaryVerifyCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Broadcast closeout evidence set summary verify options must be an object");
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
): asserts verifySummary is (params: unknown) => BroadcastCloseoutEvidenceSetSummaryVerifyCliResult {
  if (typeof verifySummary !== "function") throw new Error("Broadcast closeout evidence set summary verifier must be a function");
}
