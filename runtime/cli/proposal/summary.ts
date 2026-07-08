import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createAgentProposalSummary } from "../../proposal/summary.js";
import {
  validateProposalSummaryCliReport,
  validateProposalSummaryCliWriteSummary,
} from "../../proposal/reportValidation.js";

export interface ProposalSummaryCliArgs {
  proposalPath: string;
  outputPath?: string | undefined;
}

export interface ProposalSummaryCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  createSummary?: (params: unknown) => ProposalSummaryCliResult;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

interface ProposalSummaryCliResult {
  passed: boolean;
  failures: readonly string[];
  markdown: string;
  source: string;
  sourcePath: string;
  executable: boolean;
  steps: number;
  transactions: number;
}

if (isProposalSummaryDirectRun(import.meta.url, process.argv)) await runProposalSummaryCli();

export async function runProposalSummaryCli(options: ProposalSummaryCliOptions = {}): Promise<void> {
  validateProposalSummaryOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const createSummary = options.createSummary ?? ((params: unknown) =>
    createAgentProposalSummary(params as Parameters<typeof createAgentProposalSummary>[0]) as ProposalSummaryCliResult);
  const mkdirp = options.mkdirp ?? (async (dir: string) => {
    await mkdir(dir, { recursive: true });
  });
  const writeText = options.writeText ?? writeFile;

  validateProposalSummaryOutputWriter(writeOutput);
  validateProposalSummaryArgv(argv);
  const args = parseProposalSummaryCliArgs(argv);
  validateProposalSummaryTextReader(readText);
  validateProposalSummaryCreator(createSummary);

  const summary = createSummary({
    proposalPath: args.proposalPath,
    proposalJson: await readText(args.proposalPath),
  });
  validateProposalSummaryCliReport(summary);

  if (!summary.passed) {
    writeOutput(
      JSON.stringify(
        {
          proposal: args.proposalPath,
          passed: false,
          failures: summary.failures,
        },
        null,
        2,
      ),
    );
    validateProposalSummaryExitCodeSetter(setExitCode);
    setExitCode(1);
    return;
  }

  if (args.outputPath === undefined) {
    writeOutput(summary.markdown.trimEnd());
    return;
  }

  validateProposalSummaryDirectoryCreator(mkdirp);
  validateProposalSummaryTextWriter(writeText);
  const writeSummary = {
    proposal: args.proposalPath,
    output: args.outputPath,
    source: summary.source,
    sourcePath: summary.sourcePath,
    executable: summary.executable,
    steps: summary.steps,
    transactions: summary.transactions,
    written: true,
  };
  validateProposalSummaryCliWriteSummary(writeSummary);
  await mkdirp(dirname(args.outputPath));
  await writeText(args.outputPath, summary.markdown);
  writeOutput(JSON.stringify(writeSummary, null, 2));
}

export function parseProposalSummaryCliArgs(argv: readonly string[]): ProposalSummaryCliArgs {
  validateProposalSummaryArgv(argv);
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if (arg === "--proposal" || arg === "--output") {
      setProposalSummaryOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(/^(--proposal|--output)=(.*)$/u);
    if (equals !== null) {
      setProposalSummaryOption(values, equals[1]!, equals[2]!);
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  const proposalPath = values.get("--proposal");
  if (proposalPath === undefined) throw new Error("--proposal is required");

  return {
    proposalPath,
    ...(values.has("--output") ? { outputPath: values.get("--output")! } : {}),
  };
}

export function isProposalSummaryDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateProposalSummaryArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function setProposalSummaryOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  values.set(name, value);
}

function validateProposalSummaryOptions(options: unknown): asserts options is ProposalSummaryCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Proposal summary options must be an object");
  }
}

function validateProposalSummaryArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) {
    throw new Error(message);
  }
}

function validateProposalSummaryOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") {
    throw new Error("Output writer must be a function");
  }
}

function validateProposalSummaryExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") {
    throw new Error("Exit code setter must be a function");
  }
}

function validateProposalSummaryTextReader(readText: unknown): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") {
    throw new Error("Text reader must be a function");
  }
}

function validateProposalSummaryCreator(
  createSummary: unknown,
): asserts createSummary is (params: unknown) => ProposalSummaryCliResult {
  if (typeof createSummary !== "function") {
    throw new Error("Proposal summary creator must be a function");
  }
}

function validateProposalSummaryDirectoryCreator(mkdirp: unknown): asserts mkdirp is (dir: string) => Promise<void> {
  if (typeof mkdirp !== "function") {
    throw new Error("Directory creator must be a function");
  }
}

function validateProposalSummaryTextWriter(
  writeText: unknown,
): asserts writeText is (path: string, contents: string) => Promise<void> {
  if (typeof writeText !== "function") {
    throw new Error("Text writer must be a function");
  }
}
