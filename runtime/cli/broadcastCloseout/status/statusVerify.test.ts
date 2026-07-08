import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type BroadcastCloseoutStatusVerifyCliModule = typeof import("./statusVerify.js") & {
  isBroadcastCloseoutStatusVerifyDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseBroadcastCloseoutStatusVerifyCliArgs?: (argv: readonly string[]) => StatusVerifyCliArgs;
  runBroadcastCloseoutStatusVerifyCli?: (options?: StatusVerifyRunnerOptions) => Promise<void>;
};

interface StatusVerifyCliArgs {
  statusPath: string;
  reportPath: string;
  archivePath: string;
  broadcastReceiptPath: string;
  broadcastPackagePath: string;
  submitResultPath: string;
}

interface StatusVerifyRunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyStatus?: (params: unknown) => VerificationResult;
}

interface VerificationResult {
  passed: boolean;
  failures: readonly string[];
}

const STATUS_VERIFY_ARGS = [
  "--status",
  "artifacts/status.json",
  "--report",
  "artifacts/report.md",
  "--archive",
  "artifacts/archive.json",
  "--broadcast-receipt",
  "artifacts/receipt.json",
  "--broadcast-package",
  "artifacts/broadcast-package.json",
  "--submit-result",
  "artifacts/submit-result.json",
] as const;

describe("isBroadcastCloseoutStatusVerifyDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./statusVerify.js") as BroadcastCloseoutStatusVerifyCliModule;
    const scriptPath = resolve("runtime/cli/broadcastCloseout/status/statusVerify.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isBroadcastCloseoutStatusVerifyDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isBroadcastCloseoutStatusVerifyDirectRun?.(moduleUrl, ["node"])).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./statusVerify.js") as BroadcastCloseoutStatusVerifyCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/broadcastCloseout/status/statusVerify.ts")).href;

    expect(() => module.isBroadcastCloseoutStatusVerifyDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseBroadcastCloseoutStatusVerifyCliArgs", () => {
  it("requires status, report, archive, receipt, package, and submit-result paths", async () => {
    const module = await import("./statusVerify.js") as BroadcastCloseoutStatusVerifyCliModule;

    expect(() => module.parseBroadcastCloseoutStatusVerifyCliArgs?.([])).toThrow("--status is required");
    expect(() => module.parseBroadcastCloseoutStatusVerifyCliArgs?.(["--status", "status.json"])).toThrow(
      "--report is required",
    );
  });

  it("parses split and equals-form status verification flags", async () => {
    const module = await import("./statusVerify.js") as BroadcastCloseoutStatusVerifyCliModule;

    expect(module.parseBroadcastCloseoutStatusVerifyCliArgs?.([
      "--status=artifacts/status.json",
      "--report",
      "artifacts/report.md",
      "--archive=artifacts/archive.json",
      "--broadcast-receipt",
      "artifacts/receipt.json",
      "--broadcast-package=artifacts/broadcast-package.json",
      "--submit-result",
      " artifacts/submit-result.json ",
    ])).toEqual({
      statusPath: "artifacts/status.json",
      reportPath: "artifacts/report.md",
      archivePath: "artifacts/archive.json",
      broadcastReceiptPath: "artifacts/receipt.json",
      broadcastPackagePath: "artifacts/broadcast-package.json",
      submitResultPath: "artifacts/submit-result.json",
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./statusVerify.js") as BroadcastCloseoutStatusVerifyCliModule;

    expect(() => module.parseBroadcastCloseoutStatusVerifyCliArgs?.([
      "--status",
      "a.json",
      "--status",
      "b.json",
    ])).toThrow("Duplicate argument: --status");
    expect(() => module.parseBroadcastCloseoutStatusVerifyCliArgs?.(["--submit-result"])).toThrow(
      "--submit-result requires a value",
    );
    expect(() => module.parseBroadcastCloseoutStatusVerifyCliArgs?.(["--status", "a.json", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runBroadcastCloseoutStatusVerifyCli", () => {
  it("prints injected status verification summaries", async () => {
    const module = await import("./statusVerify.js") as BroadcastCloseoutStatusVerifyCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runBroadcastCloseoutStatusVerifyCli?.({
      argv: STATUS_VERIFY_ARGS,
      writeOutput: (output) => outputs.push(output),
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      verifyStatus: (params) => {
        calls.push(`verify:${typeof params}`);
        return { passed: true, failures: [] };
      },
    });

    expect(JSON.parse(outputs[0]!)).toEqual({
      status: "artifacts/status.json",
      report: "artifacts/report.md",
      archive: "artifacts/archive.json",
      broadcastReceipt: "artifacts/receipt.json",
      broadcastPackage: "artifacts/broadcast-package.json",
      submitResult: "artifacts/submit-result.json",
      passed: true,
      failures: [],
    });
    expect(calls).toEqual([
      "read:artifacts/status.json",
      "read:artifacts/report.md",
      "read:artifacts/archive.json",
      "read:artifacts/receipt.json",
      "read:artifacts/broadcast-package.json",
      "read:artifacts/submit-result.json",
      "verify:object",
    ]);
  });

  it("sets exit code after failed status verification output", async () => {
    const module = await import("./statusVerify.js") as BroadcastCloseoutStatusVerifyCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await module.runBroadcastCloseoutStatusVerifyCli?.({
      argv: STATUS_VERIFY_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      verifyStatus: () => ({ passed: false, failures: ["status mismatch"] }),
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ passed: false, failures: ["status mismatch"] });
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed injected status verification reports before output or exit code mutation", async () => {
    const module = await import("./statusVerify.js") as BroadcastCloseoutStatusVerifyCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await expect(module.runBroadcastCloseoutStatusVerifyCli?.({
      argv: STATUS_VERIFY_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      verifyStatus: () => ({ passed: true, failures: "not-failures" } as unknown as VerificationResult),
    })).rejects.toThrow("Broadcast closeout status verification result failures must be an array");

    expect(outputs).toEqual([]);
    expect(exitCodes).toEqual([]);
  });

  it("rejects malformed arguments before reads or verification", async () => {
    const module = await import("./statusVerify.js") as BroadcastCloseoutStatusVerifyCliModule;
    const calls: string[] = [];

    await expect(module.runBroadcastCloseoutStatusVerifyCli?.({
      argv: ["--unknown"],
      readText: async () => {
        calls.push("read");
        return "";
      },
      verifyStatus: () => ({ passed: true, failures: [] }),
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });
});
