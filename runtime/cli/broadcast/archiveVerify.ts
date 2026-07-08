import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyAgentProposalExecutionBroadcastArchive } from "../../broadcast/archiveVerify.js";
import { validateBroadcastCliVerificationResult } from "../../broadcast/cliReportValidation.js";

export interface BroadcastArchiveVerifyCliArgs {
  archivePath: string;
  reportPath: string;
  broadcastReceiptPath: string;
  broadcastPackagePath: string;
  submitResultPath: string;
}

export interface BroadcastArchiveVerifyCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyArchive?: (params: unknown) => BroadcastArchiveVerifyCliResult;
}

interface BroadcastArchiveVerifyCliResult {
  passed: boolean;
  failures: readonly string[];
}

if (isBroadcastArchiveVerifyDirectRun(import.meta.url, process.argv)) await runBroadcastArchiveVerifyCli();

export async function runBroadcastArchiveVerifyCli(options: BroadcastArchiveVerifyCliOptions = {}): Promise<void> {
  validateBroadcastArchiveVerifyOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const verifyArchive = options.verifyArchive ?? ((params: unknown) =>
    verifyAgentProposalExecutionBroadcastArchive(
      params as Parameters<typeof verifyAgentProposalExecutionBroadcastArchive>[0],
    ) as BroadcastArchiveVerifyCliResult);

  validateBroadcastArchiveVerifyOutputWriter(writeOutput);
  validateBroadcastArchiveVerifyArgv(argv);
  const args = parseBroadcastArchiveVerifyCliArgs(argv);
  validateBroadcastArchiveVerifyTextReader(readText);
  validateBroadcastArchiveVerifier(verifyArchive);

  const verification = verifyArchive({
    archivePath: args.archivePath,
    archiveJson: await readText(args.archivePath),
    reportPath: args.reportPath,
    reportMarkdown: await readText(args.reportPath),
    broadcastReceiptPath: args.broadcastReceiptPath,
    broadcastReceiptJson: await readText(args.broadcastReceiptPath),
    broadcastPackagePath: args.broadcastPackagePath,
    broadcastPackageJson: await readText(args.broadcastPackagePath),
    submitResultPath: args.submitResultPath,
    submitResultJson: await readText(args.submitResultPath),
  });
  validateBroadcastCliVerificationResult(verification, "Broadcast archive verification result");

  writeOutput(JSON.stringify({
    archive: args.archivePath,
    report: args.reportPath,
    broadcastReceipt: args.broadcastReceiptPath,
    broadcastPackage: args.broadcastPackagePath,
    submitResult: args.submitResultPath,
    ...verification,
  }, null, 2));

  if (!verification.passed) {
    validateBroadcastArchiveVerifyExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseBroadcastArchiveVerifyCliArgs(argv: readonly string[]): BroadcastArchiveVerifyCliArgs {
  validateBroadcastArchiveVerifyArgv(argv);
  const values = new Map<string, string>();
  const flags = ["--archive", "--report", "--broadcast-receipt", "--broadcast-package", "--submit-result"] as const;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if ((flags as readonly string[]).includes(arg)) {
      setBroadcastArchiveVerifyOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(/^(--archive|--report|--broadcast-receipt|--broadcast-package|--submit-result)=(.*)$/u);
    if (equals !== null) {
      setBroadcastArchiveVerifyOption(values, equals[1]!, equals[2]!);
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  const archivePath = values.get("--archive");
  if (archivePath === undefined) throw new Error("--archive is required");
  const reportPath = values.get("--report");
  if (reportPath === undefined) throw new Error("--report is required");
  const broadcastReceiptPath = values.get("--broadcast-receipt");
  if (broadcastReceiptPath === undefined) throw new Error("--broadcast-receipt is required");
  const broadcastPackagePath = values.get("--broadcast-package");
  if (broadcastPackagePath === undefined) throw new Error("--broadcast-package is required");
  const submitResultPath = values.get("--submit-result");
  if (submitResultPath === undefined) throw new Error("--submit-result is required");

  return {
    archivePath,
    reportPath,
    broadcastReceiptPath,
    broadcastPackagePath,
    submitResultPath,
  };
}

export function isBroadcastArchiveVerifyDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateBroadcastArchiveVerifyArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function setBroadcastArchiveVerifyOption(
  values: Map<string, string>,
  name: string,
  rawValue: string | undefined,
): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function validateBroadcastArchiveVerifyOptions(options: unknown): asserts options is BroadcastArchiveVerifyCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Broadcast archive verify options must be an object");
  }
}

function validateBroadcastArchiveVerifyArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) throw new Error(message);
}

function validateBroadcastArchiveVerifyOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}

function validateBroadcastArchiveVerifyExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") throw new Error("Exit code setter must be a function");
}

function validateBroadcastArchiveVerifyTextReader(readText: unknown): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") throw new Error("Text reader must be a function");
}

function validateBroadcastArchiveVerifier(
  verifyArchive: unknown,
): asserts verifyArchive is (params: unknown) => BroadcastArchiveVerifyCliResult {
  if (typeof verifyArchive !== "function") throw new Error("Broadcast archive verifier must be a function");
}
