import {
  createAgentOsCoordinationLifecyclePlanExample,
  createAgentOsErc20TransferIntentExample,
  createAgentOsMemoryCommitPlanExample,
  createAgentOsReputationScoreSyncExample,
  createAgentOsSwapIntentExample,
  createAgentOsTreasuryPaymentIntentExample,
} from "./examples.js";

export type AgentOsSdkExampleKind = "intent" | "plan" | "owner-transaction";

export interface AgentOsSdkExampleCatalogTrustBoundary {
  ai: "proposes";
  policy: "decides";
  accounts: "execute";
  callClass: "local-only";
  mainnet: false;
  liveFunds: false;
}

export interface AgentOsSdkExampleCatalogEntry {
  id: string;
  title: string;
  kind: AgentOsSdkExampleKind;
  callClass: "local-only";
  artifact: unknown;
}

export interface AgentOsSdkExampleCatalog {
  schemaVersion: 1;
  generatedAt: string;
  chainId: 84532;
  trustBoundary: AgentOsSdkExampleCatalogTrustBoundary;
  examples: AgentOsSdkExampleCatalogEntry[];
}

export interface CreateAgentOsSdkExampleCatalogParams {
  generatedAt?: string | undefined;
}

export interface VerifyAgentOsSdkExampleCatalogParams {
  catalog: AgentOsSdkExampleCatalog;
}

export interface AgentOsSdkExampleCatalogVerification {
  passed: boolean;
  failures: string[];
  expected: AgentOsSdkExampleCatalog;
}

const RECIPIENT = "0x0000000000000000000000000000000000000b01";
const AGENT = "0x0000000000000000000000000000000000000a01";
const MEMORY_REGISTRY = "0x0000000000000000000000000000000000000c01";
const REPUTATION_REGISTRY = "0x0000000000000000000000000000000000000c02";
const COORDINATION = "0x0000000000000000000000000000000000000c03";

export function createAgentOsSdkExampleCatalog(
  params: CreateAgentOsSdkExampleCatalogParams = {},
): AgentOsSdkExampleCatalog {
  const generatedAt = params.generatedAt ?? new Date().toISOString();

  return {
    schemaVersion: 1,
    generatedAt,
    chainId: 84532,
    trustBoundary: createTrustBoundary(),
    examples: [
      createCatalogEntry({
        id: "treasury-payment-intent",
        title: "Treasury payment intent",
        kind: "intent",
        artifact: createAgentOsTreasuryPaymentIntentExample({
          recipient: RECIPIENT,
          amountWei: "100",
        }),
      }),
      createCatalogEntry({
        id: "erc20-transfer-intent",
        title: "ERC20 transfer intent",
        kind: "intent",
        artifact: createAgentOsErc20TransferIntentExample({
          recipient: RECIPIENT,
          amountRaw: "2500",
        }),
      }),
      createCatalogEntry({
        id: "swap-exact-eth-for-token-intent",
        title: "Swap exact ETH for token intent",
        kind: "intent",
        artifact: createAgentOsSwapIntentExample({
          recipient: RECIPIENT,
          ethInWei: "50",
          minAmountOut: "7",
        }),
      }),
      createCatalogEntry({
        id: "memory-commit-plan",
        title: "Memory commit plan",
        kind: "plan",
        artifact: createAgentOsMemoryCommitPlanExample({
          registry: MEMORY_REGISTRY,
          memoryIdLabel: "agentos.memory.demo",
          content: "AgentOS memory commitment demo",
          storageURI: "memory://local/demo",
        }),
      }),
      createCatalogEntry({
        id: "reputation-score-sync",
        title: "Reputation score sync",
        kind: "owner-transaction",
        artifact: createAgentOsReputationScoreSyncExample({
          registry: REPUTATION_REGISTRY,
          agent: AGENT,
          registryScore: 1n,
          historyDeltas: [2n, 3n],
        }),
      }),
      createCatalogEntry({
        id: "coordination-lifecycle-plan",
        title: "Coordination lifecycle plan",
        kind: "plan",
        artifact: createAgentOsCoordinationLifecyclePlanExample({
          coordination: COORDINATION,
          assignmentId: 7n,
          resultURI: "memory://local/coordination-result",
        }),
      }),
    ],
  };
}

export function verifyAgentOsSdkExampleCatalog(
  params: VerifyAgentOsSdkExampleCatalogParams,
): AgentOsSdkExampleCatalogVerification {
  validateAgentOsSdkExampleCatalog(params.catalog);
  const expected = createAgentOsSdkExampleCatalog({ generatedAt: params.catalog.generatedAt });
  const failures = sameStableCatalog(params.catalog, expected) ? [] : ["SDK example catalog is stale"];

  return {
    passed: failures.length === 0,
    failures,
    expected,
  };
}

