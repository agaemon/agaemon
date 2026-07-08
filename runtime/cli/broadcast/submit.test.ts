import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type BroadcastSubmitCliModule = typeof import("./submit.js") & {
  isBroadcastSubmitDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseBroadcastSubmitCliArgs?: (argv: readonly string[]) => BroadcastSubmitCliArgs;
  runBroadcastSubmitCli?: (options?: BroadcastSubmitRunnerOptions) => Promise<void>;
};

interface BroadcastSubmitCliArgs {
  send: boolean;
  deploymentManifestPath: string;
  broadcastPackagePath: string;
  broadcastPreflightPath: string;
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
  receiptOutputPath?: string | undefined;
}

interface BroadcastSubmitRunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  loadDotEnv?: (path: string) => void;
  env?: Record<string, string | undefined>;
  readDeploymentManifest?: (path: string) => Promise<{ rpcUrlEnv: string; explorerUrl: string }>;
  createClient?: (rpcUrl: string) => unknown;
  readText?: (path: string) => Promise<string>;
  submitBroadcast?: (params: unknown) => Promise<BroadcastSubmitResult>;
  createReceipt?: (params: unknown) => BroadcastReceiptResult;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

interface BroadcastSubmitResult {
  mode: "dry-run" | "send";
  passed: boolean;
  failures: readonly string[];
  submitted: readonly BroadcastSubmittedTransaction[];
}

interface BroadcastSubmittedTransaction {
  index: number;
  hash: string;
  blockNumber: string;
  status: "success" | "reverted";
}

interface BroadcastReceiptResult {
  passed: boolean;
  failures: readonly string[];
  receipt: unknown;
}

