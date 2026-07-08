import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type SignedPayloadVerifyCliModule = typeof import("./signedPayloadVerify.js") & {
  isProposalExecutionSignedPayloadVerifyDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseProposalExecutionSignedPayloadVerifyCliArgs?: (argv: readonly string[]) => SignedPayloadVerifyCliArgs;
  runProposalExecutionSignedPayloadVerifyCli?: (options?: SignedPayloadVerifyRunnerOptions) => Promise<void>;
};

interface SignedPayloadVerifyCliArgs {
  signedPayloadPath: string;
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

interface SignedPayloadVerifyRunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  verifySignedPayload?: (params: unknown) => Promise<VerificationResult>;
}

interface VerificationResult {
  passed: boolean;
  failures: readonly string[];
}

const SIGNED_PAYLOAD_ARGS = [
  "--signed-payload",
  "artifacts/signed-payload.json",
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

describe("isProposalExecutionSignedPayloadVerifyDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./signedPayloadVerify.js") as SignedPayloadVerifyCliModule;
    const scriptPath = resolve("runtime/cli/proposalExecution/signedPayloadVerify.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isProposalExecutionSignedPayloadVerifyDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isProposalExecutionSignedPayloadVerifyDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isProposalExecutionSignedPayloadVerifyDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/proposalExecution/signingPayloadVerify.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./signedPayloadVerify.js") as SignedPayloadVerifyCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/proposalExecution/signedPayloadVerify.ts")).href;

    expect(() => module.isProposalExecutionSignedPayloadVerifyDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseProposalExecutionSignedPayloadVerifyCliArgs", () => {
  it("requires signed payload, payload, readiness, and execution artifact paths", async () => {
    const module = await import("./signedPayloadVerify.js") as SignedPayloadVerifyCliModule;

    expect(() => module.parseProposalExecutionSignedPayloadVerifyCliArgs?.([])).toThrow("--signed-payload is required");
    expect(() => module.parseProposalExecutionSignedPayloadVerifyCliArgs?.([
      "--signed-payload",
      "signed.json",
    ])).toThrow("--payload is required");
  });

  it("parses split and equals-form signed payload verification flags", async () => {
    const module = await import("./signedPayloadVerify.js") as SignedPayloadVerifyCliModule;

    expect(module.parseProposalExecutionSignedPayloadVerifyCliArgs?.([
      "--signed-payload=artifacts/signed-payload.json",
      "--payload",
      "artifacts/signing-payload.json",
      "--readiness=artifacts/readiness.json",
      "--preview",
      "artifacts/preview.json",
      "--runbook=artifacts/runbook.md",
      "--execution-manifest",
      "artifacts/execution-manifest.json",
      "--bundle=artifacts/bundle.json",
      "--approval",
      "artifacts/approval.json",
      "--manifest=artifacts/manifest.json",
      "--proposal",
      "artifacts/proposal.json",
      "--summary",
      " artifacts/summary.md ",
    ])).toEqual({
      signedPayloadPath: "artifacts/signed-payload.json",
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
    const module = await import("./signedPayloadVerify.js") as SignedPayloadVerifyCliModule;

    expect(() => module.parseProposalExecutionSignedPayloadVerifyCliArgs?.([
      "--signed-payload",
      "a.json",
      "--signed-payload",
      "b.json",
    ])).toThrow("Duplicate argument: --signed-payload");
    expect(() => module.parseProposalExecutionSignedPayloadVerifyCliArgs?.(["--summary"])).toThrow(
      "--summary requires a value",
    );
    expect(() => module.parseProposalExecutionSignedPayloadVerifyCliArgs?.(["--signed-payload", "a.json", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runProposalExecutionSignedPayloadVerifyCli", () => {
  it("prints injected signed payload verification reports", async () => {
    const module = await import("./signedPayloadVerify.js") as SignedPayloadVerifyCliModule;
    const outputs: string[] = [];

    await module.runProposalExecutionSignedPayloadVerifyCli?.({
      argv: SIGNED_PAYLOAD_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      readText: async (path) => path,
      verifySignedPayload: async () => ({ passed: true, failures: [] }),
    });

    expect(outputs).toEqual([JSON.stringify({
      signedPayload: "artifacts/signed-payload.json",
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

  it("sets exit code after failed signed payload verification output", async () => {
    const module = await import("./signedPayloadVerify.js") as SignedPayloadVerifyCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await module.runProposalExecutionSignedPayloadVerifyCli?.({
      argv: SIGNED_PAYLOAD_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      verifySignedPayload: async () => ({ passed: false, failures: ["signature mismatch"] }),
    });

    expect(JSON.parse(outputs[0]!)).toMatchObject({ signedPayload: "artifacts/signed-payload.json", passed: false });
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed injected signed payload verification reports before output or exit-code mutation", async () => {
    const module = await import("./signedPayloadVerify.js") as SignedPayloadVerifyCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await expect(module.runProposalExecutionSignedPayloadVerifyCli?.({
      argv: SIGNED_PAYLOAD_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      verifySignedPayload: async () => ({ passed: false, failures: "none" } as unknown as VerificationResult),
    })).rejects.toThrow("Proposal execution signed payload verification report failures must be an array");
    expect(outputs).toEqual([]);
    expect(exitCodes).toEqual([]);
  });
});
