import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type PlanProposalCliModule = typeof import("./planProposal.js") & {
  isPlanProposalDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parsePlanProposalCliArgs?: (argv: readonly string[]) => {
    planPath: string;
    manifestPath: string;
    outputPath?: string | undefined;
  };
  runPlanProposalCli?: (options?: ProposalRunnerOptions) => Promise<void>;
};

interface ProposalRunnerOptions {
  argv?: readonly string[];
  env?: Record<string, string | undefined>;
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  loadDotEnv?: (path: string, env: Record<string, string | undefined>) => void;
  readManifest?: (path: string) => Promise<ManifestFixture>;
  createPublicClient?: (rpcUrl: string) => PublicClientFixture;
  createPolicySimulator?: (client: PublicClientFixture, manifest: ManifestFixture) => unknown;
  readText?: (path: string) => string;
  parsePlanDocument?: (value: unknown) => PlanDocumentFixture;
  createProposal?: (params: unknown) => Promise<ProposalFixture>;
  createOutput?: (params: unknown) => unknown;
  createSummary?: (params: unknown) => unknown;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

interface ManifestFixture {
  chainId: number;
  rpcUrlEnv: string;
  contracts: {
    agentAccount: string;
  };
}

interface PublicClientFixture {
  getChainId: () => Promise<number>;
}

interface PlanDocumentFixture {
  objective: string;
  steps: readonly unknown[];
}

interface ProposalFixture {
  executable: boolean;
}

const MANIFEST: ManifestFixture = {
  chainId: 84532,
  rpcUrlEnv: "BASE_SEPOLIA_RPC_URL",
  contracts: {
    agentAccount: "0x1111111111111111111111111111111111111111",
  },
};

const OUTPUT = {
  mode: "dry-run",
  chainId: 84532,
  manifest: "deployments/base-sepolia/latest.json",
  plan: "docs/plan.json",
  objective: "Pay",
  agent: "0x1111111111111111111111111111111111111111",
  executable: true,
  steps: [],
};

describe("isPlanProposalDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./planProposal.js") as PlanProposalCliModule;
    const scriptPath = resolve("runtime/cli/agentPlanning/planProposal.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isPlanProposalDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isPlanProposalDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isPlanProposalDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/agentPlanning/intentProposal.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./planProposal.js") as PlanProposalCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/agentPlanning/planProposal.ts")).href;

