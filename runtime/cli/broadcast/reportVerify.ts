import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateBroadcastCliVerificationResult } from "../../broadcast/cliReportValidation.js";
import { verifyAgentProposalExecutionBroadcastReport } from "../../broadcast/reportVerify.js";

export interface BroadcastReportVerifyCliArgs {
  reportPath: string;
  broadcastReceiptPath: string;
  broadcastPackagePath: string;
  submitResultPath: string;
}

export interface BroadcastReportVerifyCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyReport?: (params: unknown) => BroadcastReportVerifyCliResult;
}

interface BroadcastReportVerifyCliResult {
  passed: boolean;
  failures: readonly string[];
  report?: unknown;
}

if (isBroadcastReportVerifyDirectRun(import.meta.url, process.argv)) await runBroadcastReportVerifyCli();

export async function runBroadcastReportVerifyCli(options: BroadcastReportVerifyCliOptions = {}): Promise<void> {
  validateBroadcastReportVerifyOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const verifyReport = options.verifyReport ?? ((params: unknown) =>
    verifyAgentProposalExecutionBroadcastReport(
      params as Parameters<typeof verifyAgentProposalExecutionBroadcastReport>[0],
    ) as BroadcastReportVerifyCliResult);

  validateBroadcastReportVerifyOutputWriter(writeOutput);
  validateBroadcastReportVerifyArgv(argv);
  const args = parseBroadcastReportVerifyCliArgs(argv);
  validateBroadcastReportVerifyTextReader(readText);
  validateBroadcastReportVerifier(verifyReport);

  const verification = verifyReport({
    reportMarkdown: await readText(args.reportPath),
    broadcastReceiptPath: args.broadcastReceiptPath,
    broadcastReceiptJson: await readText(args.broadcastReceiptPath),
    broadcastPackagePath: args.broadcastPackagePath,
    broadcastPackageJson: await readText(args.broadcastPackagePath),
    submitResultPath: args.submitResultPath,
    submitResultJson: await readText(args.submitResultPath),
  });
  validateBroadcastCliVerificationResult(verification, "Broadcast report verification result");

  writeOutput(JSON.stringify({
    reportPath: args.reportPath,
    broadcastReceipt: args.broadcastReceiptPath,
    broadcastPackage: args.broadcastPackagePath,
    submitResult: args.submitResultPath,
    ...verification,
  }, null, 2));

  if (!verification.passed) {
    validateBroadcastReportVerifyExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseBroadcastReportVerifyCliArgs(argv: readonly string[]): BroadcastReportVerifyCliArgs {
  validateBroadcastReportVerifyArgv(argv);
  const values = new Map<string, string>();
  const flags = ["--report", "--broadcast-receipt", "--broadcast-package", "--submit-result"] as const;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if ((flags as readonly string[]).includes(arg)) {
      setBroadcastReportVerifyOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(/^(--report|--broadcast-receipt|--broadcast-package|--submit-result)=(.*)$/u);
    if (equals !== null) {
      setBroadcastReportVerifyOption(values, equals[1]!, equals[2]!);
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  const reportPath = values.get("--report");
  if (reportPath === undefined) throw new Error("--report is required");
  const broadcastReceiptPath = values.get("--broadcast-receipt");
  if (broadcastReceiptPath === undefined) throw new Error("--broadcast-receipt is required");
  const broadcastPackagePath = values.get("--broadcast-package");
  if (broadcastPackagePath === undefined) throw new Error("--broadcast-package is required");
  const submitResultPath = values.get("--submit-result");
  if (submitResultPath === undefined) throw new Error("--submit-result is required");

  return {
    reportPath,
    broadcastReceiptPath,
    broadcastPackagePath,
    submitResultPath,
  };
}

export function isBroadcastReportVerifyDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateBroadcastReportVerifyArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function setBroadcastReportVerifyOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function validateBroadcastReportVerifyOptions(options: unknown): asserts options is BroadcastReportVerifyCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Broadcast report verify options must be an object");
  }
}

function validateBroadcastReportVerifyArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) throw new Error(message);
}

function validateBroadcastReportVerifyOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}

function validateBroadcastReportVerifyExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") throw new Error("Exit code setter must be a function");
}

function validateBroadcastReportVerifyTextReader(readText: unknown): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") throw new Error("Text reader must be a function");
}

function validateBroadcastReportVerifier(
  verifyReport: unknown,
): asserts verifyReport is (params: unknown) => BroadcastReportVerifyCliResult {
  if (typeof verifyReport !== "function") throw new Error("Broadcast report verifier must be a function");
}
