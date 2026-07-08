import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type Module = typeof import("./summary.js") & {
  isBroadcastCloseoutFinalizationArchiveStatusSummaryDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseBroadcastCloseoutFinalizationArchiveStatusSummaryCliArgs?: (argv: readonly string[]) => Record<string, string>;
  runBroadcastCloseoutFinalizationArchiveStatusSummaryCli?: (options?: RunnerOptions) => Promise<void>;
};

interface RunnerOptions {
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

const ARGS = [
  "--finalization-archive-status", "artifacts/finalization-archive-status.json",
  "--finalization-archive", "artifacts/finalization-archive.json",
  "--report", "artifacts/report.md",
  "--archive", "artifacts/archive.json",
  "--status", "artifacts/status.json",
  "--summary", "artifacts/summary.md",
  "--finalization-status", "artifacts/finalization-status.json",
  "--broadcast-receipt", "artifacts/receipt.json",
  "--broadcast-package", "artifacts/package.json",
  "--submit-result", "artifacts/submit.json",
] as const;

const EQUALS_ARGS = [
  "--finalization-archive-status=artifacts/finalization-archive-status.json",
  "--finalization-archive=artifacts/finalization-archive.json",
  "--report=artifacts/report.md",
  "--archive=artifacts/archive.json",
  "--status=artifacts/status.json",
  "--summary=artifacts/summary.md",
  "--finalization-status=artifacts/finalization-status.json",
  "--broadcast-receipt=artifacts/receipt.json",
  "--broadcast-package=artifacts/package.json",
  "--submit-result=artifacts/submit.json",
] as const;

describe("finalization archive status summary CLI seams", () => {
  it("detects direct execution and parses strict args", async () => {
    const module = await import("./summary.js") as Module;
    const scriptPath = resolve("runtime/cli/broadcastCloseout/finalizationArchive/statusSummary/summary.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isBroadcastCloseoutFinalizationArchiveStatusSummaryDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.parseBroadcastCloseoutFinalizationArchiveStatusSummaryCliArgs?.([
      ...ARGS,
      "--output=artifacts/finalization-archive-status-summary.md",
    ])).toMatchObject({
      finalizationArchiveStatusPath: "artifacts/finalization-archive-status.json",
      outputPath: "artifacts/finalization-archive-status-summary.md",
    });
    expect(module.parseBroadcastCloseoutFinalizationArchiveStatusSummaryCliArgs?.(EQUALS_ARGS)).toMatchObject({
      finalizationStatusPath: "artifacts/finalization-status.json",
      submitResultPath: "artifacts/submit.json",
    });
    expect(() => module.parseBroadcastCloseoutFinalizationArchiveStatusSummaryCliArgs?.([])).toThrow(
      "--finalization-archive-status is required",
    );
    expect(() => module.parseBroadcastCloseoutFinalizationArchiveStatusSummaryCliArgs?.(["--output"])).toThrow(
      "--output requires a value",
    );
    expect(() => module.parseBroadcastCloseoutFinalizationArchiveStatusSummaryCliArgs?.([
      ...ARGS,
      "--archive", "artifacts/other-archive.json",
    ])).toThrow("Duplicate argument: --archive");
  });

  it("writes successful summaries through injected dependencies", async () => {
    const module = await import("./summary.js") as Module;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runBroadcastCloseoutFinalizationArchiveStatusSummaryCli?.({
      argv: [...ARGS, "--output", "artifacts/finalization-archive-status-summary.md"],
      writeOutput: (output) => outputs.push(output),
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      createSummary: () => ({ passed: true, failures: [], markdown: "# summary\n" }),
      mkdirp: async (dir) => {
        calls.push(`mkdir:${dir}`);
      },
      writeText: async (path, contents) => {
        calls.push(`write:${path}:${contents}`);
      },
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({
      output: "artifacts/finalization-archive-status-summary.md",
      passed: true,
    });
    expect(calls).toContain("write:artifacts/finalization-archive-status-summary.md:# summary\n");
  });

  it("sets failed exit after output without writing summaries", async () => {
    const module = await import("./summary.js") as Module;
    const outputs: string[] = [];
    const exitCodes: number[] = [];
    const calls: string[] = [];

    await module.runBroadcastCloseoutFinalizationArchiveStatusSummaryCli?.({
      argv: [...ARGS, "--output", "artifacts/finalization-archive-status-summary.md"],
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async (path) => path,
      createSummary: () => ({ passed: false, failures: ["summary mismatch"], markdown: "" }),
      mkdirp: async (dir) => {
        calls.push(`mkdir:${dir}`);
      },
      writeText: async (path, contents) => {
        calls.push(`write:${path}:${contents}`);
      },
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ passed: false, failures: ["summary mismatch"] });
    expect(exitCodes).toEqual([1]);
    expect(calls).toEqual([]);
  });

  it("rejects malformed arguments before reads", async () => {
    const module = await import("./summary.js") as Module;
    const calls: string[] = [];

    await expect(module.runBroadcastCloseoutFinalizationArchiveStatusSummaryCli?.({
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
