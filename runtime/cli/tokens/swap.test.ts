import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type Module = typeof import("./swap.js") & {
  isTokenSwapDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseTokenSwapCliArgs?: (argv: readonly string[]) => Record<string, unknown>;
  runTokenSwapCli?: (options?: RunnerOptions) => Promise<void>;
};

interface RunnerOptions {
  argv?: readonly string[];
  env?: Record<string, string | undefined>;
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  loadDotEnv?: (path: string, env: Record<string, string | undefined>) => void;
  readDeploymentManifest?: (path: string) => Promise<Manifest>;
  requireSwapAdapter?: (manifest: Manifest) => string;
  requireToken?: (manifest: Manifest) => string;
  createPublicClient?: (rpcUrl: string) => PublicClient;
  buildTokenSwapTransaction?: (params: unknown) => Promise<BuildResult>;
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
const TOKEN = "0x4444444444444444444444444444444444444444";
const RECIPIENT = "0x5555555555555555555555555555555555555555";
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

describe("token swap CLI seams", () => {
  it("detects direct execution and parses strict args", async () => {
    const module = await import("./swap.js") as Module;
    const scriptPath = resolve("runtime/cli/tokens/swap.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isTokenSwapDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(() => module.isTokenSwapDirectRun?.(moduleUrl, "bad" as unknown as readonly string[]))
      .toThrow("Direct-run argv must be an array of strings");
    expect(module.parseTokenSwapCliArgs?.([
      "--send",
      "--manifest=deployments/custom.json",
      "--recipient", RECIPIENT,
      "--amount-eth", "0.01",
      "--min-amount-out=9.5",
    ])).toEqual({
      send: true,
      manifestPath: "deployments/custom.json",
      recipient: RECIPIENT,
      amountEth: "0.01",
      minAmountOut: "9.5",
    });
    expect(module.parseTokenSwapCliArgs?.([])).toMatchObject({
      send: false,
      manifestPath: "deployments/base-sepolia/latest.json",
      amountEth: "0.000001",
      minAmountOut: "0.00095",
    });
    expect(() => module.parseTokenSwapCliArgs?.(["--send", "--send"])).toThrow("Duplicate argument: --send");
    expect(() => module.parseTokenSwapCliArgs?.(["--recipient"])).toThrow("--recipient requires a value");
    expect(() => module.parseTokenSwapCliArgs?.(["--unknown"])).toThrow("Unsupported argument: --unknown");
  });

  it("prints injected dry-run swap output", async () => {
    const module = await import("./swap.js") as Module;
    const outputs: string[] = [];

    await module.runTokenSwapCli?.({
      argv: ["--recipient", RECIPIENT],
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: (output) => outputs.push(output),
      loadDotEnv: () => undefined,
      readDeploymentManifest: async () => MANIFEST,
      requireSwapAdapter: () => ADAPTER,
      requireToken: () => TOKEN,
      createPublicClient: () => ({ getChainId: async () => 84532 }),
      buildTokenSwapTransaction: async () => ALLOWED,
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({
      mode: "dry-run",
      chainId: 84532,
      agent: AGENT,
      adapter: ADAPTER,
      tokenOut: TOKEN,
      recipient: RECIPIENT,
      amountEth: "0.000001",
      minAmountOutRaw: "950000000000000",
      allowed: true,
      transaction: { to: AGENT, value: "1", data: "0x1234" },
    });
  });

  it("sets exit code after denied policy output", async () => {
    const module = await import("./swap.js") as Module;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await module.runTokenSwapCli?.({
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      loadDotEnv: () => undefined,
      readDeploymentManifest: async () => MANIFEST,
      requireSwapAdapter: () => ADAPTER,
      requireToken: () => TOKEN,
      createPublicClient: () => ({ getChainId: async () => 84532 }),
      buildTokenSwapTransaction: async () => ({ allowed: false, decision: { code: "SwapMinOutputTooLow" }, transaction: null }),
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ allowed: false, decision: { code: "SwapMinOutputTooLow" } });
    expect(exitCodes).toEqual([1]);
  });

  it("prints injected send receipt output", async () => {
    const module = await import("./swap.js") as Module;
    const outputs: string[] = [];

    await module.runTokenSwapCli?.({
      argv: ["--send"],
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example", PRIVATE_KEY: "0xabc" },
      writeOutput: (output) => outputs.push(output),
      loadDotEnv: () => undefined,
      readDeploymentManifest: async () => MANIFEST,
      requireSwapAdapter: () => ADAPTER,
      requireToken: () => TOKEN,
      createPublicClient: () => ({
        getChainId: async () => 84532,
        waitForTransactionReceipt: async () => ({ blockNumber: 42n, status: "success" }),
      }),
      buildTokenSwapTransaction: async () => ALLOWED,
      createWalletAccount: (privateKey) => ({ privateKey }),
      createWalletClient: () => ({ sendTransaction: async () => "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }),
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({
      mode: "send",
      hash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      explorerUrl: "https://explorer.example/tx/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      receipt: { blockNumber: "42", status: "success" },
    });
  });

  it("rejects malformed arguments before manifest reads", async () => {
    const module = await import("./swap.js") as Module;
    const calls: string[] = [];

    await expect(module.runTokenSwapCli?.({
      argv: ["--unknown"],
      loadDotEnv: () => calls.push("dotenv"),
      readDeploymentManifest: async () => {
        calls.push("manifest");
        return MANIFEST;
      },
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });

  it("rejects malformed injected swap reports before output", async () => {
    const module = await import("./swap.js") as Module;
    const calls: string[] = [];

    await expect(module.runTokenSwapCli?.({
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      loadDotEnv: () => undefined,
      readDeploymentManifest: async () => MANIFEST,
      requireSwapAdapter: () => ADAPTER,
      requireToken: () => TOKEN,
      createPublicClient: () => ({ getChainId: async () => 84532 }),
      buildTokenSwapTransaction: async () => ({
        allowed: "yes" as unknown as boolean,
        decision: { code: "Allowed" },
        transaction: null,
      }),
    })).rejects.toThrow("Token swap report allowed must be a boolean");
    expect(calls).toEqual([]);
  });
});
