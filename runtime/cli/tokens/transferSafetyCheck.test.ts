import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type Module = typeof import("./transferSafetyCheck.js") & {
  isTokenTransferSafetyCheckDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseTokenTransferSafetyCheckCliArgs?: (argv: readonly string[]) => Record<string, unknown>;
  runTokenTransferSafetyCheckCli?: (options?: RunnerOptions) => Promise<void>;
};

interface RunnerOptions {
  argv?: readonly string[];
  env?: Record<string, string | undefined>;
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  loadDotEnv?: (path: string, env: Record<string, string | undefined>) => void;
  readDeploymentManifest?: (path: string) => Promise<Manifest>;
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
const TOKEN = "0x3333333333333333333333333333333333333333";
const RECIPIENT = "0x4444444444444444444444444444444444444444";
const MANIFEST: Manifest = {
  chainId: 84532,
  rpcUrlEnv: "BASE_SEPOLIA_RPC_URL",
  owner: OWNER,
  contracts: { agentAccount: AGENT },
};

describe("token transfer safety check CLI seams", () => {
  it("detects direct execution and parses strict args", async () => {
    const module = await import("./transferSafetyCheck.js") as Module;
    const scriptPath = resolve("runtime/cli/tokens/transferSafetyCheck.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isTokenTransferSafetyCheckDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(() => module.isTokenTransferSafetyCheckDirectRun?.(moduleUrl, "bad" as unknown as readonly string[]))
      .toThrow("Direct-run argv must be an array of strings");
    expect(module.parseTokenTransferSafetyCheckCliArgs?.([
      "--manifest=deployments/custom.json",
      "--recipient", RECIPIENT,
    ])).toEqual({ manifestPath: "deployments/custom.json", recipient: RECIPIENT });
    expect(module.parseTokenTransferSafetyCheckCliArgs?.([])).toMatchObject({
      manifestPath: "deployments/base-sepolia/latest.json",
    });
    expect(() => module.parseTokenTransferSafetyCheckCliArgs?.(["--manifest", "a.json", "--manifest", "b.json"]))
      .toThrow("Duplicate argument: --manifest");
    expect(() => module.parseTokenTransferSafetyCheckCliArgs?.(["--recipient"])).toThrow("--recipient requires a value");
    expect(() => module.parseTokenTransferSafetyCheckCliArgs?.(["--unknown"])).toThrow("Unsupported argument: --unknown");
  });

  it("prints injected safety reports", async () => {
    const module = await import("./transferSafetyCheck.js") as Module;
    const outputs: string[] = [];

    await module.runTokenTransferSafetyCheckCli?.({
      argv: ["--recipient", RECIPIENT],
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: (output) => outputs.push(output),
      loadDotEnv: () => undefined,
      readDeploymentManifest: async () => MANIFEST,
      requireToken: () => TOKEN,
      createPublicClient: () => ({}),
      buildSafetyTransaction: async (params) => {
        const kind = (params as { kind: string }).kind;
        if (kind === "allowed") return { allowed: true, decision: { code: "Allowed" }, transaction: {} };
        if (kind === "unknownToken") return { allowed: false, decision: { code: "CapabilityDenied" }, transaction: null };
        if (kind === "overLimit") return { allowed: false, decision: { code: "TokenActionAmountExceeded" }, transaction: null };
        return { allowed: false, decision: { code: "InvalidTokenTransfer" }, transaction: null };
      },
    });

    expect(JSON.parse(outputs[0]!)).toEqual({
      chainId: 84532,
      agent: AGENT,
      token: TOKEN,
      checks: {
        allowedTransfer: true,
        unknownTokenDenied: true,
        overLimitDenied: true,
        invalidCalldataDenied: true,
      },
    });
  });

  it("sets exit code after failed safety output", async () => {
    const module = await import("./transferSafetyCheck.js") as Module;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await module.runTokenTransferSafetyCheckCli?.({
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      loadDotEnv: () => undefined,
      readDeploymentManifest: async () => MANIFEST,
      requireToken: () => TOKEN,
      createPublicClient: () => ({}),
      buildSafetyTransaction: async () => ({ allowed: false, decision: { code: "Denied" }, transaction: null }),
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ checks: { allowedTransfer: false } });
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed arguments before manifest reads", async () => {
    const module = await import("./transferSafetyCheck.js") as Module;
    const calls: string[] = [];

    await expect(module.runTokenTransferSafetyCheckCli?.({
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
    const module = await import("./transferSafetyCheck.js") as Module;
    const calls: string[] = [];

    await expect(module.runTokenTransferSafetyCheckCli?.({
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      loadDotEnv: () => undefined,
      readDeploymentManifest: async () => ({ ...MANIFEST, chainId: "84532" as unknown as number }),
      requireToken: () => TOKEN,
      createPublicClient: () => ({}),
      buildSafetyTransaction: async () => ({ allowed: true, decision: { code: "Allowed" }, transaction: {} }),
    })).rejects.toThrow("Token transfer safety report chainId must be a number");
    expect(calls).toEqual([]);
  });
});
