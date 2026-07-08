import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyAgentProposalReviewPreflight } from "../../proposalReview/preflight.js";
import { validateProposalReviewPreflightCliReport } from "../../proposalReview/reportValidation.js";

export interface ProposalReviewPreflightCliArgs {
  proposalPath: string;
  summaryPath: string;
}

export interface ProposalReviewPreflightCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyPreflight?: (params: unknown) => ProposalReviewPreflightCliReport;
}

interface ProposalReviewPreflightCliReport {
  passed: boolean;
}

if (isProposalReviewPreflightDirectRun(import.meta.url, process.argv)) await runProposalReviewPreflightCli();

export async function runProposalReviewPreflightCli(options: ProposalReviewPreflightCliOptions = {}): Promise<void> {
  validateProposalReviewPreflightOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const verifyPreflight = options.verifyPreflight ?? ((params: unknown) =>
    verifyAgentProposalReviewPreflight(
      params as Parameters<typeof verifyAgentProposalReviewPreflight>[0],
    ) as ProposalReviewPreflightCliReport);

  validateProposalReviewPreflightOutputWriter(writeOutput);
  validateProposalReviewPreflightArgv(argv);
  const args = parseProposalReviewPreflightCliArgs(argv);
  validateProposalReviewPreflightTextReader(readText);
  validateProposalReviewPreflightVerifier(verifyPreflight);

  const report = verifyPreflight({
    proposalPath: args.proposalPath,
    proposalJson: await readText(args.proposalPath),
    summaryPath: args.summaryPath,
    summaryMarkdown: await readText(args.summaryPath),
  });
  validateProposalReviewPreflightCliReport(report);

  writeOutput(JSON.stringify(report, null, 2));
  if (!report.passed) {
    validateProposalReviewPreflightExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseProposalReviewPreflightCliArgs(argv: readonly string[]): ProposalReviewPreflightCliArgs {
  validateProposalReviewPreflightArgv(argv);
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if (arg === "--proposal" || arg === "--summary") {
      setProposalReviewPreflightOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(/^(--proposal|--summary)=(.*)$/u);
    if (equals !== null) {
      setProposalReviewPreflightOption(values, equals[1]!, equals[2]!);
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

export function isProposalReviewPreflightDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateProposalReviewPreflightArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function setProposalReviewPreflightOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  values.set(name, value);
}

function validateProposalReviewPreflightOptions(options: unknown): asserts options is ProposalReviewPreflightCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Proposal review preflight options must be an object");
  }
}

function validateProposalReviewPreflightArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) {
    throw new Error(message);
  }
}

function validateProposalReviewPreflightOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") {
    throw new Error("Output writer must be a function");
  }
}

function validateProposalReviewPreflightExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") {
    throw new Error("Exit code setter must be a function");
  }
}

function validateProposalReviewPreflightTextReader(readText: unknown): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") {
    throw new Error("Text reader must be a function");
  }
}

function validateProposalReviewPreflightVerifier(
  verifyPreflight: unknown,
): asserts verifyPreflight is (params: unknown) => ProposalReviewPreflightCliReport {
  if (typeof verifyPreflight !== "function") {
    throw new Error("Proposal review preflight verifier must be a function");
  }
}
