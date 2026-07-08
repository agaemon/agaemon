import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type FinalizationVerifyModule = typeof import("./finalizationVerify.js") & {
  isBroadcastCloseoutFinalizationVerifyDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseBroadcastCloseoutFinalizationVerifyCliArgs?: (argv: readonly string[]) => FinalizationVerifyArgs;
  runBroadcastCloseoutFinalizationVerifyCli?: (options?: FinalizationVerifyOptions) => Promise<void>;
};

interface FinalizationVerifyArgs {
  summaryPath: string;
  reportPath: string;
  archivePath: string;
  statusPath: string;
  broadcastReceiptPath: string;
  broadcastPackagePath: string;
  submitResultPath: string;
}

interface FinalizationVerifyOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyFinalization?: (params: unknown) => VerificationResult;
}

interface VerificationResult {
  passed: boolean;
  failures: readonly string[];
  checks?: readonly unknown[];
}

const VERIFY_ARGS = [
  "--summary",
  "artifacts/summary.md",
  "--report",
  "artifacts/report.md",
  "--archive",
  "artifacts/archive.json",
  "--status",
  "artifacts/status.json",
  "--broadcast-receipt",
  "artifacts/receipt.json",
  "--broadcast-package",
  "artifacts/package.json",
  "--submit-result",
  "artifacts/submit.json",
] as const;

describe("finalization verify CLI seams", () => {
  it("detects direct execution, parses args, and rejects malformed argv", async () => {
    const module = await import("./finalizationVerify.js") as FinalizationVerifyModule;
    const scriptPath = resolve("runtime/cli/broadcastCloseout/finalization/finalization/finalizationVerify.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isBroadcastCloseoutFinalizationVerifyDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(() => module.isBroadcastCloseoutFinalizationVerifyDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
    expect(module.parseBroadcastCloseoutFinalizationVerifyCliArgs?.(VERIFY_ARGS)).toEqual({
      summaryPath: "artifacts/summary.md",
      reportPath: "artifacts/report.md",
      archivePath: "artifacts/archive.json",
      statusPath: "artifacts/status.json",
      broadcastReceiptPath: "artifacts/receipt.json",
      broadcastPackagePath: "artifacts/package.json",
      submitResultPath: "artifacts/submit.json",
    });
    expect(() => module.parseBroadcastCloseoutFinalizationVerifyCliArgs?.([])).toThrow("--summary is required");
    expect(() => module.parseBroadcastCloseoutFinalizationVerifyCliArgs?.(["--summary"])).toThrow(
      "--summary requires a value",
    );
  });

  it("runs through injected dependencies and stops malformed args before reads", async () => {
    const module = await import("./finalizationVerify.js") as FinalizationVerifyModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runBroadcastCloseoutFinalizationVerifyCli?.({
      argv: VERIFY_ARGS,
      writeOutput: (output) => outputs.push(output),
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      verifyFinalization: (params) => {
        calls.push(`verify:${typeof params}`);
        return { passed: true, failures: [], checks: [] };
      },
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ passed: true, checks: [] });
    expect(calls).toContain("verify:object");

    await expect(module.runBroadcastCloseoutFinalizationVerifyCli?.({
      argv: ["--unknown"],
      readText: async () => {
        calls.push("bad-read");
        return "";
      },
      verifyFinalization: () => ({ passed: true, failures: [] }),
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).not.toContain("bad-read");
  });

  it("sets exit code after failed verification output", async () => {
    const module = await import("./finalizationVerify.js") as FinalizationVerifyModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await module.runBroadcastCloseoutFinalizationVerifyCli?.({
      argv: VERIFY_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      verifyFinalization: () => ({ passed: false, failures: ["finalization mismatch"] }),
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ passed: false, failures: ["finalization mismatch"] });
    expect(exitCodes).toEqual([1]);
  });
});
