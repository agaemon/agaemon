import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateBroadcastCloseoutEvidenceVerificationResult } from "../../../broadcastCloseout/cliReportValidation.js";
import { verifyAgentProposalExecutionBroadcastCloseoutEvidenceSet } from "../../../broadcastCloseout/evidenceSet/verify.js";

export interface BroadcastCloseoutEvidenceVerifyCliArgs {
  reportPath: string;
  archivePath: string;
  statusPath: string;
  broadcastReceiptPath: string;
  broadcastPackagePath: string;
  submitResultPath: string;
}

export interface BroadcastCloseoutEvidenceVerifyCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyEvidence?: (params: unknown) => BroadcastCloseoutEvidenceVerifyCliResult;
}

interface BroadcastCloseoutEvidenceVerifyCliResult {
  passed: boolean;
  failures: readonly string[];
  checks?: readonly unknown[];
}

if (isBroadcastCloseoutEvidenceVerifyDirectRun(import.meta.url, process.argv)) {
  await runBroadcastCloseoutEvidenceVerifyCli();
}

export async function runBroadcastCloseoutEvidenceVerifyCli(
  options: BroadcastCloseoutEvidenceVerifyCliOptions = {},
): Promise<void> {
  validateEvidenceVerifyOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const verifyEvidence = options.verifyEvidence ?? ((params: unknown) =>
    verifyAgentProposalExecutionBroadcastCloseoutEvidenceSet(
      params as Parameters<typeof verifyAgentProposalExecutionBroadcastCloseoutEvidenceSet>[0],
    ) as BroadcastCloseoutEvidenceVerifyCliResult);

  validateOutputWriter(writeOutput);
  validateArgv(argv);
  const args = parseBroadcastCloseoutEvidenceVerifyCliArgs(argv);
  validateTextReader(readText);
  validateEvidenceVerifier(verifyEvidence);

  const verification = verifyEvidence({
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
  validateBroadcastCloseoutEvidenceVerificationResult(verification);

  writeOutput(JSON.stringify({
    report: args.reportPath,
    archive: args.archivePath,
    status: args.statusPath,
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

export function parseBroadcastCloseoutEvidenceVerifyCliArgs(
  argv: readonly string[],
): BroadcastCloseoutEvidenceVerifyCliArgs {
  validateArgv(argv);
  const values = parseValues(argv, ["--report", "--archive", "--status", "--broadcast-receipt", "--broadcast-package", "--submit-result"]);
  return readEvidenceValues(values);
}

export function isBroadcastCloseoutEvidenceVerifyDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
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

function readEvidenceValues(values: Map<string, string>): BroadcastCloseoutEvidenceVerifyCliArgs {
  const reportPath = values.get("--report");
  if (reportPath === undefined) throw new Error("--report is required");
  const archivePath = values.get("--archive");
  if (archivePath === undefined) throw new Error("--archive is required");
  const statusPath = values.get("--status");
  if (statusPath === undefined) throw new Error("--status is required");
  const broadcastReceiptPath = values.get("--broadcast-receipt");
  if (broadcastReceiptPath === undefined) throw new Error("--broadcast-receipt is required");
  const broadcastPackagePath = values.get("--broadcast-package");
  if (broadcastPackagePath === undefined) throw new Error("--broadcast-package is required");
  const submitResultPath = values.get("--submit-result");
  if (submitResultPath === undefined) throw new Error("--submit-result is required");
  return { reportPath, archivePath, statusPath, broadcastReceiptPath, broadcastPackagePath, submitResultPath };
}

function setOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function validateEvidenceVerifyOptions(options: unknown): asserts options is BroadcastCloseoutEvidenceVerifyCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Broadcast closeout evidence verify options must be an object");
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

function validateEvidenceVerifier(
  verifyEvidence: unknown,
): asserts verifyEvidence is (params: unknown) => BroadcastCloseoutEvidenceVerifyCliResult {
  if (typeof verifyEvidence !== "function") throw new Error("Broadcast closeout evidence verifier must be a function");
}
