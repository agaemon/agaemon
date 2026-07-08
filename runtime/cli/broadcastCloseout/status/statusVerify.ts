import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateBroadcastCloseoutVerificationResult } from "../../../broadcastCloseout/cliReportValidation.js";
import { verifyAgentProposalExecutionBroadcastCloseoutStatus } from "../../../broadcastCloseout/status/statusVerify.js";

export interface BroadcastCloseoutStatusVerifyCliArgs {
  statusPath: string;
  reportPath: string;
  archivePath: string;
  broadcastReceiptPath: string;
  broadcastPackagePath: string;
  submitResultPath: string;
}

export interface BroadcastCloseoutStatusVerifyCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyStatus?: (params: unknown) => BroadcastCloseoutStatusVerifyCliResult;
}

interface BroadcastCloseoutStatusVerifyCliResult {
  passed: boolean;
  failures: readonly string[];
}

if (isBroadcastCloseoutStatusVerifyDirectRun(import.meta.url, process.argv)) {
  await runBroadcastCloseoutStatusVerifyCli();
}

export async function runBroadcastCloseoutStatusVerifyCli(
  options: BroadcastCloseoutStatusVerifyCliOptions = {},
): Promise<void> {
  validateStatusVerifyOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const verifyStatus = options.verifyStatus ?? ((params: unknown) =>
    verifyAgentProposalExecutionBroadcastCloseoutStatus(
      params as Parameters<typeof verifyAgentProposalExecutionBroadcastCloseoutStatus>[0],
    ) as BroadcastCloseoutStatusVerifyCliResult);

  validateOutputWriter(writeOutput);
  validateArgv(argv);
  const args = parseBroadcastCloseoutStatusVerifyCliArgs(argv);
  validateTextReader(readText);
  validateStatusVerifier(verifyStatus);

  const verification = verifyStatus({
    statusJson: await readText(args.statusPath),
    reportPath: args.reportPath,
    reportMarkdown: await readText(args.reportPath),
    archivePath: args.archivePath,
    archiveJson: await readText(args.archivePath),
    broadcastReceiptPath: args.broadcastReceiptPath,
    broadcastReceiptJson: await readText(args.broadcastReceiptPath),
    broadcastPackagePath: args.broadcastPackagePath,
    broadcastPackageJson: await readText(args.broadcastPackagePath),
    submitResultPath: args.submitResultPath,
    submitResultJson: await readText(args.submitResultPath),
  });
  validateBroadcastCloseoutVerificationResult(verification, "Broadcast closeout status verification result");

  writeOutput(JSON.stringify({
    status: args.statusPath,
    report: args.reportPath,
    archive: args.archivePath,
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

export function parseBroadcastCloseoutStatusVerifyCliArgs(
  argv: readonly string[],
): BroadcastCloseoutStatusVerifyCliArgs {
  return parseCommonCliArgs(argv, ["--status"], (values) => {
    const statusPath = values.get("--status");
    if (statusPath === undefined) throw new Error("--status is required");
    return { statusPath, ...readCommonValues(values) };
  });
}

export function isBroadcastCloseoutStatusVerifyDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function parseCommonCliArgs<T>(
  argv: readonly string[],
  extraFlags: readonly string[],
  build: (values: Map<string, string>) => T,
): T {
  validateArgv(argv);
  const values = new Map<string, string>();
  const flags = ["--report", "--archive", "--broadcast-receipt", "--broadcast-package", "--submit-result", ...extraFlags];
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

  return build(values);
}

function readCommonValues(values: Map<string, string>): Omit<BroadcastCloseoutStatusVerifyCliArgs, "statusPath"> {
  const reportPath = values.get("--report");
  if (reportPath === undefined) throw new Error("--report is required");
  const archivePath = values.get("--archive");
  if (archivePath === undefined) throw new Error("--archive is required");
  const broadcastReceiptPath = values.get("--broadcast-receipt");
  if (broadcastReceiptPath === undefined) throw new Error("--broadcast-receipt is required");
  const broadcastPackagePath = values.get("--broadcast-package");
  if (broadcastPackagePath === undefined) throw new Error("--broadcast-package is required");
  const submitResultPath = values.get("--submit-result");
  if (submitResultPath === undefined) throw new Error("--submit-result is required");
  return { reportPath, archivePath, broadcastReceiptPath, broadcastPackagePath, submitResultPath };
}

function setOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function validateStatusVerifyOptions(options: unknown): asserts options is BroadcastCloseoutStatusVerifyCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Broadcast closeout status verify options must be an object");
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

function validateStatusVerifier(
  verifyStatus: unknown,
): asserts verifyStatus is (params: unknown) => BroadcastCloseoutStatusVerifyCliResult {
  if (typeof verifyStatus !== "function") throw new Error("Broadcast closeout status verifier must be a function");
}
