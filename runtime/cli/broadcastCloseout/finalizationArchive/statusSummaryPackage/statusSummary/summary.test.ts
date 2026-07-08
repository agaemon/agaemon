import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type Module = typeof import("./summary.js") & {
  isBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusSummaryDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusSummaryCliArgs?: (argv: readonly string[]) => Record<string, string>;
  runBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusSummaryCli?: (options?: RunnerOptions) => Promise<void>;
};

interface RunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  createSummary?: (params: unknown) => { passed: boolean; failures: readonly string[]; markdown: string };
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

const ARGS = [
  "--finalization-archive-status-summary-package-status", "artifacts/finalization-archive-status-summary-package-status.json",
  "--finalization-archive-status-summary-package", "artifacts/finalization-archive-status-summary-package.json",
  "--finalization-archive-status-summary", "artifacts/finalization-archive-status-summary.md",
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

describe("finalization archive status summary package status summary CLI seams", () => {
  it("detects direct execution and parses strict args", async () => {
    const module = await import("./summary.js") as Module;
    const scriptPath = resolve("runtime/cli/broadcastCloseout/finalizationArchive/statusSummaryPackage/statusSummary/summary.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusSummaryDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.parseBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusSummaryCliArgs?.([
      ...ARGS,
      "--output=artifacts/finalization-archive-status-summary-package-status-summary.md",
    ])).toMatchObject({
      finalizationArchiveStatusSummaryPackageStatusPath: "artifacts/finalization-archive-status-summary-package-status.json",
      outputPath: "artifacts/finalization-archive-status-summary-package-status-summary.md",
    });
    expect(() => module.parseBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusSummaryCliArgs?.([])).toThrow(
      "--finalization-archive-status-summary-package-status is required",
    );
    expect(() => module.parseBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusSummaryCliArgs?.(["--output"])).toThrow(
      "--output requires a value",
    );
  });

  it("writes successful summaries through injected dependencies", async () => {
    const module = await import("./summary.js") as Module;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusSummaryCli?.({
      argv: [...ARGS, "--output", "artifacts/finalization-archive-status-summary-package-status-summary.md"],
      writeOutput: (output) => outputs.push(output),
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      createSummary: () => ({ passed: true, failures: [], markdown: "# package status summary\n" }),
      mkdirp: async (dir) => {
        calls.push(`mkdir:${dir}`);
      },
      writeText: async (path, contents) => {
        calls.push(`write:${path}:${contents}`);
      },
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({
      output: "artifacts/finalization-archive-status-summary-package-status-summary.md",
      passed: true,
    });
    expect(calls).toContain("write:artifacts/finalization-archive-status-summary-package-status-summary.md:# package status summary\n");
  });

  it("rejects malformed arguments before reads", async () => {
    const module = await import("./summary.js") as Module;
    const calls: string[] = [];

    await expect(module.runBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusSummaryCli?.({
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
