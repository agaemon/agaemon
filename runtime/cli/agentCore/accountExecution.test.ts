import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BaseError, ContractFunctionRevertedError, decodeFunctionData, encodeErrorResult } from "viem";

import { AGENT_ACCOUNT_ABI, AGENT_ACCOUNT_REVOCATION_CHECKS } from "../../agentCore/account.js";
import { runAgentAccountCli, parseAgentAccountCliArgs } from "./account.js";
import { runAgentAccountSafetyCheckCli } from "./accountSafetyCheck.js";

const mocks = vi.hoisted(() => ({
  readContract: vi.fn(), getChainId: vi.fn(), call: vi.fn(), simulateContract: vi.fn(),
  waitForTransactionReceipt: vi.fn(), sendTransaction: vi.fn(), createWalletClient: vi.fn(),
  privateKeyToAccount: vi.fn(), readManifest: vi.fn(),
}));
vi.mock("viem", async (importOriginal) => ({
  ...await importOriginal<typeof import("viem")>(),
  createPublicClient: () => mocks,
  createWalletClient: mocks.createWalletClient,
}));
vi.mock("viem/accounts", () => ({ privateKeyToAccount: mocks.privateKeyToAccount }));
vi.mock("../../base/deploymentManifest.js", () => ({ readDeploymentManifest: mocks.readManifest }));

const OWNER = "0x0000000000000000000000000000000000001000";
const AGENT = "0x0000000000000000000000000000000000001001";
const DELEGATE = "0x0000000000000000000000000000000000001002";
const ZERO = "0x0000000000000000000000000000000000000000";
const HASH = `0x${"a".repeat(64)}`;
const manifest = {
  chainId: 84532, rpcUrlEnv: "ISSUE_1_TEST_RPC", explorerUrl: "https://example.test", owner: OWNER,
  contracts: { agentAccount: AGENT, capabilityRegistry: AGENT, policyEngine: AGENT, reputationRegistry: AGENT },
};
let output: ReturnType<typeof vi.spyOn>;
const previousExitCode = process.exitCode;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ISSUE_1_TEST_RPC", "http://localhost:1");
  vi.stubEnv("AGENT_DELEGATE", "");
  vi.stubEnv("PRIVATE_KEY", "");
  process.exitCode = undefined;
  output = vi.spyOn(console, "log").mockImplementation(() => {});
  mocks.readManifest.mockResolvedValue(manifest);
  mocks.getChainId.mockResolvedValue(84532);
  mocks.readContract.mockImplementation(async ({ functionName, blockNumber }) => {
    if (functionName === "owner") return OWNER;
    if (functionName === "paused") return false;
    if (functionName === "reputation") return 0n;
    if (functionName === "delegates") return blockNumber === undefined;
    return AGENT;
  });
  mocks.call.mockResolvedValue({});
  mocks.simulateContract.mockResolvedValue({});
  mocks.createWalletClient.mockReturnValue({ sendTransaction: mocks.sendTransaction });
  mocks.privateKeyToAccount.mockReturnValue({ address: OWNER });
  mocks.sendTransaction.mockResolvedValue(HASH);
  mocks.waitForTransactionReceipt.mockResolvedValue({ status: "success", blockNumber: 10n });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  process.exitCode = previousExitCode;
});
function report() { return JSON.parse(output.mock.calls[0]![0] as string); }
function revert(errorName?: "NotOwner" | "InvalidAddress") {
  return new BaseError("Contract execution failed", { cause: new ContractFunctionRevertedError({
    abi: AGENT_ACCOUNT_ABI, functionName: "revokeDelegate",
    data: errorName === undefined ? "0x" : encodeErrorResult({ abi: AGENT_ACCOUNT_ABI, errorName }),
  }) });
}
function sending() { vi.stubEnv("PRIVATE_KEY", `0x${"1".repeat(64)}`); }

