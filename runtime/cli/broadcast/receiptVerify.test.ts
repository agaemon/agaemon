import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type BroadcastReceiptVerifyCliModule = typeof import("./receiptVerify.js") & {
  isBroadcastReceiptVerifyDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseBroadcastReceiptVerifyCliArgs?: (argv: readonly string[]) => ReceiptVerifyCliArgs;
  runBroadcastReceiptVerifyCli?: (options?: ReceiptVerifyRunnerOptions) => Promise<void>;
};

interface ReceiptVerifyCliArgs {
  broadcastReceiptPath: string;
  broadcastPackagePath: string;
  submitResultPath: string;
}

interface ReceiptVerifyRunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyReceipt?: (params: unknown) => VerificationResult;
}

interface VerificationResult {
  passed: boolean;
  failures: readonly string[];
}

const RECEIPT_VERIFY_ARGS = [
  "--broadcast-receipt",
  "artifacts/receipt.json",
  "--broadcast-package",
  "artifacts/broadcast-package.json",
  "--submit-result",
  "artifacts/submit-result.json",
] as const;

describe("isBroadcastReceiptVerifyDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./receiptVerify.js") as BroadcastReceiptVerifyCliModule;
    const scriptPath = resolve("runtime/cli/broadcast/receiptVerify.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isBroadcastReceiptVerifyDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isBroadcastReceiptVerifyDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isBroadcastReceiptVerifyDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/broadcast/report.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./receiptVerify.js") as BroadcastReceiptVerifyCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/broadcast/receiptVerify.ts")).href;

    expect(() => module.isBroadcastReceiptVerifyDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseBroadcastReceiptVerifyCliArgs", () => {
  it("requires broadcast receipt, package, and submit-result paths", async () => {
    const module = await import("./receiptVerify.js") as BroadcastReceiptVerifyCliModule;

    expect(() => module.parseBroadcastReceiptVerifyCliArgs?.([])).toThrow("--broadcast-receipt is required");
    expect(() => module.parseBroadcastReceiptVerifyCliArgs?.(["--broadcast-receipt", "receipt.json"])).toThrow(
      "--broadcast-package is required",
    );
  });

  it("parses split and equals-form receipt verification flags", async () => {
    const module = await import("./receiptVerify.js") as BroadcastReceiptVerifyCliModule;

    expect(module.parseBroadcastReceiptVerifyCliArgs?.([
      "--broadcast-receipt=artifacts/receipt.json",
      "--broadcast-package",
      "artifacts/broadcast-package.json",
      "--submit-result",
      " artifacts/submit-result.json ",
    ])).toEqual({
      broadcastReceiptPath: "artifacts/receipt.json",
      broadcastPackagePath: "artifacts/broadcast-package.json",
      submitResultPath: "artifacts/submit-result.json",
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./receiptVerify.js") as BroadcastReceiptVerifyCliModule;

    expect(() => module.parseBroadcastReceiptVerifyCliArgs?.([
      "--broadcast-receipt",
      "a.json",
      "--broadcast-receipt",
      "b.json",
    ])).toThrow("Duplicate argument: --broadcast-receipt");
    expect(() => module.parseBroadcastReceiptVerifyCliArgs?.(["--submit-result"])).toThrow(
      "--submit-result requires a value",
    );
    expect(() => module.parseBroadcastReceiptVerifyCliArgs?.(["--broadcast-receipt", "a.json", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runBroadcastReceiptVerifyCli", () => {
  it("prints injected receipt verification reports", async () => {
    const module = await import("./receiptVerify.js") as BroadcastReceiptVerifyCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runBroadcastReceiptVerifyCli?.({
      argv: RECEIPT_VERIFY_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      verifyReceipt: (params) => {
        calls.push(`verify:${typeof params}`);
        return { passed: true, failures: [] };
      },
    });

    expect(JSON.parse(outputs[0]!)).toEqual({
      broadcastReceipt: "artifacts/receipt.json",
      broadcastPackage: "artifacts/broadcast-package.json",
      submitResult: "artifacts/submit-result.json",
      passed: true,
      failures: [],
    });
    expect(calls).toEqual([
      "read:artifacts/receipt.json",
      "read:artifacts/broadcast-package.json",
      "read:artifacts/submit-result.json",
      "verify:object",
    ]);
  });

  it("sets exit code after failed receipt verification output", async () => {
    const module = await import("./receiptVerify.js") as BroadcastReceiptVerifyCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await module.runBroadcastReceiptVerifyCli?.({
      argv: RECEIPT_VERIFY_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      verifyReceipt: () => ({ passed: false, failures: ["receipt mismatch"] }),
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ passed: false, failures: ["receipt mismatch"] });
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed injected receipt verification reports before output or exit code mutation", async () => {
    const module = await import("./receiptVerify.js") as BroadcastReceiptVerifyCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await expect(module.runBroadcastReceiptVerifyCli?.({
      argv: RECEIPT_VERIFY_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      verifyReceipt: () => ({ passed: true, failures: "not-failures" } as unknown as VerificationResult),
    })).rejects.toThrow("Broadcast receipt verification result failures must be an array");

    expect(outputs).toEqual([]);
    expect(exitCodes).toEqual([]);
  });

  it("rejects malformed arguments before reads or verification", async () => {
    const module = await import("./receiptVerify.js") as BroadcastReceiptVerifyCliModule;
    const calls: string[] = [];

    await expect(module.runBroadcastReceiptVerifyCli?.({
      argv: ["--unknown"],
      readText: async () => {
        calls.push("read");
        return "";
      },
      verifyReceipt: () => ({ passed: true, failures: [] }),
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });
});
