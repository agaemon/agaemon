import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createAgentProposalExecutionBroadcastCloseoutFinalization } from "../../../../broadcastCloseout/finalization/finalization/finalization.js";

export interface BroadcastCloseoutFinalizationCliArgs {
  broadcastReceiptPath: string;
  broadcastPackagePath: string;
  submitResultPath: string;
  reportOutputPath: string;
  archiveOutputPath: string;
  statusOutputPath: string;
  summaryOutputPath: string;
  finalizationStatusOutputPath?: string | undefined;
  finalizationArchiveOutputPath?: string | undefined;
  finalizationArchiveStatusOutputPath?: string | undefined;
  finalizationArchiveStatusSummaryOutputPath?: string | undefined;
  finalizationArchiveStatusSummaryPackageOutputPath?: string | undefined;
  finalizationArchiveStatusSummaryPackageStatusOutputPath?: string | undefined;
  generatedAt?: string | undefined;
}

export interface BroadcastCloseoutFinalizationCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  createFinalization?: (params: unknown) => BroadcastCloseoutFinalizationCliResult;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

interface BroadcastCloseoutFinalizationCliResult {
  passed: boolean;
  failures: readonly string[];
  report: { path: string; markdown: string };
  archive: { path: string; json: string };
  status: { path: string; json: string } | null;
  summary: { path: string; markdown: string };
  finalizationStatus: { path: string; json: string } | null;
  finalizationArchive: { path: string; json: string } | null;
  finalizationArchiveStatus: { path: string; json: string } | null;
  finalizationArchiveStatusSummary: { path: string; markdown: string } | null;
  finalizationArchiveStatusSummaryPackage: { path: string; json: string } | null;
  finalizationArchiveStatusSummaryPackageStatus: { path: string; json: string } | null;
}

if (isBroadcastCloseoutFinalizationDirectRun(import.meta.url, process.argv)) {
  await runBroadcastCloseoutFinalizationCli();
}

