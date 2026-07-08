import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createAgentProposalReviewManifest } from "../../proposalReview/manifest.js";
import {
  validateProposalReviewManifestCliArtifact,
  validateProposalReviewManifestCliWriteSummary,
} from "../../proposalReview/reportValidation.js";

export interface ProposalReviewManifestCliArgs {
  proposalPath: string;
  summaryPath: string;
  outputPath?: string | undefined;
  generatedAt?: string | undefined;
}

export interface ProposalReviewManifestCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  createManifest?: (params: unknown) => ProposalReviewManifestCliArtifact;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

interface ProposalReviewManifestCliArtifact {
  generatedAt: string;
  proposal: { path: string };
  summary: { path: string };
  preflight: { passed: boolean };
}

if (isProposalReviewManifestDirectRun(import.meta.url, process.argv)) await runProposalReviewManifestCli();

export async function runProposalReviewManifestCli(options: ProposalReviewManifestCliOptions = {}): Promise<void> {
  validateProposalReviewManifestOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const createManifest = options.createManifest ?? ((params: unknown) =>
    createAgentProposalReviewManifest(
      params as Parameters<typeof createAgentProposalReviewManifest>[0],
    ) as ProposalReviewManifestCliArtifact);
  const mkdirp = options.mkdirp ?? (async (dir: string) => {
    await mkdir(dir, { recursive: true });
  });
  const writeText = options.writeText ?? writeFile;

  validateProposalReviewManifestOutputWriter(writeOutput);
  validateProposalReviewManifestArgv(argv);
  const args = parseProposalReviewManifestCliArgs(argv);
  validateProposalReviewManifestTextReader(readText);
  validateProposalReviewManifestCreator(createManifest);

  const manifest = createManifest({
    proposalPath: args.proposalPath,
    proposalJson: await readText(args.proposalPath),
    summaryPath: args.summaryPath,
    summaryMarkdown: await readText(args.summaryPath),
    generatedAt: args.generatedAt,
  });
  validateProposalReviewManifestCliArtifact(manifest);

  if (args.outputPath === undefined) {
    writeOutput(JSON.stringify(manifest, null, 2));
  } else {
    validateProposalReviewManifestDirectoryCreator(mkdirp);
    validateProposalReviewManifestTextWriter(writeText);
    const writeSummary = {
      output: args.outputPath,
      proposal: manifest.proposal.path,
      summary: manifest.summary.path,
      passed: manifest.preflight.passed,
      generatedAt: manifest.generatedAt,
    };
    validateProposalReviewManifestCliWriteSummary(writeSummary);
    await mkdirp(dirname(args.outputPath));
    await writeText(args.outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
    writeOutput(JSON.stringify(writeSummary, null, 2));
  }

  if (!manifest.preflight.passed) {
    validateProposalReviewManifestExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseProposalReviewManifestCliArgs(argv: readonly string[]): ProposalReviewManifestCliArgs {
  validateProposalReviewManifestArgv(argv);
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if (arg === "--proposal" || arg === "--summary" || arg === "--output" || arg === "--generated-at") {
      setProposalReviewManifestOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(/^(--proposal|--summary|--output|--generated-at)=(.*)$/u);
    if (equals !== null) {
      setProposalReviewManifestOption(values, equals[1]!, equals[2]!);
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  const proposalPath = values.get("--proposal");
  if (proposalPath === undefined) throw new Error("--proposal is required");
  const summaryPath = values.get("--summary");
  if (summaryPath === undefined) throw new Error("--summary is required");

  return {
    proposalPath,
    summaryPath,
    ...(values.has("--output") ? { outputPath: values.get("--output")! } : {}),
    ...(values.has("--generated-at") ? { generatedAt: values.get("--generated-at")! } : {}),
  };
}

export function isProposalReviewManifestDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateProposalReviewManifestArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function setProposalReviewManifestOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  values.set(name, value);
}

function validateProposalReviewManifestOptions(options: unknown): asserts options is ProposalReviewManifestCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Proposal review manifest options must be an object");
  }
}

function validateProposalReviewManifestArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) {
    throw new Error(message);
  }
}

function validateProposalReviewManifestOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") {
    throw new Error("Output writer must be a function");
  }
}

function validateProposalReviewManifestExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") {
    throw new Error("Exit code setter must be a function");
  }
}

function validateProposalReviewManifestTextReader(readText: unknown): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") {
    throw new Error("Text reader must be a function");
  }
}

function validateProposalReviewManifestCreator(
  createManifest: unknown,
): asserts createManifest is (params: unknown) => ProposalReviewManifestCliArtifact {
  if (typeof createManifest !== "function") {
    throw new Error("Proposal review manifest creator must be a function");
  }
}

function validateProposalReviewManifestDirectoryCreator(mkdirp: unknown): asserts mkdirp is (dir: string) => Promise<void> {
  if (typeof mkdirp !== "function") {
    throw new Error("Directory creator must be a function");
  }
}

function validateProposalReviewManifestTextWriter(
  writeText: unknown,
): asserts writeText is (path: string, contents: string) => Promise<void> {
  if (typeof writeText !== "function") {
    throw new Error("Text writer must be a function");
  }
}
