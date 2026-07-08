import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type BroadcastReportVerifyCliModule = typeof import("./reportVerify.js") & {
  isBroadcastReportVerifyDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseBroadcastReportVerifyCliArgs?: (argv: readonly string[]) => ReportVerifyCliArgs;
  runBroadcastReportVerifyCli?: (options?: ReportVerifyRunnerOptions) => Promise<void>;
};

interface ReportVerifyCliArgs {
  reportPath: string;
  broadcastReceiptPath: string;
  broadcastPackagePath: string;
  submitResultPath: string;
}

interface ReportVerifyRunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyReport?: (params: unknown) => VerificationResult;
}

interface VerificationResult {
  passed: boolean;
  failures: readonly string[];
  report?: unknown;
}

const REPORT_VERIFY_ARGS = [
  "--report",
  "artifacts/report.md",
  "--broadcast-receipt",
  "artifacts/receipt.json",
  "--broadcast-package",
  "artifacts/broadcast-package.json",
  "--submit-result",
  "artifacts/submit-result.json",
] as const;

describe("isBroadcastReportVerifyDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./reportVerify.js") as BroadcastReportVerifyCliModule;
    const scriptPath = resolve("runtime/cli/broadcast/reportVerify.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isBroadcastReportVerifyDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isBroadcastReportVerifyDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isBroadcastReportVerifyDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/broadcast/report.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./reportVerify.js") as BroadcastReportVerifyCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/broadcast/reportVerify.ts")).href;

    expect(() => module.isBroadcastReportVerifyDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseBroadcastReportVerifyCliArgs", () => {
  it("requires report, receipt, package, and submit-result paths", async () => {
    const module = await import("./reportVerify.js") as BroadcastReportVerifyCliModule;

    expect(() => module.parseBroadcastReportVerifyCliArgs?.([])).toThrow("--report is required");
    expect(() => module.parseBroadcastReportVerifyCliArgs?.(["--report", "report.md"])).toThrow(
      "--broadcast-receipt is required",
    );
  });

  it("parses split and equals-form report verification flags", async () => {
    const module = await import("./reportVerify.js") as BroadcastReportVerifyCliModule;

    expect(module.parseBroadcastReportVerifyCliArgs?.([
      "--report=artifacts/report.md",
      "--broadcast-receipt",
      "artifacts/receipt.json",
      "--broadcast-package=artifacts/broadcast-package.json",
      "--submit-result",
      " artifacts/submit-result.json ",
    ])).toEqual({
      reportPath: "artifacts/report.md",
      broadcastReceiptPath: "artifacts/receipt.json",
      broadcastPackagePath: "artifacts/broadcast-package.json",
      submitResultPath: "artifacts/submit-result.json",
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./reportVerify.js") as BroadcastReportVerifyCliModule;

    expect(() => module.parseBroadcastReportVerifyCliArgs?.([
      "--report",
      "a.md",
      "--report",
      "b.md",
    ])).toThrow("Duplicate argument: --report");
    expect(() => module.parseBroadcastReportVerifyCliArgs?.(["--submit-result"])).toThrow(
      "--submit-result requires a value",
    );
    expect(() => module.parseBroadcastReportVerifyCliArgs?.(["--report", "a.md", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runBroadcastReportVerifyCli", () => {
  it("prints injected report verification summaries", async () => {
    const module = await import("./reportVerify.js") as BroadcastReportVerifyCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runBroadcastReportVerifyCli?.({
      argv: REPORT_VERIFY_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      verifyReport: (params) => {
        calls.push(`verify:${typeof params}`);
        return { passed: true, failures: [], report: { transactions: 1 } };
      },
    });

    expect(JSON.parse(outputs[0]!)).toEqual({
      reportPath: "artifacts/report.md",
      broadcastReceipt: "artifacts/receipt.json",
      broadcastPackage: "artifacts/broadcast-package.json",
      submitResult: "artifacts/submit-result.json",
      passed: true,
      failures: [],
      report: { transactions: 1 },
    });
    expect(calls).toEqual([
      "read:artifacts/report.md",
      "read:artifacts/receipt.json",
      "read:artifacts/broadcast-package.json",
      "read:artifacts/submit-result.json",
      "verify:object",
    ]);
  });

  it("sets exit code after failed report verification output", async () => {
    const module = await import("./reportVerify.js") as BroadcastReportVerifyCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await module.runBroadcastReportVerifyCli?.({
      argv: REPORT_VERIFY_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      verifyReport: () => ({ passed: false, failures: ["report mismatch"] }),
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ passed: false, failures: ["report mismatch"] });
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed injected report verification reports before output or exit code mutation", async () => {
    const module = await import("./reportVerify.js") as BroadcastReportVerifyCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await expect(module.runBroadcastReportVerifyCli?.({
      argv: REPORT_VERIFY_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      verifyReport: () => ({ passed: true, failures: "not-failures" } as unknown as VerificationResult),
    })).rejects.toThrow("Broadcast report verification result failures must be an array");

    expect(outputs).toEqual([]);
    expect(exitCodes).toEqual([]);
  });

  it("rejects malformed arguments before reads or verification", async () => {
    const module = await import("./reportVerify.js") as BroadcastReportVerifyCliModule;
    const calls: string[] = [];

    await expect(module.runBroadcastReportVerifyCli?.({
      argv: ["--unknown"],
      readText: async () => {
        calls.push("read");
        return "";
      },
      verifyReport: () => ({ passed: true, failures: [] }),
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });
});
