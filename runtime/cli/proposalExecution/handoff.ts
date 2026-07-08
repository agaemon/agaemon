import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createAgentProposalExecutionHandoff } from "../../proposalExecution/handoff.js";
import { validateProposalExecutionHandoffCliResult } from "../../proposalExecution/reportValidation.js";

export interface ProposalExecutionHandoffCliArgs {
  bundlePath: string;
  approvalPath: string;
  manifestPath: string;
  proposalPath: string;
  summaryPath: string;
  previewOutputPath: string;
  runbookOutputPath: string;
  executionManifestOutputPath: string;
  generatedAt?: string | undefined;
}

export interface ProposalExecutionHandoffCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  createHandoff?: (params: unknown) => ProposalExecutionHandoffCliResult;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

interface ProposalExecutionHandoffCliResult {
  preview: { path: string; json: string };
  runbook: { path: string; markdown: string };
  executionManifest: { path: string; json: string };
  passed: boolean;
  failures: readonly string[];
}

if (isProposalExecutionHandoffDirectRun(import.meta.url, process.argv)) await runProposalExecutionHandoffCli();

export async function runProposalExecutionHandoffCli(
  options: ProposalExecutionHandoffCliOptions = {},
): Promise<void> {
  validateProposalExecutionHandoffOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const createHandoff = options.createHandoff ?? ((params: unknown) =>
    createAgentProposalExecutionHandoff(
      params as Parameters<typeof createAgentProposalExecutionHandoff>[0],
    ) as ProposalExecutionHandoffCliResult);
  const mkdirp = options.mkdirp ?? (async (dir: string) => {
    await mkdir(dir, { recursive: true });
  });
  const writeText = options.writeText ?? writeFile;

  validateProposalExecutionHandoffOutputWriter(writeOutput);
  validateProposalExecutionHandoffArgv(argv);
  const args = parseProposalExecutionHandoffCliArgs(argv);
  validateProposalExecutionHandoffTextReader(readText);
  validateProposalExecutionHandoffCreator(createHandoff);

  const handoff = createHandoff({
    previewPath: args.previewOutputPath,
    runbookPath: args.runbookOutputPath,
    executionManifestPath: args.executionManifestOutputPath,
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
  validateProposalExecutionHandoffCliResult(handoff);

  if (handoff.passed) {
    validateProposalExecutionHandoffDirectoryCreator(mkdirp);
    validateProposalExecutionHandoffTextWriter(writeText);
    await writeTextFile(args.previewOutputPath, handoff.preview.json, mkdirp, writeText);
    await writeTextFile(args.runbookOutputPath, handoff.runbook.markdown, mkdirp, writeText);
    await writeTextFile(args.executionManifestOutputPath, handoff.executionManifest.json, mkdirp, writeText);
  }

  writeOutput(JSON.stringify({
    preview: handoff.preview.path,
    runbook: handoff.runbook.path,
    executionManifest: handoff.executionManifest.path,
    passed: handoff.passed,
    failures: handoff.failures,
  }, null, 2));

  if (!handoff.passed) {
    validateProposalExecutionHandoffExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseProposalExecutionHandoffCliArgs(argv: readonly string[]): ProposalExecutionHandoffCliArgs {
  validateProposalExecutionHandoffArgv(argv);
  const values = new Map<string, string>();
  const flags = [
    "--bundle",
    "--approval",
    "--manifest",
    "--proposal",
    "--summary",
    "--preview-output",
    "--runbook-output",
    "--execution-manifest-output",
    "--generated-at",
  ] as const;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if ((flags as readonly string[]).includes(arg)) {
      setProposalExecutionHandoffOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(/^(--bundle|--approval|--manifest|--proposal|--summary|--preview-output|--runbook-output|--execution-manifest-output|--generated-at)=(.*)$/u);
    if (equals !== null) {
      setProposalExecutionHandoffOption(values, equals[1]!, equals[2]!);
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
  const executionManifestOutputPath = values.get("--execution-manifest-output");
  if (executionManifestOutputPath === undefined) throw new Error("--execution-manifest-output is required");

  return {
    bundlePath,
    approvalPath,
    manifestPath,
    proposalPath,
    summaryPath,
    previewOutputPath,
    runbookOutputPath,
    executionManifestOutputPath,
    ...(values.has("--generated-at") ? { generatedAt: values.get("--generated-at")! } : {}),
  };
}

export function isProposalExecutionHandoffDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateProposalExecutionHandoffArgv(argv, "Direct-run argv must be an array of strings");
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

function setProposalExecutionHandoffOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function validateProposalExecutionHandoffOptions(options: unknown): asserts options is ProposalExecutionHandoffCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Proposal execution handoff options must be an object");
  }
}

function validateProposalExecutionHandoffArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) throw new Error(message);
}

function validateProposalExecutionHandoffOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}

function validateProposalExecutionHandoffExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") throw new Error("Exit code setter must be a function");
}

function validateProposalExecutionHandoffTextReader(readText: unknown): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") throw new Error("Text reader must be a function");
}

function validateProposalExecutionHandoffCreator(
  createHandoff: unknown,
): asserts createHandoff is (params: unknown) => ProposalExecutionHandoffCliResult {
  if (typeof createHandoff !== "function") throw new Error("Proposal execution handoff creator must be a function");
}

function validateProposalExecutionHandoffDirectoryCreator(mkdirp: unknown): asserts mkdirp is (dir: string) => Promise<void> {
  if (typeof mkdirp !== "function") throw new Error("Directory creator must be a function");
}

function validateProposalExecutionHandoffTextWriter(
  writeText: unknown,
): asserts writeText is (path: string, contents: string) => Promise<void> {
  if (typeof writeText !== "function") throw new Error("Text writer must be a function");
}
