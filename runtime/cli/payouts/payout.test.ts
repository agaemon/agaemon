import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type Module = typeof import("./payout.js") & {
  isPayoutsPayoutDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parsePayoutsPayoutCliArgs?: (argv: readonly string[]) => Record<string, unknown>;
  runPayoutsPayoutCli?: (options?: RunnerOptions) => Promise<void>;
};

interface RunnerOptions {
  argv?: readonly string[];
  env?: Record<string, string | undefined>;
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  loadDotEnv?: (path: string, env: Record<string, string | undefined>) => void;
  readDeploymentManifest?: (path: string) => Promise<Manifest>;
  requireAdapter?: (manifest: Manifest) => string;
  createPublicClient?: (rpcUrl: string) => PublicClient;
  readPayoutRule?: (params: unknown) => Promise<Rule>;
  buildPayoutTransaction?: (params: unknown) => Promise<BuildResult>;
  simulateExecution?: (params: unknown) => Promise<boolean>;
  createWalletAccount?: (privateKey: string) => unknown;
  createWalletClient?: (params: unknown) => WalletClient;
}

interface Manifest {
  chainId: number;
  rpcUrlEnv: string;
  explorerUrl: string;
  owner: string;
  contracts: { agentAccount: string };
}

interface PublicClient {
  getChainId: () => Promise<number>;
  waitForTransactionReceipt?: (params: { hash: string }) => Promise<{ blockNumber: bigint; status: string }>;
}

interface WalletClient {
  sendTransaction: (params: unknown) => Promise<string>;
}

type Rule = readonly [bigint, bigint, boolean];

interface BuildResult {
  allowed: boolean;
  decision: { code: string };
  transaction: null | { to: string; value: bigint; data: string };
}

const AGENT = "0x1111111111111111111111111111111111111111";
const OWNER = "0x2222222222222222222222222222222222222222";
const ADAPTER = "0x3333333333333333333333333333333333333333";
const RECIPIENT = "0x4444444444444444444444444444444444444444";
const MANIFEST: Manifest = {
  chainId: 84532,
  rpcUrlEnv: "BASE_SEPOLIA_RPC_URL",
  explorerUrl: "https://explorer.example",
  owner: OWNER,
  contracts: { agentAccount: AGENT },
};
const RULE: Rule = [10n, 20n, true];
const ALLOWED: BuildResult = {
  allowed: true,
  decision: { code: "Allowed" },
  transaction: { to: AGENT, value: 1n, data: "0x1234" },
};

describe("payouts payout CLI seams", () => {
  it("detects direct execution and parses strict args", async () => {
    const module = await import("./payout.js") as Module;
    const scriptPath = resolve("runtime/cli/payouts/payout.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isPayoutsPayoutDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(() => module.isPayoutsPayoutDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
    expect(module.parsePayoutsPayoutCliArgs?.([
      "--send",
      "--manifest=deployments/custom.json",
      "--recipient", RECIPIENT,
      "--amount-eth", "0.02",
    ])).toEqual({
      send: true,
      manifestPath: "deployments/custom.json",
      recipient: RECIPIENT,
      amountEth: "0.02",
    });
    expect(module.parsePayoutsPayoutCliArgs?.([])).toMatchObject({
      send: false,
      manifestPath: "deployments/base-sepolia/latest.json",
      amountEth: "0.000001",
    });
    expect(() => module.parsePayoutsPayoutCliArgs?.(["--send", "--send"])).toThrow("Duplicate argument: --send");
    expect(() => module.parsePayoutsPayoutCliArgs?.(["--recipient"])).toThrow("--recipient requires a value");
    expect(() => module.parsePayoutsPayoutCliArgs?.(["--unknown"])).toThrow("Unsupported argument: --unknown");
  });

  it("prints injected dry-run payout output after execution simulation", async () => {
    const module = await import("./payout.js") as Module;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runPayoutsPayoutCli?.({
      argv: ["--recipient", RECIPIENT],
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: (output) => outputs.push(output),
      loadDotEnv: (path) => calls.push(`dotenv:${path}`),
      readDeploymentManifest: async (path) => {
        calls.push(`manifest:${path}`);
        return MANIFEST;
      },
      requireAdapter: () => ADAPTER,
      createPublicClient: (rpcUrl) => {
        calls.push(`client:${rpcUrl}`);
        return { getChainId: async () => 84532 };
      },
      readPayoutRule: async () => RULE,
      buildPayoutTransaction: async () => ALLOWED,
      simulateExecution: async () => true,
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({
      mode: "dry-run",
      chainId: 84532,
      agent: AGENT,
      adapter: ADAPTER,
      recipient: RECIPIENT,
      amountEth: "0.000001",
      rule: { maxActionValue: "10", maxDailyValue: "20", enabled: true },
      allowed: true,
      executionSimulation: "passed",
    });
    expect(calls).toEqual([
      "dotenv:.env",
      "manifest:deployments/base-sepolia/latest.json",
      "client:https://rpc.example",
    ]);
  });

  it("sets exit code after rejected payout policy output", async () => {
    const module = await import("./payout.js") as Module;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await module.runPayoutsPayoutCli?.({
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      loadDotEnv: () => undefined,
      readDeploymentManifest: async () => MANIFEST,
      requireAdapter: () => ADAPTER,
      createPublicClient: () => ({ getChainId: async () => 84532 }),
      readPayoutRule: async () => RULE,
      buildPayoutTransaction: async () => ({
        allowed: false,
        decision: { code: "ActionValueExceeded" },
        transaction: null,
      }),
      simulateExecution: async () => true,
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ allowed: false, decision: { code: "ActionValueExceeded" } });
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed arguments before manifest reads", async () => {
    const module = await import("./payout.js") as Module;
    const calls: string[] = [];

    await expect(module.runPayoutsPayoutCli?.({
      argv: ["--unknown"],
      loadDotEnv: () => calls.push("dotenv"),
      readDeploymentManifest: async () => {
        calls.push("manifest");
        return MANIFEST;
      },
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });

  it("rejects malformed injected payout reports before output", async () => {
    const module = await import("./payout.js") as Module;
    const calls: string[] = [];

    await expect(module.runPayoutsPayoutCli?.({
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      loadDotEnv: () => undefined,
      readDeploymentManifest: async () => MANIFEST,
      requireAdapter: () => ADAPTER,
      createPublicClient: () => ({ getChainId: async () => 84532 }),
      readPayoutRule: async () => RULE,
      buildPayoutTransaction: async () => ({
        allowed: "yes" as unknown as boolean,
        decision: { code: "Allowed" },
        transaction: null,
      }),
      simulateExecution: async () => true,
    })).rejects.toThrow("Payout report allowed must be a boolean");
    expect(calls).toEqual([]);
  });
});
