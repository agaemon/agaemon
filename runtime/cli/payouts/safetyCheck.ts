import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createPublicClient as createViemPublicClient, http, isAddress } from "viem";
import { baseSepolia } from "viem/chains";

import { createAction } from "../../core/action.js";
import { createOnChainPolicySimulator } from "../../base/execution.js";
import { readDeploymentManifest, requirePayoutRuleAdapter } from "../../base/deploymentManifest.js";
import { createPayoutRuleAction, PAYOUT_CAPABILITY, PAYOUT_RULE_ABI } from "../../payouts/rule.js";
import { buildExecuteTransaction } from "../../transactions/builder.js";
import {
  requireReportBoolean,
  requireReportNumber,
  requireReportObject,
  requireReportString,
  validateReportChecks,
} from "../../valueTransfer/reportValidation.js";

const DEFAULT_MANIFEST_PATH = "deployments/base-sepolia/latest.json";
const UNKNOWN_TARGET = "0x000000000000000000000000000000000000dEaD";
const UNKNOWN_RECIPIENT = "0x000000000000000000000000000000000000bEEF";

export interface PayoutsSafetyCheckCliArgs {
  manifestPath: string;
}

export interface PayoutsSafetyCheckCliOptions {
  argv?: readonly string[];
  env?: Record<string, string | undefined>;
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  loadDotEnv?: (path: string, env: Record<string, string | undefined>) => void;
  readDeploymentManifest?: (path: string) => Promise<PayoutSafetyManifest>;
  requireAdapter?: (manifest: PayoutSafetyManifest) => string;
  createPublicClient?: (rpcUrl: string) => PayoutSafetyPublicClient;
  readPayoutRule?: (params: PayoutSafetyRuleReadParams) => Promise<PayoutRule>;
  buildSafetyTransaction?: (params: PayoutSafetyBuildParams) => Promise<PayoutSafetyBuildResult>;
  callPasses?: (params: PayoutCallPassesParams) => Promise<boolean>;
}

interface PayoutSafetyManifest {
  chainId: number;
  rpcUrlEnv: string;
  owner: string;
  contracts: { agentAccount: string };
}

interface PayoutSafetyPublicClient {
  getChainId: () => Promise<number>;
  readContract?: (params: unknown) => Promise<PayoutRule>;
  call?: (params: unknown) => Promise<unknown>;
}

type PayoutRule = readonly [bigint, bigint, boolean];

interface PayoutSafetyRuleReadParams {
  publicClient: PayoutSafetyPublicClient;
  adapter: string;
  manifest: PayoutSafetyManifest;
  recipient: string;
}

interface PayoutSafetyBuildParams {
  kind: "allowed" | "unknownAdapter" | "unknownRecipient" | "overAdapterLimit" | "invalidCalldata";
  manifest: PayoutSafetyManifest;
  publicClient: unknown;
  adapter: string;
  recipient: string;
  amountWei: bigint;
  rule: PayoutRule;
}

interface PayoutSafetyBuildResult {
  allowed: boolean;
  decision: { code: string };
  transaction: null | { to: `0x${string}` | string; value: bigint; data: `0x${string}` | string };
}

interface PayoutCallPassesParams {
  publicClient: PayoutSafetyPublicClient;
  manifest: PayoutSafetyManifest;
  transaction: { to: `0x${string}` | string; value: bigint; data: `0x${string}` | string };
  expectPass: boolean;
}

if (isPayoutsSafetyCheckDirectRun(import.meta.url, process.argv)) {
  await runPayoutsSafetyCheckCli();
}

