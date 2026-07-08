import type { Address, Hex } from "viem";
import { decodeEventLog, getAddress, parseAbiItem } from "viem";

import type { DeploymentManifest, DeploymentManifestContractField } from "../base/deploymentManifest.js";

export const AGENTOS_EVENT_INDEXER_SCHEMA_VERSION = 1;

export interface AgentOsEventIndexLog {
  address: Address;
  topics: [Hex, ...Hex[]];
  data: Hex;
  blockNumber: bigint;
  logIndex: number;
  transactionHash?: Hex | null | undefined;
}

export interface AgentOsEventSpec {
  contract: DeploymentManifestContractField;
  events: readonly string[];
}

export interface CreateAgentOsEventIndexParams {
  manifest: DeploymentManifest;
  manifestPath: string;
  fromBlock: bigint;
  toBlock?: bigint | undefined;
  logs: readonly AgentOsEventIndexLog[];
}

export interface AgentOsIndexedEvent {
  id: string;
  contract: DeploymentManifestContractField;
  address: Address;
  eventName: string;
  blockNumber: string;
  logIndex: number;
  transactionHash: Hex | null;
  args: Record<string, string | boolean | null>;
}

export interface AgentOsEventIndexStoreMetadata {
  path: string;
  sha256: string;
}

export interface AgentOsEconomicEventCount {
  eventCount: number;
}

export interface AgentOsEconomicEventContractCount extends AgentOsEconomicEventCount {
  contract: DeploymentManifestContractField;
}

export interface AgentOsEconomicEventNameCount extends AgentOsEconomicEventCount {
  eventName: string;
}

export interface AgentOsEconomicEventSummary {
  eventCount: number;
  latestBlock: string | null;
  byContract: AgentOsEconomicEventContractCount[];
  byEventName: AgentOsEconomicEventNameCount[];
}

export interface AgentOsEventIndex {
  schemaVersion: typeof AGENTOS_EVENT_INDEXER_SCHEMA_VERSION;
  manifest: {
    path: string;
    network: string;
    chainId: number;
    contracts: Partial<Record<DeploymentManifestContractField, Address>>;
  };
  replay: {
    fromBlock: string;
    toBlock: string | null;
    inputLogCount: number;
    indexedEventCount: number;
  };
  economicEvents: AgentOsEconomicEventSummary;
  events: AgentOsIndexedEvent[];
}

export const ECONOMIC_EVENT_CONTRACTS = [
  "coordinationPayoutReceiptRegistry",
  "payoutRuleAdapter",
  "treasuryPaymentAdapter",
] as const satisfies readonly DeploymentManifestContractField[];

export const KNOWN_AGENTOS_EVENT_SPECS = [
  {
    contract: "agentAccount",
    events: [
      "event Executed(address indexed caller, bytes32 indexed capability, address indexed target, uint256 value, bytes result)",
      "event DelegateSet(address indexed subagent, bool allowed)",
      "event Paused(address indexed caller)",
      "event Unpaused(address indexed caller)",
    ],
  },
  {
    contract: "agentDirectory",
    events: [
      "event AgentRegistered(address indexed agent, bytes32 indexed roleHash, bytes32 metadataURIHash, bool active)",
      "event AgentActiveSet(address indexed agent, bool active)",
    ],
  },
  {
    contract: "memoryRegistry",
    events: [
      "event MemoryCommitted(address indexed agent, bytes32 indexed memoryId, uint256 indexed version, bytes32 merkleRoot, bytes32 contentHash, bytes32 storageURIHash)",
    ],
  },
  {
    contract: "reputationHistory",
    events: [
      "event ReputationEventRecorded(address indexed agent, uint256 indexed eventId, bytes32 indexed actionHash, bytes32 evidenceHash, int256 scoreDelta)",
    ],
  },
  {
    contract: "agentCoordination",
    events: [
      "event AssignmentCreated(uint256 indexed assignmentId, address indexed assigner, address indexed assignee, bytes32 taskHash, bytes32 contextHash)",
      "event AssignmentAccepted(uint256 indexed assignmentId, address indexed acceptedBy)",
      "event AssignmentCompleted(uint256 indexed assignmentId, bytes32 resultHash)",
      "event AssignmentMemoryResultLinked(uint256 indexed assignmentId, bytes32 indexed memoryId, bytes32 merkleRoot)",
      "event AssignmentCancelled(uint256 indexed assignmentId, bytes32 cancellationHash)",
    ],
  },
  {
    contract: "coordinationPayoutReceiptRegistry",
    events: [
      "event CoordinationPayoutReceiptRecorded(address indexed coordination, uint256 indexed assignmentId, address indexed agent, address recipient, uint256 amount, bytes32 payoutTxHash)",
    ],
  },
  {
    contract: "policyEngine",
    events: [
      "event PolicySet(address indexed agent, uint256 maxActionValue, uint256 maxDailyValue, bool allowBorrowing)",
      "event TokenPolicySet(address indexed agent, address indexed token, uint256 maxActionAmount, uint256 maxDailyAmount)",
      "event SwapPolicySet(address indexed agent, address indexed adapter, address indexed tokenOut, uint256 minOutputPerEth)",
      "event ActionRecorded(address indexed agent, uint256 indexed day, uint256 value)",
      "event TokenActionRecorded(address indexed agent, address indexed token, uint256 indexed day, uint256 amount)",
    ],
  },
  {
    contract: "capabilityRegistry",
    events: ["event CapabilitySet(bytes32 indexed capability, address indexed target, bool allowed)"],
  },
  {
    contract: "payoutRuleAdapter",
    events: [
      "event PayoutRuleSet(address indexed agent, address indexed recipient, uint256 maxActionValue, uint256 maxDailyValue, bool enabled)",
      "event PayoutSent(address indexed agent, address indexed recipient, uint256 amount, uint256 indexed day, uint256 dailyAmount)",
    ],
  },
  {
    contract: "treasuryPaymentAdapter",
    events: ["event PaymentForwarded(address indexed agent, address indexed recipient, uint256 amount)"],
  },
  {
    contract: "reputationRegistry",
    events: ["event ReputationAdjusted(address indexed agent, int256 delta, uint256 newScore)"],
  },
] as const satisfies readonly AgentOsEventSpec[];