export async function runBroadcastCloseoutFinalizationCli(
  options: BroadcastCloseoutFinalizationCliOptions = {},
): Promise<void> {
  validateOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const createFinalization = options.createFinalization ?? ((params: unknown) =>
    createAgentProposalExecutionBroadcastCloseoutFinalization(
      params as Parameters<typeof createAgentProposalExecutionBroadcastCloseoutFinalization>[0],
    ) as BroadcastCloseoutFinalizationCliResult);
  const mkdirp = options.mkdirp ?? (async (dir: string) => {
    await mkdir(dir, { recursive: true });
  });
  const writeText = options.writeText ?? writeFile;

  validateOutputWriter(writeOutput);
  validateArgv(argv);
  const args = parseBroadcastCloseoutFinalizationCliArgs(argv);
  validateTextReader(readText);
  validateFinalizationCreator(createFinalization);

  const finalization = createFinalization({
    reportPath: args.reportOutputPath,
    archivePath: args.archiveOutputPath,
    statusPath: args.statusOutputPath,
    summaryPath: args.summaryOutputPath,
    finalizationStatusPath: args.finalizationStatusOutputPath,
    finalizationArchivePath: args.finalizationArchiveOutputPath,
    finalizationArchiveStatusPath: args.finalizationArchiveStatusOutputPath,
    finalizationArchiveStatusSummaryPath: args.finalizationArchiveStatusSummaryOutputPath,
    finalizationArchiveStatusSummaryPackagePath: args.finalizationArchiveStatusSummaryPackageOutputPath,
    finalizationArchiveStatusSummaryPackageStatusPath: args.finalizationArchiveStatusSummaryPackageStatusOutputPath,
    broadcastReceiptPath: args.broadcastReceiptPath,
    broadcastReceiptJson: await readText(args.broadcastReceiptPath),
    broadcastPackagePath: args.broadcastPackagePath,
    broadcastPackageJson: await readText(args.broadcastPackagePath),
    submitResultPath: args.submitResultPath,
    submitResultJson: await readText(args.submitResultPath),
    generatedAt: args.generatedAt,
  });

  if (finalization.passed && finalization.status !== null) {
    validateDirectoryCreator(mkdirp);
    validateTextWriter(writeText);
    await writeArtifact(finalization.report.path, finalization.report.markdown, mkdirp, writeText);
    await writeArtifact(finalization.archive.path, finalization.archive.json, mkdirp, writeText);
    await writeArtifact(finalization.status.path, finalization.status.json, mkdirp, writeText);
    await writeArtifact(finalization.summary.path, finalization.summary.markdown, mkdirp, writeText);
    await writeOptionalJson(finalization.finalizationStatus, mkdirp, writeText);
    await writeOptionalJson(finalization.finalizationArchive, mkdirp, writeText);
    await writeOptionalJson(finalization.finalizationArchiveStatus, mkdirp, writeText);
    if (finalization.finalizationArchiveStatusSummary !== null) {
      await writeArtifact(
        finalization.finalizationArchiveStatusSummary.path,
        finalization.finalizationArchiveStatusSummary.markdown,
        mkdirp,
        writeText,
      );
    }
    await writeOptionalJson(finalization.finalizationArchiveStatusSummaryPackage, mkdirp, writeText);
    await writeOptionalJson(finalization.finalizationArchiveStatusSummaryPackageStatus, mkdirp, writeText);
  }

  writeOutput(JSON.stringify({
    report: finalization.report.path,
    archive: finalization.archive.path,
    status: finalization.status?.path,
    summary: finalization.summary.path,
    finalizationStatus: finalization.finalizationStatus?.path,
    finalizationArchive: finalization.finalizationArchive?.path,
    finalizationArchiveStatus: finalization.finalizationArchiveStatus?.path,
    finalizationArchiveStatusSummary: finalization.finalizationArchiveStatusSummary?.path,
    finalizationArchiveStatusSummaryPackage: finalization.finalizationArchiveStatusSummaryPackage?.path,
    finalizationArchiveStatusSummaryPackageStatus: finalization.finalizationArchiveStatusSummaryPackageStatus?.path,
    passed: finalization.passed,
    failures: finalization.failures,
  }, null, 2));

  if (!finalization.passed) {
    validateExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseBroadcastCloseoutFinalizationCliArgs(
  argv: readonly string[],
): BroadcastCloseoutFinalizationCliArgs {
  validateArgv(argv);
  const flags = [
    "--broadcast-receipt",
    "--broadcast-package",
    "--submit-result",
    "--report-output",
    "--archive-output",
    "--status-output",
    "--summary-output",
    "--finalization-status-output",
    "--finalization-archive-output",
    "--finalization-archive-status-output",
    "--finalization-archive-status-summary-output",
    "--finalization-archive-status-summary-package-output",
    "--finalization-archive-status-summary-package-status-output",
    "--generated-at",
  ];
  const values = parseValues(argv, flags);
  const broadcastReceiptPath = readRequired(values, "--broadcast-receipt");
  const broadcastPackagePath = readRequired(values, "--broadcast-package");
  const submitResultPath = readRequired(values, "--submit-result");
  const reportOutputPath = readRequired(values, "--report-output");
  const archiveOutputPath = readRequired(values, "--archive-output");
  const statusOutputPath = readRequired(values, "--status-output");
  const summaryOutputPath = readRequired(values, "--summary-output");

  return {
    broadcastReceiptPath,
    broadcastPackagePath,
    submitResultPath,
    reportOutputPath,
    archiveOutputPath,
    statusOutputPath,
    summaryOutputPath,
    ...(values.has("--finalization-status-output")
      ? { finalizationStatusOutputPath: values.get("--finalization-status-output")! }
      : {}),
    ...(values.has("--finalization-archive-output")
      ? { finalizationArchiveOutputPath: values.get("--finalization-archive-output")! }
      : {}),
    ...(values.has("--finalization-archive-status-output")
      ? { finalizationArchiveStatusOutputPath: values.get("--finalization-archive-status-output")! }
      : {}),
    ...(values.has("--finalization-archive-status-summary-output")
      ? { finalizationArchiveStatusSummaryOutputPath: values.get("--finalization-archive-status-summary-output")! }
      : {}),
    ...(values.has("--finalization-archive-status-summary-package-output")
      ? {
          finalizationArchiveStatusSummaryPackageOutputPath:
            values.get("--finalization-archive-status-summary-package-output")!,
        }
      : {}),
    ...(values.has("--finalization-archive-status-summary-package-status-output")
      ? {
          finalizationArchiveStatusSummaryPackageStatusOutputPath:
            values.get("--finalization-archive-status-summary-package-status-output")!,
        }
      : {}),
    ...(values.has("--generated-at") ? { generatedAt: values.get("--generated-at")! } : {}),
  };
}

export function isBroadcastCloseoutFinalizationDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

async function writeOptionalJson(
  artifact: { path: string; json: string } | null,
  mkdirp: (dir: string) => Promise<void>,
  writeText: (path: string, contents: string) => Promise<void>,
): Promise<void> {
  if (artifact !== null) await writeArtifact(artifact.path, artifact.json, mkdirp, writeText);
}

async function writeArtifact(
  path: string,
  contents: string,
  mkdirp: (dir: string) => Promise<void>,
  writeText: (path: string, contents: string) => Promise<void>,
): Promise<void> {
  await mkdirp(dirname(path));
  await writeText(path, contents);
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

function validateOptions(options: unknown): asserts options is BroadcastCloseoutFinalizationCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Broadcast closeout finalization options must be an object");
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

function validateFinalizationCreator(
  createFinalization: unknown,
): asserts createFinalization is (params: unknown) => BroadcastCloseoutFinalizationCliResult {
  if (typeof createFinalization !== "function") throw new Error("Broadcast closeout finalization creator must be a function");
}

function validateDirectoryCreator(mkdirp: unknown): asserts mkdirp is (dir: string) => Promise<void> {
  if (typeof mkdirp !== "function") throw new Error("Directory creator must be a function");
}

function validateTextWriter(writeText: unknown): asserts writeText is (path: string, contents: string) => Promise<void> {
  if (typeof writeText !== "function") throw new Error("Text writer must be a function");
}
