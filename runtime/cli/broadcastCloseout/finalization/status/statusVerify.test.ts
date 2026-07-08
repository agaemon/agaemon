import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type Module = typeof import("./statusVerify.js") & {
  isBroadcastCloseoutFinalizationStatusVerifyDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseBroadcastCloseoutFinalizationStatusVerifyCliArgs?: (argv: readonly string[]) => Record<string, string>;
  runBroadcastCloseoutFinalizationStatusVerifyCli?: (options?: RunnerOptions) => Promise<void>;
};

interface RunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyStatus?: (params: unknown) => { passed: boolean; failures: readonly string[] };
}

const ARGS = [
  "--finalization-status", "artifacts/finalization-status.json",
  "--summary", "artifacts/summary.md",
  "--report", "artifacts/report.md",
  "--archive", "artifacts/archive.json",
  "--status", "artifacts/status.json",
  "--broadcast-receipt", "artifacts/receipt.json",
  "--broadcast-package", "artifacts/package.json",
  "--submit-result", "artifacts/submit.json",
] as const;

describe("finalization status verify CLI seams", () => {
  it("detects direct execution and parses strict args", async () => {
    const module = await import("./statusVerify.js") as Module;
    const scriptPath = resolve("runtime/cli/broadcastCloseout/finalization/status/statusVerify.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isBroadcastCloseoutFinalizationStatusVerifyDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(() => module.isBroadcastCloseoutFinalizationStatusVerifyDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
    expect(module.parseBroadcastCloseoutFinalizationStatusVerifyCliArgs?.(ARGS)).toMatchObject({
      finalizationStatusPath: "artifacts/finalization-status.json",
      summaryPath: "artifacts/summary.md",
    });
    expect(module.parseBroadcastCloseoutFinalizationStatusVerifyCliArgs?.(
      ARGS.map((arg, index) => (index % 2 === 0 ? `${arg}=${ARGS[index + 1]}` : null)).filter((arg) => arg !== null),
    )).toMatchObject({
      archivePath: "artifacts/archive.json",
      submitResultPath: "artifacts/submit.json",
    });
    expect(() => module.parseBroadcastCloseoutFinalizationStatusVerifyCliArgs?.([])).toThrow(
      "--finalization-status is required",
    );
    expect(() => module.parseBroadcastCloseoutFinalizationStatusVerifyCliArgs?.(["--summary"])).toThrow(
      "--summary requires a value",
    );
    expect(() => module.parseBroadcastCloseoutFinalizationStatusVerifyCliArgs?.([
      ...ARGS,
      "--summary", "artifacts/other-summary.md",
    ])).toThrow("Duplicate argument: --summary");
  });

  it("runs through injected dependencies and handles failed verification after output", async () => {
    const module = await import("./statusVerify.js") as Module;
    const outputs: string[] = [];
    const exitCodes: number[] = [];
    const calls: string[] = [];

    await module.runBroadcastCloseoutFinalizationStatusVerifyCli?.({
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
    expect(calls).toContain("read:artifacts/finalization-status.json");
  });

  it("rejects malformed arguments before reads", async () => {
    const module = await import("./statusVerify.js") as Module;
    const calls: string[] = [];

    await expect(module.runBroadcastCloseoutFinalizationStatusVerifyCli?.({
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