    expect(() => module.isPlanProposalDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parsePlanProposalCliArgs", () => {
  it("requires a plan path", async () => {
    const module = await import("./planProposal.js") as PlanProposalCliModule;

    expect(() => module.parsePlanProposalCliArgs?.([])).toThrow("--plan is required");
  });

  it("parses split and equals-form plan proposal flags", async () => {
    const module = await import("./planProposal.js") as PlanProposalCliModule;

    expect(module.parsePlanProposalCliArgs?.([
      "--plan",
      "docs/plan.json",
      "--manifest=deployments/base-sepolia/custom.json",
      "--output",
      "artifacts/plan-proposal.json",
    ])).toEqual({
      planPath: "docs/plan.json",
      manifestPath: "deployments/base-sepolia/custom.json",
      outputPath: "artifacts/plan-proposal.json",
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./planProposal.js") as PlanProposalCliModule;

    expect(() => module.parsePlanProposalCliArgs?.(["--plan", "a.json", "--plan", "b.json"])).toThrow(
      "Duplicate argument: --plan",
    );
    expect(() => module.parsePlanProposalCliArgs?.(["--manifest"])).toThrow("--manifest requires a value");
    expect(() => module.parsePlanProposalCliArgs?.(["--plan", "a.json", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runPlanProposalCli", () => {
  it("prints injected executable plan proposal output", async () => {
    const module = await import("./planProposal.js") as PlanProposalCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runPlanProposalCli?.({
      argv: ["--plan", "docs/plan.json"],
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: (output) => outputs.push(output),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      loadDotEnv: (path) => calls.push(`dotenv:${path}`),
      readManifest: async (path) => {
        calls.push(`manifest:${path}`);
        return MANIFEST;
      },
      createPublicClient: (rpcUrl) => {
        calls.push(`client:${rpcUrl}`);
        return { getChainId: async () => 84532 };
      },
      createPolicySimulator: () => {
        calls.push("simulator");
        return {};
      },
      readText: (path) => {
        calls.push(`read:${path}`);
        return "{\"objective\":\"Pay\"}";
      },
      parsePlanDocument: (value) => {
        calls.push(`parse:${typeof value}`);
        return { objective: "Pay", steps: [] };
      },
      createProposal: async (params) => {
        calls.push(`proposal:${typeof params}`);
        return { executable: true };
      },
      createOutput: () => OUTPUT,
      createSummary: () => {
        throw new Error("createSummary should not be called");
      },
      mkdirp: async () => {
        throw new Error("mkdirp should not be called");
      },
      writeText: async () => {
        throw new Error("writeText should not be called");
      },
    });

    expect(outputs).toEqual([JSON.stringify(OUTPUT, null, 2)]);
    expect(calls).toEqual([
      "dotenv:.env",
      "manifest:deployments/base-sepolia/latest.json",
      "client:https://rpc.example",
      "read:docs/plan.json",
      "parse:object",
      "simulator",
      "proposal:object",
    ]);
  });

  it("writes injected non-executable plan proposal summaries before setting exit code", async () => {
    const module = await import("./planProposal.js") as PlanProposalCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];
    const calls: string[] = [];
    const summary = {
      mode: "dry-run",
      chainId: 84532,
      manifest: "deployments/base-sepolia/latest.json",
      plan: "docs/plan.json",
      output: "artifacts/plan-proposal.json",
      executable: false,
      steps: 0,
      written: true,
    };

    await module.runPlanProposalCli?.({
      argv: ["--plan", "docs/plan.json", "--output", "artifacts/plan-proposal.json"],
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      loadDotEnv: () => undefined,
      readManifest: async () => MANIFEST,
      createPublicClient: () => ({ getChainId: async () => 84532 }),
      createPolicySimulator: () => ({}),
      readText: () => "{}",
      parsePlanDocument: () => ({ objective: "Pay", steps: [] }),
      createProposal: async () => ({ executable: false }),
      createOutput: () => ({ ...OUTPUT, executable: false }),
      createSummary: () => summary,
      mkdirp: async (dir) => {
        calls.push(`mkdir:${dir}`);
      },
      writeText: async (path, contents) => {
        calls.push(`write:${path}:${contents}`);
      },
    });

    expect(outputs).toEqual([JSON.stringify(summary, null, 2)]);
    expect(exitCodes).toEqual([1]);
    expect(calls).toEqual([
      "mkdir:artifacts",
      `write:artifacts/plan-proposal.json:${JSON.stringify({ ...OUTPUT, executable: false }, null, 2)}\n`,
    ]);
  });

  it("rejects malformed arguments before dotenv, manifest reads, or RPC setup", async () => {
    const module = await import("./planProposal.js") as PlanProposalCliModule;
    const calls: string[] = [];

    await expect(module.runPlanProposalCli?.({
      argv: ["--unknown"],
      writeOutput: () => calls.push("output"),
      loadDotEnv: () => calls.push("dotenv"),
      readManifest: async () => {
        calls.push("manifest");
        return MANIFEST;
      },
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });

  it("rejects malformed injected proposal output before rendering or exit-code mutation", async () => {
    const module = await import("./planProposal.js") as PlanProposalCliModule;
    const calls: string[] = [];

    await expect(module.runPlanProposalCli?.({
      argv: ["--plan", "docs/plan.json"],
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      loadDotEnv: () => undefined,
      readManifest: async () => MANIFEST,
      createPublicClient: () => ({ getChainId: async () => 84532 }),
      createPolicySimulator: () => ({}),
      readText: () => "{}",
      parsePlanDocument: () => ({ objective: "Pay", steps: [] }),
      createProposal: async () => ({ executable: false }),
      createOutput: () => ({ ...OUTPUT, executable: false, steps: "none" }),
    })).rejects.toThrow("Plan proposal report steps must be an array");
    expect(calls).toEqual([]);
  });

  it("rejects malformed injected write summaries before artifact writes", async () => {
    const module = await import("./planProposal.js") as PlanProposalCliModule;
    const calls: string[] = [];

    await expect(module.runPlanProposalCli?.({
      argv: ["--plan", "docs/plan.json", "--output", "artifacts/plan-proposal.json"],
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      loadDotEnv: () => undefined,
      readManifest: async () => MANIFEST,
      createPublicClient: () => ({ getChainId: async () => 84532 }),
      createPolicySimulator: () => ({}),
      readText: () => "{}",
      parsePlanDocument: () => ({ objective: "Pay", steps: [] }),
      createProposal: async () => ({ executable: false }),
      createOutput: () => ({ ...OUTPUT, executable: false }),
      createSummary: () => ({
        mode: "dry-run",
        chainId: 84532,
        manifest: "deployments/base-sepolia/latest.json",
        plan: "docs/plan.json",
        output: "artifacts/plan-proposal.json",
        executable: false,
        steps: 0,
        written: "yes",
      }),
      mkdirp: async () => {
        calls.push("mkdir");
      },
      writeText: async () => {
        calls.push("write");
      },
    })).rejects.toThrow("Plan proposal write summary written must be true");
    expect(calls).toEqual([]);
  });
});
