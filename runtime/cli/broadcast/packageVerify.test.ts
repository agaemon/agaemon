import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type BroadcastPackageVerifyCliModule = typeof import("./packageVerify.js") & {
  isBroadcastPackageVerifyDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseBroadcastPackageVerifyCliArgs?: (argv: readonly string[]) => BroadcastPackageVerifyCliArgs;
  runBroadcastPackageVerifyCli?: (options?: BroadcastPackageVerifyRunnerOptions) => Promise<void>;
};

interface BroadcastPackageVerifyCliArgs {
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
}

interface BroadcastPackageVerifyRunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyPackage?: (params: unknown) => Promise<VerificationResult>;
}

interface VerificationResult {
  passed: boolean;
  failures: readonly string[];
}

const BROADCAST_PACKAGE_VERIFY_ARGS = [
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

describe("isBroadcastPackageVerifyDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./packageVerify.js") as BroadcastPackageVerifyCliModule;
    const scriptPath = resolve("runtime/cli/broadcast/packageVerify.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isBroadcastPackageVerifyDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isBroadcastPackageVerifyDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isBroadcastPackageVerifyDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/broadcast/package.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./packageVerify.js") as BroadcastPackageVerifyCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/broadcast/packageVerify.ts")).href;

    expect(() => module.isBroadcastPackageVerifyDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseBroadcastPackageVerifyCliArgs", () => {
  it("requires broadcast package verification artifact paths", async () => {
    const module = await import("./packageVerify.js") as BroadcastPackageVerifyCliModule;

    expect(() => module.parseBroadcastPackageVerifyCliArgs?.([])).toThrow("--broadcast-package is required");
    expect(() => module.parseBroadcastPackageVerifyCliArgs?.([
      "--broadcast-package",
      "artifacts/broadcast-package.json",
    ])).toThrow("--broadcast-preflight is required");
  });

  it("parses split and equals-form broadcast package verification flags", async () => {
    const module = await import("./packageVerify.js") as BroadcastPackageVerifyCliModule;

    expect(module.parseBroadcastPackageVerifyCliArgs?.([
      "--broadcast-package=artifacts/broadcast-package.json",
      "--broadcast-preflight",
      "artifacts/broadcast-preflight.json",
      "--signed-payload=artifacts/signed-payload.json",
      "--payload",
      "artifacts/payload.json",
      "--readiness=artifacts/readiness.json",
      "--preview",
      "artifacts/preview.json",
      "--runbook=artifacts/runbook.md",
      "--execution-manifest",
      "artifacts/execution-manifest.json",
      "--bundle=artifacts/bundle.json",
      "--approval",
      "artifacts/approval.json",
      "--manifest=artifacts/manifest.json",
      "--proposal",
      "artifacts/proposal.json",
      "--summary",
      " artifacts/summary.md ",
    ])).toEqual({
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
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./packageVerify.js") as BroadcastPackageVerifyCliModule;

    expect(() => module.parseBroadcastPackageVerifyCliArgs?.([
      "--broadcast-package",
      "a.json",
      "--broadcast-package",
      "b.json",
    ])).toThrow("Duplicate argument: --broadcast-package");
    expect(() => module.parseBroadcastPackageVerifyCliArgs?.(["--summary"])).toThrow("--summary requires a value");
    expect(() => module.parseBroadcastPackageVerifyCliArgs?.(["--broadcast-package", "a.json", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runBroadcastPackageVerifyCli", () => {
  it("prints injected broadcast package verification reports", async () => {
    const module = await import("./packageVerify.js") as BroadcastPackageVerifyCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runBroadcastPackageVerifyCli?.({
      argv: BROADCAST_PACKAGE_VERIFY_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      verifyPackage: async (params) => {
        calls.push(`verify:${typeof params}`);
        return { passed: true, failures: [] };
      },
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({
      broadcastPackage: "artifacts/broadcast-package.json",
      broadcastPreflight: "artifacts/broadcast-preflight.json",
      signedPayload: "artifacts/signed-payload.json",
      passed: true,
      failures: [],
    });
    expect(calls).toContain("read:artifacts/broadcast-package.json");
    expect(calls).toContain("verify:object");
  });

  it("sets exit code after failed package verification output", async () => {
    const module = await import("./packageVerify.js") as BroadcastPackageVerifyCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await module.runBroadcastPackageVerifyCli?.({
      argv: BROADCAST_PACKAGE_VERIFY_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      verifyPackage: async () => ({ passed: false, failures: ["package verification failed"] }),
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({
      broadcastPackage: "artifacts/broadcast-package.json",
      passed: false,
      failures: ["package verification failed"],
    });
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed injected package verification reports before output or exit code mutation", async () => {
    const module = await import("./packageVerify.js") as BroadcastPackageVerifyCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await expect(module.runBroadcastPackageVerifyCli?.({
      argv: BROADCAST_PACKAGE_VERIFY_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      verifyPackage: async () => ({ passed: true, failures: "not-failures" } as unknown as VerificationResult),
    })).rejects.toThrow("Broadcast package verification result failures must be an array");

    expect(outputs).toEqual([]);
    expect(exitCodes).toEqual([]);
  });

  it("rejects malformed arguments before reads or verification", async () => {
    const module = await import("./packageVerify.js") as BroadcastPackageVerifyCliModule;
    const calls: string[] = [];

    await expect(module.runBroadcastPackageVerifyCli?.({
      argv: ["--unknown"],
      writeOutput: () => calls.push("output"),
      readText: async () => {
        calls.push("read");
        return "";
      },
      verifyPackage: async () => ({ passed: true, failures: [] }),
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });
});
