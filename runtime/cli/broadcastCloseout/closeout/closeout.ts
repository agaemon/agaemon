import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateBroadcastCloseoutCliResult } from "../../../broadcastCloseout/cliReportValidation.js";
import { createAgentProposalExecutionBroadcastCloseoutEvidenceSet } from "../../../broadcastCloseout/evidenceSet/set.js";

export interface BroadcastCloseoutCliArgs {
  broadcastReceiptPath: string;
  broadcastPackagePath: string;
  submitResultPath: string;
  reportOutputPath: string;
  archiveOutputPath: string;
  statusOutputPath?: string | undefined;
  generatedAt?: string | undefined;
}

export interface BroadcastCloseoutCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  createCloseout?: (params: unknown) => BroadcastCloseoutCliResult;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

interface BroadcastCloseoutCliResult {
  passed: boolean;
  failures: readonly string[];
  report: { path: string; markdown: string };
  archive: { path: string; json: string };
  status: { path: string; json: string } | null;
}

if (isBroadcastCloseoutDirectRun(import.meta.url, process.argv)) await runBroadcastCloseoutCli();

export async function runBroadcastCloseoutCli(options: BroadcastCloseoutCliOptions = {}): Promise<void> {
  validateBroadcastCloseoutOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const createCloseout = options.createCloseout ?? ((params: unknown) =>
    createAgentProposalExecutionBroadcastCloseoutEvidenceSet(
      params as Parameters<typeof createAgentProposalExecutionBroadcastCloseoutEvidenceSet>[0],
    ) as BroadcastCloseoutCliResult);
  const mkdirp = options.mkdirp ?? (async (dir: string) => {
    await mkdir(dir, { recursive: true });
  });
  const writeText = options.writeText ?? writeFile;

  validateBroadcastCloseoutOutputWriter(writeOutput);
  validateBroadcastCloseoutArgv(argv);
  const args = parseBroadcastCloseoutCliArgs(argv);
  validateBroadcastCloseoutTextReader(readText);
  validateBroadcastCloseoutCreator(createCloseout);

  const closeout = createCloseout({
    reportPath: args.reportOutputPath,
    archivePath: args.archiveOutputPath,
    statusPath: args.statusOutputPath,
    broadcastReceiptPath: args.broadcastReceiptPath,
    broadcastReceiptJson: await readText(args.broadcastReceiptPath),
    broadcastPackagePath: args.broadcastPackagePath,
    broadcastPackageJson: await readText(args.broadcastPackagePath),
    submitResultPath: args.submitResultPath,
    submitResultJson: await readText(args.submitResultPath),
    generatedAt: args.generatedAt,
  });
  validateBroadcastCloseoutCliResult(closeout);

  if (closeout.passed) {
    validateBroadcastCloseoutDirectoryCreator(mkdirp);
    validateBroadcastCloseoutTextWriter(writeText);
    await writeTextFile(closeout.report.path, closeout.report.markdown, mkdirp, writeText);
    await writeTextFile(closeout.archive.path, closeout.archive.json, mkdirp, writeText);
    if (closeout.status !== null) await writeTextFile(closeout.status.path, closeout.status.json, mkdirp, writeText);
  }

  writeOutput(JSON.stringify({
    report: closeout.report.path,
    archive: closeout.archive.path,
    status: closeout.status?.path,
    passed: closeout.passed,
    failures: closeout.failures,
  }, null, 2));

  if (!closeout.passed) {
    validateBroadcastCloseoutExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseBroadcastCloseoutCliArgs(argv: readonly string[]): BroadcastCloseoutCliArgs {
  validateBroadcastCloseoutArgv(argv);
  const values = new Map<string, string>();
  const flags = [
    "--broadcast-receipt",
    "--broadcast-package",
    "--submit-result",
    "--report-output",
    "--archive-output",
    "--status-output",
    "--generated-at",
  ] as const;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if ((flags as readonly string[]).includes(arg)) {
      setBroadcastCloseoutOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(
      /^(--broadcast-receipt|--broadcast-package|--submit-result|--report-output|--archive-output|--status-output|--generated-at)=(.*)$/u,
    );
    if (equals !== null) {
      setBroadcastCloseoutOption(values, equals[1]!, equals[2]!);
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
  const reportOutputPath = values.get("--report-output");
  if (reportOutputPath === undefined) throw new Error("--report-output is required");
  const archiveOutputPath = values.get("--archive-output");
  if (archiveOutputPath === undefined) throw new Error("--archive-output is required");

  return {
    broadcastReceiptPath,
    broadcastPackagePath,
    submitResultPath,
    reportOutputPath,
    archiveOutputPath,
    ...(values.has("--status-output") ? { statusOutputPath: values.get("--status-output")! } : {}),
    ...(values.has("--generated-at") ? { generatedAt: values.get("--generated-at")! } : {}),
  };
}

export function isBroadcastCloseoutDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateBroadcastCloseoutArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

async function writeTextFile(
  path: string,
  contents: string,
  mkdirp: (dir: string) => Promise<void>,
  writeText: (path: string, contents: string) => Promise<void>,
): Promise<void> {
  await mkdirp(dirname(path));
  await writeText(path, contents);
}

function setBroadcastCloseoutOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function validateBroadcastCloseoutOptions(options: unknown): asserts options is BroadcastCloseoutCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Broadcast closeout options must be an object");
  }
}

function validateBroadcastCloseoutArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) throw new Error(message);
}

function validateBroadcastCloseoutOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}

function validateBroadcastCloseoutExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") throw new Error("Exit code setter must be a function");
}

function validateBroadcastCloseoutTextReader(readText: unknown): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") throw new Error("Text reader must be a function");
}

function validateBroadcastCloseoutCreator(
  createCloseout: unknown,
): asserts createCloseout is (params: unknown) => BroadcastCloseoutCliResult {
  if (typeof createCloseout !== "function") throw new Error("Broadcast closeout creator must be a function");
}

function validateBroadcastCloseoutDirectoryCreator(mkdirp: unknown): asserts mkdirp is (dir: string) => Promise<void> {
  if (typeof mkdirp !== "function") throw new Error("Directory creator must be a function");
}

function validateBroadcastCloseoutTextWriter(
  writeText: unknown,
): asserts writeText is (path: string, contents: string) => Promise<void> {
  if (typeof writeText !== "function") throw new Error("Text writer must be a function");
}
