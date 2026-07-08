import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type ProposalExecutionReadinessCliModule = typeof import("./readiness.js") & {
  isProposalExecutionReadinessDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseProposalExecutionReadinessCliArgs?: (argv: readonly string[]) => ReadinessCliArgs;
  runProposalExecutionReadinessCli?: (options?: ReadinessRunnerOptions) => Promise<void>;
};

interface ReadinessCliArgs {
  signer: string;
  deploymentManifestPath: string;
  previewPath: string;
  runbookPath: string;
  executionManifestPath: string;
  bundlePath: string;
  approvalPath: string;
  manifestPath: string;
  proposalPath: string;
  summaryPath: string;
  outputPath?: string | undefined;
}

interface ReadinessRunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  loadDotEnv?: (path: string) => void;
  env?: Record<string, string | undefined>;
  readDeploymentManifest?: (path: string) => Promise<{ chainId: number; rpcUrlEnv: string }>;
  createClient?: (rpcUrl: string) => unknown;
  readText?: (path: string) => Promise<string>;
  createReadiness?: (params: unknown) => Promise<ReadinessReport>;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

interface ReadinessReport {
  passed: boolean;
  failures: readonly string[];
  checks: readonly unknown[];
}

const SIGNER = "0x1111111111111111111111111111111111111111";
const READINESS_ARGS = [
  "--signer",
  SIGNER,
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

const READINESS_REPORT: ReadinessReport = {
  passed: true,
  failures: [],
  checks: [{ name: "chain", passed: true, failures: [] }],
};

describe("isProposalExecutionReadinessDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./readiness.js") as ProposalExecutionReadinessCliModule;
    const scriptPath = resolve("runtime/cli/proposalExecution/readiness.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isProposalExecutionReadinessDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isProposalExecutionReadinessDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isProposalExecutionReadinessDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/proposalExecution/readinessVerify.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./readiness.js") as ProposalExecutionReadinessCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/proposalExecution/readiness.ts")).href;

    expect(() => module.isProposalExecutionReadinessDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseProposalExecutionReadinessCliArgs", () => {
  it("requires signer and execution artifact paths", async () => {
    const module = await import("./readiness.js") as ProposalExecutionReadinessCliModule;

    expect(() => module.parseProposalExecutionReadinessCliArgs?.([])).toThrow("--signer is required");
    expect(() => module.parseProposalExecutionReadinessCliArgs?.(["--signer", SIGNER])).toThrow(
      "--preview is required",
    );
  });

  it("parses split and equals-form readiness flags", async () => {
    const module = await import("./readiness.js") as ProposalExecutionReadinessCliModule;

    expect(module.parseProposalExecutionReadinessCliArgs?.([
      `--signer=${SIGNER}`,
      "--deployment-manifest",
      "deployments/custom.json",
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
      "--output=artifacts/readiness.json",
    ])).toEqual({
      signer: SIGNER,
      deploymentManifestPath: "deployments/custom.json",
      previewPath: "artifacts/preview.json",
      runbookPath: "artifacts/runbook.md",
      executionManifestPath: "artifacts/execution-manifest.json",
      bundlePath: "artifacts/bundle.json",
      approvalPath: "artifacts/approval.json",
      manifestPath: "artifacts/manifest.json",
      proposalPath: "artifacts/proposal.json",
      summaryPath: "artifacts/summary.md",
      outputPath: "artifacts/readiness.json",
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./readiness.js") as ProposalExecutionReadinessCliModule;

    expect(() => module.parseProposalExecutionReadinessCliArgs?.(["--signer", SIGNER, "--signer", SIGNER])).toThrow(
      "Duplicate argument: --signer",
    );
    expect(() => module.parseProposalExecutionReadinessCliArgs?.(["--summary"])).toThrow("--summary requires a value");
    expect(() => module.parseProposalExecutionReadinessCliArgs?.(["--signer", SIGNER, "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runProposalExecutionReadinessCli", () => {
  it("creates readiness reports through injected env, manifest, client, and artifact dependencies", async () => {
    const module = await import("./readiness.js") as ProposalExecutionReadinessCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runProposalExecutionReadinessCli?.({
      argv: [...READINESS_ARGS, "--output", "artifacts/readiness.json"],
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
      createReadiness: async (params) => {
        calls.push(`readiness:${typeof params}`);
        return READINESS_REPORT;
      },
      mkdirp: async (dir) => {
        calls.push(`mkdir:${dir}`);
      },
      writeText: async (path, contents) => {
        calls.push(`write:${path}:${contents}`);
      },
    });

    const output = {
      deploymentManifest: "deployments/base-sepolia/latest.json",
      preview: "artifacts/preview.json",
      runbook: "artifacts/runbook.md",
      executionManifest: "artifacts/execution-manifest.json",
      bundle: "artifacts/bundle.json",
      approval: "artifacts/approval.json",
      manifest: "artifacts/manifest.json",
      proposal: "artifacts/proposal.json",
      summary: "artifacts/summary.md",
      ...READINESS_REPORT,
    };
    expect(outputs).toEqual([JSON.stringify(output, null, 2)]);
    expect(calls).toEqual([
      "dotenv:.env",
      "manifest:deployments/base-sepolia/latest.json",
      "client:https://rpc.example",
      "read:artifacts/preview.json",
      "read:artifacts/runbook.md",
      "read:artifacts/execution-manifest.json",
      "read:artifacts/bundle.json",
      "read:artifacts/approval.json",
      "read:artifacts/manifest.json",
      "read:artifacts/proposal.json",
      "read:artifacts/summary.md",
      "readiness:object",
      "mkdir:artifacts",
      `write:artifacts/readiness.json:${JSON.stringify(output, null, 2)}\n`,
    ]);
  });

  it("rejects invalid signers before deployment manifest reads or client creation", async () => {
    const module = await import("./readiness.js") as ProposalExecutionReadinessCliModule;
    const calls: string[] = [];

    await expect(module.runProposalExecutionReadinessCli?.({
      argv: ["--signer", "not-an-address", ...READINESS_ARGS.slice(2)],
      loadDotEnv: (path) => calls.push(`dotenv:${path}`),
      readDeploymentManifest: async () => {
        calls.push("manifest");
        return { chainId: 84532, rpcUrlEnv: "BASE_SEPOLIA_RPC_URL" };
      },
      createClient: () => {
        calls.push("client");
        return {};
      },
    })).rejects.toThrow("--signer must be an EVM address");
    expect(calls).toEqual(["dotenv:.env"]);
  });

  it("rejects missing RPC URL env values before client creation", async () => {
    const module = await import("./readiness.js") as ProposalExecutionReadinessCliModule;
    const calls: string[] = [];

    await expect(module.runProposalExecutionReadinessCli?.({
      argv: READINESS_ARGS,
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

  it("sets exit code after failed readiness output", async () => {
    const module = await import("./readiness.js") as ProposalExecutionReadinessCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await module.runProposalExecutionReadinessCli?.({
      argv: READINESS_ARGS,
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      loadDotEnv: () => {},
      readDeploymentManifest: async () => ({ chainId: 84532, rpcUrlEnv: "BASE_SEPOLIA_RPC_URL" }),
      createClient: () => ({}),
      readText: async () => "{}",
      createReadiness: async () => ({ passed: false, failures: ["chain mismatch"], checks: [] }),
    });

    expect(outputs).toHaveLength(1);
    expect(JSON.parse(outputs[0]!)).toMatchObject({ passed: false, failures: ["chain mismatch"] });
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed injected readiness reports before output or writes", async () => {
    const module = await import("./readiness.js") as ProposalExecutionReadinessCliModule;
    const outputs: string[] = [];
    const writes: string[] = [];

    await expect(module.runProposalExecutionReadinessCli?.({
      argv: [...READINESS_ARGS, "--output", "artifacts/readiness.json"],
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: (output) => outputs.push(output),
      loadDotEnv: () => {},
      readDeploymentManifest: async () => ({ chainId: 84532, rpcUrlEnv: "BASE_SEPOLIA_RPC_URL" }),
      createClient: () => ({}),
      readText: async () => "{}",
      createReadiness: async () => ({ ...READINESS_REPORT, checks: "none" } as unknown as ReadinessReport),
      writeText: async (path) => {
        writes.push(path);
      },
    })).rejects.toThrow("Proposal execution readiness report checks must be an array");
    expect(outputs).toEqual([]);
    expect(writes).toEqual([]);
  });
});