export async function runPayoutsSafetyCheckCli(options: PayoutsSafetyCheckCliOptions = {}): Promise<void> {
  validateOptions(options);
  const argv = options.argv ?? process.argv.slice(2);
  const env = options.env ?? process.env;
  const writeOutput = options.writeOutput ?? ((output: string) => console.log(output));
  const setExitCode = options.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });
  const loadDotEnv = options.loadDotEnv ?? loadPayoutsSafetyCheckDotEnv;
  const readManifest = options.readDeploymentManifest ?? readDeploymentManifest;
  const readAdapter = options.requireAdapter ?? ((manifest: PayoutSafetyManifest) =>
    requirePayoutRuleAdapter(manifest as Parameters<typeof requirePayoutRuleAdapter>[0]));
  const createClient = options.createPublicClient ?? ((rpcUrl: string) =>
    createViemPublicClient({ chain: baseSepolia, transport: http(rpcUrl) }) as PayoutSafetyPublicClient);
  const readRule = options.readPayoutRule ?? readDefaultPayoutRule;
  const buildSafety = options.buildSafetyTransaction ?? buildDefaultSafetyTransaction;
  const callPasses = options.callPasses ?? callDefaultPasses;

  validateOutputWriter(writeOutput);
  validateArgv(argv);
  const args = parsePayoutsSafetyCheckCliArgs(argv);
  validateEnv(env);
  validateDotEnvLoader(loadDotEnv);
  validateManifestReader(readManifest);
  validateAdapterReader(readAdapter);
  validatePublicClientFactory(createClient);
  validatePayoutRuleReader(readRule);
  validateSafetyBuilder(buildSafety);
  validateCallPasses(callPasses);

  loadDotEnv(".env", env);
  const manifest = await readManifest(args.manifestPath);
  const rpcUrl = env[manifest.rpcUrlEnv];
  if (rpcUrl === undefined || rpcUrl.length === 0) throw new Error(`${manifest.rpcUrlEnv} is required`);

  const rawRecipient = env.PAYOUT_RECIPIENT ?? env.PAYMENT_RECIPIENT ?? manifest.owner;
  if (!isAddress(rawRecipient)) throw new Error("PAYOUT_RECIPIENT or PAYMENT_RECIPIENT must be an address");
  const recipient = rawRecipient;
  const adapter = readAdapter(manifest);
  const publicClient = createClient(rpcUrl);
  const chainId = await publicClient.getChainId();
  if (chainId !== manifest.chainId) throw new Error(`Connected to chain ${chainId}, expected ${manifest.chainId}`);

  const rule = await readRule({ publicClient, adapter, manifest, recipient });
  const amountWei = 1_000_000_000_000n;
  const allowedPayout = await buildSafety({ kind: "allowed", manifest, publicClient, adapter, recipient, amountWei, rule });
  const allowedPayoutCallable = allowedPayout.transaction !== null &&
    await callPasses({ publicClient, manifest, transaction: allowedPayout.transaction, expectPass: true });
  const unknownAdapter = await buildSafety({ kind: "unknownAdapter", manifest, publicClient, adapter, recipient, amountWei, rule });
  const unknownRecipient = await buildSafety({ kind: "unknownRecipient", manifest, publicClient, adapter, recipient, amountWei, rule });
  const unknownRecipientRejected = unknownRecipient.transaction !== null &&
    !(await callPasses({ publicClient, manifest, transaction: unknownRecipient.transaction, expectPass: false }));
  const overAdapterLimit = await buildSafety({ kind: "overAdapterLimit", manifest, publicClient, adapter, recipient, amountWei: rule[0] + 1n, rule });
  const overAdapterLimitRejected = overAdapterLimit.transaction !== null &&
    !(await callPasses({ publicClient, manifest, transaction: overAdapterLimit.transaction, expectPass: false }));
  const invalidCalldata = await buildSafety({ kind: "invalidCalldata", manifest, publicClient, adapter, recipient, amountWei, rule });
  const invalidCalldataRejected = invalidCalldata.transaction !== null &&
    !(await callPasses({ publicClient, manifest, transaction: invalidCalldata.transaction, expectPass: false }));

  const checks = {
    payoutRuleEnabled: rule[2],
    allowedPayoutCallable: allowedPayout.allowed && allowedPayoutCallable,
    unknownAdapterDenied: !unknownAdapter.allowed && unknownAdapter.decision.code === "CapabilityDenied",
    unknownRecipientRejected,
    overAdapterLimitRejected,
    invalidCalldataRejected,
  };

  const report = {
    chainId,
    agent: manifest.contracts.agentAccount,
    adapter,
    recipient,
    rule: formatRule(rule),
    checks,
  };
  validatePayoutSafetyReport(report);
  writeOutput(JSON.stringify(report, null, 2));

  if (!Object.values(checks).every(Boolean)) {
    validateExitCodeSetter(setExitCode);
    setExitCode(1);
  }
}

export function parsePayoutsSafetyCheckCliArgs(argv: readonly string[]): PayoutsSafetyCheckCliArgs {
  validateArgv(argv);
  const values = parseValues(argv, ["--manifest"]);
  return { manifestPath: values.get("--manifest") ?? DEFAULT_MANIFEST_PATH };
}

export function isPayoutsSafetyCheckDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  validateArgv(argv, "Direct-run argv must be an array of strings");
  return argv[1] !== undefined && fileURLToPath(moduleUrl) === resolve(argv[1]);
}

export function loadPayoutsSafetyCheckDotEnv(path: string, env: Record<string, string | undefined>): void {
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
    const value = stripQuotes(line.slice(separator + 1).trim());
    if (key.length > 0 && env[key] === undefined) env[key] = value;
  }
}

async function readDefaultPayoutRule(params: PayoutSafetyRuleReadParams): Promise<PayoutRule> {
  if (typeof params.publicClient.readContract !== "function") throw new Error("Public client must support payout rule reads");
  return params.publicClient.readContract({
    address: params.adapter,
    abi: PAYOUT_RULE_ABI,
    functionName: "payoutRules",
    args: [params.manifest.contracts.agentAccount, params.recipient],
  });
}

