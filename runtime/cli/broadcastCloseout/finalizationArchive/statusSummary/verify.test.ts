import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type Module = typeof import("./verify.js") & {
  isBroadcastCloseoutFinalizationArchiveStatusSummaryVerifyDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseBroadcastCloseoutFinalizationArchiveStatusSummaryVerifyCliArgs?: (argv: readonly string[]) => Record<string, string>;
  runBroadcastCloseoutFinalizationArchiveStatusSummaryVerifyCli?: (options?: RunnerOptions) => Promise<void>;
};

interface RunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifySummary?: (params: unknown) => { passed: boolean; failures: readonly string[] };
}

const ARGS = [
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

describe("finalization archive status summary verify CLI seams", () => {
  it("detects direct execution and parses strict args", async () => {
    const module = await import("./verify.js") as Module;
    const scriptPath = resolve("runtime/cli/broadcastCloseout/finalizationArchive/statusSummary/verify.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isBroadcastCloseoutFinalizationArchiveStatusSummaryVerifyDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(() => module.isBroadcastCloseoutFinalizationArchiveStatusSummaryVerifyDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
    expect(module.parseBroadcastCloseoutFinalizationArchiveStatusSummaryVerifyCliArgs?.(ARGS)).toMatchObject({
      finalizationArchiveStatusSummaryPath: "artifacts/finalization-archive-status-summary.md",
      finalizationStatusPath: "artifacts/finalization-status.json",
    });
    expect(module.parseBroadcastCloseoutFinalizationArchiveStatusSummaryVerifyCliArgs?.(EQUALS_ARGS)).toMatchObject({
      broadcastReceiptPath: "artifacts/receipt.json",
      submitResultPath: "artifacts/submit.json",
    });
    expect(() => module.parseBroadcastCloseoutFinalizationArchiveStatusSummaryVerifyCliArgs?.([])).toThrow(
      "--finalization-archive-status-summary is required",
    );
    expect(() => module.parseBroadcastCloseoutFinalizationArchiveStatusSummaryVerifyCliArgs?.([
      ...ARGS,
      "--summary", "artifacts/other-summary.md",
    ])).toThrow("Duplicate argument: --summary");
  });

  it("runs through injected dependencies and sets failed exit after output", async () => {
    const module = await import("./verify.js") as Module;
    const outputs: string[] = [];
    const exitCodes: number[] = [];
    const calls: string[] = [];

    await module.runBroadcastCloseoutFinalizationArchiveStatusSummaryVerifyCli?.({
      argv: ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      verifySummary: () => ({ passed: false, failures: ["summary mismatch"] }),
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ passed: false, failures: ["summary mismatch"] });
    expect(exitCodes).toEqual([1]);
    expect(calls).toContain("read:artifacts/finalization-archive-status-summary.md");
  });

  it("rejects malformed arguments before reads", async () => {
    const module = await import("./verify.js") as Module;
    const calls: string[] = [];

    await expect(module.runBroadcastCloseoutFinalizationArchiveStatusSummaryVerifyCli?.({
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
