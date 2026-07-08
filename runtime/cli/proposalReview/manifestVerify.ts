import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyAgentProposalReviewManifest } from "../../proposalReview/manifestVerify.js";
import { validateProposalReviewVerificationCliReport } from "../../proposalReview/reportValidation.js";

export interface ProposalReviewManifestVerifyCliArgs {
  manifestPath: string;
  proposalPath: string;
  summaryPath: string;
}

export interface ProposalReviewManifestVerifyCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyManifest?: (params: unknown) => ProposalReviewManifestVerifyCliResult;
}

interface ProposalReviewManifestVerifyCliResult {
  passed: boolean;
  failures: readonly string[];
}

if (isProposalReviewManifestVerifyDirectRun(import.meta.url, process.argv)) {
  await runProposalReviewManifestVerifyCli();
}

export async function runProposalReviewManifestVerifyCli(
  options: ProposalReviewManifestVerifyCliOptions = {},
): Promise<void> {
  validateProposalReviewManifestVerifyOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const verifyManifest = options.verifyManifest ?? ((params: unknown) =>
    verifyAgentProposalReviewManifest(
      params as Parameters<typeof verifyAgentProposalReviewManifest>[0],
    ) as ProposalReviewManifestVerifyCliResult);

  validateProposalReviewManifestVerifyOutputWriter(writeOutput);
  validateProposalReviewManifestVerifyArgv(argv);
  const args = parseProposalReviewManifestVerifyCliArgs(argv);
  validateProposalReviewManifestVerifyTextReader(readText);
  validateProposalReviewManifestVerifyVerifier(verifyManifest);

  const verification = verifyManifest({
    manifestJson: await readText(args.manifestPath),
    proposalPath: args.proposalPath,
    proposalJson: await readText(args.proposalPath),
    summaryPath: args.summaryPath,
    summaryMarkdown: await readText(args.summaryPath),
  });
  validateProposalReviewVerificationCliReport(verification, "Proposal review manifest verification report");

  writeOutput(
    JSON.stringify(
      {
        manifest: args.manifestPath,
        proposal: args.proposalPath,
        summary: args.summaryPath,
        ...verification,
      },
      null,
      2,
    ),
  );

  if (!verification.passed) {
    validateProposalReviewManifestVerifyExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseProposalReviewManifestVerifyCliArgs(
  argv: readonly string[],
): ProposalReviewManifestVerifyCliArgs {
  validateProposalReviewManifestVerifyArgv(argv);
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if (arg === "--manifest" || arg === "--proposal" || arg === "--summary") {
      setProposalReviewManifestVerifyOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(/^(--manifest|--proposal|--summary)=(.*)$/u);
    if (equals !== null) {
      setProposalReviewManifestVerifyOption(values, equals[1]!, equals[2]!);
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  const manifestPath = values.get("--manifest");
  if (manifestPath === undefined) throw new Error("--manifest is required");
  const proposalPath = values.get("--proposal");
  if (proposalPath === undefined) throw new Error("--proposal is required");
  const summaryPath = values.get("--summary");
  if (summaryPath === undefined) throw new Error("--summary is required");

  return { manifestPath, proposalPath, summaryPath };
}

export function isProposalReviewManifestVerifyDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateProposalReviewManifestVerifyArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function setProposalReviewManifestVerifyOption(
  values: Map<string, string>,
  name: string,
  rawValue: string | undefined,
): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  values.set(name, value);
}

function validateProposalReviewManifestVerifyOptions(
  options: unknown,
): asserts options is ProposalReviewManifestVerifyCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Proposal review manifest verification options must be an object");
  }
}

function validateProposalReviewManifestVerifyArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) {
    throw new Error(message);
  }
}

function validateProposalReviewManifestVerifyOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") {
    throw new Error("Output writer must be a function");
  }
}

function validateProposalReviewManifestVerifyExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") {
    throw new Error("Exit code setter must be a function");
  }
}

function validateProposalReviewManifestVerifyTextReader(readText: unknown): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") {
    throw new Error("Text reader must be a function");
  }
}

function validateProposalReviewManifestVerifyVerifier(
  verifyManifest: unknown,
): asserts verifyManifest is (params: unknown) => ProposalReviewManifestVerifyCliResult {
  if (typeof verifyManifest !== "function") {
    throw new Error("Proposal review manifest verifier must be a function");
  }
}
