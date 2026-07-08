import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createPublicClient as createViemPublicClient, http, isAddress, parseEther } from "viem";
import { baseSepolia } from "viem/chains";

import { createAction } from "../../core/action.js";
import { createOnChainPolicySimulator } from "../../base/execution.js";
import { readDeploymentManifest, requireTreasuryPaymentAdapter } from "../../base/deploymentManifest.js";
import { buildExecuteTransaction } from "../../transactions/builder.js";
import { createTreasuryPaymentAction, PAYMENT_CAPABILITY } from "../../payments/treasury.js";
import {
  requireReportNumber,
  requireReportObject,
  requireReportString,
  validateReportChecks,
} from "../../valueTransfer/reportValidation.js";

const DEFAULT_MANIFEST_PATH = "deployments/base-sepolia/latest.json";
const UNKNOWN_TARGET = "0x000000000000000000000000000000000000dEaD";

export interface PaymentsSafetyCheckCliArgs {
  manifestPath: string;
  recipient?: string | undefined;
}

export interface PaymentsSafetyCheckCliOptions {
  argv?: readonly string[];
  env?: Record<string, string | undefined>;
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  loadDotEnv?: (path: string, env: Record<string, string | undefined>) => void;
  readDeploymentManifest?: (path: string) => Promise<PaymentSafetyManifest>;
  requireAdapter?: (manifest: PaymentSafetyManifest) => string;
  createPublicClient?: (rpcUrl: string) => PaymentSafetyPublicClient;
  buildSafetyTransaction?: (params: PaymentSafetyBuildParams) => Promise<PaymentSafetyBuildResult>;
  callUnauthorizedDelegate?: (params: PaymentUnauthorizedDelegateParams) => Promise<boolean>;
  readPaused?: (params: PaymentReadPausedParams) => Promise<boolean>;
}

interface PaymentSafetyManifest {
  chainId: number;
  rpcUrlEnv: string;
  owner: string;
  contracts: { agentAccount: string };
}

interface PaymentSafetyPublicClient {
  call?: (params: unknown) => Promise<unknown>;
  readContract?: (params: unknown) => Promise<boolean>;
}

interface PaymentSafetyBuildParams {
  kind: "allowed" | "unknownTarget" | "overLimit";
  manifest: PaymentSafetyManifest;
  publicClient: unknown;
  adapter: string;
  recipient: string;
  amountWei: bigint;
}

interface PaymentSafetyBuildResult {
  allowed: boolean;
  decision: { code: string };
  transaction: null | { data: `0x${string}` | string };
}

interface PaymentUnauthorizedDelegateParams {
  publicClient: PaymentSafetyPublicClient;
  manifest: PaymentSafetyManifest;
  transaction: { data: `0x${string}` | string };
}

interface PaymentReadPausedParams {
  publicClient: PaymentSafetyPublicClient;
  manifest: PaymentSafetyManifest;
}

if (isPaymentsSafetyCheckDirectRun(import.meta.url, process.argv)) {
  await runPaymentsSafetyCheckCli();
}

