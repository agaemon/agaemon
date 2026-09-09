import { describe, expect, it } from "vitest";

import { parseDeploymentManifest } from "../base/deploymentManifest.js";
import { createAgentOsIntentWorkflowPackage } from "./intentWorkflow.js";

import type { Address } from "viem";
import type { PolicyDecision } from "../core/policy.js";

const OWNER = "0x0000000000000000000000000000000000000a00";
const AGENT = "0x0000000000000000000000000000000000000a01" as Address;
const PAYMENT_ADAPTER = "0x0000000000000000000000000000000000000a02" as Address;
const TOKEN = "0x0000000000000000000000000000000000000e20" as Address;
const SWAP_ADAPTER = "0x0000000000000000000000000000000000000a03" as Address;
const RECIPIENT = "0x0000000000000000000000000000000000000b01" as Address;
const REVIEWER = "0x0000000000000000000000000000000000000c01";
const GENERATED_AT = "2026-07-03T12:00:00.000Z";

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

const PATHS = {
  deploymentManifestPath: "deployments/base-sepolia/latest.json",
  intentPath: "artifacts/sdk/example-agent-intents.json",
  proposalPath: "artifacts/sdk/example-agent-intent-proposal.json",
  summaryPath: "artifacts/sdk/example-agent-intent-proposal.md",
  reviewManifestPath: "artifacts/sdk/example-agent-intent-proposal-review.json",
  approvalPath: "artifacts/sdk/example-agent-intent-proposal-approval.json",
  bundlePath: "artifacts/sdk/example-agent-intent-proposal-execution-bundle.json",
  previewPath: "artifacts/sdk/example-agent-intent-proposal-execution-preview.json",
  runbookPath: "artifacts/sdk/example-agent-intent-proposal-execution-runbook.md",
  executionManifestPath: "artifacts/sdk/example-agent-intent-proposal-execution-manifest.json",
};

describe("createAgentOsIntentWorkflowPackage", () => {
  it("retains multi-step diagnostics but blocks approved execution handoff", async () => {
    const result = await createAgentOsIntentWorkflowPackage({
      ...PATHS,
      manifest: MANIFEST,
      objective: "Review independently allowed steps",
      intents: [1, 2].map((id) => ({
        id: `payment-${id}`, title: "Pay recipient", type: "treasury-payment" as const,
        recipient: RECIPIENT, amountWei: "10",
      })),
      simulatePolicy: async (): Promise<PolicyDecision> => ({ allowed: true, code: "Allowed" }),
      reviewer: REVIEWER,
      decision: "approved",
      generatedAt: GENERATED_AT,
    });
    expect(result.proposal.validationStatus).toBe("sequence-unverified");
    expect(result.proposal.steps.map((step) => step.decision.allowed)).toEqual([true, true]);
    expect(result.proposalArtifact.output.validationStatus).toBe("sequence-unverified");
    expect(result.proposalArtifact.output.steps.map((step) => step.transaction)).toEqual([null, null]);
    expect(result.workflow.reviewPackage.passed).toBe(true);
    expect(result.workflow.files.summary.markdown).toContain("Sequence execution, cumulative limits, and step dependencies are unverified");
    expect(result.passed).toBe(false);
    expect(result.workflow.executionBundle).toBeNull();
    expect(result.workflow.executionHandoff).toBeNull();
  });

  it("compiles allowed typed intents and packages local execution handoff evidence", async () => {
    const result = await createAgentOsIntentWorkflowPackage({
      ...PATHS,
      manifest: MANIFEST,
      objective: "Pay from an SDK intent",
      intents: [
        {
          id: "payment-1",
          title: "Pay recipient",
          type: "treasury-payment",
          recipient: RECIPIENT,
          amountWei: "100",
        },
      ],
      simulatePolicy: async ({ agent, action }): Promise<PolicyDecision> => {
        expect(agent).toBe(AGENT);
        expect(action.target).toBe(PAYMENT_ADAPTER);
        return { allowed: true, code: "Allowed" };
      },
      reviewer: REVIEWER,
      decision: "approved",
      generatedAt: GENERATED_AT,
    });

    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.proposal.executable).toBe(true);
    expect(result.proposalArtifact.output.intent).toBe(PATHS.intentPath);
    expect(result.proposalArtifact.output.manifest).toBe(PATHS.deploymentManifestPath);
    expect(JSON.parse(result.proposalArtifact.json).steps[0].transaction).not.toBeNull();
    expect(result.workflow.executionHandoff?.passed).toBe(true);
    expect(JSON.parse(result.workflow.files.executionManifest.json).preflight.passed).toBe(true);
  });

  it("keeps denied compiled intents reviewable without execution handoff evidence", async () => {
    const result = await createAgentOsIntentWorkflowPackage({
      ...PATHS,
      manifest: MANIFEST,
      objective: "Dry-run a mixed SDK intent batch",
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
      simulatePolicy: async ({ action }): Promise<PolicyDecision> =>
        action.target === SWAP_ADAPTER
          ? { allowed: false, code: "CapabilityDenied" }
          : { allowed: true, code: "Allowed" },
      reviewer: REVIEWER,
      decision: "rejected",
      generatedAt: GENERATED_AT,
    });

    expect(result.passed).toBe(true);
    expect(result.proposal.executable).toBe(false);
    expect(result.proposal.steps.map((step) => step.action.target)).toEqual([TOKEN, SWAP_ADAPTER]);
    expect(JSON.parse(result.proposalArtifact.json).steps.map((step: { transaction: unknown }) => step.transaction))
      .toEqual([null, null]);
    expect(result.workflow.approval?.approval?.decision).toBe("rejected");
    expect(result.workflow.executionBundle).toBeNull();
    expect(result.workflow.executionHandoff).toBeNull();
  });

  it("fails approved denied typed intents before execution evidence is created", async () => {
    const result = await createAgentOsIntentWorkflowPackage({
      ...PATHS,
      manifest: MANIFEST,
      objective: "Try to approve a denied SDK intent",
      intents: [
        {
          id: "payment-1",
          title: "Pay recipient",
          type: "treasury-payment",
          recipient: RECIPIENT,
          amountWei: "100",
        },
      ],
      simulatePolicy: async (): Promise<PolicyDecision> => ({
        allowed: false,
        code: "CapabilityDenied",
      }),
      reviewer: REVIEWER,
      decision: "approved",
      generatedAt: GENERATED_AT,
    });

    expect(result.passed).toBe(false);
    expect(result.failures).toEqual([
      "approved review packages must be executable",
      "approved review packages must include at least one transaction",
    ]);
    expect(result.workflow.executionBundle).toBeNull();
    expect(result.workflow.executionHandoff).toBeNull();
  });
});
