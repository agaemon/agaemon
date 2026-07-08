import type { Address, Hex } from "viem";

import { createAction } from "../core/action.js";
import type { AgentAction } from "../core/action.js";
import type { PolicyDecision, SimulatePolicy } from "../core/policy.js";

export const POLICY_FIXTURE_AGENT = "0x0000000000000000000000000000000000000a01" as Address;

export const POLICY_FIXTURE_CAPABILITIES = {
  swap: `0x${"11".repeat(32)}` as Hex,
  payment: `0x${"22".repeat(32)}` as Hex,
  memory: `0x${"33".repeat(32)}` as Hex,
} as const;

export const POLICY_FIXTURE_TARGETS = {
  allowedSwap: "0x0000000000000000000000000000000000000b01" as Address,
  deniedCapability: "0x0000000000000000000000000000000000000b02" as Address,
  payment: "0x0000000000000000000000000000000000000b03" as Address,
  memory: "0x0000000000000000000000000000000000000b04" as Address,
  unknown: "0x0000000000000000000000000000000000000fff" as Address,
} as const;

export const POLICY_DECISION_FIXTURE_IDS = [
  "allowed-swap",
  "denied-capability",
  "denied-borrowing",
  "denied-action-value",
  "allowed-memory",
] as const;

export type PolicyDecisionFixtureId = (typeof POLICY_DECISION_FIXTURE_IDS)[number];
export type PolicyDecisionFixtureKey = string;

export interface PolicyDecisionFixture {
  readonly id: PolicyDecisionFixtureId;
  readonly title: string;
  readonly agent: Address;
  readonly action: AgentAction;
  readonly decision: PolicyDecision;
}

export interface CreatePolicyDecisionFixtureSimulatorParams {
  readonly decisions?: Partial<Record<PolicyDecisionFixtureId, PolicyDecision>>;
  readonly fallbackDecision?: PolicyDecision;
}

export const POLICY_DECISION_FIXTURES: readonly PolicyDecisionFixture[] = [
  {
    id: "allowed-swap",
    title: "Allowed swap action",
    agent: POLICY_FIXTURE_AGENT,
    action: createAction({
      capability: POLICY_FIXTURE_CAPABILITIES.swap,
      target: POLICY_FIXTURE_TARGETS.allowedSwap,
      value: 123n,
      data: "0x1234",
    }),
    decision: { allowed: true, code: "Allowed" },
  },
  {
    id: "denied-capability",
    title: "Denied unknown capability target",
    agent: POLICY_FIXTURE_AGENT,
    action: createAction({
      capability: POLICY_FIXTURE_CAPABILITIES.swap,
      target: POLICY_FIXTURE_TARGETS.deniedCapability,
      data: "0x2222",
    }),
    decision: { allowed: false, code: "CapabilityDenied" },
  },
  {
    id: "denied-borrowing",
    title: "Denied borrowing request",
    agent: POLICY_FIXTURE_AGENT,
    action: createAction({
      capability: POLICY_FIXTURE_CAPABILITIES.payment,
      target: POLICY_FIXTURE_TARGETS.payment,
      value: 5n,
      data: "0x",
      usesBorrowing: true,
    }),
    decision: { allowed: false, code: "BorrowingDenied" },
  },
  {
    id: "denied-action-value",
    title: "Denied action value over policy limit",
    agent: POLICY_FIXTURE_AGENT,
    action: createAction({
      capability: POLICY_FIXTURE_CAPABILITIES.payment,
      target: POLICY_FIXTURE_TARGETS.payment,
      value: 10_000_000_000_000_000n,
      data: "0xabcd",
    }),
    decision: { allowed: false, code: "ActionValueExceeded" },
  },
  {
    id: "allowed-memory",
    title: "Allowed memory commitment",
    agent: POLICY_FIXTURE_AGENT,
    action: createAction({
      capability: POLICY_FIXTURE_CAPABILITIES.memory,
      target: POLICY_FIXTURE_TARGETS.memory,
      data: "0xabcdef",
    }),
    decision: { allowed: true, code: "Allowed" },
  },
];

export function getPolicyDecisionFixture(id: PolicyDecisionFixtureId): PolicyDecisionFixture {
  const fixture = POLICY_DECISION_FIXTURES.find((candidate) => candidate.id === id);
  if (!fixture) throw new Error(`Unknown policy decision fixture: ${id}`);
  return fixture;
}

export function getPolicyDecisionFixtureKey(input: {
  readonly agent: Address;
  readonly action: AgentAction;
}): PolicyDecisionFixtureKey {
  return [
    input.agent.toLowerCase(),
    input.action.capability.toLowerCase(),
    input.action.target.toLowerCase(),
    input.action.value.toString(),
    input.action.data.toLowerCase(),
    input.action.usesBorrowing ? "1" : "0",
  ].join("|");
}

export function createPolicyDecisionFixtureSimulator(
  params: CreatePolicyDecisionFixtureSimulatorParams = {},
): SimulatePolicy {
  const decisionsByKey = new Map<PolicyDecisionFixtureKey, PolicyDecision>();
  for (const fixture of POLICY_DECISION_FIXTURES) {
    const decision = params.decisions?.[fixture.id] ?? fixture.decision;
    decisionsByKey.set(getPolicyDecisionFixtureKey(fixture), clonePolicyDecision(decision));
  }

  const fallbackDecision = clonePolicyDecision(
    params.fallbackDecision ?? { allowed: false, code: "PolicyNotConfigured" },
  );

  return async ({ agent, action }) =>
    clonePolicyDecision(decisionsByKey.get(getPolicyDecisionFixtureKey({ agent, action })) ?? fallbackDecision);
}

function clonePolicyDecision(decision: PolicyDecision): PolicyDecision {
  return {
    allowed: decision.allowed,
    code: decision.code,
  };
}
