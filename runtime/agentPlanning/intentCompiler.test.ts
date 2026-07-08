import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";

import {
  createAgentIntentPlan,
  formatAgentIntentPlan,
  parseAgentIntentDocument,
} from "./intentCompiler.js";
import { parseDeploymentManifest } from "../base/deploymentManifest.js";
import { ERC20_TRANSFER_ABI, ERC20_TRANSFER_CAPABILITY } from "../tokens/transfer.js";
import { SWAP_EXACT_ETH_FOR_TOKEN_ABI, SWAP_EXACT_ETH_FOR_TOKEN_CAPABILITY } from "../tokens/swap.js";
import { PAYMENT_CAPABILITY, TREASURY_PAYMENT_ABI } from "../payments/treasury.js";

const OWNER = "0x0000000000000000000000000000000000000a00";
const AGENT = "0x0000000000000000000000000000000000000a01";
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

const RAW_INTENT_DOCUMENT = {
  objective: "Prepare a policy-gated action batch",
  intents: [
    {
      id: "payment-1",
      title: "Pay the recipient",
      type: "treasury-payment",
      recipient: RECIPIENT,
      amountWei: "100",
    },
    {
      id: "token-1",
      title: "Transfer test token",
      type: "erc20-transfer",
      recipient: RECIPIENT,
      amountRaw: "2500",
    },
    {
      id: "swap-1",
      title: "Swap ETH for test token",
      type: "swap-exact-eth-for-token",
      recipient: RECIPIENT,
      ethInWei: "50",
      minAmountOut: "7",
    },
  ],
};

describe("agent intent compiler", () => {
  it("compiles supported Base Sepolia intents into structured plan actions", () => {
    const document = parseAgentIntentDocument(RAW_INTENT_DOCUMENT);
    const plan = createAgentIntentPlan({ manifest: MANIFEST, ...document });

    expect(plan.objective).toBe("Prepare a policy-gated action batch");
    expect(plan.steps.map((step) => step.id)).toEqual(["payment-1", "token-1", "swap-1"]);

    const payment = plan.steps[0]!;
    const paymentCall = decodeFunctionData({ abi: TREASURY_PAYMENT_ABI, data: payment.action.data });
    expect(payment.action.capability).toBe(PAYMENT_CAPABILITY);
    expect(payment.action.target).toBe(PAYMENT_ADAPTER);
    expect(payment.action.value).toBe(100n);
    expect(paymentCall.functionName).toBe("pay");
    expect(paymentCall.args[0].toLowerCase()).toBe(RECIPIENT.toLowerCase());

    const transfer = plan.steps[1]!;
    const transferCall = decodeFunctionData({ abi: ERC20_TRANSFER_ABI, data: transfer.action.data });
    expect(transfer.action.capability).toBe(ERC20_TRANSFER_CAPABILITY);
    expect(transfer.action.target).toBe(TOKEN);
    expect(transfer.action.value).toBe(0n);
    expect(transferCall.functionName).toBe("transfer");
    expect(transferCall.args[0].toLowerCase()).toBe(RECIPIENT.toLowerCase());
    expect(transferCall.args[1]).toBe(2500n);

    const swap = plan.steps[2]!;
    const swapCall = decodeFunctionData({ abi: SWAP_EXACT_ETH_FOR_TOKEN_ABI, data: swap.action.data });
    expect(swap.action.capability).toBe(SWAP_EXACT_ETH_FOR_TOKEN_CAPABILITY);
    expect(swap.action.target).toBe(SWAP_ADAPTER);
    expect(swap.action.value).toBe(50n);
    expect(swapCall.functionName).toBe("swapExactEthForToken");
    expect(swapCall.args[0].toLowerCase()).toBe(TOKEN.toLowerCase());
    expect(swapCall.args[1].toLowerCase()).toBe(RECIPIENT.toLowerCase());
    expect(swapCall.args[2]).toBe(7n);
  });

  it("renders deterministic JSON-safe structured plan output", () => {
    const plan = createAgentIntentPlan({
      manifest: MANIFEST,
      ...parseAgentIntentDocument(RAW_INTENT_DOCUMENT),
    });

    const formatted = formatAgentIntentPlan(plan);

    expect(formatted.objective).toBe("Prepare a policy-gated action batch");
    expect(formatted.steps[0]).toMatchObject({
      id: "payment-1",
      title: "Pay the recipient",
      action: {
        capability: PAYMENT_CAPABILITY,
        target: PAYMENT_ADAPTER,
        valueWei: "100",
        usesBorrowing: false,
      },
    });
    expect(formatted.steps).toHaveLength(3);
  });

  it("rejects unsupported intent types before compiling actions", () => {
    expect(() =>
      parseAgentIntentDocument({
        objective: "Unsupported",
        intents: [
          {
            id: "borrow-1",
            title: "Borrow funds",
            type: "borrow",
          },
        ],
      }),
    ).toThrow("intents[0].type is unsupported");
  });
});
