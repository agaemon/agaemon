import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyAgentProposalArtifact } from "../../proposal/verify.js";
import { validateProposalVerificationCliReport } from "../../proposal/reportValidation.js";

export interface ProposalVerifyCliArgs {
  proposalPath: string;
}

export interface ProposalVerifyCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyProposal?: (json: string) => ProposalVerifyCliResult;
}

interface ProposalVerifyCliResult {
  passed: boolean;
  failures: readonly string[];
}

if (isProposalVerifyDirectRun(import.meta.url, process.argv)) await runProposalVerifyCli();

export async function runProposalVerifyCli(options: ProposalVerifyCliOptions = {}): Promise<void> {
  validateProposalVerifyOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const verifyProposal = options.verifyProposal ?? verifyAgentProposalArtifact;

  validateProposalVerifyOutputWriter(writeOutput);
  validateProposalVerifyArgv(argv);
  const args = parseProposalVerifyCliArgs(argv);
  validateProposalVerifyTextReader(readText);
  validateProposalVerifyVerifier(verifyProposal);
  const verification = verifyProposal(await readText(args.proposalPath));
  validateProposalVerificationCliReport(verification, "Proposal verification report");

  writeOutput(
    JSON.stringify(
      {
        proposal: args.proposalPath,
        ...verification,
      },
      null,
      2,
    ),
  );

  if (!verification.passed) {
    validateProposalVerifyExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseProposalVerifyCliArgs(argv: readonly string[]): ProposalVerifyCliArgs {
  validateProposalVerifyArgv(argv);
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if (arg === "--proposal") {
      setProposalVerifyOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(/^(--proposal)=(.*)$/u);
    if (equals !== null) {
      setProposalVerifyOption(values, equals[1]!, equals[2]!);
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  const proposalPath = values.get("--proposal");
  if (proposalPath === undefined) throw new Error("--proposal is required");
  return { proposalPath };
}

export function isProposalVerifyDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateProposalVerifyArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function setProposalVerifyOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  values.set(name, value);
}

function validateProposalVerifyOptions(options: unknown): asserts options is ProposalVerifyCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Proposal verification options must be an object");
  }
}

function validateProposalVerifyArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) {
    throw new Error(message);
  }
}

function validateProposalVerifyOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") {
    throw new Error("Output writer must be a function");
  }
}

function validateProposalVerifyExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") {
    throw new Error("Exit code setter must be a function");
  }
}

function validateProposalVerifyTextReader(readText: unknown): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") {
    throw new Error("Text reader must be a function");
  }
}

function validateProposalVerifyVerifier(
  verifyProposal: unknown,
): asserts verifyProposal is (json: string) => ProposalVerifyCliResult {
  if (typeof verifyProposal !== "function") {
    throw new Error("Proposal verifier must be a function");
  }
}
