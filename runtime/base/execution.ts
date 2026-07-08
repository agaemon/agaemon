import type { Address, Hex } from "viem";

import { createAction } from "../core/action.js";
import type { AgentAction } from "../core/action.js";
import { POLICY_DECISION_CODES } from "../core/policy.js";
import type { PolicyDecision, SimulatePolicy } from "../core/policy.js";
import type { DeploymentManifest } from "./deploymentManifest.js";

export const TEST_TARGET_MARK_SELECTOR = "0x8c0d0c29" as const;

const POLICY_ENGINE_ABI = [
  {
    type: "function",
    name: "checkAction",
    stateMutability: "view",
    inputs: [
      { name: "agent", type: "address" },
      {
        name: "action",
        type: "tuple",
        components: [
          { name: "capability", type: "bytes32" },
          { name: "target", type: "address" },
          { name: "value", type: "uint256" },
          { name: "data", type: "bytes" },
          { name: "usesBorrowing", type: "bool" },
        ],
      },
    ],
    outputs: [
      { name: "allowed", type: "bool" },
      { name: "code", type: "uint8" },
    ],
  },
] as const;

interface PolicyReadClient {
  readContract(parameters: {
    address: Address;
    abi: typeof POLICY_ENGINE_ABI;
    functionName: "checkAction";
    args: readonly [Address, AgentAction];
  }): Promise<unknown>;
}

export function createSmokeTestAction(manifest: DeploymentManifest): AgentAction {
  return createAction({
    capability: manifest.smokeTest.capability,
    target: manifest.contracts.testTargetProtocol,
    data: TEST_TARGET_MARK_SELECTOR,
  });
}

export function policyDecisionFromCode(code: number): PolicyDecision {
  if (!Number.isFinite(code) || !Number.isInteger(code) || code < 0 || code > 255) {
    throw new Error(`Invalid policy decision code: ${code}`);
  }

  const decisionCode = POLICY_DECISION_CODES[code];
  if (decisionCode === undefined) {
    throw new Error(`Unknown policy decision code: ${code}`);
  }

  return {
    allowed: decisionCode === "Allowed",
    code: decisionCode,
  };
}

export function normalizePrivateKey(value: string): Hex {
  const trimmedValue = value.trim();
  const key = trimmedValue.startsWith("0x") || trimmedValue.startsWith("0X") ? `0x${trimmedValue.slice(2)}` : `0x${trimmedValue}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error("PRIVATE_KEY must be a 32-byte hex string");
  }

  return key.toLowerCase() as Hex;
}

export function createOnChainPolicySimulator(client: PolicyReadClient, manifest: DeploymentManifest): SimulatePolicy {
  return async ({ agent, action }: { agent: Address; action: AgentAction }) => {
    const [allowed, code] = parsePolicyResponse(await client.readContract({
      address: manifest.contracts.policyEngine,
      abi: POLICY_ENGINE_ABI,
      functionName: "checkAction",
      args: [agent, action],
    }));

    const decision = policyDecisionFromCode(code);
    if (allowed !== decision.allowed) {
      throw new Error(`Policy decision mismatch: contract allowed=${allowed} but code ${decision.code} allows=${decision.allowed}`);
    }

    return decision;
  };
}

function parsePolicyResponse(response: unknown): readonly [boolean, number] {
  if (
    !Array.isArray(response) ||
    response.length !== 2 ||
    typeof response[0] !== "boolean" ||
    typeof response[1] !== "number" ||
    !Number.isFinite(response[1]) ||
    !Number.isInteger(response[1]) ||
    response[1] < 0 ||
    response[1] > 255
  ) {
    throw new Error("Invalid policy response");
  }

  return [response[0], response[1]];
}
