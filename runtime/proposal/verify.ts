import { isAddress, isHex } from "viem";

const BASE_SEPOLIA_CHAIN_ID = 84532;

export interface AgentProposalArtifactVerification {
  passed: boolean;
  failures: string[];
  source: "plan" | "intent" | null;
  sourcePath: string | null;
  chainId: number | null;
  executable: boolean | null;
  steps: number;
  transactions: number;
}

export function verifyAgentProposalArtifact(json: string): AgentProposalArtifactVerification {
  let artifact: unknown;
  try {
    artifact = JSON.parse(json);
  } catch (error) {
    return createVerification(["proposal JSON is malformed: " + (error instanceof Error ? error.message : String(error))]);
  }

  if (!isRecord(artifact)) return createVerification(["proposal must be a JSON object"]);

  const failures: string[] = [];
  if (artifact.mode !== "dry-run") failures.push("mode must be dry-run");
  if (artifact.chainId !== BASE_SEPOLIA_CHAIN_ID) failures.push("chainId must be 84532");
  if (!isNonEmptyString(artifact.manifest)) failures.push("manifest must be a non-empty string");
  if (!isNonEmptyString(artifact.objective)) failures.push("objective must be a non-empty string");
  if (!isAddressString(artifact.agent)) failures.push("agent must be an address");
  if (typeof artifact.executable !== "boolean") failures.push("executable must be a boolean");

  const source = parseSource(artifact, failures);
  const steps = Array.isArray(artifact.steps) ? artifact.steps : undefined;
  if (steps === undefined || steps.length === 0) {
    failures.push("steps must include at least one step");
  }

  let allowedDecisionCount = 0;
  let transactionCount = 0;
  steps?.forEach((step, index) => {
    const result = validateStep(step, index, failures);
    if (result.decisionAllowed === true) allowedDecisionCount += 1;
    if (result.hasTransaction) transactionCount += 1;
  });

  if (artifact.executable === true && steps !== undefined) {
    if (allowedDecisionCount !== steps.length) failures.push("executable proposals must only contain allowed decisions");
    if (transactionCount !== steps.length) failures.push("executable proposals must include transaction payloads for every step");
  }

  if (artifact.executable === false && transactionCount > 0) {
    failures.push("non-executable proposals must not expose transaction payloads");
  }

  return {
    passed: failures.length === 0,
    failures,
    source: source.type,
    sourcePath: source.path,
    chainId: typeof artifact.chainId === "number" ? artifact.chainId : null,
    executable: typeof artifact.executable === "boolean" ? artifact.executable : null,
    steps: steps?.length ?? 0,
    transactions: transactionCount,
  };
}

function validateStep(
  value: unknown,
  index: number,
  failures: string[],
): { decisionAllowed: boolean | null; hasTransaction: boolean } {
  const prefix = `steps[${index}]`;
  if (!isRecord(value)) {
    failures.push(`${prefix} must be an object`);
    return { decisionAllowed: null, hasTransaction: false };
  }

  if (!isNonEmptyString(value.id)) failures.push(`${prefix}.id must be a non-empty string`);
  if (!isNonEmptyString(value.title)) failures.push(`${prefix}.title must be a non-empty string`);

  validateAction(value.action, `${prefix}.action`, failures);
  const decisionAllowed = validateDecision(value.decision, `${prefix}.decision`, failures);
  const hasTransaction = validateTransaction(value.transaction, `${prefix}.transaction`, failures);

  return { decisionAllowed, hasTransaction };
}

function validateAction(value: unknown, prefix: string, failures: string[]): void {
  if (!isRecord(value)) {
    failures.push(`${prefix} must be an object`);
    return;
  }

  if (!isBytes32(value.capability)) failures.push(`${prefix}.capability must be a bytes32 hex string`);
  if (!isAddressString(value.target)) failures.push(`${prefix}.target must be an address`);
  if (!isAmountString(value.valueWei)) failures.push(`${prefix}.valueWei must be a non-negative integer string`);
  if (!isHexString(value.data)) failures.push(`${prefix}.data must be hex data`);
  if (typeof value.usesBorrowing !== "boolean") failures.push(`${prefix}.usesBorrowing must be a boolean`);
}

function validateDecision(value: unknown, prefix: string, failures: string[]): boolean | null {
  if (!isRecord(value)) {
    failures.push(`${prefix} must be an object`);
    return null;
  }

  if (typeof value.allowed !== "boolean") failures.push(`${prefix}.allowed must be a boolean`);
  if (!isNonEmptyString(value.code)) failures.push(`${prefix}.code must be a non-empty string`);
  return typeof value.allowed === "boolean" ? value.allowed : null;
}

function validateTransaction(value: unknown, prefix: string, failures: string[]): boolean {
  if (value === null) return false;
  if (!isRecord(value)) {
    failures.push(`${prefix} must be null or an object`);
    return false;
  }

  if (!isAddressString(value.to)) failures.push(`${prefix}.to must be an address`);
  if (!isAmountString(value.value)) failures.push(`${prefix}.value must be a non-negative integer string`);
  if (!isHexString(value.data)) failures.push(`${prefix}.data must be hex data`);
  return true;
}

function parseSource(
  artifact: Record<string, unknown>,
  failures: string[],
): { type: "plan" | "intent" | null; path: string | null } {
  const hasPlan = artifact.plan !== undefined;
  const hasIntent = artifact.intent !== undefined;
  if (hasPlan === hasIntent) {
    failures.push("proposal must include exactly one source path: plan or intent");
    return { type: null, path: null };
  }

  if (hasPlan) {
    if (!isNonEmptyString(artifact.plan)) failures.push("plan must be a non-empty string");
    return { type: "plan", path: isNonEmptyString(artifact.plan) ? artifact.plan : null };
  }

  if (!isNonEmptyString(artifact.intent)) failures.push("intent must be a non-empty string");
  return { type: "intent", path: isNonEmptyString(artifact.intent) ? artifact.intent : null };
}

function createVerification(failures: string[]): AgentProposalArtifactVerification {
  return {
    passed: false,
    failures,
    source: null,
    sourcePath: null,
    chainId: null,
    executable: null,
    steps: 0,
    transactions: 0,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isAddressString(value: unknown): value is string {
  return typeof value === "string" && isAddress(value);
}

function isBytes32(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

function isHexString(value: unknown): value is string {
  return typeof value === "string" && isHex(value);
}

function isAmountString(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value);
}
