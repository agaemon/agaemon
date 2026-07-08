import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type Module = typeof import("./status.js") & {
  isBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusCliArgs?: (argv: readonly string[]) => Record<string, string>;
  runBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusCli?: (options?: RunnerOptions) => Promise<void>;
};

interface RunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  createStatus?: (params: unknown) => StatusResult;
  formatStatus?: (status: StatusResult) => string;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

interface StatusResult {
  passed: boolean;
}

const ARGS = [
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

const EQUALS_ARGS = [
  "--finalization-archive-status-summary-package=artifacts/finalization-archive-status-summary-package.json",
  "--finalization-archive-status-summary=artifacts/finalization-archive-status-summary.md",
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

describe("finalization archive status summary package status CLI seams", () => {
  it("detects direct execution and parses strict args", async () => {
    const module = await import("./status.js") as Module;
    const scriptPath = resolve("runtime/cli/broadcastCloseout/finalizationArchive/statusSummaryPackage/status/status.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(() => module.isBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
    expect(module.parseBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusCliArgs?.([
      ...ARGS,
      "--output=artifacts/finalization-archive-status-summary-package-status.json",
    ])).toMatchObject({
      finalizationArchiveStatusSummaryPackagePath: "artifacts/finalization-archive-status-summary-package.json",
      outputPath: "artifacts/finalization-archive-status-summary-package-status.json",
    });
    expect(module.parseBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusCliArgs?.(EQUALS_ARGS)).toMatchObject({
      finalizationStatusPath: "artifacts/finalization-status.json",
      submitResultPath: "artifacts/submit.json",
    });
    expect(() => module.parseBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusCliArgs?.([])).toThrow(
      "--finalization-archive-status-summary-package is required",
    );
    expect(() => module.parseBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusCliArgs?.([
      ...ARGS,
      "--summary", "artifacts/other-summary.md",
    ])).toThrow("Duplicate argument: --summary");
  });

  it("writes successful formatted status through injected dependencies", async () => {
    const module = await import("./status.js") as Module;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusCli?.({
      argv: [...ARGS, "--output", "artifacts/finalization-archive-status-summary-package-status.json"],
      writeOutput: (output) => outputs.push(output),
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      createStatus: () => ({ passed: true }),
      formatStatus: () => "formatted-status\n",
      mkdirp: async (dir) => {
        calls.push(`mkdir:${dir}`);
      },
      writeText: async (path, contents) => {
        calls.push(`write:${path}:${contents}`);
      },
    });

    expect(outputs).toEqual(["formatted-status"]);
    expect(calls).toContain("read:artifacts/finalization-archive-status-summary-package.json");
    expect(calls).toContain("write:artifacts/finalization-archive-status-summary-package-status.json:formatted-status\n");
  });

  it("rejects malformed arguments before reads", async () => {
    const module = await import("./status.js") as Module;
    const calls: string[] = [];

    await expect(module.runBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusCli?.({
      argv: ["--unknown"],
      readText: async () => {
        calls.push("read");
        return "";
      },
      createStatus: () => ({ passed: true }),
      formatStatus: () => "",
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });
});
