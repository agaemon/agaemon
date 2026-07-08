import { readFileSync } from "node:fs";

import { createPublicClient, createWalletClient, getAddress, http, isAddress } from "viem";
import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

import { normalizePrivateKey } from "../../base/execution.js";
import { readDeploymentManifest, requireReputationHistory } from "../../base/deploymentManifest.js";
import { REPUTATION_REGISTRY_ABI } from "../../reputation/registry.js";
import { createReputationScoreSyncTransaction, sumReputationHistoryScore } from "../../reputation/scoreSync.js";
import { REPUTATION_HISTORY_ABI } from "../../reputation/history.js";
import {
  isDirectRun,
  parseValues,
  requireNumber,
  requireObject,
  requireString,
  runInjectedOrDefault,
  validateReceiptEvidence,
  validateTransactionEvidence,
} from "./runnerShared.js";
import type { ReputationRunnerOptions } from "./runnerShared.js";

const DEFAULT_MANIFEST_PATH = "deployments/base-sepolia/latest.json";

export interface ReputationScoreSyncCliArgs {
  send: boolean;
  manifestPath: string;
  agent?: string | undefined;
}

export type ReputationScoreSyncCliOptions = ReputationRunnerOptions<ReputationScoreSyncCliArgs>;

if (isReputationScoreSyncDirectRun(import.meta.url, process.argv)) {
  await runReputationScoreSyncCli();
}

export async function runReputationScoreSyncCli(options: ReputationScoreSyncCliOptions = {}): Promise<void> {
  await runInjectedOrDefault(options, parseReputationScoreSyncCliArgs, main, validateReputationScoreSyncReport);
}

export function parseReputationScoreSyncCliArgs(argv: readonly string[]): ReputationScoreSyncCliArgs {
  const values = parseValues(argv, ["--manifest", "--agent"], ["--send"]);
  return {
    send: values.booleans.has("--send"),
    manifestPath: values.options.get("--manifest") ?? DEFAULT_MANIFEST_PATH,
    agent: values.options.get("--agent"),
  };
}

