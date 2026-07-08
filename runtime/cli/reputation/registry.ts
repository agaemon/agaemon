import { readFileSync } from "node:fs";

import { createPublicClient, createWalletClient, getAddress, http, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

import { normalizePrivateKey } from "../../base/execution.js";
import { readDeploymentManifest } from "../../base/deploymentManifest.js";
import {
  createReputationAdjustTransaction,
  parseReputationDelta,
  REPUTATION_REGISTRY_ABI,
} from "../../reputation/registry.js";
import {
  isDirectRun,
  parseValues,
  requireBoolean,
  requireNumber,
  requireObject,
  requireString,
  runInjectedOrDefault,
  validateReceiptEvidence,
  validateTransactionEvidence,
} from "./runnerShared.js";
import type { ReputationRunnerOptions } from "./runnerShared.js";

const DEFAULT_MANIFEST_PATH = "deployments/base-sepolia/latest.json";

export interface ReputationRegistryCliArgs {
  send: boolean;
  manifestPath: string;
  agent?: string | undefined;
  delta?: string | undefined;
}

export type ReputationRegistryCliOptions = ReputationRunnerOptions<ReputationRegistryCliArgs>;

if (isReputationRegistryDirectRun(import.meta.url, process.argv)) {
  await runReputationRegistryCli();
}

export async function runReputationRegistryCli(options: ReputationRegistryCliOptions = {}): Promise<void> {
  await runInjectedOrDefault(options, parseReputationRegistryCliArgs, main, validateReputationRegistryReport);
}

export function parseReputationRegistryCliArgs(argv: readonly string[]): ReputationRegistryCliArgs {
  const values = parseValues(argv, ["--manifest", "--agent", "--delta"], ["--send"]);
  return {
    send: values.booleans.has("--send"),
    manifestPath: values.options.get("--manifest") ?? DEFAULT_MANIFEST_PATH,
    agent: values.options.get("--agent"),
    delta: values.options.get("--delta"),
  };
}

export function isReputationRegistryDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  return isDirectRun(moduleUrl, argv);
}

async function main(): Promise<void> {
  loadDotEnv(".env");

  const shouldSend = process.argv.includes("--send");
  const manifestPath = readFlag("--manifest") ?? DEFAULT_MANIFEST_PATH;
  const manifest = await readDeploymentManifest(manifestPath);
  const rpcUrl = process.env[manifest.rpcUrlEnv];
  if (rpcUrl === undefined || rpcUrl.length === 0) throw new Error(`${manifest.rpcUrlEnv} is required`);

  const agent = readAddressFlag("--agent") ?? manifest.contracts.agentAccount;
  const deltaFlag = readFlag("--delta");
  if (shouldSend && deltaFlag === undefined) throw new Error("--send requires --delta");
  const delta = deltaFlag === undefined ? undefined : parseReputationDelta(deltaFlag);

  const registry = manifest.contracts.reputationRegistry;
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
  const ownerMatchesManifest = getAddress(owner) === getAddress(manifest.owner);

  const baseOutput = {
    mode: shouldSend ? "send" : "dry-run",
    chainId,
    registry,
    agent,
    owner,
    ownerMatchesManifest,
    score: score.toString(),
  };

  if (delta === undefined) {
    console.log(JSON.stringify({ ...baseOutput, transaction: null }, null, 2));
    return;
  }

  if (!ownerMatchesManifest) {
    throw new Error(`Registry owner ${owner} does not match manifest owner ${manifest.owner}`);
  }

  const transaction = createReputationAdjustTransaction({ registry, agent, delta });
  await publicClient.call({
    account: owner,
    to: transaction.to,
    value: transaction.value,
    data: transaction.data,
  });

  const outputWithTransaction = {
    ...baseOutput,
    delta: delta.toString(),
    transaction: {
      to: transaction.to,
      value: transaction.value.toString(),
      data: transaction.data,
    },
    simulation: "passed",
  };

  if (!shouldSend) {
    console.log(JSON.stringify(outputWithTransaction, null, 2));
    return;
  }

  const rawPrivateKey = process.env.PRIVATE_KEY;
  if (rawPrivateKey === undefined || rawPrivateKey.length === 0) {
    throw new Error("PRIVATE_KEY is required when --send is used");
  }

  const account = privateKeyToAccount(normalizePrivateKey(rawPrivateKey));
  if (getAddress(account.address) !== getAddress(owner)) {
    throw new Error(`PRIVATE_KEY address ${account.address} does not match reputation registry owner ${owner}`);
  }

  const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http(rpcUrl) });
  const hash = await walletClient.sendTransaction({
    account,
    chain: baseSepolia,
    to: transaction.to,
    value: transaction.value,
    data: transaction.data,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  const nextScore = (await publicClient.readContract({
    address: registry,
    abi: REPUTATION_REGISTRY_ABI,
    functionName: "scoreOf",
    args: [agent],
    blockNumber: receipt.blockNumber,
  })) as bigint;

  console.log(
    JSON.stringify(
      {
        ...outputWithTransaction,
        hash,
        explorerUrl: `${manifest.explorerUrl}/tx/${hash}`,
        receipt: {
          blockNumber: receipt.blockNumber.toString(),
          status: receipt.status,
        },
        nextScore: nextScore.toString(),
      },
      null,
      2,
    ),
  );
}

function readAddressFlag(name: string): `0x${string}` | undefined {
  const value = readFlag(name);
  if (value === undefined) return undefined;
  if (!isAddress(value)) throw new Error(`${name} must be an address`);
  return value;
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

function validateReputationRegistryReport(output: unknown): void {
  const report = requireObject(output, "Reputation registry report must be an object");
  requireString(report.mode, "Reputation registry report mode must be a string");
  requireNumber(report.chainId, "Reputation registry report chainId must be a number");
  requireString(report.registry, "Reputation registry report registry must be a string");
  requireString(report.agent, "Reputation registry report agent must be a string");
  requireString(report.owner, "Reputation registry report owner must be a string");
  requireBoolean(report.ownerMatchesManifest, "Reputation registry report ownerMatchesManifest must be a boolean");
  requireString(report.score, "Reputation registry report score must be a string");
  validateTransactionEvidence(report.transaction, "Reputation registry");
  if (report.simulation !== undefined) requireString(report.simulation, "Reputation registry simulation must be a string");
  if (report.hash !== undefined) {
    requireString(report.hash, "Reputation registry hash must be a string");
    validateReceiptEvidence(report.receipt, "Reputation registry");
    requireString(report.nextScore, "Reputation registry nextScore must be a string");
  }
}
