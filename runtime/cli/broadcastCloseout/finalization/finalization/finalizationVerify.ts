import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyAgentProposalExecutionBroadcastCloseoutFinalization } from "../../../../broadcastCloseout/finalization/finalization/finalizationVerify.js";

export interface BroadcastCloseoutFinalizationVerifyCliArgs {
  summaryPath: string;
  reportPath: string;
  archivePath: string;
  statusPath: string;
  broadcastReceiptPath: string;
  broadcastPackagePath: string;
  submitResultPath: string;
}

export interface BroadcastCloseoutFinalizationVerifyCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyFinalization?: (params: unknown) => BroadcastCloseoutFinalizationVerifyCliResult;
}

interface BroadcastCloseoutFinalizationVerifyCliResult {
  passed: boolean;
  failures: readonly string[];
  checks?: readonly unknown[];
}

if (isBroadcastCloseoutFinalizationVerifyDirectRun(import.meta.url, process.argv)) {
  await runBroadcastCloseoutFinalizationVerifyCli();
}

export async function runBroadcastCloseoutFinalizationVerifyCli(
  options: BroadcastCloseoutFinalizationVerifyCliOptions = {},
): Promise<void> {
  validateOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const verifyFinalization = options.verifyFinalization ?? ((params: unknown) =>
    verifyAgentProposalExecutionBroadcastCloseoutFinalization(
      params as Parameters<typeof verifyAgentProposalExecutionBroadcastCloseoutFinalization>[0],
    ) as BroadcastCloseoutFinalizationVerifyCliResult);

  validateOutputWriter(writeOutput);
  validateArgv(argv);
  const args = parseBroadcastCloseoutFinalizationVerifyCliArgs(argv);
  validateTextReader(readText);
  validateFinalizationVerifier(verifyFinalization);

  const verification = verifyFinalization({
    summaryPath: args.summaryPath,
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

  writeOutput(JSON.stringify({
    summary: args.summaryPath,
    report: args.reportPath,
    archive: args.archivePath,
    status: args.statusPath,
    broadcastReceipt: args.broadcastReceiptPath,
    broadcastPackage: args.broadcastPackagePath,
    submitResult: args.submitResultPath,
    checks: verification.checks,
    passed: verification.passed,
    failures: verification.failures,
  }, null, 2));

  if (!verification.passed) {
    validateExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseBroadcastCloseoutFinalizationVerifyCliArgs(
  argv: readonly string[],
): BroadcastCloseoutFinalizationVerifyCliArgs {
  validateArgv(argv);
  const values = parseValues(argv);
  return readFinalizationValues(values);
}

export function isBroadcastCloseoutFinalizationVerifyDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

export function parseValues(argv: readonly string[]): Map<string, string> {
  const flags = ["--summary", "--report", "--archive", "--status", "--broadcast-receipt", "--broadcast-package", "--submit-result"];
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

export function readFinalizationValues(values: Map<string, string>): BroadcastCloseoutFinalizationVerifyCliArgs {
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

function validateOptions(options: unknown): asserts options is BroadcastCloseoutFinalizationVerifyCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Broadcast closeout finalization verify options must be an object");
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

function validateFinalizationVerifier(
  verifyFinalization: unknown,
): asserts verifyFinalization is (params: unknown) => BroadcastCloseoutFinalizationVerifyCliResult {
  if (typeof verifyFinalization !== "function") throw new Error("Broadcast closeout finalization verifier must be a function");
}
