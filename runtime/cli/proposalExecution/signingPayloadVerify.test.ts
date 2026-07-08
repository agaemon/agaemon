import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type SigningPayloadVerifyCliModule = typeof import("./signingPayloadVerify.js") & {
  isProposalExecutionSigningPayloadVerifyDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseProposalExecutionSigningPayloadVerifyCliArgs?: (argv: readonly string[]) => PayloadVerifyCliArgs;
  runProposalExecutionSigningPayloadVerifyCli?: (options?: PayloadVerifyRunnerOptions) => Promise<void>;
};

interface PayloadVerifyCliArgs {
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

interface PayloadVerifyRunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifyPayload?: (params: unknown) => VerificationResult;
}

interface VerificationResult {
  passed: boolean;
  failures: readonly string[];
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

describe("isProposalExecutionSigningPayloadVerifyDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./signingPayloadVerify.js") as SigningPayloadVerifyCliModule;
    const scriptPath = resolve("runtime/cli/proposalExecution/signingPayloadVerify.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isProposalExecutionSigningPayloadVerifyDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isProposalExecutionSigningPayloadVerifyDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isProposalExecutionSigningPayloadVerifyDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/proposalExecution/signingPayloadPreflight.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./signingPayloadVerify.js") as SigningPayloadVerifyCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/proposalExecution/signingPayloadVerify.ts")).href;

    expect(() => module.isProposalExecutionSigningPayloadVerifyDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseProposalExecutionSigningPayloadVerifyCliArgs", () => {
  it("requires payload, readiness, and execution artifact paths", async () => {
    const module = await import("./signingPayloadVerify.js") as SigningPayloadVerifyCliModule;

    expect(() => module.parseProposalExecutionSigningPayloadVerifyCliArgs?.([])).toThrow("--payload is required");
    expect(() => module.parseProposalExecutionSigningPayloadVerifyCliArgs?.(["--payload", "payload.json"])).toThrow(
      "--readiness is required",
    );
  });

  it("parses split and equals-form signing payload verification flags", async () => {
    const module = await import("./signingPayloadVerify.js") as SigningPayloadVerifyCliModule;

    expect(module.parseProposalExecutionSigningPayloadVerifyCliArgs?.([
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
    const module = await import("./signingPayloadVerify.js") as SigningPayloadVerifyCliModule;

    expect(() => module.parseProposalExecutionSigningPayloadVerifyCliArgs?.([
      "--payload",
      "a.json",
      "--payload",
      "b.json",
    ])).toThrow("Duplicate argument: --payload");
    expect(() => module.parseProposalExecutionSigningPayloadVerifyCliArgs?.(["--summary"])).toThrow(
      "--summary requires a value",
    );
    expect(() => module.parseProposalExecutionSigningPayloadVerifyCliArgs?.(["--payload", "a.json", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runProposalExecutionSigningPayloadVerifyCli", () => {
  it("prints injected payload verification reports", async () => {
    const module = await import("./signingPayloadVerify.js") as SigningPayloadVerifyCliModule;
    const outputs: string[] = [];

    await module.runProposalExecutionSigningPayloadVerifyCli?.({
      argv: PAYLOAD_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      readText: async (path) => path,
      verifyPayload: () => ({ passed: true, failures: [] }),
    });

    expect(outputs).toEqual([JSON.stringify({
      payload: "artifacts/signing-payload.json",
      readiness: "artifacts/readiness.json",
      preview: "artifacts/preview.json",
      runbook: "artifacts/runbook.md",
      executionManifest: "artifacts/execution-manifest.json",
      bundle: "artifacts/bundle.json",
      approval: "artifacts/approval.json",
      manifest: "artifacts/manifest.json",
      proposal: "artifacts/proposal.json",
      summary: "artifacts/summary.md",
      passed: true,
      failures: [],
    }, null, 2)]);
  });

  it("sets exit code after failed payload verification output", async () => {
    const module = await import("./signingPayloadVerify.js") as SigningPayloadVerifyCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await module.runProposalExecutionSigningPayloadVerifyCli?.({
      argv: PAYLOAD_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      verifyPayload: () => ({ passed: false, failures: ["payload nonce mismatch"] }),
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ payload: "artifacts/signing-payload.json", passed: false });
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed injected payload verification reports before output or exit-code mutation", async () => {
    const module = await import("./signingPayloadVerify.js") as SigningPayloadVerifyCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await expect(module.runProposalExecutionSigningPayloadVerifyCli?.({
      argv: PAYLOAD_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      verifyPayload: () => ({ passed: false, failures: "none" } as unknown as VerificationResult),
    })).rejects.toThrow("Proposal execution signing payload verification report failures must be an array");
    expect(outputs).toEqual([]);
    expect(exitCodes).toEqual([]);
  });
});
