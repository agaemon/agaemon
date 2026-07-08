import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createAgentProposalExecutionBroadcastArchive } from "../../broadcast/archive.js";
import { validateBroadcastCliArchiveManifest } from "../../broadcast/cliReportValidation.js";

export interface BroadcastArchiveCliArgs {
  reportPath: string;
  broadcastReceiptPath: string;
  broadcastPackagePath: string;
  submitResultPath: string;
  outputPath?: string | undefined;
  generatedAt?: string | undefined;
}

export interface BroadcastArchiveCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  createArchive?: (params: unknown) => BroadcastArchiveCliResult;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

interface BroadcastArchiveCliResult {
  schemaVersion: 1;
  generatedAt: string;
  report: { path: string };
  receipt: { path: string };
  broadcastPackage: { path: string };
  submitResult: { path: string };
  verification: {
    passed: boolean;
    failures: readonly string[];
  };
}

if (isBroadcastArchiveDirectRun(import.meta.url, process.argv)) await runBroadcastArchiveCli();

export async function runBroadcastArchiveCli(options: BroadcastArchiveCliOptions = {}): Promise<void> {
  validateBroadcastArchiveOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const createArchive = options.createArchive ?? ((params: unknown) =>
    createAgentProposalExecutionBroadcastArchive(
      params as Parameters<typeof createAgentProposalExecutionBroadcastArchive>[0],
    ) as BroadcastArchiveCliResult);
  const mkdirp = options.mkdirp ?? (async (dir: string) => {
    await mkdir(dir, { recursive: true });
  });
  const writeText = options.writeText ?? writeFile;

  validateBroadcastArchiveOutputWriter(writeOutput);
  validateBroadcastArchiveArgv(argv);
  const args = parseBroadcastArchiveCliArgs(argv);
  validateBroadcastArchiveTextReader(readText);
  validateBroadcastArchiveCreator(createArchive);

  const archive = createArchive({
    archivePath: args.outputPath,
    reportPath: args.reportPath,
    reportMarkdown: await readText(args.reportPath),
    broadcastReceiptPath: args.broadcastReceiptPath,
    broadcastReceiptJson: await readText(args.broadcastReceiptPath),
    broadcastPackagePath: args.broadcastPackagePath,
    broadcastPackageJson: await readText(args.broadcastPackagePath),
    submitResultPath: args.submitResultPath,
    submitResultJson: await readText(args.submitResultPath),
    generatedAt: args.generatedAt,
  });
  validateBroadcastCliArchiveManifest(archive);

  if (args.outputPath === undefined) {
    writeOutput(JSON.stringify(archive, null, 2));
  } else {
    validateBroadcastArchiveDirectoryCreator(mkdirp);
    validateBroadcastArchiveTextWriter(writeText);
    await mkdirp(dirname(args.outputPath));
    await writeText(args.outputPath, `${JSON.stringify(archive, null, 2)}\n`);
    writeOutput(JSON.stringify({
      output: args.outputPath,
      report: archive.report.path,
      receipt: archive.receipt.path,
      broadcastPackage: archive.broadcastPackage.path,
      submitResult: archive.submitResult.path,
      passed: archive.verification.passed,
      generatedAt: archive.generatedAt,
    }, null, 2));
  }

  if (!archive.verification.passed) {
    validateBroadcastArchiveExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseBroadcastArchiveCliArgs(argv: readonly string[]): BroadcastArchiveCliArgs {
  validateBroadcastArchiveArgv(argv);
  const values = new Map<string, string>();
  const flags = [
    "--report",
    "--broadcast-receipt",
    "--broadcast-package",
    "--submit-result",
    "--output",
    "--generated-at",
  ] as const;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if ((flags as readonly string[]).includes(arg)) {
      setBroadcastArchiveOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(
      /^(--report|--broadcast-receipt|--broadcast-package|--submit-result|--output|--generated-at)=(.*)$/u,
    );
    if (equals !== null) {
      setBroadcastArchiveOption(values, equals[1]!, equals[2]!);
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  const reportPath = values.get("--report");
  if (reportPath === undefined) throw new Error("--report is required");
  const broadcastReceiptPath = values.get("--broadcast-receipt");
  if (broadcastReceiptPath === undefined) throw new Error("--broadcast-receipt is required");
  const broadcastPackagePath = values.get("--broadcast-package");
  if (broadcastPackagePath === undefined) throw new Error("--broadcast-package is required");
  const submitResultPath = values.get("--submit-result");
  if (submitResultPath === undefined) throw new Error("--submit-result is required");

  return {
    reportPath,
    broadcastReceiptPath,
    broadcastPackagePath,
    submitResultPath,
    ...(values.has("--output") ? { outputPath: values.get("--output")! } : {}),
    ...(values.has("--generated-at") ? { generatedAt: values.get("--generated-at")! } : {}),
  };
}

export function isBroadcastArchiveDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateBroadcastArchiveArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function setBroadcastArchiveOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function validateBroadcastArchiveOptions(options: unknown): asserts options is BroadcastArchiveCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Broadcast archive options must be an object");
  }
}

function validateBroadcastArchiveArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) throw new Error(message);
}

function validateBroadcastArchiveOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}

function validateBroadcastArchiveExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") throw new Error("Exit code setter must be a function");
}

function validateBroadcastArchiveTextReader(readText: unknown): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") throw new Error("Text reader must be a function");
}

function validateBroadcastArchiveCreator(
  createArchive: unknown,
): asserts createArchive is (params: unknown) => BroadcastArchiveCliResult {
  if (typeof createArchive !== "function") throw new Error("Broadcast archive creator must be a function");
}

function validateBroadcastArchiveDirectoryCreator(mkdirp: unknown): asserts mkdirp is (dir: string) => Promise<void> {
  if (typeof mkdirp !== "function") throw new Error("Directory creator must be a function");
}

function validateBroadcastArchiveTextWriter(
  writeText: unknown,
): asserts writeText is (path: string, contents: string) => Promise<void> {
  if (typeof writeText !== "function") throw new Error("Text writer must be a function");
}
