import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createAgentProposalExecutionRunbook } from "../../proposalExecution/runbook.js";
import {
  validateProposalExecutionRunbookCliResult,
  validateProposalExecutionRunbookWriteSummary,
} from "../../proposalExecution/reportValidation.js";

export interface ProposalExecutionRunbookCliArgs {
  previewPath: string;
  bundlePath: string;
  approvalPath: string;
  manifestPath: string;
  proposalPath: string;
  summaryPath: string;
  outputPath?: string | undefined;
}

export interface ProposalExecutionRunbookCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  createRunbook?: (params: unknown) => ProposalExecutionRunbookCliResult;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

interface ProposalExecutionRunbookCliResult {
  passed: boolean;
  failures: readonly string[];
  markdown: string;
  transactions: number;
}

if (isProposalExecutionRunbookDirectRun(import.meta.url, process.argv)) await runProposalExecutionRunbookCli();

export async function runProposalExecutionRunbookCli(
  options: ProposalExecutionRunbookCliOptions = {},
): Promise<void> {
  validateProposalExecutionRunbookOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const createRunbook = options.createRunbook ?? ((params: unknown) =>
    createAgentProposalExecutionRunbook(
      params as Parameters<typeof createAgentProposalExecutionRunbook>[0],
    ) as ProposalExecutionRunbookCliResult);
  const mkdirp = options.mkdirp ?? (async (dir: string) => {
    await mkdir(dir, { recursive: true });
  });
  const writeText = options.writeText ?? writeFile;

  validateProposalExecutionRunbookOutputWriter(writeOutput);
  validateProposalExecutionRunbookArgv(argv);
  const args = parseProposalExecutionRunbookCliArgs(argv);
  validateProposalExecutionRunbookTextReader(readText);
  validateProposalExecutionRunbookCreator(createRunbook);

  const runbook = createRunbook({
    previewPath: args.previewPath,
    previewJson: await readText(args.previewPath),
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
  });
  validateProposalExecutionRunbookCliResult(runbook);

  if (!runbook.passed) {
    writeOutput(JSON.stringify({ preview: args.previewPath, passed: false, failures: runbook.failures }, null, 2));
    validateProposalExecutionRunbookExitCodeSetter(setExitCode);
    setExitCode(1);
    return;
  }

  if (args.outputPath === undefined) {
    writeOutput(runbook.markdown.trimEnd());
    return;
  }

  validateProposalExecutionRunbookDirectoryCreator(mkdirp);
  validateProposalExecutionRunbookTextWriter(writeText);
  const summary = {
    preview: args.previewPath,
    output: args.outputPath,
    transactions: runbook.transactions,
    written: true,
  };
  validateProposalExecutionRunbookWriteSummary(summary);
  await mkdirp(dirname(args.outputPath));
  await writeText(args.outputPath, runbook.markdown);
  writeOutput(JSON.stringify(summary, null, 2));
}

export function parseProposalExecutionRunbookCliArgs(argv: readonly string[]): ProposalExecutionRunbookCliArgs {
  validateProposalExecutionRunbookArgv(argv);
  const values = new Map<string, string>();
  const flags = ["--preview", "--bundle", "--approval", "--manifest", "--proposal", "--summary", "--output"] as const;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if ((flags as readonly string[]).includes(arg)) {
      setProposalExecutionRunbookOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(/^(--preview|--bundle|--approval|--manifest|--proposal|--summary|--output)=(.*)$/u);
    if (equals !== null) {
      setProposalExecutionRunbookOption(values, equals[1]!, equals[2]!);
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  const previewPath = values.get("--preview");
  if (previewPath === undefined) throw new Error("--preview is required");
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

  return {
    previewPath,
    bundlePath,
    approvalPath,
    manifestPath,
    proposalPath,
    summaryPath,
    ...(values.has("--output") ? { outputPath: values.get("--output")! } : {}),
  };
}

export function isProposalExecutionRunbookDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateProposalExecutionRunbookArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function setProposalExecutionRunbookOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function validateProposalExecutionRunbookOptions(options: unknown): asserts options is ProposalExecutionRunbookCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Proposal execution runbook options must be an object");
  }
}

function validateProposalExecutionRunbookArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) throw new Error(message);
}

function validateProposalExecutionRunbookOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}

function validateProposalExecutionRunbookExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") throw new Error("Exit code setter must be a function");
}

function validateProposalExecutionRunbookTextReader(readText: unknown): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") throw new Error("Text reader must be a function");
}

function validateProposalExecutionRunbookCreator(
  createRunbook: unknown,
): asserts createRunbook is (params: unknown) => ProposalExecutionRunbookCliResult {
  if (typeof createRunbook !== "function") throw new Error("Proposal execution runbook creator must be a function");
}

function validateProposalExecutionRunbookDirectoryCreator(mkdirp: unknown): asserts mkdirp is (dir: string) => Promise<void> {
  if (typeof mkdirp !== "function") throw new Error("Directory creator must be a function");
}

function validateProposalExecutionRunbookTextWriter(
  writeText: unknown,
): asserts writeText is (path: string, contents: string) => Promise<void> {
  if (typeof writeText !== "function") throw new Error("Text writer must be a function");
}
