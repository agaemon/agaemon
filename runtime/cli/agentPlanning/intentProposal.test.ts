import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type IntentProposalCliModule = typeof import("./intentProposal.js") & {
  isIntentProposalDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseIntentProposalCliArgs?: (argv: readonly string[]) => {
    intentPath: string;
    manifestPath: string;
    outputPath?: string | undefined;
  };
  runIntentProposalCli?: (options?: ProposalRunnerOptions) => Promise<void>;
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
  parseIntentDocument?: (value: unknown) => unknown;
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

const PROPOSAL: ProposalFixture = {
  executable: true,
};

const OUTPUT = {
  mode: "dry-run",
  chainId: 84532,
  manifest: "deployments/base-sepolia/latest.json",
  intent: "docs/intent.json",
  objective: "Pay",
  agent: "0x1111111111111111111111111111111111111111",
  executable: true,
  steps: [],
};

describe("isIntentProposalDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./intentProposal.js") as IntentProposalCliModule;
    const scriptPath = resolve("runtime/cli/agentPlanning/intentProposal.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isIntentProposalDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isIntentProposalDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isIntentProposalDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/agentPlanning/planProposal.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./intentProposal.js") as IntentProposalCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/agentPlanning/intentProposal.ts")).href;

    expect(() => module.isIntentProposalDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseIntentProposalCliArgs", () => {
  it("requires an intent path", async () => {
    const module = await import("./intentProposal.js") as IntentProposalCliModule;

    expect(() => module.parseIntentProposalCliArgs?.([])).toThrow("--intent is required");
  });

  it("parses split and equals-form intent proposal flags", async () => {
    const module = await import("./intentProposal.js") as IntentProposalCliModule;

    expect(module.parseIntentProposalCliArgs?.([
      "--intent",
      "docs/intent.json",
      "--manifest=deployments/base-sepolia/custom.json",
      "--output",
      "artifacts/intent-proposal.json",
    ])).toEqual({
      intentPath: "docs/intent.json",
      manifestPath: "deployments/base-sepolia/custom.json",
      outputPath: "artifacts/intent-proposal.json",
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./intentProposal.js") as IntentProposalCliModule;

    expect(() => module.parseIntentProposalCliArgs?.(["--intent", "a.json", "--intent", "b.json"])).toThrow(
      "Duplicate argument: --intent",
    );
    expect(() => module.parseIntentProposalCliArgs?.(["--manifest"])).toThrow("--manifest requires a value");
    expect(() => module.parseIntentProposalCliArgs?.(["--intent", "a.json", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runIntentProposalCli", () => {
  it("prints injected executable intent proposal output", async () => {
    const module = await import("./intentProposal.js") as IntentProposalCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runIntentProposalCli?.({
      argv: ["--intent", "docs/intent.json"],
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
      parseIntentDocument: (value) => {
        calls.push(`parse:${typeof value}`);
        return { objective: "Pay", intents: [] };
      },
      createProposal: async () => {
        calls.push("proposal");
        return PROPOSAL;
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
      "read:docs/intent.json",
      "parse:object",
      "simulator",
      "proposal",
    ]);
  });

  it("writes injected non-executable intent proposal summaries before setting exit code", async () => {
    const module = await import("./intentProposal.js") as IntentProposalCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];
    const calls: string[] = [];
    const summary = {
      mode: "dry-run",
      chainId: 84532,
      manifest: "deployments/base-sepolia/latest.json",
      intent: "docs/intent.json",
      output: "artifacts/intent-proposal.json",
      executable: false,
      steps: 0,
      written: true,
    };

    await module.runIntentProposalCli?.({
      argv: ["--intent", "docs/intent.json", "--output", "artifacts/intent-proposal.json"],
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      loadDotEnv: () => undefined,
      readManifest: async () => MANIFEST,
      createPublicClient: () => ({ getChainId: async () => 84532 }),
      createPolicySimulator: () => ({}),
      readText: () => "{}",
      parseIntentDocument: () => ({ objective: "Pay", intents: [] }),
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
      `write:artifacts/intent-proposal.json:${JSON.stringify({ ...OUTPUT, executable: false }, null, 2)}\n`,
    ]);
  });

  it("rejects malformed arguments before dotenv, manifest reads, or RPC setup", async () => {
    const module = await import("./intentProposal.js") as IntentProposalCliModule;
    const calls: string[] = [];

    await expect(module.runIntentProposalCli?.({
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
    const module = await import("./intentProposal.js") as IntentProposalCliModule;
    const calls: string[] = [];

    await expect(module.runIntentProposalCli?.({
      argv: ["--intent", "docs/intent.json"],
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      loadDotEnv: () => undefined,
      readManifest: async () => MANIFEST,
      createPublicClient: () => ({ getChainId: async () => 84532 }),
      createPolicySimulator: () => ({}),
      readText: () => "{}",
      parseIntentDocument: () => ({ objective: "Pay", intents: [] }),
      createProposal: async () => ({ executable: false }),
      createOutput: () => ({ ...OUTPUT, executable: false, steps: "none" }),
    })).rejects.toThrow("Intent proposal report steps must be an array");
    expect(calls).toEqual([]);
  });

  it("rejects malformed injected write summaries before artifact writes", async () => {
    const module = await import("./intentProposal.js") as IntentProposalCliModule;
    const calls: string[] = [];

    await expect(module.runIntentProposalCli?.({
      argv: ["--intent", "docs/intent.json", "--output", "artifacts/intent-proposal.json"],
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      loadDotEnv: () => undefined,
      readManifest: async () => MANIFEST,
      createPublicClient: () => ({ getChainId: async () => 84532 }),
      createPolicySimulator: () => ({}),
      readText: () => "{}",
      parseIntentDocument: () => ({ objective: "Pay", intents: [] }),
      createProposal: async () => ({ executable: false }),
      createOutput: () => ({ ...OUTPUT, executable: false }),
      createSummary: () => ({
        mode: "dry-run",
        chainId: 84532,
        manifest: "deployments/base-sepolia/latest.json",
        intent: "docs/intent.json",
        output: "artifacts/intent-proposal.json",
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
    })).rejects.toThrow("Intent proposal write summary written must be true");
    expect(calls).toEqual([]);
  });
});
