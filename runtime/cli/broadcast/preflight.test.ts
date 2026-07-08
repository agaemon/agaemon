import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type BroadcastPreflightCliModule = typeof import("./preflight.js") & {
  isBroadcastPreflightDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseBroadcastPreflightCliArgs?: (argv: readonly string[]) => BroadcastPreflightCliArgs;
  runBroadcastPreflightCli?: (options?: BroadcastPreflightRunnerOptions) => Promise<void>;
};

interface BroadcastPreflightCliArgs {
  deploymentManifestPath: string;
  signedPayloadPath: string;
  payloadPath: string;
  readinessPath: string;
  previewPath: string;
  runbookPath: string;
  executionManifestPath: string;
  bundlePath: string;
  approvalPath: string;
  manifestPath: string;
  proposalPath: string;
  summaryPath: string;
}

interface BroadcastPreflightRunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  loadDotEnv?: (path: string) => void;
  env?: Record<string, string | undefined>;
  readDeploymentManifest?: (path: string) => Promise<{ chainId: number; rpcUrlEnv: string }>;
  createClient?: (rpcUrl: string) => unknown;
  readText?: (path: string) => Promise<string>;
  createPreflight?: (params: unknown) => Promise<BroadcastPreflightReport>;
}

interface BroadcastPreflightReport {
  passed: boolean;
  failures: readonly string[];
  checks: readonly unknown[];
}

const BROADCAST_PREFLIGHT_ARGS = [
  "--signed-payload",
  "artifacts/signed-payload.json",
  "--payload",
  "artifacts/payload.json",
  "--readiness",
  "artifacts/readiness.json",
  "--preview",
  "artifacts/preview.json",
  "--runbook",
  "artifacts/runbook.md",
  "--execution-manifest",
  "artifacts/execution-manifest.json",
  "--bundle",
  "artifacts/bundle.json",
  "--approval",
  "artifacts/approval.json",
  "--manifest",
  "artifacts/manifest.json",
  "--proposal",
  "artifacts/proposal.json",
  "--summary",
  "artifacts/summary.md",
] as const;

const PREFLIGHT_REPORT: BroadcastPreflightReport = {
  passed: true,
  failures: [],
  checks: [{ name: "chain", passed: true, failures: [] }],
};

