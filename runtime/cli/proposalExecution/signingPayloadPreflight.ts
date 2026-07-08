import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyAgentProposalExecutionSigningPayloadPreflight } from "../../proposalExecution/signingPayloadPreflight.js";
import { validateProposalExecutionSigningPayloadPreflightReport } from "../../proposalExecution/reportValidation.js";

export interface ProposalExecutionSigningPayloadPreflightCliArgs {
  payloadPath: string;
  readinessPath: string;
  previewPath: string;
  runbookPath: string;
  executionManifestPath: string;
  bundlePath: string;
  approvalPath: string;
  manifestPath: string;
  proposalPath: string;
  summaryPath: string;
}

export interface ProposalExecutionSigningPayloadPreflightCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyPreflight?: (params: unknown) => ProposalExecutionSigningPayloadPreflightReport;
}

interface ProposalExecutionSigningPayloadPreflightReport {
  passed: boolean;
  checks: readonly unknown[];
}

if (isProposalExecutionSigningPayloadPreflightDirectRun(import.meta.url, process.argv)) {
  await runProposalExecutionSigningPayloadPreflightCli();
}

export async function runProposalExecutionSigningPayloadPreflightCli(
  options: ProposalExecutionSigningPayloadPreflightCliOptions = {},
): Promise<void> {
  validateProposalExecutionSigningPayloadPreflightOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const verifyPreflight = options.verifyPreflight ?? ((params: unknown) =>
    verifyAgentProposalExecutionSigningPayloadPreflight(
      params as Parameters<typeof verifyAgentProposalExecutionSigningPayloadPreflight>[0],
    ) as ProposalExecutionSigningPayloadPreflightReport);

  validateProposalExecutionSigningPayloadPreflightOutputWriter(writeOutput);
  validateProposalExecutionSigningPayloadPreflightArgv(argv);
  const args = parseProposalExecutionSigningPayloadPreflightCliArgs(argv);
  validateProposalExecutionSigningPayloadPreflightTextReader(readText);
  validateProposalExecutionSigningPayloadPreflightVerifier(verifyPreflight);

  const report = verifyPreflight({
    payloadPath: args.payloadPath,
    payloadJson: await readText(args.payloadPath),
    readinessPath: args.readinessPath,
    readinessJson: await readText(args.readinessPath),
    previewPath: args.previewPath,
    previewJson: await readText(args.previewPath),
    runbookPath: args.runbookPath,
    runbookMarkdown: await readText(args.runbookPath),
    executionManifestPath: args.executionManifestPath,
    executionManifestJson: await readText(args.executionManifestPath),
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
  validateProposalExecutionSigningPayloadPreflightReport(report);

  writeOutput(JSON.stringify(report, null, 2));
  if (!report.passed) {
    validateProposalExecutionSigningPayloadPreflightExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseProposalExecutionSigningPayloadPreflightCliArgs(
  argv: readonly string[],
): ProposalExecutionSigningPayloadPreflightCliArgs {
  validateProposalExecutionSigningPayloadPreflightArgv(argv);
  const values = parseSigningPayloadVerificationFlags(argv);

  const payloadPath = values.get("--payload");
  if (payloadPath === undefined) throw new Error("--payload is required");
  const readinessPath = values.get("--readiness");
  if (readinessPath === undefined) throw new Error("--readiness is required");
  const previewPath = values.get("--preview");
  if (previewPath === undefined) throw new Error("--preview is required");
  const runbookPath = values.get("--runbook");
  if (runbookPath === undefined) throw new Error("--runbook is required");
  const executionManifestPath = values.get("--execution-manifest");
  if (executionManifestPath === undefined) throw new Error("--execution-manifest is required");
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
    payloadPath,
    readinessPath,
    previewPath,
    runbookPath,
    executionManifestPath,
    bundlePath,
    approvalPath,
    manifestPath,
    proposalPath,
    summaryPath,
  };
}

export function isProposalExecutionSigningPayloadPreflightDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateProposalExecutionSigningPayloadPreflightArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function parseSigningPayloadVerificationFlags(argv: readonly string[]): Map<string, string> {
  const values = new Map<string, string>();
  const flags = [
    "--payload",
    "--readiness",
    "--preview",
    "--runbook",
    "--execution-manifest",
    "--bundle",
    "--approval",
    "--manifest",
    "--proposal",
    "--summary",
  ] as const;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if ((flags as readonly string[]).includes(arg)) {
      setProposalExecutionSigningPayloadPreflightOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(
      /^(--payload|--readiness|--preview|--runbook|--execution-manifest|--bundle|--approval|--manifest|--proposal|--summary)=(.*)$/u,
    );
    if (equals !== null) {
      setProposalExecutionSigningPayloadPreflightOption(values, equals[1]!, equals[2]!);
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  return values;
}

function setProposalExecutionSigningPayloadPreflightOption(
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

function validateProposalExecutionSigningPayloadPreflightOptions(
  options: unknown,
): asserts options is ProposalExecutionSigningPayloadPreflightCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Proposal execution signing payload preflight options must be an object");
  }
}

function validateProposalExecutionSigningPayloadPreflightArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) throw new Error(message);
}

function validateProposalExecutionSigningPayloadPreflightOutputWriter(
  writeOutput: unknown,
): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}

function validateProposalExecutionSigningPayloadPreflightExitCodeSetter(
  setExitCode: unknown,
): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") throw new Error("Exit code setter must be a function");
}

function validateProposalExecutionSigningPayloadPreflightTextReader(
  readText: unknown,
): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") throw new Error("Text reader must be a function");
}

function validateProposalExecutionSigningPayloadPreflightVerifier(
  verifyPreflight: unknown,
): asserts verifyPreflight is (params: unknown) => ProposalExecutionSigningPayloadPreflightReport {
  if (typeof verifyPreflight !== "function") {
    throw new Error("Proposal execution signing payload preflight verifier must be a function");
  }
}