async function buildDefaultSafetyTransaction(params: PayoutSafetyBuildParams): Promise<PayoutSafetyBuildResult> {
  const simulatePolicy = createOnChainPolicySimulator(
    params.publicClient as Parameters<typeof createOnChainPolicySimulator>[0],
    params.manifest as Parameters<typeof createOnChainPolicySimulator>[1],
  );
  let action;
  if (params.kind === "unknownAdapter") {
    action = createPayoutRuleAction({ adapter: UNKNOWN_TARGET, recipient: params.recipient as `0x${string}`, amountWei: params.amountWei });
  } else if (params.kind === "unknownRecipient") {
    action = createPayoutRuleAction({ adapter: params.adapter as `0x${string}`, recipient: UNKNOWN_RECIPIENT, amountWei: params.amountWei });
  } else if (params.kind === "invalidCalldata") {
    action = createAction({ capability: PAYOUT_CAPABILITY, target: params.adapter as `0x${string}`, value: params.amountWei, data: "0x" });
  } else {
    action = createPayoutRuleAction({ adapter: params.adapter as `0x${string}`, recipient: params.recipient as `0x${string}`, amountWei: params.amountWei });
  }
  return buildExecuteTransaction({
    agent: params.manifest.contracts.agentAccount as `0x${string}`,
    action,
    simulatePolicy,
  });
}

async function callDefaultPasses(params: PayoutCallPassesParams): Promise<boolean> {
  if (typeof params.publicClient.call !== "function") throw new Error("Public client must support calls for payout safety checks");
  try {
    await params.publicClient.call({
      account: params.manifest.owner,
      to: params.transaction.to,
      value: params.transaction.value,
      data: params.transaction.data,
    });
    return true;
  } catch {
    return false;
  }
}

function formatRule(rule: PayoutRule): { maxActionValue: string; maxDailyValue: string; enabled: boolean } {
  return { maxActionValue: rule[0].toString(), maxDailyValue: rule[1].toString(), enabled: rule[2] };
}

function validatePayoutSafetyReport(output: unknown): void {
  const report = requireReportObject(output, "Payout safety report must be an object");
  requireReportNumber(report.chainId, "Payout safety report chainId must be a number");
  requireReportString(report.agent, "Payout safety report agent must be a string");
  requireReportString(report.adapter, "Payout safety report adapter must be a string");
  requireReportString(report.recipient, "Payout safety report recipient must be a string");
  validatePayoutSafetyRule(report.rule);
  validateReportChecks(report.checks, "Payout safety");
}

function validatePayoutSafetyRule(value: unknown): void {
  const rule = requireReportObject(value, "Payout safety rule must be an object");
  requireReportString(rule.maxActionValue, "Payout safety rule maxActionValue must be a string");
  requireReportString(rule.maxDailyValue, "Payout safety rule maxDailyValue must be a string");
  requireReportBoolean(rule.enabled, "Payout safety rule enabled must be a boolean");
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

function validateOptions(options: unknown): asserts options is PayoutsSafetyCheckCliOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) throw new Error("Payouts safety check options must be an object");
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

function validateDotEnvLoader(loadDotEnv: unknown): asserts loadDotEnv is (path: string, env: Record<string, string | undefined>) => void {
  if (typeof loadDotEnv !== "function") throw new Error("Dotenv loader must be a function");
}

function validateManifestReader(readManifest: unknown): asserts readManifest is (path: string) => Promise<PayoutSafetyManifest> {
  if (typeof readManifest !== "function") throw new Error("Deployment manifest reader must be a function");
}

function validateAdapterReader(readAdapter: unknown): asserts readAdapter is (manifest: PayoutSafetyManifest) => string {
  if (typeof readAdapter !== "function") throw new Error("Payout adapter reader must be a function");
}

function validatePublicClientFactory(createClient: unknown): asserts createClient is (rpcUrl: string) => PayoutSafetyPublicClient {
  if (typeof createClient !== "function") throw new Error("Public client factory must be a function");
}

function validatePayoutRuleReader(readRule: unknown): asserts readRule is (params: PayoutSafetyRuleReadParams) => Promise<PayoutRule> {
  if (typeof readRule !== "function") throw new Error("Payout rule reader must be a function");
}

function validateSafetyBuilder(buildSafety: unknown): asserts buildSafety is (params: PayoutSafetyBuildParams) => Promise<PayoutSafetyBuildResult> {
  if (typeof buildSafety !== "function") throw new Error("Payout safety transaction builder must be a function");
}

function validateCallPasses(callPasses: unknown): asserts callPasses is (params: PayoutCallPassesParams) => Promise<boolean> {
  if (typeof callPasses !== "function") throw new Error("Payout call probe must be a function");
}

function stripQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
