import { describe, expect, it } from "vitest";

import { parseAgentIntentDocument } from "./intentCompiler.js";
import { createAgentIntentProposal } from "./intentProposal.js";
import { parseDeploymentManifest } from "../base/deploymentManifest.js";

import type { Address } from "viem";
import type { PolicyDecision } from "../core/policy.js";

const OWNER = "0x0000000000000000000000000000000000000a00";
const AGENT = "0x0000000000000000000000000000000000000a01" as Address;
const PAYMENT_ADAPTER = "0x0000000000000000000000000000000000000a02";
const TOKEN = "0x0000000000000000000000000000000000000e20";
const SWAP_ADAPTER = "0x0000000000000000000000000000000000000a03";
const RECIPIENT = "0x0000000000000000000000000000000000000b01";

const MANIFEST = parseDeploymentManifest({
  network: "base-sepolia",
  chainId: 84532,
  rpcUrlEnv: "BASE_SEPOLIA_RPC_URL",
  explorerUrl: "https://sepolia.basescan.org",
  owner: OWNER,
  contracts: {
    capabilityRegistry: "0x0000000000000000000000000000000000000001",
    policyEngine: "0x0000000000000000000000000000000000000002",
    reputationRegistry: "0x0000000000000000000000000000000000000003",
    agentAccount: AGENT,
    testTargetProtocol: "0x0000000000000000000000000000000000000004",
    treasuryPaymentAdapter: PAYMENT_ADAPTER,
    testErc20Token: TOKEN,
    mockSwapAdapter: SWAP_ADAPTER,
  },
  transactions: {
    deployCapabilityRegistry: `0x${"11".repeat(32)}`,
    deployPolicyEngine: `0x${"22".repeat(32)}`,
    deployReputationRegistry: `0x${"33".repeat(32)}`,
    deployAgentAccount: `0x${"44".repeat(32)}`,
    deployTestTargetProtocol: `0x${"55".repeat(32)}`,
    setCapability: `0x${"66".repeat(32)}`,
    setPolicy: `0x${"77".repeat(32)}`,
    smokeExecute: `0x${"88".repeat(32)}`,
  },
  smokeTest: {
    capability: `0x${"99".repeat(32)}`,
    targetWasCalled: true,
  },
});

describe("createAgentIntentProposal", () => {
  it("compiles an allowed intent into an executable proposal", async () => {
    const document = parseAgentIntentDocument({
      objective: "Pay from an operator intent",
      intents: [
        {
          id: "payment-1",
          title: "Pay the recipient",
          type: "treasury-payment",
          recipient: RECIPIENT,
          amountWei: "100",
        },
      ],
    });
    let simulatedTarget: Address | null = null;

    const proposal = await createAgentIntentProposal({
      manifest: MANIFEST,
      ...document,
      simulatePolicy: async ({ agent, action }): Promise<PolicyDecision> => {
        expect(agent).toBe(AGENT);
        simulatedTarget = action.target;
        return { allowed: true, code: "Allowed" };
      },
    });

    expect(simulatedTarget).toBe(PAYMENT_ADAPTER);
    expect(proposal.objective).toBe("Pay from an operator intent");
    expect(proposal.agent).toBe(AGENT);
    expect(proposal.executable).toBe(true);
    expect(proposal.steps).toHaveLength(1);
    expect(proposal.steps[0]).toMatchObject({
      id: "payment-1",
      title: "Pay the recipient",
      decision: { allowed: true, code: "Allowed" },
    });
    expect(proposal.steps[0]!.transaction?.to).toBe(AGENT);
    expect(proposal.steps[0]!.transaction?.value).toBe(100n);
  });

  it("suppresses all transaction payloads when any compiled intent is denied", async () => {
    const document = parseAgentIntentDocument({
      objective: "Dry-run a mixed intent batch",
      intents: [
        {
          id: "token-1",
          title: "Transfer test token",
          type: "erc20-transfer",
          recipient: RECIPIENT,
          amountRaw: "2500",
        },
        {
          id: "swap-1",
          title: "Swap ETH for token",
          type: "swap-exact-eth-for-token",
          recipient: RECIPIENT,
          ethInWei: "50",
          minAmountOut: "7",
        },
      ],
    });

    const proposal = await createAgentIntentProposal({
      manifest: MANIFEST,
      ...document,
      simulatePolicy: async ({ action }): Promise<PolicyDecision> =>
        action.target === SWAP_ADAPTER
          ? { allowed: false, code: "CapabilityDenied" }
          : { allowed: true, code: "Allowed" },
    });

    expect(proposal.executable).toBe(false);
    expect(proposal.steps.map((step) => step.action.target)).toEqual([TOKEN, SWAP_ADAPTER]);
    expect(proposal.steps.map((step) => step.decision.code)).toEqual(["Allowed", "CapabilityDenied"]);
    expect(proposal.steps.map((step) => step.transaction)).toEqual([null, null]);
  });
});
