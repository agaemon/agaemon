import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createAgentProposalExecutionBroadcastCloseoutStatus,
  formatAgentProposalExecutionBroadcastCloseoutStatus,
} from "../../../broadcastCloseout/status/status.js";
import {
  validateBroadcastCloseoutFormattedStatus,
  validateBroadcastCloseoutStatusResult,
} from "../../../broadcastCloseout/cliReportValidation.js";

export interface BroadcastCloseoutStatusCliArgs {
  reportPath: string;
  archivePath: string;
  broadcastReceiptPath: string;
  broadcastPackagePath: string;
  submitResultPath: string;
  outputPath?: string | undefined;
}

export interface BroadcastCloseoutStatusCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  createStatus?: (params: unknown) => BroadcastCloseoutStatusCliResult;
  formatStatus?: (status: BroadcastCloseoutStatusCliResult) => string;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

interface BroadcastCloseoutStatusCliResult {
  passed: boolean;
}

if (isBroadcastCloseoutStatusDirectRun(import.meta.url, process.argv)) await runBroadcastCloseoutStatusCli();

export async function runBroadcastCloseoutStatusCli(options: BroadcastCloseoutStatusCliOptions = {}): Promise<void> {
  validateBroadcastCloseoutStatusOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const createStatus = options.createStatus ?? ((params: unknown) =>
    createAgentProposalExecutionBroadcastCloseoutStatus(
      params as Parameters<typeof createAgentProposalExecutionBroadcastCloseoutStatus>[0],
    ) as BroadcastCloseoutStatusCliResult);
  const formatStatus = options.formatStatus ?? ((status: BroadcastCloseoutStatusCliResult) =>
    formatAgentProposalExecutionBroadcastCloseoutStatus(
      status as Parameters<typeof formatAgentProposalExecutionBroadcastCloseoutStatus>[0],
    ));
  const mkdirp = options.mkdirp ?? (async (dir: string) => {
    await mkdir(dir, { recursive: true });
  });
  const writeText = options.writeText ?? writeFile;

  validateBroadcastCloseoutStatusOutputWriter(writeOutput);
  validateBroadcastCloseoutStatusArgv(argv);
  const args = parseBroadcastCloseoutStatusCliArgs(argv);
  validateBroadcastCloseoutStatusTextReader(readText);
  validateBroadcastCloseoutStatusCreator(createStatus);
  validateBroadcastCloseoutStatusFormatter(formatStatus);

  const status = createStatus({
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
  validateBroadcastCloseoutStatusResult(status);

  const formattedStatus = formatStatus(status);
  validateBroadcastCloseoutFormattedStatus(formattedStatus);
  if (status.passed && args.outputPath !== undefined) {
    validateBroadcastCloseoutStatusDirectoryCreator(mkdirp);
    validateBroadcastCloseoutStatusTextWriter(writeText);
    await mkdirp(dirname(args.outputPath));
    await writeText(args.outputPath, formattedStatus);
  }

  writeOutput(formattedStatus.trimEnd());
  if (!status.passed) {
    validateBroadcastCloseoutStatusExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseBroadcastCloseoutStatusCliArgs(argv: readonly string[]): BroadcastCloseoutStatusCliArgs {
  validateBroadcastCloseoutStatusArgv(argv);
  const values = new Map<string, string>();
  const flags = ["--report", "--archive", "--broadcast-receipt", "--broadcast-package", "--submit-result", "--output"] as const;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if ((flags as readonly string[]).includes(arg)) {
      setBroadcastCloseoutStatusOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(/^(--report|--archive|--broadcast-receipt|--broadcast-package|--submit-result|--output)=(.*)$/u);
    if (equals !== null) {
      setBroadcastCloseoutStatusOption(values, equals[1]!, equals[2]!);
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
    ...(values.has("--output") ? { outputPath: values.get("--output")! } : {}),
  };
}

export function isBroadcastCloseoutStatusDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateBroadcastCloseoutStatusArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function setBroadcastCloseoutStatusOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function validateBroadcastCloseoutStatusOptions(
  options: unknown,
): asserts options is BroadcastCloseoutStatusCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Broadcast closeout status options must be an object");
  }
}

function validateBroadcastCloseoutStatusArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) throw new Error(message);
}

function validateBroadcastCloseoutStatusOutputWriter(
  writeOutput: unknown,
): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}

function validateBroadcastCloseoutStatusExitCodeSetter(
  setExitCode: unknown,
): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") throw new Error("Exit code setter must be a function");
}

function validateBroadcastCloseoutStatusTextReader(
  readText: unknown,
): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") throw new Error("Text reader must be a function");
}

function validateBroadcastCloseoutStatusCreator(
  createStatus: unknown,
): asserts createStatus is (params: unknown) => BroadcastCloseoutStatusCliResult {
  if (typeof createStatus !== "function") throw new Error("Broadcast closeout status creator must be a function");
}

function validateBroadcastCloseoutStatusFormatter(
  formatStatus: unknown,
): asserts formatStatus is (status: BroadcastCloseoutStatusCliResult) => string {
  if (typeof formatStatus !== "function") throw new Error("Broadcast closeout status formatter must be a function");
}

function validateBroadcastCloseoutStatusDirectoryCreator(mkdirp: unknown): asserts mkdirp is (dir: string) => Promise<void> {
  if (typeof mkdirp !== "function") throw new Error("Directory creator must be a function");
}

function validateBroadcastCloseoutStatusTextWriter(
  writeText: unknown,
): asserts writeText is (path: string, contents: string) => Promise<void> {
  if (typeof writeText !== "function") throw new Error("Text writer must be a function");
}