export function createAgentOsEventIndex(params: CreateAgentOsEventIndexParams): AgentOsEventIndex {
  const contracts = resolveAgentOsEventIndexContracts(params.manifest);
  const specsByAddress = new Map(
    [...contracts.entries()].map(([contract, address]) => [address.toLowerCase(), { contract, address }]),
  );
  const indexedEvents = params.logs
    .map((log) => decodeKnownEvent(log, specsByAddress))
    .filter((event): event is AgentOsIndexedEvent => event !== null)
    .sort(compareIndexedEvents);

  return {
    schemaVersion: AGENTOS_EVENT_INDEXER_SCHEMA_VERSION,
    manifest: {
      path: params.manifestPath,
      network: params.manifest.network,
      chainId: params.manifest.chainId,
      contracts: Object.fromEntries(contracts),
    },
    replay: {
      fromBlock: params.fromBlock.toString(),
      toBlock: params.toBlock?.toString() ?? null,
      inputLogCount: params.logs.length,
      indexedEventCount: indexedEvents.length,
    },
    economicEvents: summarizeAgentOsEconomicEvents(indexedEvents),
    events: indexedEvents,
  };
}

export function summarizeAgentOsEconomicEvents(
  events: readonly AgentOsIndexedEvent[],
): AgentOsEconomicEventSummary {
  const economicContracts = new Set<DeploymentManifestContractField>(ECONOMIC_EVENT_CONTRACTS);
  const economicEvents = events.filter((event) => economicContracts.has(event.contract));
  const byContract = countBy(economicEvents, (event) => event.contract)
    .map(([contract, eventCount]) => ({ contract: contract as DeploymentManifestContractField, eventCount }));
  const byEventName = countBy(economicEvents, (event) => event.eventName)
    .map(([eventName, eventCount]) => ({ eventName, eventCount }));

  return {
    eventCount: economicEvents.length,
    latestBlock: economicEvents.at(-1)?.blockNumber ?? null,
    byContract,
    byEventName,
  };
}

export function resolveAgentOsEventIndexContracts(
  manifest: DeploymentManifest,
): Map<DeploymentManifestContractField, Address> {
  const contracts = new Map<DeploymentManifestContractField, Address>();

  for (const spec of KNOWN_AGENTOS_EVENT_SPECS) {
    const address = manifest.contracts[spec.contract];
    if (address !== undefined) {
      contracts.set(spec.contract, getAddress(address));
    }
  }

  return contracts;
}

function decodeKnownEvent(
  log: AgentOsEventIndexLog,
  specsByAddress: Map<string, { contract: DeploymentManifestContractField; address: Address }>,
): AgentOsIndexedEvent | null {
  const match = specsByAddress.get(log.address.toLowerCase());
  if (match === undefined) return null;

  const spec = KNOWN_AGENTOS_EVENT_SPECS.find((candidate) => candidate.contract === match.contract);
  if (spec === undefined) return null;

  for (const event of spec.events) {
    try {
      const decoded = decodeEventLog({
        abi: [parseAbiItem(event)],
        data: log.data,
        topics: log.topics,
      });

      return {
        id: `${log.blockNumber.toString()}:${log.logIndex}:${log.transactionHash ?? "0x"}`,
        contract: match.contract,
        address: match.address,
        eventName: decoded.eventName,
        blockNumber: log.blockNumber.toString(),
        logIndex: log.logIndex,
        transactionHash: log.transactionHash ?? null,
        args: normalizeDecodedArgs(decoded.args),
      };
    } catch {
      continue;
    }
  }

  return null;
}

function normalizeDecodedArgs(args: unknown): Record<string, string | boolean | null> {
  if (typeof args !== "object" || args === null || Array.isArray(args)) return {};

  return Object.fromEntries(
    Object.entries(args as Record<string, unknown>)
      .filter(([key]) => Number.isNaN(Number(key)))
      .map(([key, value]) => [key, normalizeDecodedArg(value)]),
  );
}

function normalizeDecodedArg(value: unknown): string | boolean | null {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return null;

  return String(value);
}

function compareIndexedEvents(left: AgentOsIndexedEvent, right: AgentOsIndexedEvent): number {
  const blockDelta = BigInt(left.blockNumber) - BigInt(right.blockNumber);
  if (blockDelta < 0n) return -1;
  if (blockDelta > 0n) return 1;
  if (left.logIndex !== right.logIndex) return left.logIndex - right.logIndex;
  return left.id.localeCompare(right.id);
}

function countBy<T>(items: readonly T[], selectKey: (item: T) => string): [string, number][] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = selectKey(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right));
}
