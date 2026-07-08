import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyAgentProposalExecutionBundle } from "../../proposalExecution/bundleVerify.js";
import { validateProposalExecutionBundleVerificationReport } from "../../proposalExecution/reportValidation.js";

export interface ProposalExecutionBundleVerifyCliArgs {
  bundlePath: string;
  approvalPath: string;
  manifestPath: string;
  proposalPath: string;
  summaryPath: string;
}

export interface ProposalExecutionBundleVerifyCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyBundle?: (params: unknown) => ProposalExecutionBundleVerification;
}

interface ProposalExecutionBundleVerification {
  passed: boolean;
  failures: readonly string[];
  approvalVerification: unknown;
}

if (isProposalExecutionBundleVerifyDirectRun(import.meta.url, process.argv)) await runProposalExecutionBundleVerifyCli();

export async function runProposalExecutionBundleVerifyCli(
  options: ProposalExecutionBundleVerifyCliOptions = {},
): Promise<void> {
  validateProposalExecutionBundleVerifyOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const verifyBundle = options.verifyBundle ?? ((params: unknown) =>
    verifyAgentProposalExecutionBundle(
      params as Parameters<typeof verifyAgentProposalExecutionBundle>[0],
    ) as ProposalExecutionBundleVerification);

  validateProposalExecutionBundleVerifyOutputWriter(writeOutput);
  validateProposalExecutionBundleVerifyArgv(argv);
  const args = parseProposalExecutionBundleVerifyCliArgs(argv);
  validateProposalExecutionBundleVerifyTextReader(readText);
  validateProposalExecutionBundleVerifier(verifyBundle);

  const verification = verifyBundle({
    bundleJson: await readText(args.bundlePath),
    approvalPath: args.approvalPath,
    approvalJson: await readText(args.approvalPath),
    manifestPath: args.manifestPath,
    manifestJson: await readText(args.manifestPath),
    proposalPath: args.proposalPath,
    proposalJson: await readText(args.proposalPath),
    summaryPath: args.summaryPath,
    summaryMarkdown: await readText(args.summaryPath),
  });
  validateProposalExecutionBundleVerificationReport(verification);

  writeOutput(JSON.stringify({
    bundle: args.bundlePath,
    approval: args.approvalPath,
    manifest: args.manifestPath,
    proposal: args.proposalPath,
    summary: args.summaryPath,
    ...verification,
  }, null, 2));

  if (!verification.passed) {
    validateProposalExecutionBundleVerifyExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseProposalExecutionBundleVerifyCliArgs(
  argv: readonly string[],
): ProposalExecutionBundleVerifyCliArgs {
  validateProposalExecutionBundleVerifyArgv(argv);
  const values = new Map<string, string>();
  const flags = ["--bundle", "--approval", "--manifest", "--proposal", "--summary"] as const;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if ((flags as readonly string[]).includes(arg)) {
      setProposalExecutionBundleVerifyOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(/^(--bundle|--approval|--manifest|--proposal|--summary)=(.*)$/u);
    if (equals !== null) {
      setProposalExecutionBundleVerifyOption(values, equals[1]!, equals[2]!);
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

  return { bundlePath, approvalPath, manifestPath, proposalPath, summaryPath };
}

export function isProposalExecutionBundleVerifyDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateProposalExecutionBundleVerifyArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function setProposalExecutionBundleVerifyOption(
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

function validateProposalExecutionBundleVerifyOptions(
  options: unknown,
): asserts options is ProposalExecutionBundleVerifyCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Proposal execution bundle verification options must be an object");
  }
}

function validateProposalExecutionBundleVerifyArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) throw new Error(message);
}

function validateProposalExecutionBundleVerifyOutputWriter(
  writeOutput: unknown,
): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}

function validateProposalExecutionBundleVerifyExitCodeSetter(
  setExitCode: unknown,
): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") throw new Error("Exit code setter must be a function");
}

function validateProposalExecutionBundleVerifyTextReader(
  readText: unknown,
): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") throw new Error("Text reader must be a function");
}

function validateProposalExecutionBundleVerifier(
  verifyBundle: unknown,
): asserts verifyBundle is (params: unknown) => ProposalExecutionBundleVerification {
  if (typeof verifyBundle !== "function") throw new Error("Proposal execution bundle verifier must be a function");
}
