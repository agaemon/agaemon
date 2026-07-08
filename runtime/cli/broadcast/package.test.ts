import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type BroadcastPackageCliModule = typeof import("./package.js") & {
  isBroadcastPackageDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseBroadcastPackageCliArgs?: (argv: readonly string[]) => BroadcastPackageCliArgs;
  runBroadcastPackageCli?: (options?: BroadcastPackageRunnerOptions) => Promise<void>;
};

interface BroadcastPackageCliArgs {
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
  outputPath?: string | undefined;
  generatedAt?: string | undefined;
}

interface BroadcastPackageRunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  createPackage?: (params: unknown) => Promise<BroadcastPackageResult>;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

interface BroadcastPackageResult {
  passed: boolean;
  failures: readonly string[];
  package: unknown;
}

const BROADCAST_PACKAGE_ARGS = [
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

const BROADCAST_PACKAGE = { schemaVersion: 1, generatedAt: "2026-07-01T08:00:00.000Z" };

describe("isBroadcastPackageDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./package.js") as BroadcastPackageCliModule;
    const scriptPath = resolve("runtime/cli/broadcast/package.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isBroadcastPackageDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isBroadcastPackageDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isBroadcastPackageDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/broadcast/preflight.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./package.js") as BroadcastPackageCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/broadcast/package.ts")).href;

    expect(() => module.isBroadcastPackageDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseBroadcastPackageCliArgs", () => {
  it("requires broadcast package artifact paths", async () => {
    const module = await import("./package.js") as BroadcastPackageCliModule;

    expect(() => module.parseBroadcastPackageCliArgs?.([])).toThrow("--broadcast-preflight is required");
    expect(() => module.parseBroadcastPackageCliArgs?.([
      "--broadcast-preflight",
      "artifacts/broadcast-preflight.json",
    ])).toThrow("--signed-payload is required");
  });

  it("parses split and equals-form broadcast package flags", async () => {
    const module = await import("./package.js") as BroadcastPackageCliModule;

    expect(module.parseBroadcastPackageCliArgs?.([
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
      "--output=artifacts/broadcast-package.json",
      "--generated-at",
      " 2026-07-01T08:00:00.000Z ",
    ])).toEqual({
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
      outputPath: "artifacts/broadcast-package.json",
      generatedAt: "2026-07-01T08:00:00.000Z",
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./package.js") as BroadcastPackageCliModule;

    expect(() => module.parseBroadcastPackageCliArgs?.([
      "--broadcast-preflight",
      "a.json",
      "--broadcast-preflight",
      "b.json",
    ])).toThrow("Duplicate argument: --broadcast-preflight");
    expect(() => module.parseBroadcastPackageCliArgs?.(["--generated-at"])).toThrow(
      "--generated-at requires a value",
    );
    expect(() => module.parseBroadcastPackageCliArgs?.(["--broadcast-preflight", "a.json", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runBroadcastPackageCli", () => {
  it("creates packages and writes optional output through injected dependencies", async () => {
    const module = await import("./package.js") as BroadcastPackageCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runBroadcastPackageCli?.({
      argv: [...BROADCAST_PACKAGE_ARGS, "--output", "artifacts/broadcast-package.json"],
      writeOutput: (output) => outputs.push(output),
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      createPackage: async (params) => {
        calls.push(`package:${typeof params}`);
        return { passed: true, failures: [], package: BROADCAST_PACKAGE };
      },
      mkdirp: async (dir) => {
        calls.push(`mkdir:${dir}`);
      },
      writeText: async (path, contents) => {
        calls.push(`write:${path}:${contents}`);
      },
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({
      broadcastPreflight: "artifacts/broadcast-preflight.json",
      signedPayload: "artifacts/signed-payload.json",
      passed: true,
      package: BROADCAST_PACKAGE,
    });
    expect(calls).toContain("package:object");
    expect(calls).toContain(`write:artifacts/broadcast-package.json:${JSON.stringify(BROADCAST_PACKAGE, null, 2)}\n`);
  });

  it("sets exit code after failed package output without writing artifacts", async () => {
    const module = await import("./package.js") as BroadcastPackageCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];
    const calls: string[] = [];

    await module.runBroadcastPackageCli?.({
      argv: [...BROADCAST_PACKAGE_ARGS, "--output", "artifacts/broadcast-package.json"],
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      createPackage: async () => ({ passed: false, failures: ["package failed"], package: null }),
      writeText: async () => {
        calls.push("write");
      },
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ passed: false, failures: ["package failed"] });
    expect(exitCodes).toEqual([1]);
    expect(calls).toEqual([]);
  });

  it("rejects malformed injected package results before writes, output, or exit code mutation", async () => {
    const module = await import("./package.js") as BroadcastPackageCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];
    const exitCodes: number[] = [];

    await expect(module.runBroadcastPackageCli?.({
      argv: [...BROADCAST_PACKAGE_ARGS, "--output", "artifacts/broadcast-package.json"],
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      createPackage: async () => ({ passed: true, failures: [], package: null }),
      mkdirp: async () => {
        calls.push("mkdir");
      },
      writeText: async () => {
        calls.push("write");
      },
    })).rejects.toThrow("Broadcast package result package must be an object");

    expect(outputs).toEqual([]);
    expect(calls).toEqual([]);
    expect(exitCodes).toEqual([]);
  });

  it("rejects malformed arguments before reads or package creation", async () => {
    const module = await import("./package.js") as BroadcastPackageCliModule;
    const calls: string[] = [];

    await expect(module.runBroadcastPackageCli?.({
      argv: ["--unknown"],
      writeOutput: () => calls.push("output"),
      readText: async () => {
        calls.push("read");
        return "";
      },
      createPackage: async () => ({ passed: true, failures: [], package: BROADCAST_PACKAGE }),
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });
});
