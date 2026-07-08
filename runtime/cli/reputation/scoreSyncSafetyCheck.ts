import { readFileSync } from "node:fs";

import { createPublicClient, getAddress, http, isAddress } from "viem";
import type { Address, Hex } from "viem";
import { baseSepolia } from "viem/chains";

import { readDeploymentManifest, requireReputationHistory } from "../../base/deploymentManifest.js";
import { createReputationAdjustTransaction, REPUTATION_REGISTRY_ABI } from "../../reputation/registry.js";
import { createReputationScoreSyncTransaction, sumReputationHistoryScore } from "../../reputation/scoreSync.js";
import { REPUTATION_HISTORY_ABI } from "../../reputation/history.js";
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
const UNAUTHORIZED_CALLER = "0x000000000000000000000000000000000000dEaD";

interface CallClient {
  call(parameters: { account: Address; to: Address; value: bigint; data: Hex }): Promise<unknown>;
}

export interface ReputationScoreSyncSafetyCheckCliArgs {
  manifestPath: string;
  agent?: string | undefined;
}

export type ReputationScoreSyncSafetyCheckCliOptions = ReputationRunnerOptions<ReputationScoreSyncSafetyCheckCliArgs>;

if (isReputationScoreSyncSafetyCheckDirectRun(import.meta.url, process.argv)) {
  await runReputationScoreSyncSafetyCheckCli();
}

export async function runReputationScoreSyncSafetyCheckCli(
  options: ReputationScoreSyncSafetyCheckCliOptions = {},
): Promise<void> {
  await runInjectedOrDefault(
    options,
    parseReputationScoreSyncSafetyCheckCliArgs,
    main,
    validateReputationScoreSyncSafetyReport,
  );
}

export function parseReputationScoreSyncSafetyCheckCliArgs(argv: readonly string[]): ReputationScoreSyncSafetyCheckCliArgs {
  const values = parseValues(argv, ["--manifest", "--agent"]);
  return {
    manifestPath: values.options.get("--manifest") ?? DEFAULT_MANIFEST_PATH,
    agent: values.options.get("--agent"),
  };
}

export function isReputationScoreSyncSafetyCheckDirectRun(moduleUrl: string, argv: readonly string[]): boolean {
  return isDirectRun(moduleUrl, argv);
}

async function main(): Promise<void> {
  loadDotEnv(".env");

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
  const historyOwner = (await publicClient.readContract({
    address: history,
    abi: REPUTATION_HISTORY_ABI,
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
  const syncTransaction = createReputationScoreSyncTransaction({
    registry,
    agent,
    registryScore,
    historyScore,
  });
  const unauthorizedProbe = createReputationAdjustTransaction({
    registry,
    agent,
    delta: 1n,
  });

  const syncCallable =
    syncTransaction === null ? true : await callPasses(publicClient, registryOwner, syncTransaction);
  const unauthorizedAdjustmentDenied = !(await callPasses(publicClient, UNAUTHORIZED_CALLER, unauthorizedProbe));

  const checks = {
    registryOwnerMatchesManifest: getAddress(registryOwner) === getAddress(manifest.owner),
    historyOwnerMatchesManifest: getAddress(historyOwner) === getAddress(manifest.owner),
    registryScoreReadable: registryScore >= 0n,
    historyEventsReadable: historyEvents.length >= 0,
    historyScoreNonNegative: historyScore >= 0n,
    syncCallable,
    unauthorizedAdjustmentDenied,
  };

  console.log(
    JSON.stringify(
      {
        chainId,
        registry,
        history,
        agent,
        registryOwner,
        historyOwner,
        registryScore: registryScore.toString(),
        historyScore: historyScore.toString(),
        syncDelta: (historyScore - registryScore).toString(),
        eventCount: historyEvents.length.toString(),
        latestEvent: historyEvents.length === 0 ? null : formatHistoryEvent(historyEvents[historyEvents.length - 1]!),
        checks,
      },
      null,
      2,
    ),
  );

  if (!Object.values(checks).every(Boolean)) process.exitCode = 1;
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

async function callPasses(client: CallClient, account: Address, transaction: { to: Address; value: bigint; data: Hex }) {
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

function validateReputationScoreSyncSafetyReport(output: unknown): void {
  const report = requireObject(output, "Reputation score sync safety report must be an object");
  requireNumber(report.chainId, "Reputation score sync safety chainId must be a number");
  requireString(report.registry, "Reputation score sync safety registry must be a string");
  requireString(report.history, "Reputation score sync safety history must be a string");
  requireString(report.agent, "Reputation score sync safety agent must be a string");
  requireString(report.registryOwner, "Reputation score sync safety registryOwner must be a string");
  requireString(report.historyOwner, "Reputation score sync safety historyOwner must be a string");
  requireString(report.registryScore, "Reputation score sync safety registryScore must be a string");
  requireString(report.historyScore, "Reputation score sync safety historyScore must be a string");
  requireString(report.syncDelta, "Reputation score sync safety syncDelta must be a string");
  requireString(report.eventCount, "Reputation score sync safety eventCount must be a string");
  validateChecksEvidence(report.checks, "Reputation score sync safety");
}