describe("isBroadcastPreflightDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./preflight.js") as BroadcastPreflightCliModule;
    const scriptPath = resolve("runtime/cli/broadcast/preflight.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isBroadcastPreflightDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isBroadcastPreflightDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isBroadcastPreflightDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/broadcast/package.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./preflight.js") as BroadcastPreflightCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/broadcast/preflight.ts")).href;

    expect(() => module.isBroadcastPreflightDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseBroadcastPreflightCliArgs", () => {
  it("requires signed payload and execution artifact paths", async () => {
    const module = await import("./preflight.js") as BroadcastPreflightCliModule;

    expect(() => module.parseBroadcastPreflightCliArgs?.([])).toThrow("--signed-payload is required");
    expect(() => module.parseBroadcastPreflightCliArgs?.([
      "--signed-payload",
      "artifacts/signed-payload.json",
    ])).toThrow("--payload is required");
  });

  it("parses split and equals-form broadcast preflight flags", async () => {
    const module = await import("./preflight.js") as BroadcastPreflightCliModule;

    expect(module.parseBroadcastPreflightCliArgs?.([
      "--deployment-manifest=deployments/custom.json",
      "--signed-payload",
      "artifacts/signed-payload.json",
      "--payload=artifacts/payload.json",
      "--readiness",
      "artifacts/readiness.json",
      "--preview=artifacts/preview.json",
      "--runbook",
      "artifacts/runbook.md",
      "--execution-manifest=artifacts/execution-manifest.json",
      "--bundle",
      "artifacts/bundle.json",
      "--approval=artifacts/approval.json",
      "--manifest",
      "artifacts/manifest.json",
      "--proposal=artifacts/proposal.json",
      "--summary",
      " artifacts/summary.md ",
    ])).toEqual({
      deploymentManifestPath: "deployments/custom.json",
      signedPayloadPath: "artifacts/signed-payload.json",
      payloadPath: "artifacts/payload.json",
      readinessPath: "artifacts/readiness.json",
      previewPath: "artifacts/preview.json",
      runbookPath: "artifacts/runbook.md",
      executionManifestPath: "artifacts/execution-manifest.json",
      bundlePath: "artifacts/bundle.json",
      approvalPath: "artifacts/approval.json",
      manifestPath: "artifacts/manifest.json",
      proposalPath: "artifacts/proposal.json",
      summaryPath: "artifacts/summary.md",
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./preflight.js") as BroadcastPreflightCliModule;

    expect(() => module.parseBroadcastPreflightCliArgs?.([
      "--signed-payload",
      "a.json",
      "--signed-payload",
      "b.json",
    ])).toThrow("Duplicate argument: --signed-payload");
    expect(() => module.parseBroadcastPreflightCliArgs?.(["--summary"])).toThrow("--summary requires a value");
    expect(() => module.parseBroadcastPreflightCliArgs?.(["--signed-payload", "a.json", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runBroadcastPreflightCli", () => {
  it("creates preflight reports through injected env, manifest, client, and artifact dependencies", async () => {
    const module = await import("./preflight.js") as BroadcastPreflightCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runBroadcastPreflightCli?.({
      argv: BROADCAST_PREFLIGHT_ARGS,
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: (output) => outputs.push(output),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      loadDotEnv: (path) => calls.push(`dotenv:${path}`),
      readDeploymentManifest: async (path) => {
        calls.push(`manifest:${path}`);
        return { chainId: 84532, rpcUrlEnv: "BASE_SEPOLIA_RPC_URL" };
      },
      createClient: (rpcUrl) => {
        calls.push(`client:${rpcUrl}`);
        return { client: true };
      },
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      createPreflight: async (params) => {
        calls.push(`preflight:${typeof params}`);
        return PREFLIGHT_REPORT;
      },
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({
      deploymentManifest: "deployments/base-sepolia/latest.json",
      signedPayload: "artifacts/signed-payload.json",
      readiness: "artifacts/readiness.json",
      passed: true,
      failures: [],
    });
    expect(calls.slice(0, 3)).toEqual([
      "dotenv:.env",
      "manifest:deployments/base-sepolia/latest.json",
      "client:https://rpc.example",
    ]);
    expect(calls).toContain("preflight:object");
  });

  it("rejects malformed arguments before dotenv loading", async () => {
    const module = await import("./preflight.js") as BroadcastPreflightCliModule;
    const calls: string[] = [];

    await expect(module.runBroadcastPreflightCli?.({
      argv: ["--unknown"],
      loadDotEnv: () => calls.push("dotenv"),
      readDeploymentManifest: async () => {
        calls.push("manifest");
        return { chainId: 84532, rpcUrlEnv: "BASE_SEPOLIA_RPC_URL" };
      },
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });

  it("rejects missing RPC URL env values before client creation", async () => {
    const module = await import("./preflight.js") as BroadcastPreflightCliModule;
    const calls: string[] = [];

    await expect(module.runBroadcastPreflightCli?.({
      argv: BROADCAST_PREFLIGHT_ARGS,
      env: {},
      loadDotEnv: (path) => calls.push(`dotenv:${path}`),
      readDeploymentManifest: async (path) => {
        calls.push(`manifest:${path}`);
        return { chainId: 84532, rpcUrlEnv: "BASE_SEPOLIA_RPC_URL" };
      },
      createClient: () => {
        calls.push("client");
        return {};
      },
    })).rejects.toThrow("BASE_SEPOLIA_RPC_URL is required");
    expect(calls).toEqual(["dotenv:.env", "manifest:deployments/base-sepolia/latest.json"]);
  });

  it("sets exit code after failed preflight output", async () => {
    const module = await import("./preflight.js") as BroadcastPreflightCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await module.runBroadcastPreflightCli?.({
      argv: BROADCAST_PREFLIGHT_ARGS,
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      loadDotEnv: () => {},
      readDeploymentManifest: async () => ({ chainId: 84532, rpcUrlEnv: "BASE_SEPOLIA_RPC_URL" }),
      createClient: () => ({}),
      readText: async () => "{}",
      createPreflight: async () => ({ passed: false, failures: ["nonce mismatch"], checks: [] }),
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ passed: false, failures: ["nonce mismatch"] });
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed injected preflight reports before output or exit code mutation", async () => {
    const module = await import("./preflight.js") as BroadcastPreflightCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await expect(module.runBroadcastPreflightCli?.({
      argv: BROADCAST_PREFLIGHT_ARGS,
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      loadDotEnv: () => {},
      readDeploymentManifest: async () => ({ chainId: 84532, rpcUrlEnv: "BASE_SEPOLIA_RPC_URL" }),
      createClient: () => ({}),
      readText: async () => "{}",
      createPreflight: async () => ({
        passed: true,
        failures: [],
        checks: "not-checks",
      } as unknown as BroadcastPreflightReport),
    })).rejects.toThrow("Broadcast preflight report checks must be an array");

    expect(outputs).toEqual([]);
    expect(exitCodes).toEqual([]);
  });
});
