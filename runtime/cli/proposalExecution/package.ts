import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createAgentProposalExecutionPackage } from "../../proposalExecution/package.js";
import { validateProposalExecutionPackageCliResult } from "../../proposalExecution/reportValidation.js";

export interface ProposalExecutionPackageCliArgs {
  bundlePath: string;
  approvalPath: string;
  manifestPath: string;
  proposalPath: string;
  summaryPath: string;
  previewOutputPath: string;
  runbookOutputPath: string;
  generatedAt?: string | undefined;
}

export interface ProposalExecutionPackageCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  createPackage?: (params: unknown) => ProposalExecutionPackageCliResult;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

interface ProposalExecutionPackageCliResult {
  preview: { path: string; json: string };
  runbook: { path: string; markdown: string };
  passed: boolean;
  failures: readonly string[];
}

if (isProposalExecutionPackageDirectRun(import.meta.url, process.argv)) await runProposalExecutionPackageCli();

export async function runProposalExecutionPackageCli(
  options: ProposalExecutionPackageCliOptions = {},
): Promise<void> {
  validateProposalExecutionPackageOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const createPackage = options.createPackage ?? ((params: unknown) =>
    createAgentProposalExecutionPackage(
      params as Parameters<typeof createAgentProposalExecutionPackage>[0],
    ) as ProposalExecutionPackageCliResult);
  const mkdirp = options.mkdirp ?? (async (dir: string) => {
    await mkdir(dir, { recursive: true });
  });
  const writeText = options.writeText ?? writeFile;

  validateProposalExecutionPackageOutputWriter(writeOutput);
  validateProposalExecutionPackageArgv(argv);
  const args = parseProposalExecutionPackageCliArgs(argv);
  validateProposalExecutionPackageTextReader(readText);
  validateProposalExecutionPackageCreator(createPackage);

  const result = createPackage({
    previewPath: args.previewOutputPath,
    runbookPath: args.runbookOutputPath,
    bundlePath: args.bundlePath,
    bundleJson: await readText(args.bundlePath),
    approvalPath: args.approvalPath,
    approvalJson: await readText(args.approvalPath),
    manifestPath: args.manifestPath,
    manifestJson: await readText(args.manifestPath),
    proposalPath: args.proposalPath,
    proposalJson: await readText(args.proposalPath),
    summaryPath: args.summaryPath,
    summaryMarkdown: await readText(args.summaryPath),
    generatedAt: args.generatedAt,
  });
  validateProposalExecutionPackageCliResult(result);

  if (result.passed) {
    validateProposalExecutionPackageDirectoryCreator(mkdirp);
    validateProposalExecutionPackageTextWriter(writeText);
    await writeTextFile(args.previewOutputPath, result.preview.json, mkdirp, writeText);
    await writeTextFile(args.runbookOutputPath, result.runbook.markdown, mkdirp, writeText);
  }

  writeOutput(JSON.stringify({
    preview: result.preview.path,
    runbook: result.runbook.path,
    passed: result.passed,
    failures: result.failures,
  }, null, 2));

  if (!result.passed) {
    validateProposalExecutionPackageExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseProposalExecutionPackageCliArgs(argv: readonly string[]): ProposalExecutionPackageCliArgs {
  validateProposalExecutionPackageArgv(argv);
  const values = new Map<string, string>();
  const flags = [
    "--bundle",
    "--approval",
    "--manifest",
    "--proposal",
    "--summary",
    "--preview-output",
    "--runbook-output",
    "--generated-at",
  ] as const;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if ((flags as readonly string[]).includes(arg)) {
      setProposalExecutionPackageOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(/^(--bundle|--approval|--manifest|--proposal|--summary|--preview-output|--runbook-output|--generated-at)=(.*)$/u);
    if (equals !== null) {
      setProposalExecutionPackageOption(values, equals[1]!, equals[2]!);
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  const bundlePath = values.get("--bundle");
  if (bundlePath === undefined) throw new Error("--bundle is required");
  const approvalPath = values.get("--approval");
  if (approvalPath === undefined) throw new Error("--approval is required");
  const manifestPath = values.get("--manifest");
  if (manifestPath === undefined) throw new Error("--manifest is required");
  const proposalPath = values.get("--proposal");
  if (proposalPath === undefined) throw new Error("--proposal is required");
  const summaryPath = values.get("--summary");
  if (summaryPath === undefined) throw new Error("--summary is required");
  const previewOutputPath = values.get("--preview-output");
  if (previewOutputPath === undefined) throw new Error("--preview-output is required");
  const runbookOutputPath = values.get("--runbook-output");
  if (runbookOutputPath === undefined) throw new Error("--runbook-output is required");

  return {
    bundlePath,
    approvalPath,
    manifestPath,
    proposalPath,
    summaryPath,
    previewOutputPath,
    runbookOutputPath,
    ...(values.has("--generated-at") ? { generatedAt: values.get("--generated-at")! } : {}),
  };
}

export function isProposalExecutionPackageDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateProposalExecutionPackageArgv(argv, "Direct-run argv must be an array of strings");
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

function setProposalExecutionPackageOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function validateProposalExecutionPackageOptions(options: unknown): asserts options is ProposalExecutionPackageCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Proposal execution package options must be an object");
  }
}

function validateProposalExecutionPackageArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) throw new Error(message);
}

function validateProposalExecutionPackageOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}

function validateProposalExecutionPackageExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") throw new Error("Exit code setter must be a function");
}

function validateProposalExecutionPackageTextReader(readText: unknown): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") throw new Error("Text reader must be a function");
}

function validateProposalExecutionPackageCreator(
  createPackage: unknown,
): asserts createPackage is (params: unknown) => ProposalExecutionPackageCliResult {
  if (typeof createPackage !== "function") throw new Error("Proposal execution package creator must be a function");
}

function validateProposalExecutionPackageDirectoryCreator(mkdirp: unknown): asserts mkdirp is (dir: string) => Promise<void> {
  if (typeof mkdirp !== "function") throw new Error("Directory creator must be a function");
}

function validateProposalExecutionPackageTextWriter(
  writeText: unknown,
): asserts writeText is (path: string, contents: string) => Promise<void> {
  if (typeof writeText !== "function") throw new Error("Text writer must be a function");
}
