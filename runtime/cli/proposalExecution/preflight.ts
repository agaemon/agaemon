import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyAgentProposalExecutionPreflight } from "../../proposalExecution/preflight.js";
import { validateProposalExecutionPreflightReport } from "../../proposalExecution/reportValidation.js";

export interface ProposalExecutionPreflightCliArgs {
  previewPath: string;
  runbookPath: string;
  bundlePath: string;
  approvalPath: string;
  manifestPath: string;
  proposalPath: string;
  summaryPath: string;
}

export interface ProposalExecutionPreflightCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyPreflight?: (params: unknown) => ProposalExecutionPreflightReport;
}

interface ProposalExecutionPreflightReport {
  passed: boolean;
  checks: readonly unknown[];
}

if (isProposalExecutionPreflightDirectRun(import.meta.url, process.argv)) await runProposalExecutionPreflightCli();

export async function runProposalExecutionPreflightCli(
  options: ProposalExecutionPreflightCliOptions = {},
): Promise<void> {
  validateProposalExecutionPreflightOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const verifyPreflight = options.verifyPreflight ?? ((params: unknown) =>
    verifyAgentProposalExecutionPreflight(
      params as Parameters<typeof verifyAgentProposalExecutionPreflight>[0],
    ) as ProposalExecutionPreflightReport);

  validateProposalExecutionPreflightOutputWriter(writeOutput);
  validateProposalExecutionPreflightArgv(argv);
  const args = parseProposalExecutionPreflightCliArgs(argv);
  validateProposalExecutionPreflightTextReader(readText);
  validateProposalExecutionPreflightVerifier(verifyPreflight);

  const report = verifyPreflight({
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
  validateProposalExecutionPreflightReport(report);

  writeOutput(JSON.stringify(report, null, 2));
  if (!report.passed) {
    validateProposalExecutionPreflightExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseProposalExecutionPreflightCliArgs(argv: readonly string[]): ProposalExecutionPreflightCliArgs {
  validateProposalExecutionPreflightArgv(argv);
  const values = new Map<string, string>();
  const flags = ["--preview", "--runbook", "--bundle", "--approval", "--manifest", "--proposal", "--summary"] as const;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if ((flags as readonly string[]).includes(arg)) {
      setProposalExecutionPreflightOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(/^(--preview|--runbook|--bundle|--approval|--manifest|--proposal|--summary)=(.*)$/u);
    if (equals !== null) {
      setProposalExecutionPreflightOption(values, equals[1]!, equals[2]!);
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

export function isProposalExecutionPreflightDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateProposalExecutionPreflightArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function setProposalExecutionPreflightOption(
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

function validateProposalExecutionPreflightOptions(
  options: unknown,
): asserts options is ProposalExecutionPreflightCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Proposal execution preflight options must be an object");
  }
}

function validateProposalExecutionPreflightArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) throw new Error(message);
}

function validateProposalExecutionPreflightOutputWriter(
  writeOutput: unknown,
): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}

function validateProposalExecutionPreflightExitCodeSetter(
  setExitCode: unknown,
): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") throw new Error("Exit code setter must be a function");
}

function validateProposalExecutionPreflightTextReader(
  readText: unknown,
): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") throw new Error("Text reader must be a function");
}

function validateProposalExecutionPreflightVerifier(
  verifyPreflight: unknown,
): asserts verifyPreflight is (params: unknown) => ProposalExecutionPreflightReport {
  if (typeof verifyPreflight !== "function") throw new Error("Proposal execution preflight verifier must be a function");
}
