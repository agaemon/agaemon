import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type ProposalExecutionSigningPayloadCliModule = typeof import("./signingPayload.js") & {
  isProposalExecutionSigningPayloadDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseProposalExecutionSigningPayloadCliArgs?: (argv: readonly string[]) => SigningPayloadCliArgs;
  runProposalExecutionSigningPayloadCli?: (options?: SigningPayloadRunnerOptions) => Promise<void>;
};

interface SigningPayloadCliArgs {
  readinessPath: string;
  previewPath: string;
  runbookPath: string;
  executionManifestPath: string;
  bundlePath: string;
  approvalPath: string;
  manifestPath: string;
  proposalPath: string;
  summaryPath: string;
  outputPath?: string | undefined;
}

interface SigningPayloadRunnerOptions {
  argv?: readonly string[];
  writeOutput?: (output: string) => void;
  setExitCode?: (code: number) => void;
  readText?: (path: string) => Promise<string>;
  createPayload?: (params: unknown) => SigningPayloadResult;
  mkdirp?: (dir: string) => Promise<void>;
  writeText?: (path: string, contents: string) => Promise<void>;
}

interface SigningPayloadResult {
  passed: boolean;
  failures: readonly string[];
  verification: unknown;
  payload: unknown;
}

const PAYLOAD = { schemaVersion: 1, transactions: [{ nonce: 7 }] };
const SIGNING_PAYLOAD_ARGS = [
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

describe("isProposalExecutionSigningPayloadDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./signingPayload.js") as ProposalExecutionSigningPayloadCliModule;
    const scriptPath = resolve("runtime/cli/proposalExecution/signingPayload.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isProposalExecutionSigningPayloadDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isProposalExecutionSigningPayloadDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isProposalExecutionSigningPayloadDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/proposalExecution/readiness.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./signingPayload.js") as ProposalExecutionSigningPayloadCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/proposalExecution/signingPayload.ts")).href;

    expect(() => module.isProposalExecutionSigningPayloadDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseProposalExecutionSigningPayloadCliArgs", () => {
  it("requires readiness and execution artifact paths", async () => {
    const module = await import("./signingPayload.js") as ProposalExecutionSigningPayloadCliModule;

    expect(() => module.parseProposalExecutionSigningPayloadCliArgs?.([])).toThrow("--readiness is required");
    expect(() => module.parseProposalExecutionSigningPayloadCliArgs?.(["--readiness", "readiness.json"])).toThrow(
      "--preview is required",
    );
  });

  it("parses split and equals-form signing payload flags", async () => {
    const module = await import("./signingPayload.js") as ProposalExecutionSigningPayloadCliModule;

    expect(module.parseProposalExecutionSigningPayloadCliArgs?.([
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
      "--output=artifacts/signing-payload.json",
    ])).toEqual({
      readinessPath: "artifacts/readiness.json",
      previewPath: "artifacts/preview.json",
      runbookPath: "artifacts/runbook.md",
      executionManifestPath: "artifacts/execution-manifest.json",
      bundlePath: "artifacts/bundle.json",
      approvalPath: "artifacts/approval.json",
      manifestPath: "artifacts/manifest.json",
      proposalPath: "artifacts/proposal.json",
      summaryPath: "artifacts/summary.md",
      outputPath: "artifacts/signing-payload.json",
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./signingPayload.js") as ProposalExecutionSigningPayloadCliModule;

    expect(() => module.parseProposalExecutionSigningPayloadCliArgs?.([
      "--readiness",
      "a.json",
      "--readiness",
      "b.json",
    ])).toThrow("Duplicate argument: --readiness");
    expect(() => module.parseProposalExecutionSigningPayloadCliArgs?.(["--summary"])).toThrow(
      "--summary requires a value",
    );
    expect(() => module.parseProposalExecutionSigningPayloadCliArgs?.(["--readiness", "a.json", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runProposalExecutionSigningPayloadCli", () => {
  it("creates signing payload reports and writes payload files through injected dependencies", async () => {
    const module = await import("./signingPayload.js") as ProposalExecutionSigningPayloadCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runProposalExecutionSigningPayloadCli?.({
      argv: [...SIGNING_PAYLOAD_ARGS, "--output", "artifacts/signing-payload.json"],
      writeOutput: (output) => outputs.push(output),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      createPayload: (params) => {
        calls.push(`payload:${typeof params}`);
        return { passed: true, failures: [], verification: { passed: true, failures: [] }, payload: PAYLOAD };
      },
      mkdirp: async (dir) => {
        calls.push(`mkdir:${dir}`);
      },
      writeText: async (path, contents) => {
        calls.push(`write:${path}:${contents}`);
      },
    });

    const output = {
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
      verification: { passed: true, failures: [] },
      payload: PAYLOAD,
    };
    expect(outputs).toEqual([JSON.stringify(output, null, 2)]);
    expect(calls.at(-3)).toBe("payload:object");
    expect(calls.slice(-2)).toEqual([
      "mkdir:artifacts",
      `write:artifacts/signing-payload.json:${JSON.stringify(PAYLOAD, null, 2)}\n`,
    ]);
  });

  it("sets exit code after failed signing payload output", async () => {
    const module = await import("./signingPayload.js") as ProposalExecutionSigningPayloadCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await module.runProposalExecutionSigningPayloadCli?.({
      argv: SIGNING_PAYLOAD_ARGS,
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      createPayload: () => ({
        passed: false,
        failures: ["readiness verification failed"],
        verification: { passed: false, failures: ["readiness verification failed"] },
        payload: null,
      }),
    });

    expect(outputs).toHaveLength(1);
    expect(JSON.parse(outputs[0]!)).toMatchObject({
      readiness: "artifacts/readiness.json",
      passed: false,
      failures: ["readiness verification failed"],
    });
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed injected signing payload results before output or writes", async () => {
    const module = await import("./signingPayload.js") as ProposalExecutionSigningPayloadCliModule;
    const outputs: string[] = [];
    const writes: string[] = [];

    await expect(module.runProposalExecutionSigningPayloadCli?.({
      argv: [...SIGNING_PAYLOAD_ARGS, "--output", "artifacts/signing-payload.json"],
      writeOutput: (output) => outputs.push(output),
      readText: async () => "{}",
      createPayload: () => ({
        passed: true,
        failures: [],
        verification: { passed: true, failures: [] },
        payload: { ...PAYLOAD, transactions: "none" },
      } as unknown as SigningPayloadResult),
      writeText: async (path) => {
        writes.push(path);
      },
    })).rejects.toThrow("Proposal execution signing payload transactions must be an array");
    expect(outputs).toEqual([]);
    expect(writes).toEqual([]);
  });
});
