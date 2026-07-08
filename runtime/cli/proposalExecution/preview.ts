import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createAgentProposalExecutionPreview } from "../../proposalExecution/preview.js";
import {
  validateProposalExecutionPreviewCliResult,
  validateProposalExecutionPreviewWriteSummary,
} from "../../proposalExecution/reportValidation.js";

export interface ProposalExecutionPreviewCliArgs {
  bundlePath: string;
  approvalPath: string;
  manifestPath: string;
  proposalPath: string;
  summaryPath: string;
  outputPath?: string | undefined;
}

export interface ProposalExecutionPreviewCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  createPreview?: (params: unknown) => ProposalExecutionPreviewCliResult;
  writeText?: (path: string, contents: string) => Promise<void>;
}

interface ProposalExecutionPreviewCliResult {
  passed: boolean;
  preview: ProposalExecutionPreviewCliArtifact | null;
  failures: readonly string[];
}

interface ProposalExecutionPreviewCliArtifact {
  transactions: readonly unknown[];
}

if (isProposalExecutionPreviewDirectRun(import.meta.url, process.argv)) await runProposalExecutionPreviewCli();

export async function runProposalExecutionPreviewCli(
  options: ProposalExecutionPreviewCliOptions = {},
): Promise<void> {
  validateProposalExecutionPreviewOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const createPreview = options.createPreview ?? ((params: unknown) =>
    createAgentProposalExecutionPreview(
      params as Parameters<typeof createAgentProposalExecutionPreview>[0],
    ) as ProposalExecutionPreviewCliResult);
  const writeText = options.writeText ?? writeFile;

  validateProposalExecutionPreviewOutputWriter(writeOutput);
  validateProposalExecutionPreviewArgv(argv);
  const args = parseProposalExecutionPreviewCliArgs(argv);
  validateProposalExecutionPreviewTextReader(readText);
  validateProposalExecutionPreviewCreator(createPreview);

  const result = createPreview({
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
  validateProposalExecutionPreviewCliResult(result);

  if (result.passed && result.preview !== null && args.outputPath !== undefined) {
    validateProposalExecutionPreviewTextWriter(writeText);
    const summary = { output: args.outputPath, transactions: result.preview.transactions.length, written: true };
    validateProposalExecutionPreviewWriteSummary(summary);
    await writeText(args.outputPath, `${JSON.stringify(result.preview, null, 2)}\n`);
    writeOutput(JSON.stringify(summary, null, 2));
  } else {
    writeOutput(JSON.stringify(result.passed ? result.preview : result, null, 2));
  }

  if (!result.passed) {
    validateProposalExecutionPreviewExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseProposalExecutionPreviewCliArgs(argv: readonly string[]): ProposalExecutionPreviewCliArgs {
  validateProposalExecutionPreviewArgv(argv);
  const values = new Map<string, string>();
  const flags = ["--bundle", "--approval", "--manifest", "--proposal", "--summary", "--output"] as const;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if ((flags as readonly string[]).includes(arg)) {
      setProposalExecutionPreviewOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(/^(--bundle|--approval|--manifest|--proposal|--summary|--output)=(.*)$/u);
    if (equals !== null) {
      setProposalExecutionPreviewOption(values, equals[1]!, equals[2]!);
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

  return {
    bundlePath,
    approvalPath,
    manifestPath,
    proposalPath,
    summaryPath,
    ...(values.has("--output") ? { outputPath: values.get("--output")! } : {}),
  };
}

export function isProposalExecutionPreviewDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateProposalExecutionPreviewArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function setProposalExecutionPreviewOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  values.set(name, value);
}

function validateProposalExecutionPreviewOptions(options: unknown): asserts options is ProposalExecutionPreviewCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Proposal execution preview options must be an object");
  }
}

function validateProposalExecutionPreviewArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) throw new Error(message);
}

function validateProposalExecutionPreviewOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}

function validateProposalExecutionPreviewExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") throw new Error("Exit code setter must be a function");
}

function validateProposalExecutionPreviewTextReader(readText: unknown): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") throw new Error("Text reader must be a function");
}

function validateProposalExecutionPreviewCreator(
  createPreview: unknown,
): asserts createPreview is (params: unknown) => ProposalExecutionPreviewCliResult {
  if (typeof createPreview !== "function") throw new Error("Proposal execution preview creator must be a function");
}

function validateProposalExecutionPreviewTextWriter(
  writeText: unknown,
): asserts writeText is (path: string, contents: string) => Promise<void> {
  if (typeof writeText !== "function") throw new Error("Text writer must be a function");
}
