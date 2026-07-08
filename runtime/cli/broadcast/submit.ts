import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createPublicClient, http } from "viem";
import type { Hex } from "viem";
import { baseSepolia } from "viem/chains";

import {
  validateBroadcastCliReceiptResult,
  validateBroadcastCliSubmitResult,
} from "../../broadcast/cliReportValidation.js";
import { createAgentProposalExecutionBroadcastReceipt } from "../../broadcast/receipt.js";
import { submitAgentProposalExecutionBroadcast } from "../../broadcast/submit.js";
import { readDeploymentManifest as readBaseDeploymentManifest } from "../../base/deploymentManifest.js";

import type { AgentProposalExecutionBroadcastSubmitClient } from "../../broadcast/submit.js";

const DEFAULT_DEPLOYMENT_MANIFEST_PATH = "deployments/base-sepolia/latest.json";

export interface BroadcastSubmitCliArgs {
  send: boolean;
  deploymentManifestPath: string;
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
  receiptOutputPath?: string | undefined;
}

export interface BroadcastSubmitCliOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  loadDotEnv?: (path: string) => void;
  env?: Record<string, string | undefined>;
  readDeploymentManifest?: (path: string) => Promise<BroadcastSubmitDeploymentManifest>;
  createClient?: (rpcUrl: string) => AgentProposalExecutionBroadcastSubmitClient;
  readText?: (path: string) => Promise<string>;
  submitBroadcast?: (params: unknown) => Promise<BroadcastSubmitCliResult>;
  createReceipt?: (params: unknown) => BroadcastReceiptCliResult;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

interface BroadcastSubmitDeploymentManifest {
  rpcUrlEnv: string;
  explorerUrl: string;
}

interface BroadcastSubmitCliResult {
  mode: "dry-run" | "send";
  passed: boolean;
  failures: readonly string[];
  submitted: readonly BroadcastSubmittedTransaction[];
}

interface BroadcastSubmittedTransaction {
  index: number;
  hash: string;
  blockNumber: string;
  status: "success" | "reverted";
}

interface BroadcastReceiptCliResult {
  passed: boolean;
  failures: readonly string[];
  receipt: unknown;
}

if (isBroadcastSubmitDirectRun(import.meta.url, process.argv)) await runBroadcastSubmitCli();

export async function runBroadcastSubmitCli(options: BroadcastSubmitCliOptions = {}): Promise<void> {
  validateBroadcastSubmitOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const loadDotEnvFile = options.loadDotEnv ?? loadDotEnv;
  const env = options.env ?? process.env;
  const readDeploymentManifest = options.readDeploymentManifest ?? readBaseDeploymentManifest;
  const createClient = options.createClient ?? createViemBroadcastSubmitClient;
  const readText = options.readText ?? ((path: string) => readFile(path, "utf8"));
  const submitBroadcast = options.submitBroadcast ?? ((params: unknown) =>
    submitAgentProposalExecutionBroadcast(
      params as Parameters<typeof submitAgentProposalExecutionBroadcast>[0],
    ) as Promise<BroadcastSubmitCliResult>);
  const createReceipt = options.createReceipt ?? ((params: unknown) =>
    createAgentProposalExecutionBroadcastReceipt(
      params as Parameters<typeof createAgentProposalExecutionBroadcastReceipt>[0],
    ) as BroadcastReceiptCliResult);
  const mkdirp = options.mkdirp ?? (async (dir: string) => {
    await mkdir(dir, { recursive: true });
  });
  const writeText = options.writeText ?? writeFile;

  validateBroadcastSubmitOutputWriter(writeOutput);
  validateBroadcastSubmitArgv(argv);
  const args = parseBroadcastSubmitCliArgs(argv);
  validateBroadcastSubmitDotenvLoader(loadDotEnvFile);
  loadDotEnvFile(".env");

  validateBroadcastSubmitManifestReader(readDeploymentManifest);
  const deploymentManifest = await readDeploymentManifest(args.deploymentManifestPath);
  let client: AgentProposalExecutionBroadcastSubmitClient | null = null;
  if (args.send) {
    const rpcUrl = env[deploymentManifest.rpcUrlEnv];
    if (rpcUrl === undefined || rpcUrl.length === 0) {
      throw new Error(`${deploymentManifest.rpcUrlEnv} is required when --send is used`);
    }
    validateBroadcastSubmitClientFactory(createClient);
    client = createClient(rpcUrl);
  }

  validateBroadcastSubmitTextReader(readText);
  validateBroadcastSubmitter(submitBroadcast);
  const broadcastPackageJson = await readText(args.broadcastPackagePath);
  const submitResult = await submitBroadcast({
    broadcastPackagePath: args.broadcastPackagePath,
    broadcastPackageJson,
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
    send: args.send,
    client: client ?? createUnavailableBroadcastSubmitClient(),
  });
  validateBroadcastCliSubmitResult(submitResult);

  let receipt: BroadcastReceiptCliResult | null = null;
  if (args.receiptOutputPath !== undefined) {
    validateBroadcastReceiptCreator(createReceipt);
    receipt = createReceipt({
      broadcastPackagePath: args.broadcastPackagePath,
      broadcastPackageJson,
      submitResult,
    });
    validateBroadcastCliReceiptResult(receipt);
  }

  if (args.receiptOutputPath !== undefined && receipt !== null && receipt.passed && receipt.receipt !== null) {
    validateBroadcastSubmitDirectoryCreator(mkdirp);
    validateBroadcastSubmitTextWriter(writeText);
    await mkdirp(dirname(args.receiptOutputPath));
    await writeText(args.receiptOutputPath, `${JSON.stringify(receipt.receipt, null, 2)}\n`);
  }

  writeOutput(JSON.stringify({
    deploymentManifest: args.deploymentManifestPath,
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
    ...submitResult,
    receipt: args.receiptOutputPath === undefined
      ? undefined
      : {
        path: args.receiptOutputPath,
        passed: receipt?.passed ?? false,
        failures: receipt?.failures ?? [],
      },
    submitted: submitResult.submitted.map((transaction) => ({
      ...transaction,
      explorerUrl: `${deploymentManifest.explorerUrl}/tx/${transaction.hash}`,
    })),
  }, null, 2));

  if (!submitResult.passed || (receipt !== null && !receipt.passed)) {
    validateBroadcastSubmitExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parseBroadcastSubmitCliArgs(argv: readonly string[]): BroadcastSubmitCliArgs {
  validateBroadcastSubmitArgv(argv);
  const values = new Map<string, string>();
  let send = false;
  const flags = [
    "--deployment-manifest",
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
    "--receipt-output",
  ] as const;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if (arg === "--send") {
      if (send) throw new Error("Duplicate argument: --send");
      send = true;
      continue;
    }

    if ((flags as readonly string[]).includes(arg)) {
      setBroadcastSubmitOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }

    const equals = arg.match(/^(--deployment-manifest|--broadcast-package|--broadcast-preflight|--signed-payload|--payload|--readiness|--preview|--runbook|--execution-manifest|--bundle|--approval|--manifest|--proposal|--summary|--receipt-output)=(.*)$/u);
    if (equals !== null) {
      setBroadcastSubmitOption(values, equals[1]!, equals[2]!);
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
    send,
    deploymentManifestPath: values.get("--deployment-manifest") ?? DEFAULT_DEPLOYMENT_MANIFEST_PATH,
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
    ...(values.has("--receipt-output") ? { receiptOutputPath: values.get("--receipt-output")! } : {}),
  };
}

export function isBroadcastSubmitDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateBroadcastSubmitArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

function createViemBroadcastSubmitClient(rpcUrl: string): AgentProposalExecutionBroadcastSubmitClient {
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
  return {
    getChainId: () => publicClient.getChainId(),
    sendRawTransaction: ({ serializedTransaction }) =>
      publicClient.sendRawTransaction({ serializedTransaction: serializedTransaction as Hex }),
    waitForTransactionReceipt: async ({ hash }) => {
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return {
        blockNumber: receipt.blockNumber,
        status: receipt.status,
      };
    },
  };
}

function createUnavailableBroadcastSubmitClient(): AgentProposalExecutionBroadcastSubmitClient {
  return {
    getChainId: async () => {
      throw new Error("RPC client is unavailable without --send");
    },
    sendRawTransaction: async () => {
      throw new Error("RPC client is unavailable without --send");
    },
    waitForTransactionReceipt: async () => {
      throw new Error("RPC client is unavailable without --send");
    },
  };
}

function setBroadcastSubmitOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function validateBroadcastSubmitOptions(options: unknown): asserts options is BroadcastSubmitCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Broadcast submit options must be an object");
  }
}

