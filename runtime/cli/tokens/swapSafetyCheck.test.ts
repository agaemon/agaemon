import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type Module = typeof import("./swapSafetyCheck.js") & {
  isTokenSwapSafetyCheckDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseTokenSwapSafetyCheckCliArgs?: (argv: readonly string[]) => Record<string, unknown>;
  runTokenSwapSafetyCheckCli?: (options?: RunnerOptions) => Promise<void>;
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
  createPublicClient?: (rpcUrl: string) => unknown;
  buildSafetyTransaction?: (params: unknown) => Promise<BuildResult>;
}

interface Manifest {
  chainId: number;
  rpcUrlEnv: string;
  owner: string;
  contracts: { agentAccount: string };
}

interface BuildResult {
  allowed: boolean;
  decision: { code: string };
  transaction: unknown;
}

const AGENT = "0x1111111111111111111111111111111111111111";
const OWNER = "0x2222222222222222222222222222222222222222";
const ADAPTER = "0x3333333333333333333333333333333333333333";
const TOKEN = "0x4444444444444444444444444444444444444444";
const RECIPIENT = "0x5555555555555555555555555555555555555555";
const MANIFEST: Manifest = {
  chainId: 84532,
  rpcUrlEnv: "BASE_SEPOLIA_RPC_URL",
  owner: OWNER,
  contracts: { agentAccount: AGENT },
};

describe("token swap safety check CLI seams", () => {
  it("detects direct execution and parses strict args", async () => {
    const module = await import("./swapSafetyCheck.js") as Module;
    const scriptPath = resolve("runtime/cli/tokens/swapSafetyCheck.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isTokenSwapSafetyCheckDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(() => module.isTokenSwapSafetyCheckDirectRun?.(moduleUrl, "bad" as unknown as readonly string[]))
      .toThrow("Direct-run argv must be an array of strings");
    expect(module.parseTokenSwapSafetyCheckCliArgs?.([
      "--manifest=deployments/custom.json",
      "--recipient", RECIPIENT,
    ])).toEqual({ manifestPath: "deployments/custom.json", recipient: RECIPIENT });
    expect(module.parseTokenSwapSafetyCheckCliArgs?.([])).toMatchObject({
      manifestPath: "deployments/base-sepolia/latest.json",
    });
    expect(() => module.parseTokenSwapSafetyCheckCliArgs?.(["--manifest", "a.json", "--manifest", "b.json"]))
      .toThrow("Duplicate argument: --manifest");
    expect(() => module.parseTokenSwapSafetyCheckCliArgs?.(["--recipient"])).toThrow("--recipient requires a value");
    expect(() => module.parseTokenSwapSafetyCheckCliArgs?.(["--unknown"])).toThrow("Unsupported argument: --unknown");
  });

  it("prints injected safety reports", async () => {
    const module = await import("./swapSafetyCheck.js") as Module;
    const outputs: string[] = [];

    await module.runTokenSwapSafetyCheckCli?.({
      argv: ["--recipient", RECIPIENT],
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: (output) => outputs.push(output),
      loadDotEnv: () => undefined,
      readDeploymentManifest: async () => MANIFEST,
      requireSwapAdapter: () => ADAPTER,
      requireToken: () => TOKEN,
      createPublicClient: () => ({}),
      buildSafetyTransaction: async (params) => {
        const kind = (params as { kind: string }).kind;
        if (kind === "allowed") return { allowed: true, decision: { code: "Allowed" }, transaction: {} };
        if (kind === "unknownAdapter") return { allowed: false, decision: { code: "CapabilityDenied" }, transaction: null };
        if (kind === "lowMinOutput") return { allowed: false, decision: { code: "SwapMinOutputTooLow" }, transaction: null };
        if (kind === "overLimit") return { allowed: false, decision: { code: "ActionValueExceeded" }, transaction: null };
        return { allowed: false, decision: { code: "InvalidSwap" }, transaction: null };
      },
    });

    expect(JSON.parse(outputs[0]!)).toEqual({
      chainId: 84532,
      agent: AGENT,
      adapter: ADAPTER,
      tokenOut: TOKEN,
      checks: {
        allowedSwap: true,
        unknownAdapterDenied: true,
        lowMinOutputDenied: true,
        overLimitDenied: true,
        invalidCalldataDenied: true,
      },
    });
  });

  it("sets exit code after failed safety output", async () => {
    const module = await import("./swapSafetyCheck.js") as Module;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await module.runTokenSwapSafetyCheckCli?.({
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      loadDotEnv: () => undefined,
      readDeploymentManifest: async () => MANIFEST,
      requireSwapAdapter: () => ADAPTER,
      requireToken: () => TOKEN,
      createPublicClient: () => ({}),
      buildSafetyTransaction: async () => ({ allowed: false, decision: { code: "Denied" }, transaction: null }),
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ checks: { allowedSwap: false } });
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed arguments before manifest reads", async () => {
    const module = await import("./swapSafetyCheck.js") as Module;
    const calls: string[] = [];

    await expect(module.runTokenSwapSafetyCheckCli?.({
      argv: ["--unknown"],
      loadDotEnv: () => calls.push("dotenv"),
      readDeploymentManifest: async () => {
        calls.push("manifest");
        return MANIFEST;
      },
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });

  it("rejects malformed injected safety reports before output", async () => {
    const module = await import("./swapSafetyCheck.js") as Module;
    const calls: string[] = [];

    await expect(module.runTokenSwapSafetyCheckCli?.({
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      loadDotEnv: () => undefined,
      readDeploymentManifest: async () => ({ ...MANIFEST, chainId: "84532" as unknown as number }),
      requireSwapAdapter: () => ADAPTER,
      requireToken: () => TOKEN,
      createPublicClient: () => ({}),
      buildSafetyTransaction: async () => ({ allowed: true, decision: { code: "Allowed" }, transaction: {} }),
    })).rejects.toThrow("Token swap safety report chainId must be a number");
    expect(calls).toEqual([]);
  });
});
