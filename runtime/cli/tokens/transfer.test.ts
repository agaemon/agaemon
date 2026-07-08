import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type Module = typeof import("./transfer.js") & {
  isTokenTransferDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseTokenTransferCliArgs?: (argv: readonly string[]) => Record<string, unknown>;
  runTokenTransferCli?: (options?: RunnerOptions) => Promise<void>;
};

interface RunnerOptions {
  argv?: readonly string[];
  env?: Record<string, string | undefined>;
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  loadDotEnv?: (path: string, env: Record<string, string | undefined>) => void;
  readDeploymentManifest?: (path: string) => Promise<Manifest>;
  requireToken?: (manifest: Manifest) => string;
  createPublicClient?: (rpcUrl: string) => PublicClient;
  buildTokenTransferTransaction?: (params: unknown) => Promise<BuildResult>;
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
const TOKEN = "0x3333333333333333333333333333333333333333";
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
  transaction: { to: AGENT, value: 0n, data: "0x1234" },
};

describe("token transfer CLI seams", () => {
  it("detects direct execution and parses strict args", async () => {
    const module = await import("./transfer.js") as Module;
    const scriptPath = resolve("runtime/cli/tokens/transfer.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isTokenTransferDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(() => module.isTokenTransferDirectRun?.(moduleUrl, "bad" as unknown as readonly string[]))
      .toThrow("Direct-run argv must be an array of strings");
    expect(module.parseTokenTransferCliArgs?.([
      "--send",
      "--manifest=deployments/custom.json",
      "--recipient", RECIPIENT,
      "--amount", "2",
    ])).toEqual({ send: true, manifestPath: "deployments/custom.json", recipient: RECIPIENT, amount: "2" });
    expect(module.parseTokenTransferCliArgs?.([])).toMatchObject({
      send: false,
      manifestPath: "deployments/base-sepolia/latest.json",
      amount: "1",
    });
    expect(() => module.parseTokenTransferCliArgs?.(["--send", "--send"])).toThrow("Duplicate argument: --send");
    expect(() => module.parseTokenTransferCliArgs?.(["--recipient"])).toThrow("--recipient requires a value");
    expect(() => module.parseTokenTransferCliArgs?.(["--unknown"])).toThrow("Unsupported argument: --unknown");
  });

  it("prints injected dry-run transfer output", async () => {
    const module = await import("./transfer.js") as Module;
    const outputs: string[] = [];

    await module.runTokenTransferCli?.({
      argv: ["--recipient", RECIPIENT],
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: (output) => outputs.push(output),
      loadDotEnv: () => undefined,
      readDeploymentManifest: async () => MANIFEST,
      requireToken: () => TOKEN,
      createPublicClient: () => ({ getChainId: async () => 84532 }),
      buildTokenTransferTransaction: async () => ALLOWED,
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({
      mode: "dry-run",
      chainId: 84532,
      agent: AGENT,
      token: TOKEN,
      recipient: RECIPIENT,
      amountRaw: "1000000000000000000",
      allowed: true,
      transaction: { to: AGENT, value: "0", data: "0x1234" },
    });
  });

  it("sets exit code after denied policy output", async () => {
    const module = await import("./transfer.js") as Module;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await module.runTokenTransferCli?.({
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      loadDotEnv: () => undefined,
      readDeploymentManifest: async () => MANIFEST,
      requireToken: () => TOKEN,
      createPublicClient: () => ({ getChainId: async () => 84532 }),
      buildTokenTransferTransaction: async () => ({ allowed: false, decision: { code: "TokenActionAmountExceeded" }, transaction: null }),
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ allowed: false, decision: { code: "TokenActionAmountExceeded" } });
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed arguments before manifest reads", async () => {
    const module = await import("./transfer.js") as Module;
    const calls: string[] = [];

    await expect(module.runTokenTransferCli?.({
      argv: ["--unknown"],
      loadDotEnv: () => calls.push("dotenv"),
      readDeploymentManifest: async () => {
        calls.push("manifest");
        return MANIFEST;
      },
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });

  it("rejects malformed injected transfer reports before output", async () => {
    const module = await import("./transfer.js") as Module;
    const calls: string[] = [];

    await expect(module.runTokenTransferCli?.({
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      loadDotEnv: () => undefined,
      readDeploymentManifest: async () => MANIFEST,
      requireToken: () => TOKEN,
      createPublicClient: () => ({ getChainId: async () => 84532 }),
      buildTokenTransferTransaction: async () => ({
        allowed: "yes" as unknown as boolean,
        decision: { code: "Allowed" },
        transaction: null,
      }),
    })).rejects.toThrow("Token transfer report allowed must be a boolean");
    expect(calls).toEqual([]);
  });
});
