import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummary } from "../../../../broadcastCloseout/finalizationArchive/statusSummary/summary.js";

export interface BroadcastCloseoutFinalizationArchiveStatusSummaryCliArgs {
  finalizationArchiveStatusPath: string;
  finalizationArchivePath: string;
  reportPath: string;
  archivePath: string;
  statusPath: string;
  summaryPath: string;
  finalizationStatusPath: string;
  broadcastReceiptPath: string;
  broadcastPackagePath: string;
  submitResultPath: string;
  outputPath?: string | undefined;
}

export interface BroadcastCloseoutFinalizationArchiveStatusSummaryCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  createSummary?: (params: unknown) => BroadcastCloseoutFinalizationArchiveStatusSummaryCliResult;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

interface BroadcastCloseoutFinalizationArchiveStatusSummaryCliResult {
  passed: boolean;
  failures: readonly string[];
  markdown: string;
}

if (isBroadcastCloseoutFinalizationArchiveStatusSummaryDirectRun(import.meta.url, process.argv)) {
  await runBroadcastCloseoutFinalizationArchiveStatusSummaryCli();
}

export async function runBroadcastCloseoutFinalizationArchiveStatusSummaryCli(
  options: BroadcastCloseoutFinalizationArchiveStatusSummaryCliOptions = {},
): Promise<void> {
  validateOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const createSummary = options.createSummary ?? ((params: unknown) =>
    createAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummary(
      params as Parameters<typeof createAgentProposalExecutionBroadcastCloseoutFinalizationArchiveStatusSummary>[0],
    ) as BroadcastCloseoutFinalizationArchiveStatusSummaryCliResult);
  const mkdirp = options.mkdirp ?? (async (dir: string) => {
    await mkdir(dir, { recursive: true });
  });
  const writeText = options.writeText ?? writeFile;

  validateOutputWriter(writeOutput);
  validateArgv(argv);
  const args = parseBroadcastCloseoutFinalizationArchiveStatusSummaryCliArgs(argv);
  validateTextReader(readText);
  validateSummaryCreator(createSummary);

  const summary = createSummary({
    finalizationArchiveStatusPath: args.finalizationArchiveStatusPath,
    finalizationArchiveStatusJson: await readText(args.finalizationArchiveStatusPath),
    finalizationArchivePath: args.finalizationArchivePath,
    finalizationArchiveJson: await readText(args.finalizationArchivePath),
    reportPath: args.reportPath,
    reportMarkdown: await readText(args.reportPath),
    archivePath: args.archivePath,
    archiveJson: await readText(args.archivePath),
    statusPath: args.statusPath,
    statusJson: await readText(args.statusPath),
    summaryPath: args.summaryPath,
    summaryMarkdown: await readText(args.summaryPath),
    finalizationStatusPath: args.finalizationStatusPath,
    finalizationStatusJson: await readText(args.finalizationStatusPath),
    broadcastReceiptPath: args.broadcastReceiptPath,
    broadcastReceiptJson: await readText(args.broadcastReceiptPath),
    broadcastPackagePath: args.broadcastPackagePath,
    broadcastPackageJson: await readText(args.broadcastPackagePath),
    submitResultPath: args.submitResultPath,
    submitResultJson: await readText(args.submitResultPath),
  });

  if (summary.passed && args.outputPath !== undefined) {
    validateDirectoryCreator(mkdirp);
    validateTextWriter(writeText);
    await mkdirp(dirname(args.outputPath));
    await writeText(args.outputPath, summary.markdown);
  }

  writeOutput(JSON.stringify({
    finalizationArchiveStatus: args.finalizationArchiveStatusPath,
    finalizationArchive: args.finalizationArchivePath,
    report: args.reportPath,
    archive: args.archivePath,
    status: args.statusPath,
    summary: args.summaryPath,
    finalizationStatus: args.finalizationStatusPath,
    broadcastReceipt: args.broadcastReceiptPath,
    broadcastPackage: args.broadcastPackagePath,
    submitResult: args.submitResultPath,
    output: args.outputPath,
    passed: summary.passed,
    failures: summary.failures,
  }, null, 2));

  if (!summary.passed) {
    validateExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseBroadcastCloseoutFinalizationArchiveStatusSummaryCliArgs(
  argv: readonly string[],
): BroadcastCloseoutFinalizationArchiveStatusSummaryCliArgs {
  validateArgv(argv);
  const flags = [
    "--finalization-archive-status",
    "--finalization-archive",
    "--report",
    "--archive",
    "--status",
    "--summary",
    "--finalization-status",
    "--broadcast-receipt",
    "--broadcast-package",
    "--submit-result",
    "--output",
  ];
  const values = parseValues(argv, flags);
  return {
    finalizationArchiveStatusPath: readRequired(values, "--finalization-archive-status"),
    finalizationArchivePath: readRequired(values, "--finalization-archive"),
    reportPath: readRequired(values, "--report"),
    archivePath: readRequired(values, "--archive"),
    statusPath: readRequired(values, "--status"),
    summaryPath: readRequired(values, "--summary"),
    finalizationStatusPath: readRequired(values, "--finalization-status"),
    broadcastReceiptPath: readRequired(values, "--broadcast-receipt"),
    broadcastPackagePath: readRequired(values, "--broadcast-package"),
    submitResultPath: readRequired(values, "--submit-result"),
    ...(values.has("--output") ? { outputPath: values.get("--output")! } : {}),
  };
}

export function isBroadcastCloseoutFinalizationArchiveStatusSummaryDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
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

function validateOptions(options: unknown): asserts options is BroadcastCloseoutFinalizationArchiveStatusSummaryCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Broadcast closeout finalization archive status summary options must be an object");
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

function validateSummaryCreator(
  createSummary: unknown,
): asserts createSummary is (params: unknown) => BroadcastCloseoutFinalizationArchiveStatusSummaryCliResult {
  if (typeof createSummary !== "function") throw new Error("Broadcast closeout finalization archive status summary creator must be a function");
}

function validateDirectoryCreator(mkdirp: unknown): asserts mkdirp is (dir: string) => Promise<void> {
  if (typeof mkdirp !== "function") throw new Error("Directory creator must be a function");
}

function validateTextWriter(writeText: unknown): asserts writeText is (path: string, contents: string) => Promise<void> {
  if (typeof writeText !== "function") throw new Error("Text writer must be a function");
}