export async function runPaymentsSafetyCheckCli(options: PaymentsSafetyCheckCliOptions = {}): Promise<void> {
  validateOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const env = options.env ?? process.env;
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const loadDotEnv = options.loadDotEnv ?? loadPaymentsSafetyCheckDotEnv;
  const readManifest = options.readDeploymentManifest ?? readDeploymentManifest;
  const readAdapter = options.requireAdapter ?? ((manifest: PaymentSafetyManifest) =>
    requireTreasuryPaymentAdapter(manifest as Parameters<typeof requireTreasuryPaymentAdapter>[0]));
  const createClient = options.createPublicClient ?? ((rpcUrl: string) =>
    createViemPublicClient({ chain: baseSepolia, transport: http(rpcUrl) }) as PaymentSafetyPublicClient);
  const buildSafety = options.buildSafetyTransaction ?? buildDefaultSafetyTransaction;
  const callUnauthorizedDelegate = options.callUnauthorizedDelegate ?? callDefaultUnauthorizedDelegate;
  const readPaused = options.readPaused ?? readDefaultPaused;

  validateOutputWriter(writeOutput);
  validateArgv(argv);
  const args = parsePaymentsSafetyCheckCliArgs(argv);
  validateEnv(env);
  validateDotEnvLoader(loadDotEnv);
  validateManifestReader(readManifest);
  validateAdapterReader(readAdapter);
  validatePublicClientFactory(createClient);
  validateSafetyBuilder(buildSafety);
  validateUnauthorizedDelegateChecker(callUnauthorizedDelegate);
  validatePausedReader(readPaused);

  loadDotEnv(".env", env);
  const manifest = await readManifest(args.manifestPath);
  const rpcUrl = env[manifest.rpcUrlEnv];
  if (rpcUrl === undefined || rpcUrl.length === 0) throw new Error(`${manifest.rpcUrlEnv} is required`);

  const recipient = args.recipient ?? manifest.owner;
  if (!isAddress(recipient)) throw new Error("--recipient must be an address");

  const adapter = readAdapter(manifest);
  const publicClient = createClient(rpcUrl);
  const amountWei = parseEther("0.000001");

  const allowed = await buildSafety({
    kind: "allowed",
    manifest,
    publicClient,
    adapter,
    recipient,
    amountWei,
  });

  const unknownTarget = await buildSafety({
    kind: "unknownTarget",
    manifest,
    publicClient,
    adapter,
    recipient,
    amountWei,
  });

  const overLimit = await buildSafety({
    kind: "overLimit",
    manifest,
    publicClient,
    adapter,
    recipient,
    amountWei: parseEther("0.06"),
  });

  let unauthorizedDelegateDenied = false;
  if (allowed.transaction !== null) {
    unauthorizedDelegateDenied = await callUnauthorizedDelegate({ publicClient, manifest, transaction: allowed.transaction });
  }

  const paused = await readPaused({ publicClient, manifest });

  const checks = {
    allowedPayment: allowed.allowed && allowed.decision.code === "Allowed",
    unknownTargetDenied: !unknownTarget.allowed && unknownTarget.decision.code === "CapabilityDenied",
    overLimitDenied: !overLimit.allowed && overLimit.decision.code === "ActionValueExceeded",
    agentUnpaused: paused === false,
    unauthorizedDelegateDenied,
  };

  const passed = Object.values(checks).every(Boolean);
  const report = {
    chainId: manifest.chainId,
    agent: manifest.contracts.agentAccount,
    adapter,
    checks,
  };
  validatePaymentsSafetyReport(report);
  writeOutput(JSON.stringify(report, null, 2));

  if (!passed) {
    validateExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parsePaymentsSafetyCheckCliArgs(argv: readonly string[]): PaymentsSafetyCheckCliArgs {
  validateArgv(argv);
  const values = parseValues(argv, ["--manifest", "--recipient"]);
  return {
    manifestPath: values.get("--manifest") ?? DEFAULT_MANIFEST_PATH,
    recipient: values.get("--recipient"),
  };
}

export function isPaymentsSafetyCheckDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

export function loadPaymentsSafetyCheckDotEnv(path: string, env: Record<string, string | undefined>): void {
  validateEnv(env);
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
    if (key.length > 0 && env[key] === undefined) env[key] = stripQuotes(value);
  }
}

async function buildDefaultSafetyTransaction(params: PaymentSafetyBuildParams): Promise<PaymentSafetyBuildResult> {
  const simulatePolicy = createOnChainPolicySimulator(
    params.publicClient as Parameters<typeof createOnChainPolicySimulator>[0],
    params.manifest as Parameters<typeof createOnChainPolicySimulator>[1],
  );
  const action = params.kind === "unknownTarget"
    ? createAction({
      capability: PAYMENT_CAPABILITY,
      target: UNKNOWN_TARGET,
      value: params.amountWei,
      data: "0x",
    })
    : createTreasuryPaymentAction({
      adapter: params.adapter as `0x${string}`,
      recipient: params.recipient as `0x${string}`,
      amountWei: params.amountWei,
    });

  return buildExecuteTransaction({
    agent: params.manifest.contracts.agentAccount as `0x${string}`,
    action,
    simulatePolicy,
  });
}

async function callDefaultUnauthorizedDelegate(params: PaymentUnauthorizedDelegateParams): Promise<boolean> {
  if (typeof params.publicClient.call !== "function") {
    throw new Error("Public client must support calls for payment safety checks");
  }
  try {
    await params.publicClient.call({
      account: UNKNOWN_TARGET,
      to: params.manifest.contracts.agentAccount,
      data: params.transaction.data,
    });
    return false;
  } catch {
    return true;
  }
}

async function readDefaultPaused(params: PaymentReadPausedParams): Promise<boolean> {
  if (typeof params.publicClient.readContract !== "function") {
    throw new Error("Public client must support contract reads for payment safety checks");
  }
  return params.publicClient.readContract({
    address: params.manifest.contracts.agentAccount,
    abi: [
      {
        type: "function",
        name: "paused",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "bool" }],
      },
    ] as const,
    functionName: "paused",
  });
}

