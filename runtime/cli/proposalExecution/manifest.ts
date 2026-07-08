import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createAgentProposalExecutionManifest } from "../../proposalExecution/manifest.js";
import {
  validateProposalExecutionManifestArtifact,
  validateProposalExecutionManifestWriteSummary,
} from "../../proposalExecution/reportValidation.js";

export interface ProposalExecutionManifestCliArgs {
  previewPath: string;
  runbookPath: string;
  bundlePath: string;
  approvalPath: string;
  manifestPath: string;
  proposalPath: string;
  summaryPath: string;
  outputPath?: string | undefined;
  generatedAt?: string | undefined;
}

export interface ProposalExecutionManifestCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  createManifest?: (params: unknown) => ProposalExecutionManifestCliArtifact;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

interface ProposalExecutionManifestCliArtifact {
  generatedAt: string;
  preview: { path: string };
  runbook: { path: string };
  bundle: { path: string };
  preflight: { passed: boolean };
}

if (isProposalExecutionManifestDirectRun(import.meta.url, process.argv)) await runProposalExecutionManifestCli();

export async function runProposalExecutionManifestCli(
  options: ProposalExecutionManifestCliOptions = {},
): Promise<void> {
  validateProposalExecutionManifestOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const createManifest = options.createManifest ?? ((params: unknown) =>
    createAgentProposalExecutionManifest(
      params as Parameters<typeof createAgentProposalExecutionManifest>[0],
    ) as ProposalExecutionManifestCliArtifact);
  const mkdirp = options.mkdirp ?? (async (dir: string) => {
    await mkdir(dir, { recursive: true });
  });
  const writeText = options.writeText ?? writeFile;

  validateProposalExecutionManifestOutputWriter(writeOutput);
  validateProposalExecutionManifestArgv(argv);
  const args = parseProposalExecutionManifestCliArgs(argv);
  validateProposalExecutionManifestTextReader(readText);
  validateProposalExecutionManifestCreator(createManifest);

  const manifest = createManifest({
    previewPath: args.previewPath,
    previewJson: await readText(args.previewPath),
    runbookPath: args.runbookPath,
    runbookMarkdown: await readText(args.runbookPath),
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
    executionManifestPath: args.outputPath,
    generatedAt: args.generatedAt,
  });
  validateProposalExecutionManifestArtifact(manifest);

  if (args.outputPath === undefined) {
    writeOutput(JSON.stringify(manifest, null, 2));
  } else {
    validateProposalExecutionManifestDirectoryCreator(mkdirp);
    validateProposalExecutionManifestTextWriter(writeText);
    const summary = {
      output: args.outputPath,
      preview: manifest.preview.path,
      runbook: manifest.runbook.path,
      bundle: manifest.bundle.path,
      passed: manifest.preflight.passed,
      generatedAt: manifest.generatedAt,
    };
    validateProposalExecutionManifestWriteSummary(summary);
    await mkdirp(dirname(args.outputPath));
    await writeText(args.outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
    writeOutput(JSON.stringify(summary, null, 2));
  }

  if (!manifest.preflight.passed) {
    validateProposalExecutionManifestExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseProposalExecutionManifestCliArgs(argv: readonly string[]): ProposalExecutionManifestCliArgs {
  validateProposalExecutionManifestArgv(argv);
  const values = new Map<string, string>();
  const flags = [
    "--preview",
    "--runbook",
    "--bundle",
    "--approval",
    "--manifest",
    "--proposal",
    "--summary",
    "--output",
    "--generated-at",
  ] as const;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if ((flags as readonly string[]).includes(arg)) {
      setProposalExecutionManifestOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(/^(--preview|--runbook|--bundle|--approval|--manifest|--proposal|--summary|--output|--generated-at)=(.*)$/u);
    if (equals !== null) {
      setProposalExecutionManifestOption(values, equals[1]!, equals[2]!);
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  const previewPath = values.get("--preview");
  if (previewPath === undefined) throw new Error("--preview is required");
  const runbookPath = values.get("--runbook");
  if (runbookPath === undefined) throw new Error("--runbook is required");
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
    runbookPath,
    bundlePath,
    approvalPath,
    manifestPath,
    proposalPath,
    summaryPath,
    ...(values.has("--output") ? { outputPath: values.get("--output")! } : {}),
    ...(values.has("--generated-at") ? { generatedAt: values.get("--generated-at")! } : {}),
  };
}

export function isProposalExecutionManifestDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateProposalExecutionManifestArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function setProposalExecutionManifestOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function validateProposalExecutionManifestOptions(options: unknown): asserts options is ProposalExecutionManifestCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Proposal execution manifest options must be an object");
  }
}

function validateProposalExecutionManifestArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) throw new Error(message);
}

function validateProposalExecutionManifestOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}

function validateProposalExecutionManifestExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") throw new Error("Exit code setter must be a function");
}

function validateProposalExecutionManifestTextReader(readText: unknown): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") throw new Error("Text reader must be a function");
}

function validateProposalExecutionManifestCreator(
  createManifest: unknown,
): asserts createManifest is (params: unknown) => ProposalExecutionManifestCliArtifact {
  if (typeof createManifest !== "function") throw new Error("Proposal execution manifest creator must be a function");
}

function validateProposalExecutionManifestDirectoryCreator(mkdirp: unknown): asserts mkdirp is (dir: string) => Promise<void> {
  if (typeof mkdirp !== "function") throw new Error("Directory creator must be a function");
}

function validateProposalExecutionManifestTextWriter(
  writeText: unknown,
): asserts writeText is (path: string, contents: string) => Promise<void> {
  if (typeof writeText !== "function") throw new Error("Text writer must be a function");
}
