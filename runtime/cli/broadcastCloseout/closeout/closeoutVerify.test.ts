import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type BroadcastCloseoutVerifyCliModule = typeof import("./closeoutVerify.js") & {
  isBroadcastCloseoutVerifyDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseBroadcastCloseoutVerifyCliArgs?: (argv: readonly string[]) => CloseoutVerifyCliArgs;
  runBroadcastCloseoutVerifyCli?: (options?: CloseoutVerifyRunnerOptions) => Promise<void>;
};

interface CloseoutVerifyCliArgs {
  reportPath: string;
  archivePath: string;
  broadcastReceiptPath: string;
  broadcastPackagePath: string;
  submitResultPath: string;
}

interface CloseoutVerifyRunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyCloseout?: (params: unknown) => VerificationResult;
}

interface VerificationResult {
  passed: boolean;
  failures: readonly string[];
  closeout?: unknown;
}

const CLOSEOUT_VERIFY_ARGS = [
  "--report",
  "artifacts/report.md",
  "--archive",
  "artifacts/archive.json",
  "--broadcast-receipt",
  "artifacts/receipt.json",
  "--broadcast-package",
  "artifacts/broadcast-package.json",
  "--submit-result",
  "artifacts/submit-result.json",
] as const;

describe("isBroadcastCloseoutVerifyDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./closeoutVerify.js") as BroadcastCloseoutVerifyCliModule;
    const scriptPath = resolve("runtime/cli/broadcastCloseout/closeout/closeoutVerify.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isBroadcastCloseoutVerifyDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isBroadcastCloseoutVerifyDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isBroadcastCloseoutVerifyDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/broadcastCloseout/closeout/closeout.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./closeoutVerify.js") as BroadcastCloseoutVerifyCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/broadcastCloseout/closeout/closeoutVerify.ts")).href;

    expect(() => module.isBroadcastCloseoutVerifyDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseBroadcastCloseoutVerifyCliArgs", () => {
  it("requires report, archive, receipt, package, and submit-result paths", async () => {
    const module = await import("./closeoutVerify.js") as BroadcastCloseoutVerifyCliModule;

    expect(() => module.parseBroadcastCloseoutVerifyCliArgs?.([])).toThrow("--report is required");
    expect(() => module.parseBroadcastCloseoutVerifyCliArgs?.(["--report", "report.md"])).toThrow(
      "--archive is required",
    );
  });

  it("parses split and equals-form closeout verification flags", async () => {
    const module = await import("./closeoutVerify.js") as BroadcastCloseoutVerifyCliModule;

    expect(module.parseBroadcastCloseoutVerifyCliArgs?.([
      "--report=artifacts/report.md",
      "--archive",
      "artifacts/archive.json",
      "--broadcast-receipt=artifacts/receipt.json",
      "--broadcast-package",
      "artifacts/broadcast-package.json",
      "--submit-result",
      " artifacts/submit-result.json ",
    ])).toEqual({
      reportPath: "artifacts/report.md",
      archivePath: "artifacts/archive.json",
      broadcastReceiptPath: "artifacts/receipt.json",
      broadcastPackagePath: "artifacts/broadcast-package.json",
      submitResultPath: "artifacts/submit-result.json",
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./closeoutVerify.js") as BroadcastCloseoutVerifyCliModule;

    expect(() => module.parseBroadcastCloseoutVerifyCliArgs?.([
      "--report",
      "a.md",
      "--report",
      "b.md",
    ])).toThrow("Duplicate argument: --report");
    expect(() => module.parseBroadcastCloseoutVerifyCliArgs?.(["--submit-result"])).toThrow(
      "--submit-result requires a value",
    );
    expect(() => module.parseBroadcastCloseoutVerifyCliArgs?.(["--report", "a.md", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runBroadcastCloseoutVerifyCli", () => {
  it("prints injected closeout verification summaries", async () => {
    const module = await import("./closeoutVerify.js") as BroadcastCloseoutVerifyCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runBroadcastCloseoutVerifyCli?.({
      argv: CLOSEOUT_VERIFY_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      verifyCloseout: (params) => {
        calls.push(`verify:${typeof params}`);
        return { passed: true, failures: [], closeout: { passed: true } };
      },
    });

    expect(JSON.parse(outputs[0]!)).toEqual({
      report: "artifacts/report.md",
      archive: "artifacts/archive.json",
      broadcastReceipt: "artifacts/receipt.json",
      broadcastPackage: "artifacts/broadcast-package.json",
      submitResult: "artifacts/submit-result.json",
      passed: true,
      failures: [],
      closeout: { passed: true },
    });
    expect(calls).toEqual([
      "read:artifacts/report.md",
      "read:artifacts/archive.json",
      "read:artifacts/receipt.json",
      "read:artifacts/broadcast-package.json",
      "read:artifacts/submit-result.json",
      "verify:object",
    ]);
  });

  it("sets exit code after failed closeout verification output", async () => {
    const module = await import("./closeoutVerify.js") as BroadcastCloseoutVerifyCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await module.runBroadcastCloseoutVerifyCli?.({
      argv: CLOSEOUT_VERIFY_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      verifyCloseout: () => ({ passed: false, failures: ["closeout mismatch"] }),
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ passed: false, failures: ["closeout mismatch"] });
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed injected closeout verification reports before output or exit code mutation", async () => {
    const module = await import("./closeoutVerify.js") as BroadcastCloseoutVerifyCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await expect(module.runBroadcastCloseoutVerifyCli?.({
      argv: CLOSEOUT_VERIFY_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      verifyCloseout: () => ({ passed: true, failures: "not-failures" } as unknown as VerificationResult),
    })).rejects.toThrow("Broadcast closeout verification result failures must be an array");

    expect(outputs).toEqual([]);
    expect(exitCodes).toEqual([]);
  });

  it("rejects malformed arguments before reads or verification", async () => {
    const module = await import("./closeoutVerify.js") as BroadcastCloseoutVerifyCliModule;
    const calls: string[] = [];

    await expect(module.runBroadcastCloseoutVerifyCli?.({
      argv: ["--unknown"],
      readText: async () => {
        calls.push("read");
        return "";
      },
      verifyCloseout: () => ({ passed: true, failures: [] }),
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });
});
