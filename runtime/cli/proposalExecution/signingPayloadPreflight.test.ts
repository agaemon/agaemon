import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type SigningPayloadPreflightCliModule = typeof import("./signingPayloadPreflight.js") & {
  isProposalExecutionSigningPayloadPreflightDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseProposalExecutionSigningPayloadPreflightCliArgs?: (argv: readonly string[]) => PayloadPreflightCliArgs;
  runProposalExecutionSigningPayloadPreflightCli?: (options?: PayloadPreflightRunnerOptions) => Promise<void>;
};

interface PayloadPreflightCliArgs {
  payloadPath: string;
  readinessPath: string;
  previewPath: string;
  runbookPath: string;
  executionManifestPath: string;
  bundlePath: string;
  approvalPath: string;
  manifestPath: string;
  proposalPath: string;
  summaryPath: string;
}

interface PayloadPreflightRunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyPreflight?: (params: unknown) => PreflightReport;
}

interface PreflightReport {
  passed: boolean;
  checks: readonly unknown[];
}

const PAYLOAD_ARGS = [
  "--payload",
  "artifacts/signing-payload.json",
  "--readiness",
  "artifacts/readiness.json",
  "--preview",
  "artifacts/preview.json",
  "--runbook",
  "artifacts/runbook.md",
  "--execution-manifest",
  "artifacts/execution-manifest.json",
  "--bundle",
  "artifacts/bundle.json",
  "--approval",
  "artifacts/approval.json",
  "--manifest",
  "artifacts/manifest.json",
  "--proposal",
  "artifacts/proposal.json",
  "--summary",
  "artifacts/summary.md",
] as const;

describe("isProposalExecutionSigningPayloadPreflightDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./signingPayloadPreflight.js") as SigningPayloadPreflightCliModule;
    const scriptPath = resolve("runtime/cli/proposalExecution/signingPayloadPreflight.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isProposalExecutionSigningPayloadPreflightDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isProposalExecutionSigningPayloadPreflightDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isProposalExecutionSigningPayloadPreflightDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/proposalExecution/signingPayloadVerify.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./signingPayloadPreflight.js") as SigningPayloadPreflightCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/proposalExecution/signingPayloadPreflight.ts")).href;

    expect(() => module.isProposalExecutionSigningPayloadPreflightDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseProposalExecutionSigningPayloadPreflightCliArgs", () => {
  it("requires payload, readiness, and execution artifact paths", async () => {
    const module = await import("./signingPayloadPreflight.js") as SigningPayloadPreflightCliModule;

    expect(() => module.parseProposalExecutionSigningPayloadPreflightCliArgs?.([])).toThrow("--payload is required");
    expect(() => module.parseProposalExecutionSigningPayloadPreflightCliArgs?.(["--payload", "payload.json"])).toThrow(
      "--readiness is required",
    );
  });

  it("parses split and equals-form signing payload preflight flags", async () => {
    const module = await import("./signingPayloadPreflight.js") as SigningPayloadPreflightCliModule;

    expect(module.parseProposalExecutionSigningPayloadPreflightCliArgs?.([
      "--payload=artifacts/signing-payload.json",
      "--readiness",
      "artifacts/readiness.json",
      "--preview=artifacts/preview.json",
      "--runbook",
      "artifacts/runbook.md",
      "--execution-manifest=artifacts/execution-manifest.json",
      "--bundle",
      "artifacts/bundle.json",
      "--approval=artifacts/approval.json",
      "--manifest",
      "artifacts/manifest.json",
      "--proposal=artifacts/proposal.json",
      "--summary",
      " artifacts/summary.md ",
    ])).toEqual({
      payloadPath: "artifacts/signing-payload.json",
      readinessPath: "artifacts/readiness.json",
      previewPath: "artifacts/preview.json",
      runbookPath: "artifacts/runbook.md",
      executionManifestPath: "artifacts/execution-manifest.json",
      bundlePath: "artifacts/bundle.json",
      approvalPath: "artifacts/approval.json",
      manifestPath: "artifacts/manifest.json",
      proposalPath: "artifacts/proposal.json",
      summaryPath: "artifacts/summary.md",
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./signingPayloadPreflight.js") as SigningPayloadPreflightCliModule;

    expect(() => module.parseProposalExecutionSigningPayloadPreflightCliArgs?.([
      "--payload",
      "a.json",
      "--payload",
      "b.json",
    ])).toThrow("Duplicate argument: --payload");
    expect(() => module.parseProposalExecutionSigningPayloadPreflightCliArgs?.(["--summary"])).toThrow(
      "--summary requires a value",
    );
    expect(() => module.parseProposalExecutionSigningPayloadPreflightCliArgs?.(["--payload", "a.json", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runProposalExecutionSigningPayloadPreflightCli", () => {
  it("prints injected preflight reports", async () => {
    const module = await import("./signingPayloadPreflight.js") as SigningPayloadPreflightCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];
    const report = { passed: true, checks: [{ name: "signing-payload", passed: true, failures: [] }] };

    await module.runProposalExecutionSigningPayloadPreflightCli?.({
      argv: PAYLOAD_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      verifyPreflight: (params) => {
        calls.push(`verify:${typeof params}`);
        return report;
      },
    });

    expect(outputs).toEqual([JSON.stringify(report, null, 2)]);
    expect(calls.at(-1)).toBe("verify:object");
  });

  it("sets exit code after failed preflight output", async () => {
    const module = await import("./signingPayloadPreflight.js") as SigningPayloadPreflightCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];
    const report = { passed: false, checks: [{ name: "signing-payload", passed: false, failures: ["stale payload"] }] };

    await module.runProposalExecutionSigningPayloadPreflightCli?.({
      argv: PAYLOAD_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      verifyPreflight: () => report,
    });

    expect(outputs).toEqual([JSON.stringify(report, null, 2)]);
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed injected signing payload preflight reports before output or exit-code mutation", async () => {
    const module = await import("./signingPayloadPreflight.js") as SigningPayloadPreflightCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await expect(module.runProposalExecutionSigningPayloadPreflightCli?.({
      argv: PAYLOAD_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      verifyPreflight: () => ({ passed: false, checks: "none" } as unknown as PreflightReport),
    })).rejects.toThrow("Proposal execution signing payload preflight report checks must be an array");
    expect(outputs).toEqual([]);
    expect(exitCodes).toEqual([]);
  });
});