describe("account revoke command execution", () => {
  it.each([["--revoke-delegate", DELEGATE], [`--revoke-delegate=${DELEGATE}`]])("simulates parsed args %j without a wallet", async (...argv) => {
    await runAgentAccountCli({ argv: [...argv, "--manifest=custom.json"] });
    expect(mocks.readManifest).toHaveBeenCalledWith("custom.json");
    expect(mocks.simulateContract).toHaveBeenCalledWith(expect.objectContaining({
      functionName: "revokeDelegate", address: AGENT, account: OWNER, args: [DELEGATE],
    }));
    expect(report()).toMatchObject({ operation: "revokeDelegate", delegate: DELEGATE, mode: "dry-run", delegateAllowedBefore: true, simulation: "passed" });
    expect(report()).not.toHaveProperty("delegateAllowed");
    expect(report()).not.toHaveProperty("revocationConfirmed");
    expect(decodeFunctionData({ abi: AGENT_ACCOUNT_ABI, data: report().transaction.data })).toMatchObject({ functionName: "revokeDelegate", args: [DELEGATE] });
    expect(mocks.createWalletClient).not.toHaveBeenCalled();
    expect(mocks.privateKeyToAccount).not.toHaveBeenCalled();
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });

  it("verifies receipt and post-state on explicit send", async () => {
    sending();
    await runAgentAccountCli({ argv: ["--revoke-delegate", DELEGATE, "--send"] });
    expect(report()).toMatchObject({ hash: HASH, delegateAllowedBefore: true, delegateAllowedAfter: false, revocationConfirmed: true, verifiedAtBlock: "10" });
    expect(mocks.readContract).toHaveBeenLastCalledWith(expect.objectContaining({ functionName: "delegates", args: [DELEGATE], blockNumber: 10n }));
    const sent = mocks.sendTransaction.mock.calls[0]![0];
    expect(sent).toMatchObject({ to: AGENT, value: 0n });
    expect(decodeFunctionData({ abi: AGENT_ACCOUNT_ABI, data: sent.data })).toMatchObject({ functionName: "revokeDelegate", args: [DELEGATE] });
  });

  it.each(["reverted", "still-authorized", "readback-error", "receipt-error"])("cannot confirm %s and retains transaction hash", async (failure) => {
    sending();
    if (failure === "reverted") mocks.waitForTransactionReceipt.mockResolvedValue({ status: "reverted", blockNumber: 10n });
    else if (failure === "receipt-error") mocks.waitForTransactionReceipt.mockRejectedValue(new Error("RPC unavailable"));
    else {
      const original = mocks.readContract.getMockImplementation()!;
      mocks.readContract.mockImplementation(async (args) => {
        if (args.blockNumber !== undefined) {
          if (failure === "readback-error") throw new Error("RPC unavailable");
          return true;
        }
        return original(args);
      });
    }
    await expect(runAgentAccountCli({ argv: ["--revoke-delegate", DELEGATE, "--send"] })).rejects.toThrow(HASH);
    expect(output).not.toHaveBeenCalled();
  });

  it.each(["chain", "manifest-owner", "signer-owner"])("blocks wrong %s", async (failure) => {
    sending();
    if (failure === "chain") mocks.getChainId.mockResolvedValue(1);
    if (failure === "manifest-owner") mocks.readManifest.mockResolvedValue({ ...manifest, owner: DELEGATE });
    if (failure === "signer-owner") mocks.privateKeyToAccount.mockReturnValue({ address: DELEGATE });
    await expect(runAgentAccountCli({ argv: ["--revoke-delegate", DELEGATE, "--send"] })).rejects.toThrow(/expected|does not match/);
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });

  it.each(["legacy", "rpc"])("blocks %s simulation failure before sending", async (failure) => {
    sending();
    mocks.simulateContract.mockRejectedValue(failure === "legacy" ? revert() : new Error("RPC unavailable"));
    await expect(runAgentAccountCli({ argv: ["--revoke-delegate", DELEGATE, "--send"] }))
      .rejects.toThrow(failure === "legacy" ? "supports revokeDelegate" : "RPC unavailable");
    expect(mocks.createWalletClient).not.toHaveBeenCalled();
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });

  it("keeps environment delegate observational", async () => {
    vi.stubEnv("AGENT_DELEGATE", DELEGATE);
    await runAgentAccountCli({ argv: [] });
    expect(report()).toMatchObject({ operation: null, transaction: null, delegateAllowed: true });
    expect(mocks.simulateContract).not.toHaveBeenCalled();
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
    await expect(runAgentAccountCli({ argv: ["--send"] })).rejects.toThrow("--send requires");
  });

  it.each([
    ["--revoke-delegate"], ["--revoke-delegate="], ["--revoke-delegate", "bad"],
    ["--revoke-delegate", ZERO], ["--revoke-delegate", DELEGATE, "--pause"],
    ["--revoke-delegate", DELEGATE, "--unpause"], ["--revoke-delegate", DELEGATE, "--delegate", OWNER],
    ["--revoke-delegate", DELEGATE, `--revoke-delegate=${OWNER}`],
  ])("rejects invalid revoke input %j", (...argv) => {
    expect(() => parseAgentAccountCliArgs(argv)).toThrow();
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });

  it.each(["--delegate", "--pause", "--unpause"])("preserves existing %s operation", async (flag) => {
    await runAgentAccountCli({ argv: flag === "--delegate" ? [flag, DELEGATE] : [flag] });
    expect(report().operation).toBe(flag.slice(2));
    expect(mocks.call).toHaveBeenCalledOnce();
    expect(mocks.simulateContract).not.toHaveBeenCalled();
  });
});

