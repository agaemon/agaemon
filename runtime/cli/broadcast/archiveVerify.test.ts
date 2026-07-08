import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type BroadcastArchiveVerifyCliModule = typeof import("./archiveVerify.js") & {
  isBroadcastArchiveVerifyDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseBroadcastArchiveVerifyCliArgs?: (argv: readonly string[]) => ArchiveVerifyCliArgs;
  runBroadcastArchiveVerifyCli?: (options?: ArchiveVerifyRunnerOptions) => Promise<void>;
};

interface ArchiveVerifyCliArgs {
  archivePath: string;
  reportPath: string;
  broadcastReceiptPath: string;
  broadcastPackagePath: string;
  submitResultPath: string;
}

interface ArchiveVerifyRunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyArchive?: (params: unknown) => VerificationResult;
}

interface VerificationResult {
  passed: boolean;
  failures: readonly string[];
}

const ARCHIVE_VERIFY_ARGS = [
  "--archive",
  "artifacts/archive.json",
  "--report",
  "artifacts/report.md",
  "--broadcast-receipt",
  "artifacts/receipt.json",
  "--broadcast-package",
  "artifacts/broadcast-package.json",
  "--submit-result",
  "artifacts/submit-result.json",
] as const;

describe("isBroadcastArchiveVerifyDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./archiveVerify.js") as BroadcastArchiveVerifyCliModule;
    const scriptPath = resolve("runtime/cli/broadcast/archiveVerify.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isBroadcastArchiveVerifyDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isBroadcastArchiveVerifyDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isBroadcastArchiveVerifyDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/broadcast/archive.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./archiveVerify.js") as BroadcastArchiveVerifyCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/broadcast/archiveVerify.ts")).href;

    expect(() => module.isBroadcastArchiveVerifyDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseBroadcastArchiveVerifyCliArgs", () => {
  it("requires archive, report, receipt, package, and submit-result paths", async () => {
    const module = await import("./archiveVerify.js") as BroadcastArchiveVerifyCliModule;

    expect(() => module.parseBroadcastArchiveVerifyCliArgs?.([])).toThrow("--archive is required");
    expect(() => module.parseBroadcastArchiveVerifyCliArgs?.(["--archive", "archive.json"])).toThrow(
      "--report is required",
    );
  });

  it("parses split and equals-form archive verification flags", async () => {
    const module = await import("./archiveVerify.js") as BroadcastArchiveVerifyCliModule;

    expect(module.parseBroadcastArchiveVerifyCliArgs?.([
      "--archive=artifacts/archive.json",
      "--report",
      "artifacts/report.md",
      "--broadcast-receipt=artifacts/receipt.json",
      "--broadcast-package",
      "artifacts/broadcast-package.json",
      "--submit-result",
      " artifacts/submit-result.json ",
    ])).toEqual({
      archivePath: "artifacts/archive.json",
      reportPath: "artifacts/report.md",
      broadcastReceiptPath: "artifacts/receipt.json",
      broadcastPackagePath: "artifacts/broadcast-package.json",
      submitResultPath: "artifacts/submit-result.json",
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./archiveVerify.js") as BroadcastArchiveVerifyCliModule;

    expect(() => module.parseBroadcastArchiveVerifyCliArgs?.([
      "--archive",
      "a.json",
      "--archive",
      "b.json",
    ])).toThrow("Duplicate argument: --archive");
    expect(() => module.parseBroadcastArchiveVerifyCliArgs?.(["--submit-result"])).toThrow(
      "--submit-result requires a value",
    );
    expect(() => module.parseBroadcastArchiveVerifyCliArgs?.(["--archive", "a.json", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runBroadcastArchiveVerifyCli", () => {
  it("prints injected archive verification summaries", async () => {
    const module = await import("./archiveVerify.js") as BroadcastArchiveVerifyCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runBroadcastArchiveVerifyCli?.({
      argv: ARCHIVE_VERIFY_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      verifyArchive: (params) => {
        calls.push(`verify:${typeof params}`);
        return { passed: true, failures: [] };
      },
    });

    expect(JSON.parse(outputs[0]!)).toEqual({
      archive: "artifacts/archive.json",
      report: "artifacts/report.md",
      broadcastReceipt: "artifacts/receipt.json",
      broadcastPackage: "artifacts/broadcast-package.json",
      submitResult: "artifacts/submit-result.json",
      passed: true,
      failures: [],
    });
    expect(calls).toEqual([
      "read:artifacts/archive.json",
      "read:artifacts/report.md",
      "read:artifacts/receipt.json",
      "read:artifacts/broadcast-package.json",
      "read:artifacts/submit-result.json",
      "verify:object",
    ]);
  });

  it("sets exit code after failed archive verification output", async () => {
    const module = await import("./archiveVerify.js") as BroadcastArchiveVerifyCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await module.runBroadcastArchiveVerifyCli?.({
      argv: ARCHIVE_VERIFY_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      verifyArchive: () => ({ passed: false, failures: ["archive mismatch"] }),
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ passed: false, failures: ["archive mismatch"] });
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed injected archive verification reports before output or exit code mutation", async () => {
    const module = await import("./archiveVerify.js") as BroadcastArchiveVerifyCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await expect(module.runBroadcastArchiveVerifyCli?.({
      argv: ARCHIVE_VERIFY_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      verifyArchive: () => ({ passed: true, failures: "not-failures" } as unknown as VerificationResult),
    })).rejects.toThrow("Broadcast archive verification result failures must be an array");

    expect(outputs).toEqual([]);
    expect(exitCodes).toEqual([]);
  });

  it("rejects malformed arguments before reads or verification", async () => {
    const module = await import("./archiveVerify.js") as BroadcastArchiveVerifyCliModule;
    const calls: string[] = [];

    await expect(module.runBroadcastArchiveVerifyCli?.({
      argv: ["--unknown"],
      readText: async () => {
        calls.push("read");
        return "";
      },
      verifyArchive: () => ({ passed: true, failures: [] }),
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });
});
