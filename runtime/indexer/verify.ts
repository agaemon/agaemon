import { getAddress } from "viem";

import type { DeploymentManifest, DeploymentManifestContractField } from "../base/deploymentManifest.js";
import {
  AGENTOS_EVENT_INDEXER_SCHEMA_VERSION,
  resolveAgentOsEventIndexContracts,
  summarizeAgentOsEconomicEvents,
} from "./events.js";
import type {
  AgentOsEventIndex,
  AgentOsEventIndexStoreMetadata,
  AgentOsIndexedEvent,
} from "./events.js";

export interface VerifyAgentOsEventIndexParams {
  index: AgentOsEventIndex;
  manifest: DeploymentManifest;
  expectedManifestPath?: string | undefined;
  expectedFromBlock?: bigint | undefined;
  expectedToBlock?: bigint | undefined;
  store?: AgentOsEventIndexStoreMetadata | undefined;
  expectedStoreSha256?: string | undefined;
}

export interface AgentOsEventIndexVerificationCheck {
  id: string;
  passed: boolean;
  failures: string[];
}

export interface AgentOsEventIndexVerification {
  passed: boolean;
  summary: {
    checks: number;
    passed: number;
    failed: number;
  };
  failures: string[];
  checks: AgentOsEventIndexVerificationCheck[];
  store?: AgentOsEventIndexStoreMetadata | undefined;
}

export function verifyAgentOsEventIndex(params: VerifyAgentOsEventIndexParams): AgentOsEventIndexVerification {
  const checks = [
    checkSchemaVersion(params.index),
    checkManifestIdentity(params),
    checkManifestContracts(params.index, params.manifest),
    checkReplayRange(params),
    checkEventCount(params.index),
    checkEventOrder(params.index.events),
    checkEventContracts(params.index, params.manifest),
    checkEconomicEventSummary(params.index),
    ...(params.store === undefined && params.expectedStoreSha256 === undefined
      ? []
      : [checkStoreMetadata(params.store, params.expectedStoreSha256)]),
  ];
  const failures = checks.flatMap((check) => check.failures.map((failure) => `${check.id}: ${failure}`));
  const passedChecks = checks.filter((check) => check.passed).length;

  return {
    passed: failures.length === 0,
    summary: {
      checks: checks.length,
      passed: passedChecks,
      failed: checks.length - passedChecks,
    },
    failures,
    checks,
    ...(params.store === undefined ? {} : { store: params.store }),
  };
}

export function formatAgentOsEventIndexVerificationSummary(report: AgentOsEventIndexVerification): string {
  return [
    "AgentOS event index verification",
    `overall: ${report.passed ? "passed" : "failed"}`,
    `checks: ${report.summary.passed} passed, ${report.summary.failed} failed`,
    ...(report.store === undefined ? [] : [
      `storePath: ${report.store.path}`,
      `storeSha256: ${report.store.sha256}`,
    ]),
    ...report.failures.map((failure) => `- ${failure}`),
  ].join("\n");
}

function checkSchemaVersion(index: AgentOsEventIndex): AgentOsEventIndexVerificationCheck {
  const failures: string[] = [];
  if (index.schemaVersion !== AGENTOS_EVENT_INDEXER_SCHEMA_VERSION) {
    failures.push("schemaVersion is not supported");
  }

  return createCheck("schema-version", failures);
}

function checkManifestIdentity(params: VerifyAgentOsEventIndexParams): AgentOsEventIndexVerificationCheck {
  const failures: string[] = [];
  if (params.expectedManifestPath !== undefined && params.index.manifest.path !== params.expectedManifestPath) {
    failures.push("manifest path does not match expected path");
  }
  if (params.index.manifest.network !== params.manifest.network) {
    failures.push("network does not match deployment manifest");
  }
  if (params.index.manifest.chainId !== params.manifest.chainId) {
    failures.push("chainId does not match deployment manifest");
  }

  return createCheck("manifest-identity", failures);
}

function checkManifestContracts(
  index: AgentOsEventIndex,
  manifest: DeploymentManifest,
): AgentOsEventIndexVerificationCheck {
  const failures: string[] = [];
  const expectedContracts = resolveAgentOsEventIndexContracts(manifest);
  for (const [contract, expected] of expectedContracts) {
    const actual = index.manifest.contracts[contract];
    if (actual === undefined) {
      failures.push(`indexed contract ${contract} is missing`);
      continue;
    }
    if (getAddress(actual) !== expected) {
      failures.push(`indexed contract ${contract} does not match deployment manifest`);
    }
  }

  return createCheck("manifest-contracts", failures);
}

