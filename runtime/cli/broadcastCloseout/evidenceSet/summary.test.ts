import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type BroadcastCloseoutEvidenceSummaryCliModule = typeof import("./summary.js") & {
  isBroadcastCloseoutEvidenceSummaryDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseBroadcastCloseoutEvidenceSummaryCliArgs?: (argv: readonly string[]) => EvidenceSummaryCliArgs;
  runBroadcastCloseoutEvidenceSummaryCli?: (options?: EvidenceSummaryRunnerOptions) => Promise<void>;
};

interface EvidenceSummaryCliArgs {
  reportPath: string;
  archivePath: string;
  statusPath: string;
  broadcastReceiptPath: string;
  broadcastPackagePath: string;
  submitResultPath: string;
  outputPath?: string | undefined;
}

interface EvidenceSummaryRunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  createSummary?: (params: unknown) => SummaryResult;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

interface SummaryResult {
  passed: boolean;
  failures: readonly string[];
  markdown: string;
}

const EVIDENCE_ARGS = [
  "--report",
  "artifacts/report.md",
  "--archive",
  "artifacts/archive.json",
  "--status",
  "artifacts/status.json",
  "--broadcast-receipt",
  "artifacts/receipt.json",
  "--broadcast-package",
  "artifacts/broadcast-package.json",
  "--submit-result",
  "artifacts/submit-result.json",
] as const;

describe("parseBroadcastCloseoutEvidenceSummaryCliArgs", () => {
  it("requires report, archive, status, receipt, package, and submit-result paths", async () => {
    const module = await import("./summary.js") as BroadcastCloseoutEvidenceSummaryCliModule;

    expect(() => module.parseBroadcastCloseoutEvidenceSummaryCliArgs?.([])).toThrow("--report is required");
    expect(() => module.parseBroadcastCloseoutEvidenceSummaryCliArgs?.(["--report", "report.md"])).toThrow(
      "--archive is required",
    );
  });

  it("parses split and equals-form summary flags", async () => {
    const module = await import("./summary.js") as BroadcastCloseoutEvidenceSummaryCliModule;

    expect(module.parseBroadcastCloseoutEvidenceSummaryCliArgs?.([
      "--report=artifacts/report.md",
      "--archive",
      "artifacts/archive.json",
      "--status=artifacts/status.json",
      "--broadcast-receipt",
      "artifacts/receipt.json",
      "--broadcast-package=artifacts/broadcast-package.json",
      "--submit-result",
      " artifacts/submit-result.json ",
      "--output=artifacts/summary.md",
    ])).toEqual({
      reportPath: "artifacts/report.md",
      archivePath: "artifacts/archive.json",
      statusPath: "artifacts/status.json",
      broadcastReceiptPath: "artifacts/receipt.json",
      broadcastPackagePath: "artifacts/broadcast-package.json",
      submitResultPath: "artifacts/submit-result.json",
      outputPath: "artifacts/summary.md",
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./summary.js") as BroadcastCloseoutEvidenceSummaryCliModule;

    expect(() => module.parseBroadcastCloseoutEvidenceSummaryCliArgs?.([
      "--report",
      "a.md",
      "--report",
      "b.md",
    ])).toThrow("Duplicate argument: --report");
    expect(() => module.parseBroadcastCloseoutEvidenceSummaryCliArgs?.(["--output"])).toThrow(
      "--output requires a value",
    );
    expect(() => module.parseBroadcastCloseoutEvidenceSummaryCliArgs?.(["--report", "a.md", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("isBroadcastCloseoutEvidenceSummaryDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./summary.js") as BroadcastCloseoutEvidenceSummaryCliModule;
    const scriptPath = resolve("runtime/cli/broadcastCloseout/evidenceSet/summary.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isBroadcastCloseoutEvidenceSummaryDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isBroadcastCloseoutEvidenceSummaryDirectRun?.(moduleUrl, ["node"])).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./summary.js") as BroadcastCloseoutEvidenceSummaryCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/broadcastCloseout/evidenceSet/summary.ts")).href;

    expect(() => module.isBroadcastCloseoutEvidenceSummaryDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("runBroadcastCloseoutEvidenceSummaryCli", () => {
  it("writes successful summaries and emits JSON reports", async () => {
    const module = await import("./summary.js") as BroadcastCloseoutEvidenceSummaryCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runBroadcastCloseoutEvidenceSummaryCli?.({
      argv: [...EVIDENCE_ARGS, "--output", "artifacts/summary.md"],
      writeOutput: (output) => outputs.push(output),
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      createSummary: (params) => {
        calls.push(`summary:${typeof params}`);
        return { passed: true, failures: [], markdown: "# Summary\n" };
      },
      mkdirp: async (dir) => {
        calls.push(`mkdir:${dir}`);
      },
      writeText: async (path, contents) => {
        calls.push(`write:${path}:${contents}`);
      },
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ output: "artifacts/summary.md", passed: true, failures: [] });
    expect(calls).toContain("summary:object");
    expect(calls).toContain("write:artifacts/summary.md:# Summary\n");
  });

  it("sets exit code after failed summary output without writing markdown", async () => {
    const module = await import("./summary.js") as BroadcastCloseoutEvidenceSummaryCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];
    const calls: string[] = [];

    await module.runBroadcastCloseoutEvidenceSummaryCli?.({
      argv: [...EVIDENCE_ARGS, "--output", "artifacts/summary.md"],
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      createSummary: () => ({ passed: false, failures: ["summary failed"], markdown: "" }),
      writeText: async () => {
        calls.push("write");
      },
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ passed: false, failures: ["summary failed"] });
    expect(exitCodes).toEqual([1]);
    expect(calls).toEqual([]);
  });

  it("rejects malformed injected summaries before writes, output, or exit code mutation", async () => {
    const module = await import("./summary.js") as BroadcastCloseoutEvidenceSummaryCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];
    const exitCodes: number[] = [];

    await expect(module.runBroadcastCloseoutEvidenceSummaryCli?.({
      argv: [...EVIDENCE_ARGS, "--output", "artifacts/summary.md"],
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      createSummary: () => ({ passed: true, failures: [], markdown: null } as unknown as SummaryResult),
      mkdirp: async () => {
        calls.push("mkdir");
      },
      writeText: async () => {
        calls.push("write");
      },
    })).rejects.toThrow("Broadcast closeout evidence summary result markdown must be a string");

    expect(outputs).toEqual([]);
    expect(calls).toEqual([]);
    expect(exitCodes).toEqual([]);
  });

  it("rejects malformed arguments before reads or summary creation", async () => {
    const module = await import("./summary.js") as BroadcastCloseoutEvidenceSummaryCliModule;
    const calls: string[] = [];

    await expect(module.runBroadcastCloseoutEvidenceSummaryCli?.({
      argv: ["--unknown"],
      readText: async () => {
        calls.push("read");
        return "";
      },
      createSummary: () => ({ passed: true, failures: [], markdown: "" }),
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });
});
