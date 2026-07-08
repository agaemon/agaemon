import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyAgentProposalSummary } from "../../proposal/summaryVerify.js";
import { validateProposalSummaryVerificationCliReport } from "../../proposal/reportValidation.js";

export interface ProposalSummaryVerifyCliArgs {
  proposalPath: string;
  summaryPath: string;
}

export interface ProposalSummaryVerifyCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifySummary?: (params: unknown) => ProposalSummaryVerifyCliResult;
}

interface ProposalSummaryVerifyCliResult {
  passed: boolean;
  failures: readonly string[];
}

if (isProposalSummaryVerifyDirectRun(import.meta.url, process.argv)) await runProposalSummaryVerifyCli();

export async function runProposalSummaryVerifyCli(options: ProposalSummaryVerifyCliOptions = {}): Promise<void> {
  validateProposalSummaryVerifyOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const verifySummary = options.verifySummary ?? ((params: unknown) =>
    verifyAgentProposalSummary(params as Parameters<typeof verifyAgentProposalSummary>[0]) as ProposalSummaryVerifyCliResult);

  validateProposalSummaryVerifyOutputWriter(writeOutput);
  validateProposalSummaryVerifyArgv(argv);
  const args = parseProposalSummaryVerifyCliArgs(argv);
  validateProposalSummaryVerifyTextReader(readText);
  validateProposalSummaryVerifyVerifier(verifySummary);

  const verification = verifySummary({
    proposalPath: args.proposalPath,
    proposalJson: await readText(args.proposalPath),
    summaryMarkdown: await readText(args.summaryPath),
  });
  validateProposalSummaryVerificationCliReport(verification);

  writeOutput(
    JSON.stringify(
      {
        proposal: args.proposalPath,
        summary: args.summaryPath,
        passed: verification.passed,
        failures: verification.failures,
      },
      null,
      2,
    ),
  );

  if (!verification.passed) {
    validateProposalSummaryVerifyExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseProposalSummaryVerifyCliArgs(argv: readonly string[]): ProposalSummaryVerifyCliArgs {
  validateProposalSummaryVerifyArgv(argv);
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if (arg === "--proposal" || arg === "--summary") {
      setProposalSummaryVerifyOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(/^(--proposal|--summary)=(.*)$/u);
    if (equals !== null) {
      setProposalSummaryVerifyOption(values, equals[1]!, equals[2]!);
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  const proposalPath = values.get("--proposal");
  if (proposalPath === undefined) throw new Error("--proposal is required");
  const summaryPath = values.get("--summary");
  if (summaryPath === undefined) throw new Error("--summary is required");
  return { proposalPath, summaryPath };
}

export function isProposalSummaryVerifyDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateProposalSummaryVerifyArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function setProposalSummaryVerifyOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  values.set(name, value);
}

function validateProposalSummaryVerifyOptions(options: unknown): asserts options is ProposalSummaryVerifyCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Proposal summary verification options must be an object");
  }
}

function validateProposalSummaryVerifyArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) {
    throw new Error(message);
  }
}

function validateProposalSummaryVerifyOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") {
    throw new Error("Output writer must be a function");
  }
}

function validateProposalSummaryVerifyExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") {
    throw new Error("Exit code setter must be a function");
  }
}

function validateProposalSummaryVerifyTextReader(readText: unknown): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") {
    throw new Error("Text reader must be a function");
  }
}

function validateProposalSummaryVerifyVerifier(
  verifySummary: unknown,
): asserts verifySummary is (params: unknown) => ProposalSummaryVerifyCliResult {
  if (typeof verifySummary !== "function") {
    throw new Error("Proposal summary verifier must be a function");
  }
}