export function isReputationScoreSyncDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
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
  const registry = manifest.contracts.reputationRegistry;
  const history = requireReputationHistory(manifest);

  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
  const chainId = await publicClient.getChainId();
  if (chainId !== manifest.chainId) throw new Error(`Connected to chain ${chainId}, expected ${manifest.chainId}`);

  const registryOwner = (await publicClient.readContract({
    address: registry,
    abi: REPUTATION_REGISTRY_ABI,
    functionName: "owner",
  })) as Address;
  const registryScore = (await publicClient.readContract({
    address: registry,
    abi: REPUTATION_REGISTRY_ABI,
    functionName: "scoreOf",
    args: [agent],
  })) as bigint;
  const historyEvents = await readHistoryEvents(publicClient, history, agent);
  const historyScore = sumReputationHistoryScore(historyEvents.map((event) => event.scoreDelta));
  const transaction = createReputationScoreSyncTransaction({
    registry,
    agent,
    registryScore,
    historyScore,
  });
  const syncDelta = historyScore - registryScore;

  const baseOutput = {
    mode: shouldSend ? "send" : "dry-run",
    chainId,
    registry,
    history,
    agent,
    registryOwner,
    registryOwnerMatchesManifest: getAddress(registryOwner) === getAddress(manifest.owner),
    registryScore: registryScore.toString(),
    historyScore: historyScore.toString(),
    syncDelta: syncDelta.toString(),
    eventCount: historyEvents.length.toString(),
    latestEvent: historyEvents.length === 0 ? null : formatHistoryEvent(historyEvents[historyEvents.length - 1]!),
    transaction: transaction === null
      ? null
      : {
          to: transaction.to,
          value: transaction.value.toString(),
          data: transaction.data,
        },
  };

  if (transaction === null) {
    if (shouldSend) throw new Error("reputation score already matches history");
    console.log(JSON.stringify({ ...baseOutput, simulation: "not-required" }, null, 2));
    return;
  }

  if (getAddress(registryOwner) !== getAddress(manifest.owner)) {
    throw new Error(`Registry owner ${registryOwner} does not match manifest owner ${manifest.owner}`);
  }

  await publicClient.call({
    account: registryOwner,
    to: transaction.to,
    value: transaction.value,
    data: transaction.data,
  });

  const outputWithSimulation = { ...baseOutput, simulation: "passed" };
  if (!shouldSend) {
    console.log(JSON.stringify(outputWithSimulation, null, 2));
    return;
  }

  const rawPrivateKey = process.env.PRIVATE_KEY;
  if (rawPrivateKey === undefined || rawPrivateKey.length === 0) {
    throw new Error("PRIVATE_KEY is required when --send is used");
  }

  const account = privateKeyToAccount(normalizePrivateKey(rawPrivateKey));
  if (getAddress(account.address) !== getAddress(registryOwner)) {
    throw new Error(`PRIVATE_KEY address ${account.address} does not match reputation registry owner ${registryOwner}`);
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
        ...outputWithSimulation,
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

interface HistoryEvent {
  actionHash: Hex;
  evidenceHash: Hex;
  scoreDelta: bigint;
  timestamp: bigint;
}

interface HistoryReadClient {
  readContract(parameters: {
    address: Address;
    abi: typeof REPUTATION_HISTORY_ABI;
    functionName: "eventCountOf" | "eventOf";
    args: [Address] | [Address, bigint];
  }): Promise<unknown>;
}

async function readHistoryEvents(client: HistoryReadClient, history: Address, agent: Address): Promise<HistoryEvent[]> {
  const count = (await client.readContract({
    address: history,
    abi: REPUTATION_HISTORY_ABI,
    functionName: "eventCountOf",
    args: [agent],
  })) as bigint;

  const events: HistoryEvent[] = [];
  for (let eventId = 0n; eventId < count; eventId++) {
    const event = (await client.readContract({
      address: history,
      abi: REPUTATION_HISTORY_ABI,
      functionName: "eventOf",
      args: [agent, eventId],
    })) as readonly [Hex, Hex, bigint, bigint];
    events.push({
      actionHash: event[0],
      evidenceHash: event[1],
      scoreDelta: event[2],
      timestamp: event[3],
    });
  }

  return events;
}

function formatHistoryEvent(event: HistoryEvent) {
  return {
    actionHash: event.actionHash,
    evidenceHash: event.evidenceHash,
    scoreDelta: event.scoreDelta.toString(),
    timestamp: event.timestamp.toString(),
  };
}

function readAddressFlag(name: string): Address | undefined {
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

function validateReputationScoreSyncReport(output: unknown): void {
  const report = requireObject(output, "Reputation score sync report must be an object");
  requireString(report.mode, "Reputation score sync report mode must be a string");
  requireNumber(report.chainId, "Reputation score sync report chainId must be a number");
  requireString(report.registry, "Reputation score sync report registry must be a string");
  requireString(report.history, "Reputation score sync report history must be a string");
  requireString(report.agent, "Reputation score sync report agent must be a string");
  requireString(report.registryOwner, "Reputation score sync report registryOwner must be a string");
  requireString(report.registryScore, "Reputation score sync report registryScore must be a string");
  requireString(report.historyScore, "Reputation score sync report historyScore must be a string");
  requireString(report.syncDelta, "Reputation score sync report syncDelta must be a string");
  requireString(report.eventCount, "Reputation score sync report eventCount must be a string");
  validateTransactionEvidence(report.transaction, "Reputation score sync");
  if (report.simulation !== undefined) requireString(report.simulation, "Reputation score sync simulation must be a string");
  if (report.hash !== undefined) {
    if (report.receipt === undefined) throw new Error("Reputation score sync hash is only valid with a transaction receipt");
    requireString(report.hash, "Reputation score sync hash must be a string");
    validateReceiptEvidence(report.receipt, "Reputation score sync");
    requireString(report.nextScore, "Reputation score sync nextScore must be a string");
  }
}
