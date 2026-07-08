import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createAgentProposalReviewPackage } from "../../proposalReview/package.js";
import { validateProposalReviewPackageCliResult } from "../../proposalReview/reportValidation.js";

export interface ProposalReviewPackageCliArgs {
  proposalPath: string;
  summaryOutputPath: string;
  manifestOutputPath: string;
  generatedAt?: string | undefined;
}

export interface ProposalReviewPackageCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  createPackage?: (params: unknown) => ProposalReviewPackageCliResult;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

interface ProposalReviewPackageCliResult {
  proposal: string;
  summary: { path: string; markdown: string };
  manifestPath: string;
  manifest: unknown;
  passed: boolean;
  failures: readonly string[];
}

if (isProposalReviewPackageDirectRun(import.meta.url, process.argv)) await runProposalReviewPackageCli();

export async function runProposalReviewPackageCli(options: ProposalReviewPackageCliOptions = {}): Promise<void> {
  validateProposalReviewPackageOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const createPackage = options.createPackage ?? ((params: unknown) =>
    createAgentProposalReviewPackage(
      params as Parameters<typeof createAgentProposalReviewPackage>[0],
    ) as ProposalReviewPackageCliResult);
  const mkdirp = options.mkdirp ?? (async (dir: string) => {
    await mkdir(dir, { recursive: true });
  });
  const writeText = options.writeText ?? writeFile;

  validateProposalReviewPackageOutputWriter(writeOutput);
  validateProposalReviewPackageArgv(argv);
  const args = parseProposalReviewPackageCliArgs(argv);
  validateProposalReviewPackageTextReader(readText);
  validateProposalReviewPackageCreator(createPackage);

  const result = createPackage({
    proposalPath: args.proposalPath,
    proposalJson: await readText(args.proposalPath),
    summaryPath: args.summaryOutputPath,
    manifestPath: args.manifestOutputPath,
    generatedAt: args.generatedAt,
  });
  validateProposalReviewPackageCliResult(result);

  if (result.passed && result.manifest !== null) {
    validateProposalReviewPackageDirectoryCreator(mkdirp);
    validateProposalReviewPackageTextWriter(writeText);
    await writeTextFile(args.summaryOutputPath, result.summary.markdown, mkdirp, writeText);
    await writeTextFile(args.manifestOutputPath, `${JSON.stringify(result.manifest, null, 2)}\n`, mkdirp, writeText);
  }

  writeOutput(
    JSON.stringify(
      {
        proposal: result.proposal,
        summary: result.summary.path,
        manifest: result.manifestPath,
        passed: result.passed,
        failures: result.failures,
      },
      null,
      2,
    ),
  );

  if (!result.passed) {
    validateProposalReviewPackageExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseProposalReviewPackageCliArgs(argv: readonly string[]): ProposalReviewPackageCliArgs {
  validateProposalReviewPackageArgv(argv);
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if (
      arg === "--proposal" ||
      arg === "--summary-output" ||
      arg === "--manifest-output" ||
      arg === "--generated-at"
    ) {
      setProposalReviewPackageOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(/^(--proposal|--summary-output|--manifest-output|--generated-at)=(.*)$/u);
    if (equals !== null) {
      setProposalReviewPackageOption(values, equals[1]!, equals[2]!);
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  const proposalPath = values.get("--proposal");
  if (proposalPath === undefined) throw new Error("--proposal is required");
  const summaryOutputPath = values.get("--summary-output");
  if (summaryOutputPath === undefined) throw new Error("--summary-output is required");
  const manifestOutputPath = values.get("--manifest-output");
  if (manifestOutputPath === undefined) throw new Error("--manifest-output is required");

  return {
    proposalPath,
    summaryOutputPath,
    manifestOutputPath,
    ...(values.has("--generated-at") ? { generatedAt: values.get("--generated-at")! } : {}),
  };
}

export function isProposalReviewPackageDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateProposalReviewPackageArgv(argv, "Direct-run argv must be an array of strings");
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

function setProposalReviewPackageOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  values.set(name, value);
}

function validateProposalReviewPackageOptions(options: unknown): asserts options is ProposalReviewPackageCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Proposal review package options must be an object");
  }
}

function validateProposalReviewPackageArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) {
    throw new Error(message);
  }
}

function validateProposalReviewPackageOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") {
    throw new Error("Output writer must be a function");
  }
}

function validateProposalReviewPackageExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") {
    throw new Error("Exit code setter must be a function");
  }
}

function validateProposalReviewPackageTextReader(readText: unknown): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") {
    throw new Error("Text reader must be a function");
  }
}

function validateProposalReviewPackageCreator(
  createPackage: unknown,
): asserts createPackage is (params: unknown) => ProposalReviewPackageCliResult {
  if (typeof createPackage !== "function") {
    throw new Error("Proposal review package creator must be a function");
  }
}

function validateProposalReviewPackageDirectoryCreator(mkdirp: unknown): asserts mkdirp is (dir: string) => Promise<void> {
  if (typeof mkdirp !== "function") {
    throw new Error("Directory creator must be a function");
  }
}

function validateProposalReviewPackageTextWriter(
  writeText: unknown,
): asserts writeText is (path: string, contents: string) => Promise<void> {
  if (typeof writeText !== "function") {
    throw new Error("Text writer must be a function");
  }
}
