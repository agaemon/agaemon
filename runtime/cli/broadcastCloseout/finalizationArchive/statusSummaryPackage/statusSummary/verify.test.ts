import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type Module = typeof import("./verify.js") & {
  isBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusSummaryVerifyDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusSummaryVerifyCliArgs?: (argv: readonly string[]) => Record<string, string>;
  runBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusSummaryVerifyCli?: (options?: RunnerOptions) => Promise<void>;
};

interface RunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifySummary?: (params: unknown) => { passed: boolean; failures: readonly string[]; expected?: string };
}

const ARGS = [
  "--finalization-archive-status-summary-package-status-summary", "artifacts/finalization-archive-status-summary-package-status-summary.md",
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

describe("finalization archive status summary package status summary verify CLI seams", () => {
  it("detects direct execution and parses strict args", async () => {
    const module = await import("./verify.js") as Module;
    const scriptPath = resolve("runtime/cli/broadcastCloseout/finalizationArchive/statusSummaryPackage/statusSummary/verify.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusSummaryVerifyDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(() => module.isBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusSummaryVerifyDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
    expect(module.parseBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusSummaryVerifyCliArgs?.([
      "--finalization-archive-status-summary-package-status-summary=artifacts/finalization-archive-status-summary-package-status-summary.md",
      ...ARGS.slice(2),
    ])).toMatchObject({
      finalizationArchiveStatusSummaryPackageStatusSummaryPath: "artifacts/finalization-archive-status-summary-package-status-summary.md",
      finalizationArchiveStatusSummaryPackageStatusPath: "artifacts/finalization-archive-status-summary-package-status.json",
    });
    expect(() => module.parseBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusSummaryVerifyCliArgs?.([])).toThrow(
      "--finalization-archive-status-summary-package-status-summary is required",
    );
    expect(() => module.parseBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusSummaryVerifyCliArgs?.([
      ...ARGS,
      "--report", "artifacts/other-report.md",
    ])).toThrow("Duplicate argument: --report");
  });

  it("runs through injected dependencies and sets failed exit after output", async () => {
    const module = await import("./verify.js") as Module;
    const outputs: string[] = [];
    const exitCodes: number[] = [];
    const calls: string[] = [];

    await module.runBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusSummaryVerifyCli?.({
      argv: ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      verifySummary: () => ({ passed: false, failures: ["status summary mismatch"], expected: "# expected\n" }),
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({
      finalizationArchiveStatusSummaryPackageStatusSummary: "artifacts/finalization-archive-status-summary-package-status-summary.md",
      finalizationArchiveStatusSummaryPackageStatus: "artifacts/finalization-archive-status-summary-package-status.json",
      passed: false,
      failures: ["status summary mismatch"],
    });
    expect(exitCodes).toEqual([1]);
    expect(calls).toContain("read:artifacts/finalization-archive-status-summary-package-status-summary.md");
  });

  it("rejects malformed arguments before reads", async () => {
    const module = await import("./verify.js") as Module;
    const calls: string[] = [];

    await expect(module.runBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusSummaryVerifyCli?.({
      argv: ["--unknown"],
      readText: async () => {
        calls.push("read");
        return "";
      },
      verifySummary: () => ({ passed: true, failures: [] }),
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });
});