describe("account safety revocation probes", () => {
  it.each(AGENT_ACCOUNT_REVOCATION_CHECKS)("rejects missing or malformed %s in saved output", async (name) => {
    for (const value of [undefined, "true", null]) {
      await expect(runAgentAccountSafetyCheckCli({ executeCommand: async () => ({ output: {
        chainId: 84532, agent: AGENT, owner: OWNER, paused: false, capabilities: AGENT,
        policyEngine: AGENT, reputationRegistry: AGENT, reputation: "0",
        checks: { revokeDelegateCallable: true, unauthorizedRevokeDelegateDenied: true, zeroRevokeDelegateDenied: true, [name]: value },
      } }) })).rejects.toThrow();
    }
  });

  function supported() {
    mocks.simulateContract.mockImplementation(async ({ account, args }) => {
      if (account !== OWNER) throw revert("NotOwner");
      if (args[0] === ZERO) throw revert("InvalidAddress");
      return {};
    });
    mocks.call.mockImplementation(async ({ account, data }) => {
      const decoded = decodeFunctionData({ abi: AGENT_ACCOUNT_ABI, data });
      if (account !== OWNER || (decoded.functionName === "delegate" && decoded.args[0] === ZERO)) throw new Error("denied");
      return {};
    });
  }
  it("requires owner support and exact denial errors", async () => {
    supported();
    await runAgentAccountSafetyCheckCli({ argv: ["--manifest=custom.json"] });
    expect(mocks.readManifest).toHaveBeenCalledWith("custom.json");
    expect(report().checks).toMatchObject({ revokeDelegateCallable: true, unauthorizedRevokeDelegateDenied: true, zeroRevokeDelegateDenied: true });
    expect(process.exitCode).toBeUndefined();
    expect(mocks.sendTransaction).not.toHaveBeenCalled();
  });
  it.each(["rpc", "empty-revert", "wrong-error", "unexpected-success"])("does not count %s as a denial", async (failure) => {
    supported();
    const original = mocks.simulateContract.getMockImplementation()!;
    mocks.simulateContract.mockImplementation(async (args) => {
      if (args.account === OWNER && args.args[0] !== ZERO) return original(args);
      if (failure === "rpc") throw new Error("RPC unavailable");
      if (failure === "empty-revert") throw revert();
      if (failure === "wrong-error") throw revert(args.account === OWNER ? "NotOwner" : "InvalidAddress");
      return {};
    });
    await runAgentAccountSafetyCheckCli();
    expect(report().checks).toMatchObject({ unauthorizedRevokeDelegateDenied: false, zeroRevokeDelegateDenied: false });
    expect(process.exitCode).toBe(1);
  });
  it("fails legacy accounts without revoke support", async () => {
    supported();
    mocks.simulateContract.mockRejectedValue(revert());
    await runAgentAccountSafetyCheckCli();
    expect(report().checks.revokeDelegateCallable).toBe(false);
    expect(process.exitCode).toBe(1);
  });
  it("chooses an unauthorized probe distinct from the owner", async () => {
    supported();
    const owner = "0x000000000000000000000000000000000000dEaD";
    const original = mocks.readContract.getMockImplementation()!;
    mocks.readContract.mockImplementation((args) => args.functionName === "owner" ? owner : original(args));
    await runAgentAccountSafetyCheckCli();
    expect(mocks.simulateContract.mock.calls[1]![0].account).not.toBe(owner);
  });
});
