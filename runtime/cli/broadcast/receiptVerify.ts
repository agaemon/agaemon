import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateBroadcastCliVerificationResult } from "../../broadcast/cliReportValidation.js";
import { verifyAgentProposalExecutionBroadcastReceipt } from "../../broadcast/receiptVerify.js";

export interface BroadcastReceiptVerifyCliArgs {
  broadcastReceiptPath: string;
  broadcastPackagePath: string;
  submitResultPath: string;
}

export interface BroadcastReceiptVerifyCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyReceipt?: (params: unknown) => BroadcastReceiptVerifyCliResult;
}

interface BroadcastReceiptVerifyCliResult {
  passed: boolean;
  failures: readonly string[];
}

if (isBroadcastReceiptVerifyDirectRun(import.meta.url, process.argv)) await runBroadcastReceiptVerifyCli();

export async function runBroadcastReceiptVerifyCli(
  options: BroadcastReceiptVerifyCliOptions = {},
): Promise<void> {
  validateBroadcastReceiptVerifyOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const verifyReceipt = options.verifyReceipt ?? ((params: unknown) =>
    verifyAgentProposalExecutionBroadcastReceipt(
      params as Parameters<typeof verifyAgentProposalExecutionBroadcastReceipt>[0],
    ) as BroadcastReceiptVerifyCliResult);

  validateBroadcastReceiptVerifyOutputWriter(writeOutput);
  validateBroadcastReceiptVerifyArgv(argv);
  const args = parseBroadcastReceiptVerifyCliArgs(argv);
  validateBroadcastReceiptVerifyTextReader(readText);
  validateBroadcastReceiptVerifier(verifyReceipt);

  const verification = verifyReceipt({
    broadcastReceiptPath: args.broadcastReceiptPath,
    broadcastReceiptJson: await readText(args.broadcastReceiptPath),
    broadcastPackagePath: args.broadcastPackagePath,
    broadcastPackageJson: await readText(args.broadcastPackagePath),
    submitResultPath: args.submitResultPath,
    submitResultJson: await readText(args.submitResultPath),
  });
  validateBroadcastCliVerificationResult(verification, "Broadcast receipt verification result");

  writeOutput(JSON.stringify({
    broadcastReceipt: args.broadcastReceiptPath,
    broadcastPackage: args.broadcastPackagePath,
    submitResult: args.submitResultPath,
    ...verification,
  }, null, 2));

  if (!verification.passed) {
    validateBroadcastReceiptVerifyExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseBroadcastReceiptVerifyCliArgs(argv: readonly string[]): BroadcastReceiptVerifyCliArgs {
  validateBroadcastReceiptVerifyArgv(argv);
  const values = new Map<string, string>();
  const flags = ["--broadcast-receipt", "--broadcast-package", "--submit-result"] as const;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if ((flags as readonly string[]).includes(arg)) {
      setBroadcastReceiptVerifyOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(/^(--broadcast-receipt|--broadcast-package|--submit-result)=(.*)$/u);
    if (equals !== null) {
      setBroadcastReceiptVerifyOption(values, equals[1]!, equals[2]!);
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

  return { broadcastReceiptPath, broadcastPackagePath, submitResultPath };
}

export function isBroadcastReceiptVerifyDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateBroadcastReceiptVerifyArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function setBroadcastReceiptVerifyOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function validateBroadcastReceiptVerifyOptions(options: unknown): asserts options is BroadcastReceiptVerifyCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Broadcast receipt verification options must be an object");
  }
}

function validateBroadcastReceiptVerifyArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) throw new Error(message);
}

function validateBroadcastReceiptVerifyOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}

function validateBroadcastReceiptVerifyExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") throw new Error("Exit code setter must be a function");
}

function validateBroadcastReceiptVerifyTextReader(readText: unknown): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") throw new Error("Text reader must be a function");
}

function validateBroadcastReceiptVerifier(
  verifyReceipt: unknown,
): asserts verifyReceipt is (params: unknown) => BroadcastReceiptVerifyCliResult {
  if (typeof verifyReceipt !== "function") throw new Error("Broadcast receipt verifier must be a function");
}