function parseValues(argv: readonly string[], flags: readonly string[]): Map<string, string> {
  const values = new Map<string, string>();
  const pattern = new RegExp(`^(${flags.join("|")})=(.*)$`, "u");

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (flags.includes(arg)) {
      setOption(values, arg, argv[index + 1]);
      index += 1;
      continue;
    }
    const equals = arg.match(pattern);
    if (equals !== null) {
      setOption(values, equals[1]!, equals[2]!);
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }
  return values;
}

function setOption(values: Map<string, string>, name: string, rawValue: string | undefined): void {
  if (values.has(name)) throw new Error(`Duplicate argument: ${name}`);
  const value = rawValue?.trim();
  if (value === undefined || value.length === 0 || value.startsWith("--")) throw new Error(`${name} requires a value`);
  values.set(name, value);
}

function validateOptions(options: unknown): asserts options is PaymentsSafetyCheckCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new Error("Payments safety check options must be an object");
  }
}

function validateArgv(argv: unknown, message = "CLI argv must be an array of strings"): asserts argv is readonly string[] {
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== "string")) throw new Error(message);
}

function validateEnv(env: unknown): asserts env is Record<string, string | undefined> {
  if (typeof env !== "object" || env === null || Array.isArray(env)) throw new Error("Environment must be an object");
  for (const value of Object.values(env)) {
    if (value !== undefined && typeof value !== "string") throw new Error("Environment values must be strings when defined");
  }
}

function validateOutputWriter(writeOutput: unknown): asserts writeOutput is (output: string) => void {
  if (typeof writeOutput !== "function") throw new Error("Output writer must be a function");
}

function validateExitCodeSetter(setExitCode: unknown): asserts setExitCode is (code: number) => void {
  if (typeof setExitCode !== "function") throw new Error("Exit code setter must be a function");
}

function validateDotEnvLoader(
  loadDotEnv: unknown,
): asserts loadDotEnv is (path: string, env: Record<string, string | undefined>) => void {
  if (typeof loadDotEnv !== "function") throw new Error("Dotenv loader must be a function");
}

function validateManifestReader(
  readManifest: unknown,
): asserts readManifest is (path: string) => Promise<PaymentSafetyManifest> {
  if (typeof readManifest !== "function") throw new Error("Deployment manifest reader must be a function");
}

function validateAdapterReader(readAdapter: unknown): asserts readAdapter is (manifest: PaymentSafetyManifest) => string {
  if (typeof readAdapter !== "function") throw new Error("Payment adapter reader must be a function");
}

function validatePublicClientFactory(createClient: unknown): asserts createClient is (rpcUrl: string) => PaymentSafetyPublicClient {
  if (typeof createClient !== "function") throw new Error("Public client factory must be a function");
}

function validateSafetyBuilder(buildSafety: unknown): asserts buildSafety is (params: PaymentSafetyBuildParams) => Promise<PaymentSafetyBuildResult> {
  if (typeof buildSafety !== "function") throw new Error("Payment safety transaction builder must be a function");
}

function validateUnauthorizedDelegateChecker(
  callUnauthorizedDelegate: unknown,
): asserts callUnauthorizedDelegate is (params: PaymentUnauthorizedDelegateParams) => Promise<boolean> {
  if (typeof callUnauthorizedDelegate !== "function") throw new Error("Unauthorized delegate checker must be a function");
}

function validatePausedReader(readPaused: unknown): asserts readPaused is (params: PaymentReadPausedParams) => Promise<boolean> {
  if (typeof readPaused !== "function") throw new Error("Paused reader must be a function");
}

function stripQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function validatePaymentsSafetyReport(output: unknown): void {
  const report = requireReportObject(output, "Payments safety report must be an object");
  requireReportNumber(report.chainId, "Payments safety report chainId must be a number");
  requireReportString(report.agent, "Payments safety report agent must be a string");
  requireReportString(report.adapter, "Payments safety report adapter must be a string");
  validateReportChecks(report.checks, "Payments safety");
}
