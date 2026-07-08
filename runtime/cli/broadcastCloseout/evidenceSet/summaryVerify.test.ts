import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type Module = typeof import("./summaryVerify.js") & {
  isBroadcastCloseoutEvidenceSetSummaryVerifyDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseBroadcastCloseoutEvidenceSetSummaryVerifyCliArgs?: (argv: readonly string[]) => Record<string, string>;
  runBroadcastCloseoutEvidenceSetSummaryVerifyCli?: (options?: RunnerOptions) => Promise<void>;
};

interface RunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifySummary?: (params: unknown) => { passed: boolean; failures: readonly string[]; expected?: string };
}

const ARGS = [
  "--summary", "artifacts/summary.md",
  "--report", "artifacts/report.md",
  "--archive", "artifacts/archive.json",
  "--status", "artifacts/status.json",
  "--broadcast-receipt", "artifacts/receipt.json",
  "--broadcast-package", "artifacts/package.json",
  "--submit-result", "artifacts/submit.json",
] as const;

describe("broadcast closeout evidence set summary verify CLI seams", () => {
  it("detects direct execution and parses strict args", async () => {
    const module = await import("./summaryVerify.js") as Module;
    const scriptPath = resolve("runtime/cli/broadcastCloseout/evidenceSet/summaryVerify.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isBroadcastCloseoutEvidenceSetSummaryVerifyDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(() => module.isBroadcastCloseoutEvidenceSetSummaryVerifyDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
    expect(module.parseBroadcastCloseoutEvidenceSetSummaryVerifyCliArgs?.([
      "--summary=artifacts/summary.md",
      "--report", "artifacts/report.md",
      "--archive=artifacts/archive.json",
      "--status", "artifacts/status.json",
      "--broadcast-receipt", "artifacts/receipt.json",
      "--broadcast-package=artifacts/package.json",
      "--submit-result", " artifacts/submit.json ",
    ])).toMatchObject({
      summaryPath: "artifacts/summary.md",
      reportPath: "artifacts/report.md",
      submitResultPath: "artifacts/submit.json",
    });
    expect(() => module.parseBroadcastCloseoutEvidenceSetSummaryVerifyCliArgs?.([])).toThrow("--summary is required");
    expect(() => module.parseBroadcastCloseoutEvidenceSetSummaryVerifyCliArgs?.([
      ...ARGS,
      "--report", "artifacts/other-report.md",
    ])).toThrow("Duplicate argument: --report");
    expect(() => module.parseBroadcastCloseoutEvidenceSetSummaryVerifyCliArgs?.(["--summary"])).toThrow(
      "--summary requires a value",
    );
  });

  it("runs through injected dependencies and sets failed exit after output", async () => {
    const module = await import("./summaryVerify.js") as Module;
    const outputs: string[] = [];
    const exitCodes: number[] = [];
    const calls: string[] = [];

    await module.runBroadcastCloseoutEvidenceSetSummaryVerifyCli?.({
      argv: ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      verifySummary: () => ({ passed: false, failures: ["summary mismatch"], expected: "# expected\n" }),
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({
      summary: "artifacts/summary.md",
      report: "artifacts/report.md",
      passed: false,
      failures: ["summary mismatch"],
    });
    expect(exitCodes).toEqual([1]);
    expect(calls).toContain("read:artifacts/summary.md");
  });

  it("rejects malformed injected summary verification reports before output or exit code mutation", async () => {
    const module = await import("./summaryVerify.js") as Module;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await expect(module.runBroadcastCloseoutEvidenceSetSummaryVerifyCli?.({
      argv: ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      verifySummary: () => ({ passed: true, failures: "not-failures" } as unknown as {
        passed: boolean;
        failures: readonly string[];
      }),
    })).rejects.toThrow("Broadcast closeout evidence summary verification result failures must be an array");

    expect(outputs).toEqual([]);
    expect(exitCodes).toEqual([]);
  });

  it("rejects malformed arguments before reads", async () => {
    const module = await import("./summaryVerify.js") as Module;
    const calls: string[] = [];

    await expect(module.runBroadcastCloseoutEvidenceSetSummaryVerifyCli?.({
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
