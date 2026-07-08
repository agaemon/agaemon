import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type Module = typeof import("./safetyCheck.js") & {
  isPayoutsSafetyCheckDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parsePayoutsSafetyCheckCliArgs?: (argv: readonly string[]) => Record<string, unknown>;
  runPayoutsSafetyCheckCli?: (options?: RunnerOptions) => Promise<void>;
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
  buildSafetyTransaction?: (params: unknown) => Promise<BuildResult>;
  callPasses?: (params: unknown) => Promise<boolean>;
}

interface Manifest {
  chainId: number;
  rpcUrlEnv: string;
  owner: string;
  contracts: { agentAccount: string };
}

interface PublicClient {
  getChainId: () => Promise<number>;
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
  owner: OWNER,
  contracts: { agentAccount: AGENT },
};
const RULE: Rule = [10n, 20n, true];

describe("payouts safety check CLI seams", () => {
  it("detects direct execution and parses strict args", async () => {
    const module = await import("./safetyCheck.js") as Module;
    const scriptPath = resolve("runtime/cli/payouts/safetyCheck.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isPayoutsSafetyCheckDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(() => module.isPayoutsSafetyCheckDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
    expect(module.parsePayoutsSafetyCheckCliArgs?.([
      "--manifest=deployments/custom.json",
    ])).toEqual({ manifestPath: "deployments/custom.json" });
    expect(module.parsePayoutsSafetyCheckCliArgs?.([])).toMatchObject({
      manifestPath: "deployments/base-sepolia/latest.json",
    });
    expect(() => module.parsePayoutsSafetyCheckCliArgs?.(["--manifest", "a.json", "--manifest", "b.json"]))
      .toThrow("Duplicate argument: --manifest");
    expect(() => module.parsePayoutsSafetyCheckCliArgs?.(["--manifest"])).toThrow("--manifest requires a value");
    expect(() => module.parsePayoutsSafetyCheckCliArgs?.(["--unknown"])).toThrow("Unsupported argument: --unknown");
  });

  it("prints injected safety reports", async () => {
    const module = await import("./safetyCheck.js") as Module;
    const outputs: string[] = [];

    await module.runPayoutsSafetyCheckCli?.({
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example", PAYOUT_RECIPIENT: RECIPIENT },
      writeOutput: (output) => outputs.push(output),
      loadDotEnv: () => undefined,
      readDeploymentManifest: async () => MANIFEST,
      requireAdapter: () => ADAPTER,
      createPublicClient: () => ({ getChainId: async () => 84532 }),
      readPayoutRule: async () => RULE,
      buildSafetyTransaction: async (params) => {
        const kind = (params as { kind: string }).kind;
        if (kind === "allowed") return { allowed: true, decision: { code: "Allowed" }, transaction: { to: AGENT, value: 1n, data: "0x1" } };
        if (kind === "unknownAdapter") return { allowed: false, decision: { code: "CapabilityDenied" }, transaction: null };
        return { allowed: true, decision: { code: "Allowed" }, transaction: { to: AGENT, value: 1n, data: "0x2" } };
      },
      callPasses: async (params) => (params as { expectPass: boolean }).expectPass,
    });

    expect(JSON.parse(outputs[0]!)).toEqual({
      chainId: 84532,
      agent: AGENT,
      adapter: ADAPTER,
      recipient: RECIPIENT,
      rule: { maxActionValue: "10", maxDailyValue: "20", enabled: true },
      checks: {
        payoutRuleEnabled: true,
        allowedPayoutCallable: true,
        unknownAdapterDenied: true,
        unknownRecipientRejected: true,
        overAdapterLimitRejected: true,
        invalidCalldataRejected: true,
      },
    });
  });

  it("sets exit code after failed safety output", async () => {
    const module = await import("./safetyCheck.js") as Module;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await module.runPayoutsSafetyCheckCli?.({
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example", PAYOUT_RECIPIENT: RECIPIENT },
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      loadDotEnv: () => undefined,
      readDeploymentManifest: async () => MANIFEST,
      requireAdapter: () => ADAPTER,
      createPublicClient: () => ({ getChainId: async () => 84532 }),
      readPayoutRule: async () => [10n, 20n, false],
      buildSafetyTransaction: async () => ({ allowed: false, decision: { code: "Denied" }, transaction: null }),
      callPasses: async () => false,
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({
      checks: { payoutRuleEnabled: false, allowedPayoutCallable: false },
    });
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed arguments before manifest reads", async () => {
    const module = await import("./safetyCheck.js") as Module;
    const calls: string[] = [];

    await expect(module.runPayoutsSafetyCheckCli?.({
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

    await expect(module.runPayoutsSafetyCheckCli?.({
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example", PAYOUT_RECIPIENT: RECIPIENT },
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      loadDotEnv: () => undefined,
      readDeploymentManifest: async () => MANIFEST,
      requireAdapter: () => ADAPTER,
      createPublicClient: () => ({ getChainId: async () => 84532 }),
      readPayoutRule: async () => [10n, 20n, "yes" as unknown as boolean],
      buildSafetyTransaction: async () => ({ allowed: true, decision: { code: "Allowed" }, transaction: { to: AGENT, value: 1n, data: "0x1" } }),
      callPasses: async () => true,
    })).rejects.toThrow("Payout safety rule enabled must be a boolean");
    expect(calls).toEqual([]);
  });
});
