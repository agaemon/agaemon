import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyAgentProposalExecutionPackage } from "../../proposalExecution/packageVerify.js";
import { validateProposalExecutionPackageVerificationReport } from "../../proposalExecution/reportValidation.js";

export interface ProposalExecutionPackageVerifyCliArgs {
  previewPath: string;
  runbookPath: string;
  bundlePath: string;
  approvalPath: string;
  manifestPath: string;
  proposalPath: string;
  summaryPath: string;
}

export interface ProposalExecutionPackageVerifyCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyPackage?: (params: unknown) => ProposalExecutionPackageVerifyCliResult;
}

interface ProposalExecutionPackageVerifyCliResult {
  passed: boolean;
  failures: readonly string[];
}

if (isProposalExecutionPackageVerifyDirectRun(import.meta.url, process.argv)) {
  await runProposalExecutionPackageVerifyCli();
}

export async function runProposalExecutionPackageVerifyCli(
  options: ProposalExecutionPackageVerifyCliOptions = {},
): Promise<void> {
  validateProposalExecutionPackageVerifyOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const verifyPackage = options.verifyPackage ?? ((params: unknown) =>
    verifyAgentProposalExecutionPackage(
      params as Parameters<typeof verifyAgentProposalExecutionPackage>[0],
    ) as ProposalExecutionPackageVerifyCliResult);

  validateProposalExecutionPackageVerifyOutputWriter(writeOutput);
  validateProposalExecutionPackageVerifyArgv(argv);
  const args = parseProposalExecutionPackageVerifyCliArgs(argv);
  validateProposalExecutionPackageVerifyTextReader(readText);
  validateProposalExecutionPackageVerifier(verifyPackage);

  const verification = verifyPackage({
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
  });

  const report = {
    preview: args.previewPath,
    runbook: args.runbookPath,
    bundle: args.bundlePath,
    approval: args.approvalPath,
    manifest: args.manifestPath,
    proposal: args.proposalPath,
    summary: args.summaryPath,
    ...verification,
  };
  validateProposalExecutionPackageVerificationReport(report);
  writeOutput(JSON.stringify(report, null, 2));

  if (!verification.passed) {
    validateProposalExecutionPackageVerifyExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseProposalExecutionPackageVerifyCliArgs(
  argv: readonly string[],
): ProposalExecutionPackageVerifyCliArgs {
  validateProposalExecutionPackageVerifyArgv(argv);
  const values = new Map<string, string>();
  const flags = ["--preview", "--runbook", "--bundle", "--approval", "--manifest", "--proposal", "--summary"] as const;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if ((flags as readonly string[]).includes(arg)) {
      setProposalExecutionPackageVerifyOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(/^(--preview|--runbook|--bundle|--approval|--manifest|--proposal|--summary)=(.*)$/u);
    if (equals !== null) {
      setProposalExecutionPackageVerifyOption(values, equals[1]!, equals[2]!);
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

  return { previewPath, runbookPath, bundlePath, approvalPath, manifestPath, proposalPath, summaryPath };
}

export function isProposalExecutionPackageVerifyDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateProposalExecutionPackageVerifyArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function setProposalExecutionPackageVerifyOption(
  values: Map<string, string>,
  name: string,
  rawValue: string | undefined,
): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function validateProposalExecutionPackageVerifyOptions(
  options: unknown,
): asserts options is ProposalExecutionPackageVerifyCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Proposal execution package verification options must be an object");
  }
}

function validateProposalExecutionPackageVerifyArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) throw new Error(message);
}

function validateProposalExecutionPackageVerifyOutputWriter(
  writeOutput: unknown,
): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}

function validateProposalExecutionPackageVerifyExitCodeSetter(
  setExitCode: unknown,
): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") throw new Error("Exit code setter must be a function");
}

function validateProposalExecutionPackageVerifyTextReader(
  readText: unknown,
): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") throw new Error("Text reader must be a function");
}

function validateProposalExecutionPackageVerifier(
  verifyPackage: unknown,
): asserts verifyPackage is (params: unknown) => ProposalExecutionPackageVerifyCliResult {
  if (typeof verifyPackage !== "function") throw new Error("Proposal execution package verifier must be a function");
}
