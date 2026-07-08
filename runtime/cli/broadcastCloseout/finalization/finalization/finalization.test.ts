import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type FinalizationModule = typeof import("./finalization.js") & {
  isBroadcastCloseoutFinalizationDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseBroadcastCloseoutFinalizationCliArgs?: (argv: readonly string[]) => FinalizationArgs;
  runBroadcastCloseoutFinalizationCli?: (options?: FinalizationOptions) => Promise<void>;
};

interface FinalizationArgs {
  broadcastReceiptPath: string;
  broadcastPackagePath: string;
  submitResultPath: string;
  reportOutputPath: string;
  archiveOutputPath: string;
  statusOutputPath: string;
  summaryOutputPath: string;
  finalizationStatusOutputPath?: string;
}

interface FinalizationOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  createFinalization?: (params: unknown) => FinalizationResult;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

interface FinalizationResult {
  passed: boolean;
  failures: readonly string[];
  report: { path: string; markdown: string };
  archive: { path: string; json: string };
  status: { path: string; json: string } | null;
  summary: { path: string; markdown: string };
  finalizationStatus: { path: string; json: string } | null;
  finalizationArchive: { path: string; json: string } | null;
  finalizationArchiveStatus: { path: string; json: string } | null;
  finalizationArchiveStatusSummary: { path: string; markdown: string } | null;
  finalizationArchiveStatusSummaryPackage: { path: string; json: string } | null;
  finalizationArchiveStatusSummaryPackageStatus: { path: string; json: string } | null;
}

const FINALIZATION_ARGS = [
  "--broadcast-receipt",
  "artifacts/receipt.json",
  "--broadcast-package",
  "artifacts/package.json",
  "--submit-result",
  "artifacts/submit.json",
  "--report-output",
  "artifacts/report.md",
  "--archive-output",
  "artifacts/archive.json",
  "--status-output",
  "artifacts/status.json",
  "--summary-output",
  "artifacts/summary.md",
] as const;

const FINALIZATION: FinalizationResult = {
  passed: true,
  failures: [],
  report: { path: "artifacts/report.md", markdown: "# Report\n" },
  archive: { path: "artifacts/archive.json", json: "{}\n" },
  status: { path: "artifacts/status.json", json: "{\"passed\":true}\n" },
  summary: { path: "artifacts/summary.md", markdown: "# Summary\n" },
  finalizationStatus: { path: "artifacts/finalization-status.json", json: "{}\n" },
  finalizationArchive: null,
  finalizationArchiveStatus: null,
  finalizationArchiveStatusSummary: null,
  finalizationArchiveStatusSummaryPackage: null,
  finalizationArchiveStatusSummaryPackageStatus: null,
};

describe("isBroadcastCloseoutFinalizationDirectRun", () => {
  it("detects direct execution and rejects malformed argv", async () => {
    const module = await import("./finalization.js") as FinalizationModule;
    const scriptPath = resolve("runtime/cli/broadcastCloseout/finalization/finalization/finalization.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isBroadcastCloseoutFinalizationDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isBroadcastCloseoutFinalizationDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(() => module.isBroadcastCloseoutFinalizationDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseBroadcastCloseoutFinalizationCliArgs", () => {
  it("parses required, optional, and equals-form finalization flags", async () => {
    const module = await import("./finalization.js") as FinalizationModule;

    expect(module.parseBroadcastCloseoutFinalizationCliArgs?.([
      "--broadcast-receipt=artifacts/receipt.json",
      "--broadcast-package",
      "artifacts/package.json",
      "--submit-result=artifacts/submit.json",
      "--report-output",
      " artifacts/report.md ",
      "--archive-output=artifacts/archive.json",
      "--status-output",
      "artifacts/status.json",
      "--summary-output=artifacts/summary.md",
      "--finalization-status-output",
      "artifacts/finalization-status.json",
    ])).toMatchObject({
      broadcastReceiptPath: "artifacts/receipt.json",
      broadcastPackagePath: "artifacts/package.json",
      submitResultPath: "artifacts/submit.json",
      reportOutputPath: "artifacts/report.md",
      archiveOutputPath: "artifacts/archive.json",
      statusOutputPath: "artifacts/status.json",
      summaryOutputPath: "artifacts/summary.md",
      finalizationStatusOutputPath: "artifacts/finalization-status.json",
    });
  });

  it("rejects missing, duplicate, and unsupported arguments", async () => {
    const module = await import("./finalization.js") as FinalizationModule;

    expect(() => module.parseBroadcastCloseoutFinalizationCliArgs?.([])).toThrow("--broadcast-receipt is required");
    expect(() => module.parseBroadcastCloseoutFinalizationCliArgs?.([
      "--broadcast-receipt",
      "a.json",
      "--broadcast-receipt",
      "b.json",
    ])).toThrow("Duplicate argument: --broadcast-receipt");
    expect(() => module.parseBroadcastCloseoutFinalizationCliArgs?.(["--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runBroadcastCloseoutFinalizationCli", () => {
  it("writes successful finalization artifacts and emits JSON summaries", async () => {
    const module = await import("./finalization.js") as FinalizationModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runBroadcastCloseoutFinalizationCli?.({
      argv: [...FINALIZATION_ARGS, "--finalization-status-output", "artifacts/finalization-status.json"],
      writeOutput: (output) => outputs.push(output),
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      createFinalization: (params) => {
        calls.push(`finalization:${typeof params}`);
        return FINALIZATION;
      },
      mkdirp: async (dir) => {
        calls.push(`mkdir:${dir}`);
      },
      writeText: async (path, contents) => {
        calls.push(`write:${path}:${contents}`);
      },
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ passed: true, summary: "artifacts/summary.md" });
    expect(calls).toContain("finalization:object");
    expect(calls).toContain("write:artifacts/finalization-status.json:{}\n");
  });

  it("rejects malformed arguments before reads and sets exit code after failed output", async () => {
    const module = await import("./finalization.js") as FinalizationModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];
    const calls: string[] = [];

    await expect(module.runBroadcastCloseoutFinalizationCli?.({
      argv: ["--unknown"],
      readText: async () => {
        calls.push("read");
        return "";
      },
      createFinalization: () => FINALIZATION,
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);

    await module.runBroadcastCloseoutFinalizationCli?.({
      argv: FINALIZATION_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      createFinalization: () => ({ ...FINALIZATION, passed: false, failures: ["finalization failed"], status: null }),
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ passed: false, failures: ["finalization failed"] });
    expect(exitCodes).toEqual([1]);
  });
});