function validateBroadcastSubmitArgv(
  argv: unknown,
  message = "CLI argv must be an array of strings",
): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) throw new Error(message);
}

function validateBroadcastSubmitOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}

function validateBroadcastSubmitExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") throw new Error("Exit code setter must be a function");
}

function validateBroadcastSubmitDotenvLoader(loadDotEnvFile: unknown): asserts loadDotEnvFile is (path: string) => void {
  if (typeof loadDotEnvFile !== "function") throw new Error("Dotenv loader must be a function");
}

function validateBroadcastSubmitManifestReader(
  readDeploymentManifest: unknown,
): asserts readDeploymentManifest is (path: string) => Promise<BroadcastSubmitDeploymentManifest> {
  if (typeof readDeploymentManifest !== "function") throw new Error("Deployment manifest reader must be a function");
}

function validateBroadcastSubmitClientFactory(
  createClient: unknown,
): asserts createClient is (rpcUrl: string) => AgentProposalExecutionBroadcastSubmitClient {
  if (typeof createClient !== "function") throw new Error("Broadcast submit client factory must be a function");
}

function validateBroadcastSubmitTextReader(readText: unknown): asserts readText is (path: string) => Promise<string> {
  if (typeof readText !== "function") throw new Error("Text reader must be a function");
}

function validateBroadcastSubmitter(
  submitBroadcast: unknown,
): asserts submitBroadcast is (params: unknown) => Promise<BroadcastSubmitCliResult> {
  if (typeof submitBroadcast !== "function") throw new Error("Broadcast submitter must be a function");
}

function validateBroadcastReceiptCreator(
  createReceipt: unknown,
): asserts createReceipt is (params: unknown) => BroadcastReceiptCliResult {
  if (typeof createReceipt !== "function") throw new Error("Broadcast receipt creator must be a function");
}

function validateBroadcastSubmitDirectoryCreator(mkdirp: unknown): asserts mkdirp is (dir: string) => Promise<void> {
  if (typeof mkdirp !== "function") throw new Error("Directory creator must be a function");
}

function validateBroadcastSubmitTextWriter(
  writeText: unknown,
): asserts writeText is (path: string, contents: string) => Promise<void> {
  if (typeof writeText !== "function") throw new Error("Text writer must be a function");
}

function loadDotEnv(path: string): void {
  let contents: string;
  try {
    contents = readFileSync(path, "utf8");
  } catch {
    return;
  }

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (process.env[key] === undefined) process.env[key] = stripQuotes(value);
  }
}

function stripQuotes(value: string): string {
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
