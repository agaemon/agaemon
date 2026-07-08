import { readFileSync } from "node:fs";

import { createPublicClient, getAddress, http } from "viem";
import type { Address, Hex } from "viem";
import { baseSepolia } from "viem/chains";

import { readDeploymentManifest } from "../../base/deploymentManifest.js";
import { createReputationAdjustTransaction, REPUTATION_REGISTRY_ABI } from "../../reputation/registry.js";
import {
  isDirectRun,
  parseValues,
  requireNumber,
  requireObject,
  requireString,
  runInjectedOrDefault,
  validateChecksEvidence,
} from "./runnerShared.js";
import type { ReputationRunnerOptions } from "./runnerShared.js";

const DEFAULT_MANIFEST_PATH = "deployments/base-sepolia/latest.json";
const UNAUTHORIZED_CALLER = "0x000000000000000000000000000000000000dEaD" as const;

interface CallClient {
  call(parameters: { account: Address; to: Address; value: bigint; data: Hex }): Promise<unknown>;
}

export interface ReputationRegistrySafetyCheckCliArgs {
  manifestPath: string;
}

export type ReputationRegistrySafetyCheckCliOptions = ReputationRunnerOptions<ReputationRegistrySafetyCheckCliArgs>;

if (isReputationRegistrySafetyCheckDirectRun(import.meta.url, process.argv)) {
  await runReputationRegistrySafetyCheckCli();
}

export async function runReputationRegistrySafetyCheckCli(
  options: ReputationRegistrySafetyCheckCliOptions = {},
): Promise<void> {
  await runInjectedOrDefault(
    options,
    parseReputationRegistrySafetyCheckCliArgs,
    main,
    validateReputationRegistrySafetyReport,
  );
}

export function parseReputationRegistrySafetyCheckCliArgs(argv: readonly string[]): ReputationRegistrySafetyCheckCliArgs {
  const values = parseValues(argv, ["--manifest"]);
  return { manifestPath: values.options.get("--manifest") ?? DEFAULT_MANIFEST_PATH };
}

export function isReputationRegistrySafetyCheckDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  return isDirectRun(moduleUrl, argv);
}

async function main(): Promise<void> {
  loadDotEnv(".env");

  const manifestPath = readFlag("--manifest") ?? DEFAULT_MANIFEST_PATH;
  const manifest = await readDeploymentManifest(manifestPath);
  const rpcUrl = process.env[manifest.rpcUrlEnv];
  if (rpcUrl === undefined || rpcUrl.length === 0) throw new Error(`${manifest.rpcUrlEnv} is required`);

  const registry = manifest.contracts.reputationRegistry;
  const agent = manifest.contracts.agentAccount;
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
  const chainId = await publicClient.getChainId();
  if (chainId !== manifest.chainId) throw new Error(`Connected to chain ${chainId}, expected ${manifest.chainId}`);

  const owner = (await publicClient.readContract({
    address: registry,
    abi: REPUTATION_REGISTRY_ABI,
    functionName: "owner",
  })) as typeof manifest.owner;
  const score = (await publicClient.readContract({
    address: registry,
    abi: REPUTATION_REGISTRY_ABI,
    functionName: "scoreOf",
    args: [agent],
  })) as bigint;

  const positiveAdjustment = createReputationAdjustTransaction({ registry, agent, delta: 1n });
  const positiveAdjustmentCallable = await callPasses(publicClient, owner, positiveAdjustment);

  const unauthorizedAdjustment = createReputationAdjustTransaction({ registry, agent, delta: 1n });
  const unauthorizedAdjustmentDenied = !(await callPasses(publicClient, UNAUTHORIZED_CALLER, unauthorizedAdjustment));

  const negativeAdjustment = createReputationAdjustTransaction({ registry, agent, delta: -(score + 1n) });
  const negativeReputationDenied = !(await callPasses(publicClient, owner, negativeAdjustment));

  const checks = {
    ownerMatchesManifestOwner: getAddress(owner) === getAddress(manifest.owner),
    scoreReadable: score >= 0n,
    positiveAdjustmentCallable,
    unauthorizedAdjustmentDenied,
    negativeReputationDenied,
  };

  console.log(
    JSON.stringify(
      {
        chainId,
        registry,
        agent,
        owner,
        score: score.toString(),
        checks,
      },
      null,
      2,
    ),
  );

  if (!Object.values(checks).every(Boolean)) process.exitCode = 1;
}

async function callPasses(
  client: CallClient,
  account: Address,
  transaction: { to: Address; value: bigint; data: Hex },
): Promise<boolean> {
  try {
    await client.call({
      account,
      to: transaction.to,
      value: transaction.value,
      data: transaction.data,
    });
    return true;
  } catch {
    return false;
  }
}

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
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
    const value = stripQuotes(line.slice(separator + 1).trim());
    if (key.length > 0 && process.env[key] === undefined) process.env[key] = value;
  }
}

function stripQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function validateReputationRegistrySafetyReport(output: unknown): void {
  const report = requireObject(output, "Reputation registry safety report must be an object");
  requireNumber(report.chainId, "Reputation registry safety chainId must be a number");
  requireString(report.registry, "Reputation registry safety registry must be a string");
  requireString(report.agent, "Reputation registry safety agent must be a string");
  requireString(report.owner, "Reputation registry safety owner must be a string");
  requireString(report.score, "Reputation registry safety score must be a string");
  validateChecksEvidence(report.checks, "Reputation registry safety");
}
