import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createAgentProposalExecutionBundle } from "../../proposalExecution/bundle.js";
import {
  validateProposalExecutionBundleCliResult,
  validateProposalExecutionBundleWriteSummary,
} from "../../proposalExecution/reportValidation.js";

export interface ProposalExecutionBundleCliArgs {
  approvalPath: string;
  manifestPath: string;
  proposalPath: string;
  summaryPath: string;
  outputPath?: string | undefined;
  generatedAt?: string | undefined;
}

export interface ProposalExecutionBundleCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  createBundle?: (params: unknown) => ProposalExecutionBundleCliResult;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

interface ProposalExecutionBundleCliResult {
  passed: boolean;
  failures: readonly string[];
  approvalVerification: unknown;
  bundle: ProposalExecutionBundleCliArtifact | null;
}

interface ProposalExecutionBundleCliArtifact {
  transactions: readonly unknown[];
}

if (isProposalExecutionBundleDirectRun(import.meta.url, process.argv)) await runProposalExecutionBundleCli();

export async function runProposalExecutionBundleCli(
  options: ProposalExecutionBundleCliOptions = {},
): Promise<void> {
  validateProposalExecutionBundleOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const createBundle = options.createBundle ?? ((params: unknown) =>
    createAgentProposalExecutionBundle(
      params as Parameters<typeof createAgentProposalExecutionBundle>[0],
    ) as ProposalExecutionBundleCliResult);
  const mkdirp = options.mkdirp ?? ((dir: string) => mkdir(dir, { recursive: true }).then(() => undefined));
  const writeText = options.writeText ?? writeFile;

  validateProposalExecutionBundleOutputWriter(writeOutput);
  validateProposalExecutionBundleArgv(argv);
  const args = parseProposalExecutionBundleCliArgs(argv);
  validateProposalExecutionBundleTextReader(readText);
  validateProposalExecutionBundleCreator(createBundle);

  const result = createBundle({
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
  validateProposalExecutionBundleCliResult(result);

  if (result.passed && result.bundle !== null) {
    if (args.outputPath === undefined) {
      writeOutput(JSON.stringify(result.bundle, null, 2));
    } else {
      validateProposalExecutionBundleDirectoryCreator(mkdirp);
      validateProposalExecutionBundleTextWriter(writeText);
      const writeSummary = {
        output: args.outputPath,
        transactions: result.bundle.transactions.length,
        passed: true,
      };
      validateProposalExecutionBundleWriteSummary(writeSummary);
      await mkdirp(dirname(args.outputPath));
      await writeText(args.outputPath, `${JSON.stringify(result.bundle, null, 2)}\n`);
      writeOutput(JSON.stringify(writeSummary, null, 2));
    }
    return;
  }

  writeOutput(JSON.stringify({
    approval: args.approvalPath,
    manifest: args.manifestPath,
    proposal: args.proposalPath,
    summary: args.summaryPath,
    passed: false,
    failures: result.failures,
    approvalVerification: result.approvalVerification,
  }, null, 2));
  validateProposalExecutionBundleExitCodeSetter(setExitCode);
  setExitCode(1);
}

export function parseProposalExecutionBundleCliArgs(argv: readonly string[]): ProposalExecutionBundleCliArgs {
  validateProposalExecutionBundleArgv(argv);
  const values = new Map<string, string>();
  const flags = ["--approval", "--manifest", "--proposal", "--summary", "--output", "--generated-at"] as const;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if ((flags as readonly string[]).includes(arg)) {
      setProposalExecutionBundleOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(/^(--approval|--manifest|--proposal|--summary|--output|--generated-at)=(.*)$/u);
    if (equals !== null) {
      setProposalExecutionBundleOption(values, equals[1]!, equals[2]!);
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  const approvalPath = values.get("--approval");
  if (approvalPath === undefined) throw new Error("--approval is required");
  const manifestPath = values.get("--manifest");
  if (manifestPath === undefined) throw new Error("--manifest is required");
  const proposalPath = values.get("--proposal");
  if (proposalPath === undefined) throw new Error("--proposal is required");
  const summaryPath = values.get("--summary");
  if (summaryPath === undefined) throw new Error("--summary is required");

  return {
    approvalPath,
    manifestPath,
    proposalPath,
    summaryPath,
    ...(values.has("--output") ? { outputPath: values.get("--output")! } : {}),
    ...(values.has("--generated-at") ? { generatedAt: values.get("--generated-at")! } : {}),
  };
}

export function isProposalExecutionBundleDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateProposalExecutionBundleArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function setProposalExecutionBundleOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  values.set(name, value);
}

function validateProposalExecutionBundleOptions(options: unknown): asserts options is ProposalExecutionBundleCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Proposal execution bundle options must be an object");
  }
}

function validateProposalExecutionBundleArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) throw new Error(message);
}

function validateProposalExecutionBundleOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}

function validateProposalExecutionBundleExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") throw new Error("Exit code setter must be a function");
}

function validateProposalExecutionBundleTextReader(readText: unknown): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") throw new Error("Text reader must be a function");
}

function validateProposalExecutionBundleCreator(
  createBundle: unknown,
): asserts createBundle is (params: unknown) => ProposalExecutionBundleCliResult {
  if (typeof createBundle !== "function") throw new Error("Proposal execution bundle creator must be a function");
}

function validateProposalExecutionBundleDirectoryCreator(mkdirp: unknown): asserts mkdirp is (dir: string) => Promise<void> {
  if (typeof mkdirp !== "function") throw new Error("Directory creator must be a function");
}

function validateProposalExecutionBundleTextWriter(
  writeText: unknown,
): asserts writeText is (path: string, contents: string) => Promise<void> {
  if (typeof writeText !== "function") throw new Error("Text writer must be a function");
}