const BROADCAST_SUBMIT_ARGS = [
  "--broadcast-package",
  "artifacts/broadcast-package.json",
  "--broadcast-preflight",
  "artifacts/broadcast-preflight.json",
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

const SUBMIT_RESULT: BroadcastSubmitResult = {
  mode: "dry-run",
  passed: true,
  failures: [],
  submitted: [],
};

describe("isBroadcastSubmitDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./submit.js") as BroadcastSubmitCliModule;
    const scriptPath = resolve("runtime/cli/broadcast/submit.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isBroadcastSubmitDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isBroadcastSubmitDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isBroadcastSubmitDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/broadcast/report.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./submit.js") as BroadcastSubmitCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/broadcast/submit.ts")).href;

    expect(() => module.isBroadcastSubmitDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseBroadcastSubmitCliArgs", () => {
  it("requires broadcast submit artifact paths", async () => {
    const module = await import("./submit.js") as BroadcastSubmitCliModule;

    expect(() => module.parseBroadcastSubmitCliArgs?.([])).toThrow("--broadcast-package is required");
    expect(() => module.parseBroadcastSubmitCliArgs?.([
      "--broadcast-package",
      "artifacts/broadcast-package.json",
    ])).toThrow("--broadcast-preflight is required");
  });

  it("parses split and equals-form submit flags", async () => {
    const module = await import("./submit.js") as BroadcastSubmitCliModule;

    expect(module.parseBroadcastSubmitCliArgs?.([
      "--send",
      "--deployment-manifest=deployments/custom.json",
      "--broadcast-package",
      "artifacts/broadcast-package.json",
      "--broadcast-preflight=artifacts/broadcast-preflight.json",
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
      "--receipt-output=artifacts/receipt.json",
    ])).toEqual({
      send: true,
      deploymentManifestPath: "deployments/custom.json",
      broadcastPackagePath: "artifacts/broadcast-package.json",
      broadcastPreflightPath: "artifacts/broadcast-preflight.json",
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
      receiptOutputPath: "artifacts/receipt.json",
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./submit.js") as BroadcastSubmitCliModule;

    expect(() => module.parseBroadcastSubmitCliArgs?.(["--send", "--send"])).toThrow("Duplicate argument: --send");
    expect(() => module.parseBroadcastSubmitCliArgs?.([
      "--broadcast-package",
      "a.json",
      "--broadcast-package",
      "b.json",
    ])).toThrow("Duplicate argument: --broadcast-package");
    expect(() => module.parseBroadcastSubmitCliArgs?.(["--summary"])).toThrow("--summary requires a value");
    expect(() => module.parseBroadcastSubmitCliArgs?.(["--broadcast-package", "a.json", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runBroadcastSubmitCli", () => {
  it("runs dry-run submit without creating an RPC client", async () => {
    const module = await import("./submit.js") as BroadcastSubmitCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runBroadcastSubmitCli?.({
      argv: BROADCAST_SUBMIT_ARGS,
      writeOutput: (output) => outputs.push(output),
      loadDotEnv: (path) => calls.push(`dotenv:${path}`),
      readDeploymentManifest: async (path) => {
        calls.push(`manifest:${path}`);
        return { rpcUrlEnv: "BASE_SEPOLIA_RPC_URL", explorerUrl: "https://explorer.example" };
      },
      createClient: () => {
        calls.push("client");
        return {};
      },
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      submitBroadcast: async (params) => {
        calls.push(`submit:${typeof params}`);
        return SUBMIT_RESULT;
      },
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({
      deploymentManifest: "deployments/base-sepolia/latest.json",
      broadcastPreflight: "artifacts/broadcast-preflight.json",
      mode: "dry-run",
      passed: true,
    });
    expect(calls).toContain("submit:object");
    expect(calls).not.toContain("client");
  });

  it("requires RPC env before creating send-mode clients", async () => {
    const module = await import("./submit.js") as BroadcastSubmitCliModule;
    const calls: string[] = [];

    await expect(module.runBroadcastSubmitCli?.({
      argv: ["--send", ...BROADCAST_SUBMIT_ARGS],
      env: {},
      loadDotEnv: (path) => calls.push(`dotenv:${path}`),
      readDeploymentManifest: async (path) => {
        calls.push(`manifest:${path}`);
        return { rpcUrlEnv: "BASE_SEPOLIA_RPC_URL", explorerUrl: "https://explorer.example" };
      },
      createClient: () => {
        calls.push("client");
        return {};
      },
    })).rejects.toThrow("BASE_SEPOLIA_RPC_URL is required when --send is used");
    expect(calls).toEqual(["dotenv:.env", "manifest:deployments/base-sepolia/latest.json"]);
  });

  it("writes passed receipts and adds explorer URLs to submitted transactions", async () => {
    const module = await import("./submit.js") as BroadcastSubmitCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];
    const sentResult: BroadcastSubmitResult = {
      mode: "send",
      passed: true,
      failures: [],
      submitted: [{ index: 0, hash: "0xabc", blockNumber: "123", status: "success" }],
    };

    await module.runBroadcastSubmitCli?.({
      argv: ["--send", ...BROADCAST_SUBMIT_ARGS, "--receipt-output", "artifacts/receipt.json"],
      env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" },
      writeOutput: (output) => outputs.push(output),
      loadDotEnv: (path) => calls.push(`dotenv:${path}`),
      readDeploymentManifest: async () => ({ rpcUrlEnv: "BASE_SEPOLIA_RPC_URL", explorerUrl: "https://explorer.example" }),
      createClient: (rpcUrl) => {
        calls.push(`client:${rpcUrl}`);
        return { client: true };
      },
      readText: async () => "{}",
      submitBroadcast: async () => sentResult,
      createReceipt: () => ({ passed: true, failures: [], receipt: { schemaVersion: 1 } }),
      mkdirp: async (dir) => {
        calls.push(`mkdir:${dir}`);
      },
      writeText: async (path, contents) => {
        calls.push(`write:${path}:${contents}`);
      },
    });

    const output = JSON.parse(outputs[0]!);
    expect(output.submitted[0].explorerUrl).toBe("https://explorer.example/tx/0xabc");
    expect(output.receipt).toEqual({ path: "artifacts/receipt.json", passed: true, failures: [] });
    expect(calls).toContain(`write:artifacts/receipt.json:${JSON.stringify({ schemaVersion: 1 }, null, 2)}\n`);
  });

  it("sets exit code after failed submit or receipt output", async () => {
    const module = await import("./submit.js") as BroadcastSubmitCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await module.runBroadcastSubmitCli?.({
      argv: [...BROADCAST_SUBMIT_ARGS, "--receipt-output", "artifacts/receipt.json"],
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      loadDotEnv: () => {},
      readDeploymentManifest: async () => ({ rpcUrlEnv: "BASE_SEPOLIA_RPC_URL", explorerUrl: "https://explorer.example" }),
      readText: async () => "{}",
      submitBroadcast: async () => ({ ...SUBMIT_RESULT, passed: false, failures: ["submit failed"] }),
      createReceipt: () => ({ passed: false, failures: ["receipt failed"], receipt: null }),
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ passed: false, failures: ["submit failed"] });
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed injected submit results before output or exit code mutation", async () => {
    const module = await import("./submit.js") as BroadcastSubmitCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await expect(module.runBroadcastSubmitCli?.({
      argv: BROADCAST_SUBMIT_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      loadDotEnv: () => {},
      readDeploymentManifest: async () => ({ rpcUrlEnv: "BASE_SEPOLIA_RPC_URL", explorerUrl: "https://explorer.example" }),
      readText: async () => "{}",
      submitBroadcast: async () => ({
        ...SUBMIT_RESULT,
        submitted: "not-submitted",
      } as unknown as BroadcastSubmitResult),
    })).rejects.toThrow("Broadcast submit result submitted transactions must be an array");

    expect(outputs).toEqual([]);
    expect(exitCodes).toEqual([]);
  });

  it("rejects malformed injected receipt results before writes, output, or exit code mutation", async () => {
    const module = await import("./submit.js") as BroadcastSubmitCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];
    const exitCodes: number[] = [];

    await expect(module.runBroadcastSubmitCli?.({
      argv: [...BROADCAST_SUBMIT_ARGS, "--receipt-output", "artifacts/receipt.json"],
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      loadDotEnv: () => {},
      readDeploymentManifest: async () => ({ rpcUrlEnv: "BASE_SEPOLIA_RPC_URL", explorerUrl: "https://explorer.example" }),
      readText: async () => "{}",
      submitBroadcast: async () => SUBMIT_RESULT,
      createReceipt: () => ({ passed: true, failures: "not-failures", receipt: {} } as unknown as BroadcastReceiptResult),
      mkdirp: async () => {
        calls.push("mkdir");
      },
      writeText: async () => {
        calls.push("write");
      },
    })).rejects.toThrow("Broadcast receipt result failures must be an array");

    expect(outputs).toEqual([]);
    expect(calls).toEqual([]);
    expect(exitCodes).toEqual([]);
  });

  it("rejects malformed arguments before dotenv loading", async () => {
    const module = await import("./submit.js") as BroadcastSubmitCliModule;
    const calls: string[] = [];

    await expect(module.runBroadcastSubmitCli?.({
      argv: ["--unknown"],
      loadDotEnv: () => calls.push("dotenv"),
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });
});
