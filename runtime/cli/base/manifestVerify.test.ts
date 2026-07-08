import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import { formatManifestVerifyCliOutput } from "./manifestVerify.js";

import type { DeploymentManifest } from "../../base/deploymentManifest.js";
import type { DeploymentManifestVerifyClient } from "../../base/manifestVerifier.js";
import type { ManifestVerifyCliReport } from "./manifestVerify.js";

type ManifestVerifyCliModule = typeof import("./manifestVerify.js") & {
  isManifestVerifyDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseManifestVerifyCliArgs?: (argv: readonly string[]) => {
    manifestPath: string;
    summary: boolean;
  };
  parseManifestVerifyDotEnv?: (contents: string) => readonly (readonly [string, string])[];
  applyManifestVerifyDotEnv?: (
    contents: string,
    env: Record<string, string | undefined>,
  ) => void;
  loadManifestVerifyDotEnv?: (
    path: string,
    env: Record<string, string | undefined>,
    readText?: (path: string) => string,
  ) => void;
  readRequiredManifestVerifyEnv?: (
    env: Record<string, string | undefined>,
    key: string,
  ) => string;
  runManifestVerifyCli?: (options?: {
    argv?: readonly string[];
    env?: Record<string, string | undefined>;
    writeOutput?: (output: string) => void;
    setExitCode?: (code: number) => void;
    loadDotEnv?: (path: string, env: Record<string, string | undefined>) => void;
    readManifest?: (path: string) => Promise<DeploymentManifest>;
    createPublicClient?: (rpcUrl: string) => DeploymentManifestVerifyClient;
    verifyManifest?: (
      manifest: DeploymentManifest,
      client: DeploymentManifestVerifyClient,
    ) => Promise<Omit<ManifestVerifyCliReport, "manifestPath" | "explorerUrl">>;
  }) => Promise<void>;
};

const MANIFEST: DeploymentManifest = {
  network: "base-sepolia",
  chainId: 84532,
  rpcUrlEnv: "BASE_SEPOLIA_RPC_URL",
  explorerUrl: "https://sepolia.basescan.org",
  owner: "0x0000000000000000000000000000000000002001",
  contracts: {
    capabilityRegistry: "0x0000000000000000000000000000000000001001",
    policyEngine: "0x0000000000000000000000000000000000001002",
    reputationRegistry: "0x0000000000000000000000000000000000001003",
    agentAccount: "0x0000000000000000000000000000000000001004",
    testTargetProtocol: "0x0000000000000000000000000000000000001005",
  },
  transactions: {
    deployCapabilityRegistry: "0x1111111111111111111111111111111111111111111111111111111111111111",
    deployPolicyEngine: "0x1111111111111111111111111111111111111111111111111111111111111112",
    deployReputationRegistry: "0x1111111111111111111111111111111111111111111111111111111111111113",
    deployAgentAccount: "0x1111111111111111111111111111111111111111111111111111111111111114",
    deployTestTargetProtocol: "0x1111111111111111111111111111111111111111111111111111111111111115",
    setCapability: "0x1111111111111111111111111111111111111111111111111111111111111116",
    setPolicy: "0x1111111111111111111111111111111111111111111111111111111111111117",
    smokeExecute: "0x1111111111111111111111111111111111111111111111111111111111111118",
  },
  smokeTest: {
    capability: "0x2222222222222222222222222222222222222222222222222222222222222222",
    targetWasCalled: true,
  },
};

const REPORT: ManifestVerifyCliReport = {
  manifestPath: "deployments/base-sepolia/latest.json",
  explorerUrl: "https://sepolia.basescan.org",
  network: "base-sepolia",
  chainId: {
    expected: 84532,
    actual: 84532,
    passed: true,
  },
  contracts: [
    {
      name: "capabilityRegistry",
      address: "0x0000000000000000000000000000000000001001",
      deployed: true,
      bytecodeBytes: 2,
      passed: true,
    },
  ],
  transactions: [
    {
      name: "setCapability",
      hash: "0x2222222222222222222222222222222222222222222222222222222222222222",
      status: "success",
      blockNumber: "124",
      contractAddress: null,
      passed: true,
    },
  ],
  summary: {
    contractCount: 1,
    transactionCount: 1,
    failedChecks: 0,
    passed: true,
  },
};

