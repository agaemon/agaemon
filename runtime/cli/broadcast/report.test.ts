import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type BroadcastReportCliModule = typeof import("./report.js") & {
  isBroadcastReportDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseBroadcastReportCliArgs?: (argv: readonly string[]) => ReportCliArgs;
  runBroadcastReportCli?: (options?: ReportRunnerOptions) => Promise<void>;
};

interface ReportCliArgs {
  broadcastReceiptPath: string;
  broadcastPackagePath: string;
  submitResultPath: string;
  outputPath?: string | undefined;
}

interface ReportRunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  createReport?: (params: unknown) => ReportResult;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

interface ReportResult {
  passed: boolean;
  failures: readonly string[];
  markdown: string;
  transactions: number;
}

const REPORT_ARGS = [
  "--broadcast-receipt",
  "artifacts/receipt.json",
  "--broadcast-package",
  "artifacts/broadcast-package.json",
  "--submit-result",
  "artifacts/submit-result.json",
] as const;

const REPORT_RESULT: ReportResult = {
  passed: true,
  failures: [],
  markdown: "# Broadcast Report\n",
  transactions: 1,
};

describe("isBroadcastReportDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./report.js") as BroadcastReportCliModule;
    const scriptPath = resolve("runtime/cli/broadcast/report.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isBroadcastReportDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isBroadcastReportDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isBroadcastReportDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/broadcast/receiptVerify.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./report.js") as BroadcastReportCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/broadcast/report.ts")).href;

    expect(() => module.isBroadcastReportDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseBroadcastReportCliArgs", () => {
  it("requires broadcast receipt, package, and submit-result paths", async () => {
    const module = await import("./report.js") as BroadcastReportCliModule;

    expect(() => module.parseBroadcastReportCliArgs?.([])).toThrow("--broadcast-receipt is required");
    expect(() => module.parseBroadcastReportCliArgs?.(["--broadcast-receipt", "receipt.json"])).toThrow(
      "--broadcast-package is required",
    );
  });

  it("parses split and equals-form report flags", async () => {
    const module = await import("./report.js") as BroadcastReportCliModule;

    expect(module.parseBroadcastReportCliArgs?.([
      "--broadcast-receipt=artifacts/receipt.json",
      "--broadcast-package",
      "artifacts/broadcast-package.json",
      "--submit-result",
      " artifacts/submit-result.json ",
      "--output=artifacts/report.md",
    ])).toEqual({
      broadcastReceiptPath: "artifacts/receipt.json",
      broadcastPackagePath: "artifacts/broadcast-package.json",
      submitResultPath: "artifacts/submit-result.json",
      outputPath: "artifacts/report.md",
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./report.js") as BroadcastReportCliModule;

    expect(() => module.parseBroadcastReportCliArgs?.([
      "--broadcast-receipt",
      "a.json",
      "--broadcast-receipt",
      "b.json",
    ])).toThrow("Duplicate argument: --broadcast-receipt");
    expect(() => module.parseBroadcastReportCliArgs?.(["--output"])).toThrow("--output requires a value");
    expect(() => module.parseBroadcastReportCliArgs?.(["--broadcast-receipt", "a.json", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runBroadcastReportCli", () => {
  it("writes successful reports and emits JSON summaries", async () => {
    const module = await import("./report.js") as BroadcastReportCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runBroadcastReportCli?.({
      argv: [...REPORT_ARGS, "--output", "artifacts/report.md"],
      writeOutput: (output) => outputs.push(output),
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      createReport: (params) => {
        calls.push(`report:${typeof params}`);
        return REPORT_RESULT;
      },
      mkdirp: async (dir) => {
        calls.push(`mkdir:${dir}`);
      },
      writeText: async (path, contents) => {
        calls.push(`write:${path}:${contents}`);
      },
    });

    expect(JSON.parse(outputs[0]!)).toEqual({
      broadcastReceipt: "artifacts/receipt.json",
      broadcastPackage: "artifacts/broadcast-package.json",
      submitResult: "artifacts/submit-result.json",
      output: "artifacts/report.md",
      passed: true,
      failures: [],
      transactions: 1,
    });
    expect(calls).toEqual([
      "read:artifacts/receipt.json",
      "read:artifacts/broadcast-package.json",
      "read:artifacts/submit-result.json",
      "report:object",
      "mkdir:artifacts",
      "write:artifacts/report.md:# Broadcast Report\n",
    ]);
  });

  it("sets exit code after failed report output without writing markdown", async () => {
    const module = await import("./report.js") as BroadcastReportCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];
    const calls: string[] = [];

    await module.runBroadcastReportCli?.({
      argv: [...REPORT_ARGS, "--output", "artifacts/report.md"],
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      createReport: () => ({ passed: false, failures: ["report failed"], markdown: "", transactions: 0 }),
      writeText: async () => {
        calls.push("write");
      },
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ passed: false, failures: ["report failed"] });
    expect(exitCodes).toEqual([1]);
    expect(calls).toEqual([]);
  });

  it("rejects malformed injected report results before writes, output, or exit code mutation", async () => {
    const module = await import("./report.js") as BroadcastReportCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];
    const exitCodes: number[] = [];

    await expect(module.runBroadcastReportCli?.({
      argv: [...REPORT_ARGS, "--output", "artifacts/report.md"],
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      createReport: () => ({
        ...REPORT_RESULT,
        markdown: null,
      } as unknown as ReportResult),
      mkdirp: async () => {
        calls.push("mkdir");
      },
      writeText: async () => {
        calls.push("write");
      },
    })).rejects.toThrow("Broadcast report result markdown must be a string");

    expect(outputs).toEqual([]);
    expect(calls).toEqual([]);
    expect(exitCodes).toEqual([]);
  });

  it("rejects malformed arguments before reads or report creation", async () => {
    const module = await import("./report.js") as BroadcastReportCliModule;
    const calls: string[] = [];

    await expect(module.runBroadcastReportCli?.({
      argv: ["--unknown"],
      readText: async () => {
        calls.push("read");
        return "";
      },
      createReport: () => REPORT_RESULT,
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });
});
