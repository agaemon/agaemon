import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateBroadcastCloseoutVerificationResult } from "../../../broadcastCloseout/cliReportValidation.js";
import { verifyAgentProposalExecutionBroadcastCloseout } from "../../../broadcastCloseout/closeout/closeoutVerify.js";

export interface BroadcastCloseoutVerifyCliArgs {
  reportPath: string;
  archivePath: string;
  broadcastReceiptPath: string;
  broadcastPackagePath: string;
  submitResultPath: string;
}

export interface BroadcastCloseoutVerifyCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyCloseout?: (params: unknown) => BroadcastCloseoutVerifyCliResult;
}

interface BroadcastCloseoutVerifyCliResult {
  passed: boolean;
  failures: readonly string[];
  closeout?: unknown;
}

if (isBroadcastCloseoutVerifyDirectRun(import.meta.url, process.argv)) await runBroadcastCloseoutVerifyCli();

export async function runBroadcastCloseoutVerifyCli(options: BroadcastCloseoutVerifyCliOptions = {}): Promise<void> {
  validateBroadcastCloseoutVerifyOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const verifyCloseout = options.verifyCloseout ?? ((params: unknown) =>
    verifyAgentProposalExecutionBroadcastCloseout(
      params as Parameters<typeof verifyAgentProposalExecutionBroadcastCloseout>[0],
    ) as BroadcastCloseoutVerifyCliResult);

  validateBroadcastCloseoutVerifyOutputWriter(writeOutput);
  validateBroadcastCloseoutVerifyArgv(argv);
  const args = parseBroadcastCloseoutVerifyCliArgs(argv);
  validateBroadcastCloseoutVerifyTextReader(readText);
  validateBroadcastCloseoutVerifier(verifyCloseout);

  const verification = verifyCloseout({
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
  validateBroadcastCloseoutVerificationResult(verification, "Broadcast closeout verification result");

  writeOutput(JSON.stringify({
    report: args.reportPath,
    archive: args.archivePath,
    broadcastReceipt: args.broadcastReceiptPath,
    broadcastPackage: args.broadcastPackagePath,
    submitResult: args.submitResultPath,
    ...verification,
  }, null, 2));

  if (!verification.passed) {
    validateBroadcastCloseoutVerifyExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseBroadcastCloseoutVerifyCliArgs(argv: readonly string[]): BroadcastCloseoutVerifyCliArgs {
  validateBroadcastCloseoutVerifyArgv(argv);
  const values = new Map<string, string>();
  const flags = ["--report", "--archive", "--broadcast-receipt", "--broadcast-package", "--submit-result"] as const;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if ((flags as readonly string[]).includes(arg)) {
      setBroadcastCloseoutVerifyOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(/^(--report|--archive|--broadcast-receipt|--broadcast-package|--submit-result)=(.*)$/u);
    if (equals !== null) {
      setBroadcastCloseoutVerifyOption(values, equals[1]!, equals[2]!);
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

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

  return {
    reportPath,
    archivePath,
    broadcastReceiptPath,
    broadcastPackagePath,
    submitResultPath,
  };
}

export function isBroadcastCloseoutVerifyDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateBroadcastCloseoutVerifyArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function setBroadcastCloseoutVerifyOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function validateBroadcastCloseoutVerifyOptions(
  options: unknown,
): asserts options is BroadcastCloseoutVerifyCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Broadcast closeout verify options must be an object");
  }
}

function validateBroadcastCloseoutVerifyArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) throw new Error(message);
}

function validateBroadcastCloseoutVerifyOutputWriter(
  writeOutput: unknown,
): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}

function validateBroadcastCloseoutVerifyExitCodeSetter(
  setExitCode: unknown,
): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") throw new Error("Exit code setter must be a function");
}

function validateBroadcastCloseoutVerifyTextReader(
  readText: unknown,
): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") throw new Error("Text reader must be a function");
}

function validateBroadcastCloseoutVerifier(
  verifyCloseout: unknown,
): asserts verifyCloseout is (params: unknown) => BroadcastCloseoutVerifyCliResult {
  if (typeof verifyCloseout !== "function") throw new Error("Broadcast closeout verifier must be a function");
}