const { manifestPath: _manifestPath, explorerUrl: _explorerUrl, ...VERIFY_REPORT } = REPORT;

const FAILED_REPORT: Omit<ManifestVerifyCliReport, "manifestPath" | "explorerUrl"> = {
  ...VERIFY_REPORT,
  summary: {
    contractCount: 1,
    transactionCount: 1,
    failedChecks: 1,
    passed: false,
  },
};

describe("formatManifestVerifyCliOutput", () => {
  it("keeps JSON manifest verification output available for automation", () => {
    expect(formatManifestVerifyCliOutput(REPORT, false)).toBe(JSON.stringify(REPORT, null, 2));
  });

  it("renders a readable manifest verification summary when requested", () => {
    expect(formatManifestVerifyCliOutput(REPORT, true)).toBe([
      "Base Sepolia manifest verification",
      "network: base-sepolia",
      "chainId: 84532",
      "contracts: 1",
      "transactions: 1",
      "failedChecks: 0",
      "passed: true",
    ].join("\n"));
  });
});

describe("isManifestVerifyDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./manifestVerify.js") as ManifestVerifyCliModule;
    const scriptPath = resolve("runtime/cli/base/manifestVerify.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isManifestVerifyDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isManifestVerifyDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isManifestVerifyDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/base/execute.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./manifestVerify.js") as ManifestVerifyCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/base/manifestVerify.ts")).href;

    expect(() => module.isManifestVerifyDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
    expect(() => module.isManifestVerifyDirectRun?.(
      moduleUrl,
      ["node", 123] as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseManifestVerifyCliArgs", () => {
  it("uses JSON output and the default manifest when no flags are provided", async () => {
    const module = await import("./manifestVerify.js") as ManifestVerifyCliModule;

    expect(module.parseManifestVerifyCliArgs?.([])).toEqual({
      manifestPath: "deployments/base-sepolia/latest.json",
      summary: false,
    });
  });

  it("parses summary mode and manifest flags", async () => {
    const module = await import("./manifestVerify.js") as ManifestVerifyCliModule;

    expect(module.parseManifestVerifyCliArgs?.([
      "--summary",
      "--manifest",
      "deployments/base-sepolia/custom.json",
    ])).toEqual({
      manifestPath: "deployments/base-sepolia/custom.json",
      summary: true,
    });

    expect(module.parseManifestVerifyCliArgs?.([
      "--manifest=deployments/base-sepolia/custom.json",
    ])).toEqual({
      manifestPath: "deployments/base-sepolia/custom.json",
      summary: false,
    });
  });

  it("rejects duplicate, missing, and unsupported arguments before side effects", async () => {
    const module = await import("./manifestVerify.js") as ManifestVerifyCliModule;

    expect(() => module.parseManifestVerifyCliArgs?.(["--summary", "--summary"])).toThrow(
      "Duplicate argument: --summary",
    );
    expect(() => module.parseManifestVerifyCliArgs?.(["--manifest", "a.json", "--manifest", "b.json"])).toThrow(
      "Duplicate argument: --manifest",
    );
    expect(() => module.parseManifestVerifyCliArgs?.(["--manifest"])).toThrow(
      "--manifest requires a value",
    );
    expect(() => module.parseManifestVerifyCliArgs?.(["--manifest", "--summary"])).toThrow(
      "--manifest requires a value",
    );
    expect(() => module.parseManifestVerifyCliArgs?.(["--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("parseManifestVerifyDotEnv", () => {
  it("parses supported dotenv lines without mutating process env", async () => {
    const module = await import("./manifestVerify.js") as ManifestVerifyCliModule;

    expect(module.parseManifestVerifyDotEnv?.([
      "# comment",
      "BASE_SEPOLIA_RPC_URL=https://rpc.example",
      "export PRIVATE_KEY='0xabc'",
      "QUOTED=\"hello world\"",
      "NO_EQUALS",
      "BAD-KEY=value",
      "",
    ].join("\n"))).toEqual([
      ["BASE_SEPOLIA_RPC_URL", "https://rpc.example"],
      ["PRIVATE_KEY", "0xabc"],
      ["QUOTED", "hello world"],
    ]);
  });
});

describe("loadManifestVerifyDotEnv", () => {
  it("applies parsed values without overwriting existing environment values", async () => {
    const module = await import("./manifestVerify.js") as ManifestVerifyCliModule;
    const env: Record<string, string | undefined> = {
      BASE_SEPOLIA_RPC_URL: "https://existing.example",
    };

    module.loadManifestVerifyDotEnv?.(".env", env, () => [
      "BASE_SEPOLIA_RPC_URL=https://new.example",
      "NEW_VALUE=present",
    ].join("\n"));

    expect(env).toEqual({
      BASE_SEPOLIA_RPC_URL: "https://existing.example",
      NEW_VALUE: "present",
    });
  });

  it("ignores missing dotenv files", async () => {
    const module = await import("./manifestVerify.js") as ManifestVerifyCliModule;
    const env: Record<string, string | undefined> = {};

    module.loadManifestVerifyDotEnv?.(".env", env, () => {
      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    });

    expect(env).toEqual({});
  });
});

describe("readRequiredManifestVerifyEnv", () => {
  it("rejects missing, empty, and whitespace-only values with the manifest env key", async () => {
    const module = await import("./manifestVerify.js") as ManifestVerifyCliModule;

    expect(() => module.readRequiredManifestVerifyEnv?.({}, "BASE_SEPOLIA_RPC_URL")).toThrow(
      "BASE_SEPOLIA_RPC_URL is required",
    );
    expect(() => module.readRequiredManifestVerifyEnv?.({ BASE_SEPOLIA_RPC_URL: "" }, "BASE_SEPOLIA_RPC_URL")).toThrow(
      "BASE_SEPOLIA_RPC_URL is required",
    );
    expect(() => module.readRequiredManifestVerifyEnv?.({ BASE_SEPOLIA_RPC_URL: "  " }, "BASE_SEPOLIA_RPC_URL")).toThrow(
      "BASE_SEPOLIA_RPC_URL is required",
    );
  });

  it("returns valid values unchanged", async () => {
    const module = await import("./manifestVerify.js") as ManifestVerifyCliModule;

    expect(module.readRequiredManifestVerifyEnv?.(
      { BASE_SEPOLIA_RPC_URL: " https://rpc.example " },
      "BASE_SEPOLIA_RPC_URL",
    )).toBe(" https://rpc.example ");
  });
});

describe("runManifestVerifyCli", () => {
  it("formats injected verification reports as JSON without live RPC", async () => {
    const module = await import("./manifestVerify.js") as ManifestVerifyCliModule;
    const outputs: string[] = [];
    const client: DeploymentManifestVerifyClient = {
      getChainId: async () => 84532,
      getCode: async () => "0x12",
      getTransactionReceipt: async () => ({
        status: "success",
        blockNumber: 124n,
        contractAddress: null,
      }),
    };
    const seen: Array<{ manifestPath?: string; rpcUrl?: string; client?: DeploymentManifestVerifyClient }> = [];

    await module.runManifestVerifyCli?.({
      argv: ["--manifest", "custom.json"],
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: (output) => outputs.push(output),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      loadDotEnv: () => undefined,
      readManifest: async (manifestPath) => {
        seen.push({ manifestPath });
        return MANIFEST;
      },
      createPublicClient: (rpcUrl) => {
        seen.push({ rpcUrl });
        return client;
      },
      verifyManifest: async (manifest, client) => {
        seen.push({ client });
        expect(manifest).toBe(MANIFEST);
        return VERIFY_REPORT;
      },
    });

    expect(outputs).toEqual([JSON.stringify({
      ...VERIFY_REPORT,
      manifestPath: "custom.json",
      explorerUrl: MANIFEST.explorerUrl,
    }, null, 2)]);
    expect(seen).toEqual([
      { manifestPath: "custom.json" },
      { rpcUrl: "https://rpc.example" },
      { client },
    ]);
  });

  it("formats injected verification reports as a summary", async () => {
    const module = await import("./manifestVerify.js") as ManifestVerifyCliModule;
    const outputs: string[] = [];

    await module.runManifestVerifyCli?.({
      argv: ["--summary"],
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: (output) => outputs.push(output),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      loadDotEnv: () => undefined,
      readManifest: async () => MANIFEST,
      createPublicClient: () => ({
        getChainId: async () => 84532,
        getCode: async () => "0x12",
        getTransactionReceipt: async () => ({
          status: "success",
          blockNumber: 124n,
          contractAddress: null,
        }),
      }),
      verifyManifest: async () => VERIFY_REPORT,
    });

    expect(outputs).toEqual([formatManifestVerifyCliOutput({
      ...VERIFY_REPORT,
      manifestPath: "deployments/base-sepolia/latest.json",
      explorerUrl: MANIFEST.explorerUrl,
    }, true)]);
  });

  it("sets exit code 1 after emitting failed verification output", async () => {
    const module = await import("./manifestVerify.js") as ManifestVerifyCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await module.runManifestVerifyCli?.({
      argv: ["--summary"],
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      loadDotEnv: () => undefined,
      readManifest: async () => MANIFEST,
      createPublicClient: () => ({
        getChainId: async () => 84532,
        getCode: async () => "0x12",
        getTransactionReceipt: async () => ({
          status: "success",
          blockNumber: 124n,
          contractAddress: null,
        }),
      }),
      verifyManifest: async () => FAILED_REPORT,
    });

    expect(outputs).toEqual([formatManifestVerifyCliOutput({
      manifestPath: "deployments/base-sepolia/latest.json",
      explorerUrl: MANIFEST.explorerUrl,
      ...FAILED_REPORT,
    }, true)]);
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed arguments before dotenv, manifest reads, or RPC setup", async () => {
    const module = await import("./manifestVerify.js") as ManifestVerifyCliModule;
    const calls: string[] = [];

    await expect(module.runManifestVerifyCli?.({
      argv: ["--unknown"],
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: () => calls.push("write"),
      loadDotEnv: () => calls.push("dotenv"),
      readManifest: async () => {
        calls.push("manifest");
        return MANIFEST;
      },
      createPublicClient: () => {
        calls.push("client");
        throw new Error("should not create client");
      },
      verifyManifest: async () => {
        calls.push("verify");
        return VERIFY_REPORT;
      },
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });

  it("rejects malformed output writers before dotenv, manifest reads, or RPC setup", async () => {
    const module = await import("./manifestVerify.js") as ManifestVerifyCliModule;
    const calls: string[] = [];

    await expect(module.runManifestVerifyCli?.({
      argv: [],
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: "not-a-function" as unknown as (output: string) => void,
      loadDotEnv: () => calls.push("dotenv"),
      readManifest: async () => {
        calls.push("manifest");
        return MANIFEST;
      },
      createPublicClient: () => {
        calls.push("client");
        throw new Error("should not create client");
      },
      verifyManifest: async () => {
        calls.push("verify");
        return VERIFY_REPORT;
      },
    })).rejects.toThrow("Output writer must be a function");
    expect(calls).toEqual([]);
  });

  it("rejects missing manifest RPC env before client creation", async () => {
    const module = await import("./manifestVerify.js") as ManifestVerifyCliModule;
    const calls: string[] = [];

    await expect(module.runManifestVerifyCli?.({
      argv: [],
      env: {},
      writeOutput: () => calls.push("write"),
      loadDotEnv: () => calls.push("dotenv"),
      readManifest: async () => {
        calls.push("manifest");
        return MANIFEST;
      },
      createPublicClient: () => {
        calls.push("client");
        throw new Error("should not create client");
      },
      verifyManifest: async () => {
        calls.push("verify");
        return VERIFY_REPORT;
      },
    })).rejects.toThrow("BASE_SEPOLIA_RPC_URL is required");
    expect(calls).toEqual(["dotenv", "manifest"]);
  });
});
