import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type Module = typeof import("./statusVerify.js") & {
  isBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusVerifyDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusVerifyCliArgs?: (argv: readonly string[]) => Record<string, string>;
  runBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusVerifyCli?: (options?: RunnerOptions) => Promise<void>;
};

interface RunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyStatus?: (params: unknown) => { passed: boolean; failures: readonly string[] };
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

describe("finalization archive status summary package status verify CLI seams", () => {
  it("detects direct execution and parses strict args", async () => {
    const module = await import("./statusVerify.js") as Module;
    const scriptPath = resolve("runtime/cli/broadcastCloseout/finalizationArchive/statusSummaryPackage/status/statusVerify.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusVerifyDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.parseBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusVerifyCliArgs?.(ARGS)).toMatchObject({
      finalizationArchiveStatusSummaryPackageStatusPath: "artifacts/finalization-archive-status-summary-package-status.json",
      finalizationArchiveStatusSummaryPackagePath: "artifacts/finalization-archive-status-summary-package.json",
    });
    expect(() => module.parseBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusVerifyCliArgs?.([])).toThrow(
      "--finalization-archive-status-summary-package-status is required",
    );
    expect(() => module.parseBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusVerifyCliArgs?.([
      ...ARGS,
      "--report", "artifacts/other-report.md",
    ])).toThrow("Duplicate argument: --report");
  });

  it("runs through injected dependencies and sets failed exit after output", async () => {
    const module = await import("./statusVerify.js") as Module;
    const outputs: string[] = [];
    const exitCodes: number[] = [];
    const calls: string[] = [];

    await module.runBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusVerifyCli?.({
      argv: ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      verifyStatus: () => ({ passed: false, failures: ["status mismatch"] }),
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ passed: false, failures: ["status mismatch"] });
    expect(exitCodes).toEqual([1]);
    expect(calls).toContain("read:artifacts/finalization-archive-status-summary-package-status.json");
  });

  it("rejects malformed arguments before reads", async () => {
    const module = await import("./statusVerify.js") as Module;
    const calls: string[] = [];

    await expect(module.runBroadcastCloseoutFinalizationArchiveStatusSummaryPackageStatusVerifyCli?.({
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
