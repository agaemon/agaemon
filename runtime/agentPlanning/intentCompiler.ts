import { isAddress } from "viem";
import type { Address } from "viem";

import type { AgentAction } from "../core/action.js";
import type { AgentPlanProposalDocument } from "./planProposal.js";
import {
  requireMockSwapAdapter,
  requireTestErc20Token,
  requireTreasuryPaymentAdapter,
} from "../base/deploymentManifest.js";
import type { DeploymentManifest } from "../base/deploymentManifest.js";
import { createErc20TransferAction } from "../tokens/transfer.js";
import { createSwapExactEthForTokenAction } from "../tokens/swap.js";
import { createTreasuryPaymentAction } from "../payments/treasury.js";

export type AgentIntent = TreasuryPaymentIntent | Erc20TransferIntent | SwapExactEthForTokenIntent;

export interface AgentIntentDocument {
  objective: string;
  intents: AgentIntent[];
}

export interface BaseAgentIntent {
  id: string;
  title: string;
}

export interface TreasuryPaymentIntent extends BaseAgentIntent {
  type: "treasury-payment";
  recipient: Address;
  amountWei: string;
}

export interface Erc20TransferIntent extends BaseAgentIntent {
  type: "erc20-transfer";
  recipient: Address;
  amountRaw: string;
}

export interface SwapExactEthForTokenIntent extends BaseAgentIntent {
  type: "swap-exact-eth-for-token";
  recipient: Address;
  ethInWei: string;
  minAmountOut: string;
}

export interface CreateAgentIntentPlanParams extends AgentIntentDocument {
  manifest: DeploymentManifest;
}

export interface JsonAgentPlanDocument {
  objective: string;
  steps: JsonAgentPlanStep[];
}

export interface JsonAgentPlanStep {
  id: string;
  title: string;
  action: {
    capability: string;
    target: string;
    valueWei: string;
    data: string;
    usesBorrowing: boolean;
  };
}

export function parseAgentIntentDocument(value: unknown): AgentIntentDocument {
  const document = requireRecord(value, "intent document");
  const objective = requireNonEmptyString(document.objective, "objective");
  const rawIntents = document.intents;
  if (!Array.isArray(rawIntents) || rawIntents.length === 0) {
    throw new Error("intents must include at least one intent");
  }

  return {
    objective,
    intents: rawIntents.map((intent, index) => parseIntent(intent, index)),
  };
}

export function createAgentIntentPlan(params: CreateAgentIntentPlanParams): AgentPlanProposalDocument {
  return {
    objective: params.objective,
    steps: params.intents.map((intent) => ({
      id: intent.id,
      title: intent.title,
      action: createIntentAction(params.manifest, intent),
    })),
  };
}

export function formatAgentIntentPlan(plan: AgentPlanProposalDocument): JsonAgentPlanDocument {
  return {
    objective: plan.objective,
    steps: plan.steps.map((step) => ({
      id: step.id,
      title: step.title,
      action: formatAction(step.action),
    })),
  };
}

function parseIntent(value: unknown, index: number): AgentIntent {
  const prefix = `intents[${index}]`;
  const intent = requireRecord(value, prefix);
  const base = {
    id: requireNonEmptyString(intent.id, `${prefix}.id`),
    title: requireNonEmptyString(intent.title, `${prefix}.title`),
  };
  const type = requireNonEmptyString(intent.type, `${prefix}.type`);

  if (type === "treasury-payment") {
    return {
      ...base,
      type,
      recipient: requireAddress(intent.recipient, `${prefix}.recipient`),
      amountWei: requireAmountString(intent.amountWei, `${prefix}.amountWei`),
    };
  }

  if (type === "erc20-transfer") {
    return {
      ...base,
      type,
      recipient: requireAddress(intent.recipient, `${prefix}.recipient`),
      amountRaw: requireAmountString(intent.amountRaw, `${prefix}.amountRaw`),
    };
  }

  if (type === "swap-exact-eth-for-token") {
    return {
      ...base,
      type,
      recipient: requireAddress(intent.recipient, `${prefix}.recipient`),
      ethInWei: requireAmountString(intent.ethInWei, `${prefix}.ethInWei`),
      minAmountOut: requireAmountString(intent.minAmountOut, `${prefix}.minAmountOut`),
    };
  }

  throw new Error(`${prefix}.type is unsupported`);
}

function createIntentAction(manifest: DeploymentManifest, intent: AgentIntent): AgentAction {
  if (intent.type === "treasury-payment") {
    return createTreasuryPaymentAction({
      adapter: requireTreasuryPaymentAdapter(manifest),
      recipient: intent.recipient,
      amountWei: BigInt(intent.amountWei),
    });
  }

  if (intent.type === "erc20-transfer") {
    return createErc20TransferAction({
      token: requireTestErc20Token(manifest),
      recipient: intent.recipient,
      amount: BigInt(intent.amountRaw),
    });
  }

  return createSwapExactEthForTokenAction({
    adapter: requireMockSwapAdapter(manifest),
    tokenOut: requireTestErc20Token(manifest),
    recipient: intent.recipient,
    ethIn: BigInt(intent.ethInWei),
    minAmountOut: BigInt(intent.minAmountOut),
  });
}

function formatAction(action: AgentAction): JsonAgentPlanStep["action"] {
  return {
    capability: action.capability,
    target: action.target,
    valueWei: action.value.toString(),
    data: action.data,
    usesBorrowing: action.usesBorrowing,
  };
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

function requireAddress(value: unknown, field: string): Address {
  if (typeof value !== "string" || !isAddress(value)) {
    throw new Error(`${field} must be an address`);
  }
  return value as Address;
}

function requireAmountString(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${field} must be a non-negative integer string`);
  }
  return value;
}