export function formatAgentOsSdkExampleCatalogSummary(catalog: AgentOsSdkExampleCatalog): string {
  validateAgentOsSdkExampleCatalog(catalog);
  return [
    "AgentOS SDK example catalog",
    `chainId: ${catalog.chainId}`,
    `examples: ${catalog.examples.length}`,
    `callClass: ${catalog.trustBoundary.callClass}`,
    `trustBoundary: AI ${catalog.trustBoundary.ai}, policy ${catalog.trustBoundary.policy}, accounts ${catalog.trustBoundary.accounts}`,
    "mainnet: false",
    "liveFunds: false",
  ].join("\n");
}

export function formatAgentOsSdkExampleCatalogVerificationSummary(
  report: AgentOsSdkExampleCatalogVerification,
): string {
  validateAgentOsSdkExampleCatalogVerification(report);
  return [
    "AgentOS SDK example catalog verification",
    `passed: ${report.passed}`,
    `failures: ${report.failures.length}`,
    ...report.failures.map((failure) => `- ${failure}`),
  ].join("\n");
}

export function validateAgentOsSdkExampleCatalog(catalog: unknown): asserts catalog is AgentOsSdkExampleCatalog {
  const record = requireRecord(catalog, "SDK example catalog");
  if (record.schemaVersion !== 1) throw new Error("SDK example catalog schemaVersion must be 1");
  if (typeof record.generatedAt !== "string") {
    throw new Error("SDK example catalog generatedAt must be a string");
  }
  if (record.chainId !== 84532) throw new Error("SDK example catalog chainId must be 84532");
  validateTrustBoundary(record.trustBoundary);
  if (!Array.isArray(record.examples)) throw new Error("SDK example catalog examples must be an array");
  record.examples.forEach(validateCatalogEntry);
}

export function validateAgentOsSdkExampleCatalogVerification(
  report: unknown,
): asserts report is AgentOsSdkExampleCatalogVerification {
  const record = requireRecord(report, "SDK example catalog verification");
  if (typeof record.passed !== "boolean") throw new Error("SDK example catalog verification passed must be a boolean");
  if (!Array.isArray(record.failures) || record.failures.some((failure) => typeof failure !== "string")) {
    throw new Error("SDK example catalog verification failures must be an array of strings");
  }
  validateAgentOsSdkExampleCatalog(record.expected);
}

function createCatalogEntry(params: {
  id: string;
  title: string;
  kind: AgentOsSdkExampleKind;
  artifact: unknown;
}): AgentOsSdkExampleCatalogEntry {
  return {
    id: params.id,
    title: params.title,
    kind: params.kind,
    callClass: "local-only",
    artifact: toJsonSafe(params.artifact),
  };
}

function createTrustBoundary(): AgentOsSdkExampleCatalogTrustBoundary {
  return {
    ai: "proposes",
    policy: "decides",
    accounts: "execute",
    callClass: "local-only",
    mainnet: false,
    liveFunds: false,
  };
}

function sameStableCatalog(left: AgentOsSdkExampleCatalog, right: AgentOsSdkExampleCatalog): boolean {
  return JSON.stringify(withoutGeneratedAt(left), null, 2) === JSON.stringify(withoutGeneratedAt(right), null, 2);
}

function withoutGeneratedAt(catalog: AgentOsSdkExampleCatalog): Omit<AgentOsSdkExampleCatalog, "generatedAt"> {
  const { generatedAt: _generatedAt, ...rest } = catalog;
  return rest;
}

function toJsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map((item) => toJsonSafe(item));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, toJsonSafe(nested)]),
    );
  }
  return value;
}

function validateCatalogEntry(entry: unknown, index: number): void {
  const record = requireRecord(entry, `SDK example catalog entry ${index}`);
  validateText(record.id, `SDK example catalog entry ${index} id`);
  validateText(record.title, `SDK example catalog entry ${index} title`);
  if (record.kind !== "intent" && record.kind !== "plan" && record.kind !== "owner-transaction") {
    throw new Error(`SDK example catalog entry ${index} kind must be intent, plan, or owner-transaction`);
  }
  if (record.callClass !== "local-only") {
    throw new Error(`SDK example catalog entry ${index} callClass must be local-only`);
  }
  if (record.artifact === undefined) throw new Error(`SDK example catalog entry ${index} artifact is required`);
}

function validateTrustBoundary(value: unknown): asserts value is AgentOsSdkExampleCatalogTrustBoundary {
  const record = requireRecord(value, "SDK example catalog trustBoundary");
  if (record.ai !== "proposes") throw new Error("SDK example catalog trustBoundary ai must be proposes");
  if (record.policy !== "decides") throw new Error("SDK example catalog trustBoundary policy must be decides");
  if (record.accounts !== "execute") throw new Error("SDK example catalog trustBoundary accounts must be execute");
  if (record.callClass !== "local-only") throw new Error("SDK example catalog trustBoundary callClass must be local-only");
  if (record.mainnet !== false) throw new Error("SDK example catalog trustBoundary mainnet must be false");
  if (record.liveFunds !== false) throw new Error("SDK example catalog trustBoundary liveFunds must be false");
}

function validateText(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}
