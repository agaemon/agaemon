import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createAgentProposalExecutionBroadcastCloseoutFinalizationStatus,
  formatAgentProposalExecutionBroadcastCloseoutFinalizationStatus,
} from "../../../../broadcastCloseout/finalization/status/status.js";

export interface BroadcastCloseoutFinalizationStatusCliArgs {
  summaryPath: string;
  reportPath: string;
  archivePath: string;
  statusPath: string;
  broadcastReceiptPath: string;
  broadcastPackagePath: string;
  submitResultPath: string;
  outputPath?: string | undefined;
}

export interface BroadcastCloseoutFinalizationStatusCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  createStatus?: (params: unknown) => BroadcastCloseoutFinalizationStatusCliResult;
  formatStatus?: (status: BroadcastCloseoutFinalizationStatusCliResult) => string;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

interface BroadcastCloseoutFinalizationStatusCliResult {
  passed: boolean;
}

if (isBroadcastCloseoutFinalizationStatusDirectRun(import.meta.url, process.argv)) {
  await runBroadcastCloseoutFinalizationStatusCli();
}

export async function runBroadcastCloseoutFinalizationStatusCli(
  options: BroadcastCloseoutFinalizationStatusCliOptions = {},
): Promise<void> {
  validateOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const createStatus = options.createStatus ?? ((params: unknown) =>
    createAgentProposalExecutionBroadcastCloseoutFinalizationStatus(
      params as Parameters<typeof createAgentProposalExecutionBroadcastCloseoutFinalizationStatus>[0],
    ) as BroadcastCloseoutFinalizationStatusCliResult);
  const formatStatus = options.formatStatus ?? ((status: BroadcastCloseoutFinalizationStatusCliResult) =>
    formatAgentProposalExecutionBroadcastCloseoutFinalizationStatus(
      status as Parameters<typeof formatAgentProposalExecutionBroadcastCloseoutFinalizationStatus>[0],
    ));
  const mkdirp = options.mkdirp ?? (async (dir: string) => {
    await mkdir(dir, { recursive: true });
  });
  const writeText = options.writeText ?? writeFile;

  validateOutputWriter(writeOutput);
  validateArgv(argv);
  const args = parseBroadcastCloseoutFinalizationStatusCliArgs(argv);
  validateTextReader(readText);
  validateStatusCreator(createStatus);
  validateStatusFormatter(formatStatus);

  const status = createStatus({
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

  const formattedStatus = formatStatus(status);
  if (status.passed && args.outputPath !== undefined) {
    validateDirectoryCreator(mkdirp);
    validateTextWriter(writeText);
    await mkdirp(dirname(args.outputPath));
    await writeText(args.outputPath, formattedStatus);
  }

  writeOutput(formattedStatus.trimEnd());
  if (!status.passed) {
    validateExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseBroadcastCloseoutFinalizationStatusCliArgs(
  argv: readonly string[],
): BroadcastCloseoutFinalizationStatusCliArgs {
  validateArgv(argv);
  const flags = ["--summary", "--report", "--archive", "--status", "--broadcast-receipt", "--broadcast-package", "--submit-result", "--output"];
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

  return {
    summaryPath: readRequired(values, "--summary"),
    reportPath: readRequired(values, "--report"),
    archivePath: readRequired(values, "--archive"),
    statusPath: readRequired(values, "--status"),
    broadcastReceiptPath: readRequired(values, "--broadcast-receipt"),
    broadcastPackagePath: readRequired(values, "--broadcast-package"),
    submitResultPath: readRequired(values, "--submit-result"),
    ...(values.has("--output") ? { outputPath: values.get("--output")! } : {}),
  };
}

export function isBroadcastCloseoutFinalizationStatusDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
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

function validateOptions(options: unknown): asserts options is BroadcastCloseoutFinalizationStatusCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Broadcast closeout finalization status options must be an object");
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

function validateStatusCreator(
  createStatus: unknown,
): asserts createStatus is (params: unknown) => BroadcastCloseoutFinalizationStatusCliResult {
  if (typeof createStatus !== "function") throw new Error("Broadcast closeout finalization status creator must be a function");
}

function validateStatusFormatter(
  formatStatus: unknown,
): asserts formatStatus is (status: BroadcastCloseoutFinalizationStatusCliResult) => string {
  if (typeof formatStatus !== "function") throw new Error("Broadcast closeout finalization status formatter must be a function");
}

function validateDirectoryCreator(mkdirp: unknown): asserts mkdirp is (dir: string) => Promise<void> {
  if (typeof mkdirp !== "function") throw new Error("Directory creator must be a function");
}

function validateTextWriter(writeText: unknown): asserts writeText is (path: string, contents: string) => Promise<void> {
  if (typeof writeText !== "function") throw new Error("Text writer must be a function");
}
