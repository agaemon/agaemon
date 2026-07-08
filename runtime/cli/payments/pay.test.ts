import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type Module = typeof import("./pay.js") & {
  isPaymentsPayDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parsePaymentsPayCliArgs?: (argv: readonly string[]) => Record<string, unknown>;
  runPaymentsPayCli?: (options?: RunnerOptions) => Promise<void>;
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
  buildPaymentTransaction?: (params: unknown) => Promise<BuildResult>;
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

const ALLOWED: BuildResult = {
  allowed: true,
  decision: { code: "Allowed" },
  transaction: { to: AGENT, value: 1n, data: "0x1234" },
};

describe("payments pay CLI seams", () => {
  it("detects direct execution and parses strict args", async () => {
    const module = await import("./pay.js") as Module;
    const scriptPath = resolve("runtime/cli/payments/pay.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isPaymentsPayDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(() => module.isPaymentsPayDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
    expect(module.parsePaymentsPayCliArgs?.([
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
    expect(module.parsePaymentsPayCliArgs?.([])).toMatchObject({
      send: false,
      manifestPath: "deployments/base-sepolia/latest.json",
      amountEth: "0.000001",
    });
    expect(() => module.parsePaymentsPayCliArgs?.(["--send", "--send"])).toThrow("Duplicate argument: --send");
    expect(() => module.parsePaymentsPayCliArgs?.(["--recipient"])).toThrow("--recipient requires a value");
    expect(() => module.parsePaymentsPayCliArgs?.(["--unknown"])).toThrow("Unsupported argument: --unknown");
  });

  it("prints injected dry-run transaction output without wallet work", async () => {
    const module = await import("./pay.js") as Module;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runPaymentsPayCli?.({
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
      buildPaymentTransaction: async (params) => {
        calls.push(`build:${typeof params}`);
        return ALLOWED;
      },
      createWalletClient: () => {
        calls.push("wallet");
        throw new Error("wallet should not be used");
      },
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({
      mode: "dry-run",
      chainId: 84532,
      agent: AGENT,
      adapter: ADAPTER,
      recipient: RECIPIENT,
      amountEth: "0.000001",
      allowed: true,
      transaction: { to: AGENT, value: "1", data: "0x1234" },
    });
    expect(calls).toEqual([
      "dotenv:.env",
      "manifest:deployments/base-sepolia/latest.json",
      "client:https://rpc.example",
      "build:object",
    ]);
  });

  it("sets exit code after denied policy output", async () => {
    const module = await import("./pay.js") as Module;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await module.runPaymentsPayCli?.({
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      loadDotEnv: () => undefined,
      readDeploymentManifest: async () => MANIFEST,
      requireAdapter: () => ADAPTER,
      createPublicClient: () => ({ getChainId: async () => 84532 }),
      buildPaymentTransaction: async () => ({
        allowed: false,
        decision: { code: "ActionValueExceeded" },
        transaction: null,
      }),
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ allowed: false, decision: { code: "ActionValueExceeded" } });
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed arguments before manifest reads", async () => {
    const module = await import("./pay.js") as Module;
    const calls: string[] = [];

    await expect(module.runPaymentsPayCli?.({
      argv: ["--unknown"],
      loadDotEnv: () => calls.push("dotenv"),
      readDeploymentManifest: async () => {
        calls.push("manifest");
        return MANIFEST;
      },
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });

  it("rejects malformed injected payment reports before output", async () => {
    const module = await import("./pay.js") as Module;
    const calls: string[] = [];

    await expect(module.runPaymentsPayCli?.({
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      loadDotEnv: () => undefined,
      readDeploymentManifest: async () => MANIFEST,
      requireAdapter: () => ADAPTER,
      createPublicClient: () => ({ getChainId: async () => 84532 }),
      buildPaymentTransaction: async () => ({
        allowed: "yes" as unknown as boolean,
        decision: { code: "Allowed" },
        transaction: null,
      }),
    })).rejects.toThrow("Payments pay report allowed must be a boolean");
    expect(calls).toEqual([]);
  });
});
