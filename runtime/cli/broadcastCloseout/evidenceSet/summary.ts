import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateBroadcastCloseoutEvidenceSummaryResult } from "../../../broadcastCloseout/cliReportValidation.js";
import { createAgentProposalExecutionBroadcastCloseoutEvidenceSetSummary } from "../../../broadcastCloseout/evidenceSet/summary.js";

export interface BroadcastCloseoutEvidenceSummaryCliArgs {
  reportPath: string;
  archivePath: string;
  statusPath: string;
  broadcastReceiptPath: string;
  broadcastPackagePath: string;
  submitResultPath: string;
  outputPath?: string | undefined;
}

export interface BroadcastCloseoutEvidenceSummaryCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  createSummary?: (params: unknown) => BroadcastCloseoutEvidenceSummaryCliResult;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

interface BroadcastCloseoutEvidenceSummaryCliResult {
  passed: boolean;
  failures: readonly string[];
  markdown: string;
}

if (isBroadcastCloseoutEvidenceSummaryDirectRun(import.meta.url, process.argv)) {
  await runBroadcastCloseoutEvidenceSummaryCli();
}

export async function runBroadcastCloseoutEvidenceSummaryCli(
  options: BroadcastCloseoutEvidenceSummaryCliOptions = {},
): Promise<void> {
  validateEvidenceSummaryOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const createSummary = options.createSummary ?? ((params: unknown) =>
    createAgentProposalExecutionBroadcastCloseoutEvidenceSetSummary(
      params as Parameters<typeof createAgentProposalExecutionBroadcastCloseoutEvidenceSetSummary>[0],
    ) as BroadcastCloseoutEvidenceSummaryCliResult);
  const mkdirp = options.mkdirp ?? (async (dir: string) => {
    await mkdir(dir, { recursive: true });
  });
  const writeText = options.writeText ?? writeFile;

  validateOutputWriter(writeOutput);
  validateArgv(argv);
  const args = parseBroadcastCloseoutEvidenceSummaryCliArgs(argv);
  validateTextReader(readText);
  validateSummaryCreator(createSummary);

  const summary = createSummary({
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
  validateBroadcastCloseoutEvidenceSummaryResult(summary);

  if (summary.passed && args.outputPath !== undefined) {
    validateDirectoryCreator(mkdirp);
    validateTextWriter(writeText);
    await mkdirp(dirname(args.outputPath));
    await writeText(args.outputPath, summary.markdown);
  }

  writeOutput(JSON.stringify({
    report: args.reportPath,
    archive: args.archivePath,
    status: args.statusPath,
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

export function parseBroadcastCloseoutEvidenceSummaryCliArgs(
  argv: readonly string[],
): BroadcastCloseoutEvidenceSummaryCliArgs {
  validateArgv(argv);
  const values = parseValues(argv, ["--report", "--archive", "--status", "--broadcast-receipt", "--broadcast-package", "--submit-result", "--output"]);
  return {
    ...readEvidenceValues(values),
    ...(values.has("--output") ? { outputPath: values.get("--output")! } : {}),
  };
}

export function isBroadcastCloseoutEvidenceSummaryDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
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

function readEvidenceValues(values: Map<string, string>): Omit<BroadcastCloseoutEvidenceSummaryCliArgs, "outputPath"> {
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

function validateEvidenceSummaryOptions(
  options: unknown,
): asserts options is BroadcastCloseoutEvidenceSummaryCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Broadcast closeout evidence summary options must be an object");
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
): asserts createSummary is (params: unknown) => BroadcastCloseoutEvidenceSummaryCliResult {
  if (typeof createSummary !== "function") throw new Error("Broadcast closeout evidence summary creator must be a function");
}

function validateDirectoryCreator(mkdirp: unknown): asserts mkdirp is (dir: string) => Promise<void> {
  if (typeof mkdirp !== "function") throw new Error("Directory creator must be a function");
}

function validateTextWriter(writeText: unknown): asserts writeText is (path: string, contents: string) => Promise<void> {
  if (typeof writeText !== "function") throw new Error("Text writer must be a function");
}
