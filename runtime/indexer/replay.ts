import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";

import type { Address, Hex } from "viem";

import type { DeploymentManifest } from "../base/deploymentManifest.js";
import {
  createAgentOsEventIndex,
  resolveAgentOsEventIndexContracts,
} from "./events.js";
import type {
  AgentOsEventIndex,
  AgentOsEventIndexStoreMetadata,
  AgentOsEventIndexLog,
} from "./events.js";

export interface AgentOsEventIndexLogQuery {
  address: readonly Address[];
  fromBlock: bigint;
  toBlock?: bigint | undefined;
}

export interface AgentOsEventIndexLogClient {
  getBlockNumber?: (() => Promise<bigint>) | undefined;
  getLogs(query: AgentOsEventIndexLogQuery): Promise<readonly AgentOsEventIndexLog[]>;
}

export interface ReplayAgentOsEventIndexParams {
  manifest: DeploymentManifest;
  manifestPath: string;
  fromBlock: bigint;
  toBlock?: bigint | undefined;
  maxBlockRange?: bigint | undefined;
  client: AgentOsEventIndexLogClient;
}

export interface WriteAgentOsEventIndexParams {
  path: string;
  index: AgentOsEventIndex;
  writeText?: (path: string, contents: string) => Promise<void>;
  mkdirp?: (path: string) => Promise<void>;
}

export async function replayAgentOsEventIndex(params: ReplayAgentOsEventIndexParams): Promise<AgentOsEventIndex> {
  const address = [...resolveAgentOsEventIndexContracts(params.manifest).values()];
  const logs = address.length === 0 ? [] : await readLogsInRanges({
    client: params.client,
    address,
    fromBlock: params.fromBlock,
    ...(params.toBlock === undefined ? {} : { toBlock: params.toBlock }),
    ...(params.maxBlockRange === undefined ? {} : { maxBlockRange: params.maxBlockRange }),
  });

  return createAgentOsEventIndex({
    manifest: params.manifest,
    manifestPath: params.manifestPath,
    fromBlock: params.fromBlock,
    ...(params.toBlock === undefined ? {} : { toBlock: params.toBlock }),
    logs,
  });
}

async function readLogsInRanges(params: {
  client: AgentOsEventIndexLogClient;
  address: readonly Address[];
  fromBlock: bigint;
  toBlock?: bigint | undefined;
  maxBlockRange?: bigint | undefined;
}): Promise<readonly AgentOsEventIndexLog[]> {
  const maxBlockRange = params.maxBlockRange ?? 10n;
  if (maxBlockRange <= 0n) throw new Error("event index maxBlockRange must be positive");
  const toBlock = params.toBlock ?? (params.client.getBlockNumber === undefined ? undefined : await params.client.getBlockNumber());
  if (toBlock === undefined) {
    return params.client.getLogs({
      address: params.address,
      fromBlock: params.fromBlock,
    });
  }

  const logs: AgentOsEventIndexLog[] = [];
  let fromBlock = params.fromBlock;
  while (fromBlock <= toBlock) {
    const rangeToBlock = minBigInt(toBlock, fromBlock + maxBlockRange - 1n);
    logs.push(...await params.client.getLogs({
      address: params.address,
      fromBlock,
      toBlock: rangeToBlock,
    }));
    fromBlock = rangeToBlock + 1n;
  }
  return logs;
}

function minBigInt(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

export async function writeAgentOsEventIndex(
  params: WriteAgentOsEventIndexParams,
): Promise<AgentOsEventIndexStoreMetadata> {
  const writeText = params.writeText ?? writeFile;
  const mkdirp = params.mkdirp ?? ((path: string) => mkdir(path, { recursive: true }));
  const contents = `${JSON.stringify(params.index, null, 2)}\n`;

  await mkdirp(dirname(params.path));
  await writeText(params.path, contents);
  return {
    path: params.path,
    sha256: createHash("sha256").update(contents).digest("hex"),
  };
}

export function formatAgentOsEventIndexSummary(
  index: AgentOsEventIndex,
  store?: AgentOsEventIndexStoreMetadata | undefined,
): string {
  return [
    "AgentOS event index",
    `network: ${index.manifest.network}`,
    `chainId: ${index.manifest.chainId}`,
    `manifest: ${index.manifest.path}`,
    `fromBlock: ${index.replay.fromBlock}`,
    `toBlock: ${index.replay.toBlock ?? "latest"}`,
    `inputLogs: ${index.replay.inputLogCount}`,
    `indexedEvents: ${index.replay.indexedEventCount}`,
    `economicEvents: ${index.economicEvents.eventCount}`,
    ...(store === undefined ? [] : [
      `storePath: ${store.path}`,
      `storeSha256: ${store.sha256}`,
    ]),
  ].join("\n");
}

export function createAgentOsEventIndexPublicClient(rpcUrl: string): AgentOsEventIndexLogClient {
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  });

  return {
    async getBlockNumber() {
      return publicClient.getBlockNumber();
    },
    async getLogs(query) {
      const logs = await publicClient.getLogs({
        address: [...query.address],
        fromBlock: query.fromBlock,
        ...(query.toBlock === undefined ? {} : { toBlock: query.toBlock }),
      });

      return logs.map((log) => ({
        address: log.address,
        topics: normalizeTopics(log.topics),
        data: log.data,
        blockNumber: requireBigInt(log.blockNumber, "blockNumber"),
        logIndex: requireNumber(log.logIndex, "logIndex"),
        transactionHash: log.transactionHash,
      }));
    },
  };
}

function normalizeTopics(topics: readonly Hex[]): [Hex, ...Hex[]] {
  const [signature, ...args] = topics;
  if (signature === undefined) throw new Error("event log topic signature is required");

  return [signature, ...args];
}

function requireBigInt(value: bigint | null, field: string): bigint {
  if (value === null) throw new Error(`event log ${field} is required`);

  return value;
}

function requireNumber(value: number | null, field: string): number {
  if (value === null) throw new Error(`event log ${field} is required`);

  return value;
}
