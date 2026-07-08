import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateBroadcastCliVerificationResult } from "../../broadcast/cliReportValidation.js";
import { verifyAgentProposalExecutionBroadcastPackage } from "../../broadcast/packageVerify.js";

export interface BroadcastPackageVerifyCliArgs {
  broadcastPackagePath: string;
  broadcastPreflightPath: string;
  signedPayloadPath: string;
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

export interface BroadcastPackageVerifyCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyPackage?: (params: unknown) => Promise<BroadcastPackageVerifyCliResult>;
}

interface BroadcastPackageVerifyCliResult {
  passed: boolean;
  failures: readonly string[];
}

if (isBroadcastPackageVerifyDirectRun(import.meta.url, process.argv)) await runBroadcastPackageVerifyCli();

export async function runBroadcastPackageVerifyCli(options: BroadcastPackageVerifyCliOptions = {}): Promise<void> {
  validateBroadcastPackageVerifyOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const verifyPackage = options.verifyPackage ?? ((params: unknown) =>
    verifyAgentProposalExecutionBroadcastPackage(
      params as Parameters<typeof verifyAgentProposalExecutionBroadcastPackage>[0],
    ) as Promise<BroadcastPackageVerifyCliResult>);

  validateBroadcastPackageVerifyOutputWriter(writeOutput);
  validateBroadcastPackageVerifyArgv(argv);
  const args = parseBroadcastPackageVerifyCliArgs(argv);
  validateBroadcastPackageVerifyTextReader(readText);
  validateBroadcastPackageVerifier(verifyPackage);

  const verification = await verifyPackage({
    broadcastPackagePath: args.broadcastPackagePath,
    broadcastPackageJson: await readText(args.broadcastPackagePath),
    broadcastPreflightPath: args.broadcastPreflightPath,
    broadcastPreflightJson: await readText(args.broadcastPreflightPath),
    signedPayloadPath: args.signedPayloadPath,
    signedPayloadJson: await readText(args.signedPayloadPath),
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
  validateBroadcastCliVerificationResult(verification, "Broadcast package verification result");

  writeOutput(JSON.stringify({
    broadcastPackage: args.broadcastPackagePath,
    broadcastPreflight: args.broadcastPreflightPath,
    signedPayload: args.signedPayloadPath,
    payload: args.payloadPath,
    readiness: args.readinessPath,
    preview: args.previewPath,
    runbook: args.runbookPath,
    executionManifest: args.executionManifestPath,
    bundle: args.bundlePath,
    approval: args.approvalPath,
    manifest: args.manifestPath,
    proposal: args.proposalPath,
    summary: args.summaryPath,
    ...verification,
  }, null, 2));

  if (!verification.passed) {
    validateBroadcastPackageVerifyExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseBroadcastPackageVerifyCliArgs(argv: readonly string[]): BroadcastPackageVerifyCliArgs {
  validateBroadcastPackageVerifyArgv(argv);
  const values = new Map<string, string>();
  const flags = [
    "--broadcast-package",
    "--broadcast-preflight",
    "--signed-payload",
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
      setBroadcastPackageVerifyOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(/^(--broadcast-package|--broadcast-preflight|--signed-payload|--payload|--readiness|--preview|--runbook|--execution-manifest|--bundle|--approval|--manifest|--proposal|--summary)=(.*)$/u);
    if (equals !== null) {
      setBroadcastPackageVerifyOption(values, equals[1]!, equals[2]!);
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  const broadcastPackagePath = values.get("--broadcast-package");
  if (broadcastPackagePath === undefined) throw new Error("--broadcast-package is required");
  const broadcastPreflightPath = values.get("--broadcast-preflight");
  if (broadcastPreflightPath === undefined) throw new Error("--broadcast-preflight is required");
  const signedPayloadPath = values.get("--signed-payload");
  if (signedPayloadPath === undefined) throw new Error("--signed-payload is required");
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
    broadcastPackagePath,
    broadcastPreflightPath,
    signedPayloadPath,
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

export function isBroadcastPackageVerifyDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateBroadcastPackageVerifyArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function setBroadcastPackageVerifyOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function validateBroadcastPackageVerifyOptions(options: unknown): asserts options is BroadcastPackageVerifyCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Broadcast package verification options must be an object");
  }
}

function validateBroadcastPackageVerifyArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) throw new Error(message);
}

function validateBroadcastPackageVerifyOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}

function validateBroadcastPackageVerifyExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") throw new Error("Exit code setter must be a function");
}

function validateBroadcastPackageVerifyTextReader(readText: unknown): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") throw new Error("Text reader must be a function");
}

function validateBroadcastPackageVerifier(
  verifyPackage: unknown,
): asserts verifyPackage is (params: unknown) => Promise<BroadcastPackageVerifyCliResult> {
  if (typeof verifyPackage !== "function") throw new Error("Broadcast package verifier must be a function");
}