function checkReplayRange(params: VerifyAgentOsEventIndexParams): AgentOsEventIndexVerificationCheck {
  const failures: string[] = [];
  if (params.expectedFromBlock !== undefined && params.index.replay.fromBlock !== params.expectedFromBlock.toString()) {
    failures.push("fromBlock does not match expected replay start");
  }
  if (params.expectedToBlock !== undefined && params.index.replay.toBlock !== params.expectedToBlock.toString()) {
    failures.push("toBlock does not match expected replay end");
  }

  return createCheck("replay-range", failures);
}

function checkEventCount(index: AgentOsEventIndex): AgentOsEventIndexVerificationCheck {
  const failures: string[] = [];
  if (index.replay.indexedEventCount !== index.events.length) {
    failures.push("indexedEventCount does not match events length");
  }

  return createCheck("event-count", failures);
}

function checkEventOrder(events: readonly AgentOsIndexedEvent[]): AgentOsEventIndexVerificationCheck {
  const failures: string[] = [];
  const ids = new Set<string>();
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]!;
    if (ids.has(event.id)) failures.push(`duplicate event id ${event.id}`);
    ids.add(event.id);

    const previous = events[index - 1];
    if (previous !== undefined && compareEventOrder(previous, event) > 0) {
      failures.push("events are not sorted by block, log index, and id");
      break;
    }
  }

  return createCheck("event-order", failures);
}

function checkEventContracts(
  index: AgentOsEventIndex,
  manifest: DeploymentManifest,
): AgentOsEventIndexVerificationCheck {
  const failures: string[] = [];
  const expectedContracts = resolveAgentOsEventIndexContracts(manifest);
  for (const event of index.events) {
    const address = expectedContracts.get(event.contract as DeploymentManifestContractField);
    if (address === undefined) {
      failures.push(`event ${event.id} contract is not indexed by the deployment manifest`);
      continue;
    }
    if (getAddress(event.address) !== address) {
      failures.push(`event ${event.id} address does not match its manifest contract`);
    }
  }

  return createCheck("event-contracts", failures);
}

function checkEconomicEventSummary(index: AgentOsEventIndex): AgentOsEventIndexVerificationCheck {
  const failures: string[] = [];
  const expected = summarizeAgentOsEconomicEvents(index.events);
  if (JSON.stringify(index.economicEvents) !== JSON.stringify(expected)) {
    failures.push("economic event summary does not match indexed events");
  }

  return createCheck("economic-event-summary", failures);
}

function checkStoreMetadata(
  store: AgentOsEventIndexStoreMetadata | undefined,
  expectedSha256: string | undefined,
): AgentOsEventIndexVerificationCheck {
  const failures: string[] = [];
  if (store === undefined) {
    failures.push("index store metadata is missing");
    return createCheck("store-metadata", failures);
  }
  if (store.path.trim().length === 0) failures.push("index store path is required");
  if (!isSha256Hex(store.sha256)) failures.push("index store sha256 must be a lowercase hex sha256");
  if (expectedSha256 !== undefined && !isSha256Hex(expectedSha256)) {
    failures.push("expected index store sha256 must be a lowercase hex sha256");
  }
  if (expectedSha256 !== undefined && store.sha256 !== expectedSha256) {
    failures.push("index store sha256 does not match expected hash");
  }

  return createCheck("store-metadata", failures);
}

function isSha256Hex(value: string): boolean {
  return /^[a-f0-9]{64}$/u.test(value);
}

function createCheck(id: string, failures: string[]): AgentOsEventIndexVerificationCheck {
  return {
    id,
    passed: failures.length === 0,
    failures,
  };
}

function compareEventOrder(left: AgentOsIndexedEvent, right: AgentOsIndexedEvent): number {
  const blockDelta = BigInt(left.blockNumber) - BigInt(right.blockNumber);
  if (blockDelta < 0n) return -1;
  if (blockDelta > 0n) return 1;
  if (left.logIndex !== right.logIndex) return left.logIndex - right.logIndex;
  return left.id.localeCompare(right.id);
}
