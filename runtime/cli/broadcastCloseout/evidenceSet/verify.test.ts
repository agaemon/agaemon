import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type BroadcastCloseoutEvidenceVerifyCliModule = typeof import("./verify.js") & {
  isBroadcastCloseoutEvidenceVerifyDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseBroadcastCloseoutEvidenceVerifyCliArgs?: (argv: readonly string[]) => EvidenceVerifyCliArgs;
  runBroadcastCloseoutEvidenceVerifyCli?: (options?: EvidenceVerifyRunnerOptions) => Promise<void>;
};

interface EvidenceVerifyCliArgs {
  reportPath: string;
  archivePath: string;
  statusPath: string;
  broadcastReceiptPath: string;
  broadcastPackagePath: string;
  submitResultPath: string;
}

interface EvidenceVerifyRunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyEvidence?: (params: unknown) => VerificationResult;
}

interface VerificationResult {
  passed: boolean;
  failures: readonly string[];
  checks?: readonly unknown[];
}

const EVIDENCE_ARGS = [
  "--report",
  "artifacts/report.md",
  "--archive",
  "artifacts/archive.json",
  "--status",
  "artifacts/status.json",
  "--broadcast-receipt",
  "artifacts/receipt.json",
  "--broadcast-package",
  "artifacts/broadcast-package.json",
  "--submit-result",
  "artifacts/submit-result.json",
] as const;

describe("isBroadcastCloseoutEvidenceVerifyDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./verify.js") as BroadcastCloseoutEvidenceVerifyCliModule;
    const scriptPath = resolve("runtime/cli/broadcastCloseout/evidenceSet/verify.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isBroadcastCloseoutEvidenceVerifyDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isBroadcastCloseoutEvidenceVerifyDirectRun?.(moduleUrl, ["node"])).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./verify.js") as BroadcastCloseoutEvidenceVerifyCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/broadcastCloseout/evidenceSet/verify.ts")).href;

    expect(() => module.isBroadcastCloseoutEvidenceVerifyDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseBroadcastCloseoutEvidenceVerifyCliArgs", () => {
  it("requires report, archive, status, receipt, package, and submit-result paths", async () => {
    const module = await import("./verify.js") as BroadcastCloseoutEvidenceVerifyCliModule;

    expect(() => module.parseBroadcastCloseoutEvidenceVerifyCliArgs?.([])).toThrow("--report is required");
    expect(() => module.parseBroadcastCloseoutEvidenceVerifyCliArgs?.(["--report", "report.md"])).toThrow(
      "--archive is required",
    );
  });

  it("parses split and equals-form evidence verification flags", async () => {
    const module = await import("./verify.js") as BroadcastCloseoutEvidenceVerifyCliModule;

    expect(module.parseBroadcastCloseoutEvidenceVerifyCliArgs?.([
      "--report=artifacts/report.md",
      "--archive",
      "artifacts/archive.json",
      "--status=artifacts/status.json",
      "--broadcast-receipt",
      "artifacts/receipt.json",
      "--broadcast-package=artifacts/broadcast-package.json",
      "--submit-result",
      " artifacts/submit-result.json ",
    ])).toEqual({
      reportPath: "artifacts/report.md",
      archivePath: "artifacts/archive.json",
      statusPath: "artifacts/status.json",
      broadcastReceiptPath: "artifacts/receipt.json",
      broadcastPackagePath: "artifacts/broadcast-package.json",
      submitResultPath: "artifacts/submit-result.json",
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./verify.js") as BroadcastCloseoutEvidenceVerifyCliModule;

    expect(() => module.parseBroadcastCloseoutEvidenceVerifyCliArgs?.([
      "--report",
      "a.md",
      "--report",
      "b.md",
    ])).toThrow("Duplicate argument: --report");
    expect(() => module.parseBroadcastCloseoutEvidenceVerifyCliArgs?.(["--submit-result"])).toThrow(
      "--submit-result requires a value",
    );
    expect(() => module.parseBroadcastCloseoutEvidenceVerifyCliArgs?.(["--report", "a.md", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runBroadcastCloseoutEvidenceVerifyCli", () => {
  it("prints injected evidence verification summaries", async () => {
    const module = await import("./verify.js") as BroadcastCloseoutEvidenceVerifyCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runBroadcastCloseoutEvidenceVerifyCli?.({
      argv: EVIDENCE_ARGS,
      writeOutput: (output) => outputs.push(output),
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      verifyEvidence: (params) => {
        calls.push(`verify:${typeof params}`);
        return { passed: true, failures: [], checks: [] };
      },
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({
      report: "artifacts/report.md",
      archive: "artifacts/archive.json",
      status: "artifacts/status.json",
      passed: true,
      failures: [],
      checks: [],
    });
    expect(calls).toContain("verify:object");
  });

  it("sets exit code after failed evidence verification output", async () => {
    const module = await import("./verify.js") as BroadcastCloseoutEvidenceVerifyCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await module.runBroadcastCloseoutEvidenceVerifyCli?.({
      argv: EVIDENCE_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      verifyEvidence: () => ({ passed: false, failures: ["evidence mismatch"] }),
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ passed: false, failures: ["evidence mismatch"] });
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed injected evidence verification reports before output or exit code mutation", async () => {
    const module = await import("./verify.js") as BroadcastCloseoutEvidenceVerifyCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await expect(module.runBroadcastCloseoutEvidenceVerifyCli?.({
      argv: EVIDENCE_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      verifyEvidence: () => ({
        passed: true,
        failures: [],
        checks: "not-checks",
      } as unknown as VerificationResult),
    })).rejects.toThrow("Broadcast closeout evidence verification result checks must be an array");

    expect(outputs).toEqual([]);
    expect(exitCodes).toEqual([]);
  });

  it("rejects malformed arguments before reads or verification", async () => {
    const module = await import("./verify.js") as BroadcastCloseoutEvidenceVerifyCliModule;
    const calls: string[] = [];

    await expect(module.runBroadcastCloseoutEvidenceVerifyCli?.({
      argv: ["--unknown"],
      readText: async () => {
        calls.push("read");
        return "";
      },
      verifyEvidence: () => ({ passed: true, failures: [] }),
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });
});
