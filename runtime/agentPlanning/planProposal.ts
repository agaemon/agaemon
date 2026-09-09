import { isAddress, isHex } from "viem";
import type { Address, Hex } from "viem";

import { createAction } from "../core/action.js";
import type { AgentAction } from "../core/action.js";
import { buildExecuteTransaction } from "../transactions/builder.js";
import type { ExecuteTransaction } from "../transactions/builder.js";
import type { PolicyDecision, SimulatePolicy } from "../core/policy.js";

export interface AgentPlanProposalDocument {
  objective: string;
  steps: AgentPlanStepIntent[];
}

export interface AgentPlanStepIntent {
  id: string;
  title: string;
  action: AgentAction;
}

export interface CreateAgentPlanProposalParams extends AgentPlanProposalDocument {
  agent: Address;
  simulatePolicy: SimulatePolicy;
}

export type AgentPlanValidationStatus =
  | "single-step-policy-allowed"
  | "policy-denied"
  | "sequence-unverified";

export interface AgentPlanProposal {
  objective: string;
  agent: Address;
  executable: boolean;
  validationStatus: AgentPlanValidationStatus;
  steps: AgentPlanProposalStep[];
}

export interface AgentPlanProposalStep extends AgentPlanStepIntent {
  decision: PolicyDecision;
  transaction: ExecuteTransaction | null;
}

export function parseAgentPlanProposalDocument(value: unknown): AgentPlanProposalDocument {
  const document = requireRecord(value, "plan");
  const objective = requireNonEmptyString(document.objective, "objective");
  const rawSteps = document.steps;
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
    throw new Error("steps must include at least one step");
  }

  return {
    objective,
    steps: rawSteps.map((step, index) => parseStep(step, index)),
  };
}

export async function createAgentPlanProposal(
  params: CreateAgentPlanProposalParams,
): Promise<AgentPlanProposal> {
  if (params.steps.length === 0) throw new Error("steps must include at least one step");

  const preliminarySteps: AgentPlanProposalStep[] = [];
  for (const step of params.steps) {
    const result = await buildExecuteTransaction({
      agent: params.agent,
      action: step.action,
      simulatePolicy: params.simulatePolicy,
    });
    preliminarySteps.push({
      ...step,
      decision: result.decision,
      transaction: result.transaction,
    });
  }

  const allStepsAllowed = preliminarySteps.every((step) => step.decision.allowed);
  const validationStatus: AgentPlanValidationStatus = !allStepsAllowed
    ? "policy-denied"
    : preliminarySteps.length > 1 ? "sequence-unverified" : "single-step-policy-allowed";
  const executable = validationStatus === "single-step-policy-allowed";
  return {
    objective: params.objective,
    agent: params.agent,
    executable,
    validationStatus,
    steps: executable
      ? preliminarySteps
      : preliminarySteps.map((step) => ({
          ...step,
          transaction: null,
        })),
  };
}

function parseStep(value: unknown, index: number): AgentPlanStepIntent {
  const step = requireRecord(value, `steps[${index}]`);
  return {
    id: requireNonEmptyString(step.id, `steps[${index}].id`),
    title: requireNonEmptyString(step.title, `steps[${index}].title`),
    action: parseAction(step.action, `steps[${index}].action`),
  };
}

function parseAction(value: unknown, prefix: string): AgentAction {
  const action = requireRecord(value, prefix);
  const capability = requireBytes32(action.capability, `${prefix}.capability`);
  const target = requireAddress(action.target, `${prefix}.target`);
  const data = action.data === undefined ? "0x" : requireHex(action.data, `${prefix}.data`);
  const valueWei = action.valueWei === undefined ? 0n : parseValueWei(action.valueWei, `${prefix}.valueWei`);
  const usesBorrowing =
    action.usesBorrowing === undefined ? false : requireBoolean(action.usesBorrowing, `${prefix}.usesBorrowing`);

  return createAction({
    capability,
    target,
    value: valueWei,
    data,
    usesBorrowing,
  });
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

function requireBytes32(value: unknown, field: string): Hex {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${field} must be a bytes32 hex string`);
  }
  return value as Hex;
}

function requireHex(value: unknown, field: string): Hex {
  if (typeof value !== "string" || !isHex(value)) {
    throw new Error(`${field} must be hex data`);
  }
  return value as Hex;
}

function parseValueWei(value: unknown, field: string): bigint {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${field} must be a non-negative integer string`);
  }
  return BigInt(value);
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${field} must be a boolean`);
  }
  return value;
}
