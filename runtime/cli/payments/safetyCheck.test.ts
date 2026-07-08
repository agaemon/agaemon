import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type Module = typeof import("./safetyCheck.js") & {
  isPaymentsSafetyCheckDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parsePaymentsSafetyCheckCliArgs?: (argv: readonly string[]) => Record<string, unknown>;
  runPaymentsSafetyCheckCli?: (options?: RunnerOptions) => Promise<void>;
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
  buildSafetyTransaction?: (params: unknown) => Promise<BuildResult>;
  readPaused?: (params: unknown) => Promise<boolean>;
  callUnauthorizedDelegate?: (params: unknown) => Promise<boolean>;
}

interface Manifest {
  chainId: number;
  rpcUrlEnv: string;
  owner: string;
  contracts: { agentAccount: string };
}

interface PublicClient {
  getChainId?: () => Promise<number>;
}

interface BuildResult {
  allowed: boolean;
  decision: { code: string };
  transaction: null | { data: string };
}

const AGENT = "0x1111111111111111111111111111111111111111";
const OWNER = "0x2222222222222222222222222222222222222222";
const ADAPTER = "0x3333333333333333333333333333333333333333";
const RECIPIENT = "0x4444444444444444444444444444444444444444";
const MANIFEST: Manifest = {
  chainId: 84532,
  rpcUrlEnv: "BASE_SEPOLIA_RPC_URL",
  owner: OWNER,
  contracts: { agentAccount: AGENT },
};

describe("payments safety check CLI seams", () => {
  it("detects direct execution and parses strict args", async () => {
    const module = await import("./safetyCheck.js") as Module;
    const scriptPath = resolve("runtime/cli/payments/safetyCheck.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isPaymentsSafetyCheckDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(() => module.isPaymentsSafetyCheckDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
    expect(module.parsePaymentsSafetyCheckCliArgs?.([
      "--manifest=deployments/custom.json",
      "--recipient", RECIPIENT,
    ])).toEqual({ manifestPath: "deployments/custom.json", recipient: RECIPIENT });
    expect(module.parsePaymentsSafetyCheckCliArgs?.([])).toMatchObject({
      manifestPath: "deployments/base-sepolia/latest.json",
    });
    expect(() => module.parsePaymentsSafetyCheckCliArgs?.(["--manifest", "a.json", "--manifest", "b.json"]))
      .toThrow("Duplicate argument: --manifest");
    expect(() => module.parsePaymentsSafetyCheckCliArgs?.(["--recipient"])).toThrow("--recipient requires a value");
    expect(() => module.parsePaymentsSafetyCheckCliArgs?.(["--unknown"])).toThrow("Unsupported argument: --unknown");
  });

  it("prints injected safety reports", async () => {
    const module = await import("./safetyCheck.js") as Module;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runPaymentsSafetyCheckCli?.({
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
        return {};
      },
      buildSafetyTransaction: async (params) => {
        calls.push(`build:${typeof params}`);
        const count = calls.filter((call) => call.startsWith("build:")).length;
        if (count === 1) return { allowed: true, decision: { code: "Allowed" }, transaction: { data: "0x1234" } };
        if (count === 2) return { allowed: false, decision: { code: "CapabilityDenied" }, transaction: null };
        return { allowed: false, decision: { code: "ActionValueExceeded" }, transaction: null };
      },
      callUnauthorizedDelegate: async () => true,
      readPaused: async () => false,
    });

    expect(JSON.parse(outputs[0]!)).toEqual({
      chainId: 84532,
      agent: AGENT,
      adapter: ADAPTER,
      checks: {
        allowedPayment: true,
        unknownTargetDenied: true,
        overLimitDenied: true,
        agentUnpaused: true,
        unauthorizedDelegateDenied: true,
      },
    });
  });

  it("sets exit code after failed safety output", async () => {
    const module = await import("./safetyCheck.js") as Module;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await module.runPaymentsSafetyCheckCli?.({
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      loadDotEnv: () => undefined,
      readDeploymentManifest: async () => MANIFEST,
      requireAdapter: () => ADAPTER,
      createPublicClient: () => ({}),
      buildSafetyTransaction: async () => ({ allowed: false, decision: { code: "CapabilityDenied" }, transaction: null }),
      callUnauthorizedDelegate: async () => false,
      readPaused: async () => true,
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({
      checks: { allowedPayment: false, agentUnpaused: false, unauthorizedDelegateDenied: false },
    });
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed arguments before manifest reads", async () => {
    const module = await import("./safetyCheck.js") as Module;
    const calls: string[] = [];

    await expect(module.runPaymentsSafetyCheckCli?.({
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
    const module = await import("./safetyCheck.js") as Module;
    const calls: string[] = [];

    await expect(module.runPaymentsSafetyCheckCli?.({
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      loadDotEnv: () => undefined,
      readDeploymentManifest: async () => ({ ...MANIFEST, chainId: "84532" as unknown as number }),
      requireAdapter: () => ADAPTER,
      createPublicClient: () => ({}),
      buildSafetyTransaction: async () => ({ allowed: true, decision: { code: "Allowed" }, transaction: { data: "0x1234" } }),
      callUnauthorizedDelegate: async () => true,
      readPaused: async () => false,
    })).rejects.toThrow("Payments safety report chainId must be a number");
    expect(calls).toEqual([]);
  });
});
