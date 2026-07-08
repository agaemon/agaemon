import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type ProposalReviewApprovalCliModule = typeof import("./approval.js") & {
  isProposalReviewApprovalDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseProposalReviewApprovalCliArgs?: (argv: readonly string[]) => {
    manifestPath: string;
    proposalPath: string;
    summaryPath: string;
    reviewer: string;
    decision: string;
    outputPath?: string | undefined;
    generatedAt?: string | undefined;
  };
  runProposalReviewApprovalCli?: (options?: {
    argv?: readonly string[];
    writeOutput?: (output: string) => void;
    setExitCode?: (code: number) => void;
    readText?: (path: string) => Promise<string>;
    createApproval?: (params: unknown) => ApprovalResultFixture;
    mkdirp?: (dir: string) => Promise<void>;
    writeText?: (path: string, contents: string) => Promise<void>;
  }) => Promise<void>;
};

interface ApprovalResultFixture {
  passed: boolean;
  approval: ApprovalFixture | null;
  failures: readonly string[];
  manifestVerification: { passed: boolean; failures: readonly string[] };
}

interface ApprovalFixture {
  manifest: { path: string };
  reviewer: string;
  decision: string;
}

const APPROVAL: ApprovalFixture = {
  manifest: { path: "artifacts/manifest.json" },
  reviewer: "0x1111111111111111111111111111111111111111",
  decision: "approved",
};

describe("isProposalReviewApprovalDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./approval.js") as ProposalReviewApprovalCliModule;
    const scriptPath = resolve("runtime/cli/proposalReview/approval.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isProposalReviewApprovalDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isProposalReviewApprovalDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isProposalReviewApprovalDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/proposalReview/manifest.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./approval.js") as ProposalReviewApprovalCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/proposalReview/approval.ts")).href;

    expect(() => module.isProposalReviewApprovalDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseProposalReviewApprovalCliArgs", () => {
  it("requires approval input paths and reviewer decision fields", async () => {
    const module = await import("./approval.js") as ProposalReviewApprovalCliModule;

    expect(() => module.parseProposalReviewApprovalCliArgs?.([])).toThrow("--manifest is required");
    expect(() => module.parseProposalReviewApprovalCliArgs?.(["--manifest", "manifest.json"])).toThrow(
      "--proposal is required",
    );
    expect(() => module.parseProposalReviewApprovalCliArgs?.([
      "--manifest",
      "manifest.json",
      "--proposal",
      "proposal.json",
      "--summary",
      "summary.md",
    ])).toThrow("--reviewer is required");
  });

  it("parses split and equals-form proposal review approval flags", async () => {
    const module = await import("./approval.js") as ProposalReviewApprovalCliModule;

    expect(module.parseProposalReviewApprovalCliArgs?.([
      "--manifest=artifacts/manifest.json",
      "--proposal",
      "artifacts/proposal.json",
      "--summary=artifacts/summary.md",
      "--reviewer",
      "0x1111111111111111111111111111111111111111",
      "--decision=approved",
      "--output",
      "artifacts/approval.json",
      "--generated-at",
      " 2026-07-01T06:30:00.000Z ",
    ])).toEqual({
      manifestPath: "artifacts/manifest.json",
      proposalPath: "artifacts/proposal.json",
      summaryPath: "artifacts/summary.md",
      reviewer: "0x1111111111111111111111111111111111111111",
      decision: "approved",
      outputPath: "artifacts/approval.json",
      generatedAt: "2026-07-01T06:30:00.000Z",
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./approval.js") as ProposalReviewApprovalCliModule;

    expect(() => module.parseProposalReviewApprovalCliArgs?.([
      "--manifest",
      "a.json",
      "--manifest",
      "b.json",
    ])).toThrow("Duplicate argument: --manifest");
    expect(() => module.parseProposalReviewApprovalCliArgs?.(["--decision"])).toThrow("--decision requires a value");
    expect(() => module.parseProposalReviewApprovalCliArgs?.(["--manifest", "a.json", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runProposalReviewApprovalCli", () => {
  it("prints injected proposal review approvals when no output path is provided", async () => {
    const module = await import("./approval.js") as ProposalReviewApprovalCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runProposalReviewApprovalCli?.({
      argv: [
        "--manifest",
        "artifacts/manifest.json",
        "--proposal",
        "artifacts/proposal.json",
        "--summary",
        "artifacts/summary.md",
        "--reviewer",
        "0x1111111111111111111111111111111111111111",
        "--decision",
        "approved",
      ],
      writeOutput: (output) => outputs.push(output),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      readText: async (path) => {
        calls.push(`read:${path}`);
        return "{}";
      },
      createApproval: (params) => {
        calls.push(`approval:${typeof params}`);
        return {
          passed: true,
          approval: APPROVAL,
          failures: [],
          manifestVerification: { passed: true, failures: [] },
        };
      },
      mkdirp: async () => {
        throw new Error("mkdirp should not be called");
      },
      writeText: async () => {
        throw new Error("writeText should not be called");
      },
    });

    expect(outputs).toEqual([JSON.stringify(APPROVAL, null, 2)]);
    expect(calls).toEqual([
      "read:artifacts/manifest.json",
      "read:artifacts/proposal.json",
      "read:artifacts/summary.md",
      "approval:object",
    ]);
  });

  it("writes approvals through injected dependencies", async () => {
    const module = await import("./approval.js") as ProposalReviewApprovalCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runProposalReviewApprovalCli?.({
      argv: [
        "--manifest",
        "artifacts/manifest.json",
        "--proposal",
        "artifacts/proposal.json",
        "--summary",
        "artifacts/summary.md",
        "--reviewer",
        "0x1111111111111111111111111111111111111111",
        "--decision",
        "approved",
        "--output",
        "artifacts/approval.json",
      ],
      writeOutput: (output) => outputs.push(output),
      readText: async () => "{}",
      createApproval: () => ({
        passed: true,
        approval: APPROVAL,
        failures: [],
        manifestVerification: { passed: true, failures: [] },
      }),
      mkdirp: async (dir) => {
        calls.push(`mkdir:${dir}`);
      },
      writeText: async (path, contents) => {
        calls.push(`write:${path}:${contents}`);
      },
    });

    expect(outputs).toEqual([JSON.stringify({
      output: "artifacts/approval.json",
      manifest: "artifacts/manifest.json",
      reviewer: "0x1111111111111111111111111111111111111111",
      decision: "approved",
      passed: true,
    }, null, 2)]);
    expect(calls).toEqual([
      "mkdir:artifacts",
      `write:artifacts/approval.json:${JSON.stringify(APPROVAL, null, 2)}\n`,
    ]);
  });

  it("reports failed approvals with verification detail and sets exit code after output", async () => {
    const module = await import("./approval.js") as ProposalReviewApprovalCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await module.runProposalReviewApprovalCli?.({
      argv: [
        "--manifest",
        "artifacts/manifest.json",
        "--proposal",
        "artifacts/proposal.json",
        "--summary",
        "artifacts/summary.md",
        "--reviewer",
        "0x1111111111111111111111111111111111111111",
        "--decision",
        "approved",
      ],
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      createApproval: () => ({
        passed: false,
        approval: null,
        failures: ["manifest verification failed"],
        manifestVerification: { passed: false, failures: ["proposal hash mismatch"] },
      }),
    });

    expect(outputs).toEqual([JSON.stringify({
      manifest: "artifacts/manifest.json",
      proposal: "artifacts/proposal.json",
      summary: "artifacts/summary.md",
      passed: false,
      failures: ["manifest verification failed"],
      manifestVerification: { passed: false, failures: ["proposal hash mismatch"] },
    }, null, 2)]);
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed arguments before reads or writes", async () => {
    const module = await import("./approval.js") as ProposalReviewApprovalCliModule;
    const calls: string[] = [];

    await expect(module.runProposalReviewApprovalCli?.({
      argv: ["--unknown"],
      writeOutput: () => calls.push("output"),
      readText: async () => {
        calls.push("read");
        return "";
      },
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });

  it("rejects malformed injected approvals before output or artifact writes", async () => {
    const module = await import("./approval.js") as ProposalReviewApprovalCliModule;
    const calls: string[] = [];

    await expect(module.runProposalReviewApprovalCli?.({
      argv: [
        "--manifest",
        "artifacts/manifest.json",
        "--proposal",
        "artifacts/proposal.json",
        "--summary",
        "artifacts/summary.md",
        "--reviewer",
        "0x1111111111111111111111111111111111111111",
        "--decision",
        "approved",
        "--output",
        "artifacts/approval.json",
      ],
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      readText: async () => "{}",
      createApproval: () => ({
        passed: true,
        approval: { ...APPROVAL, reviewer: 42 },
        failures: [],
        manifestVerification: { passed: true, failures: [] },
      } as unknown as ApprovalResultFixture),
      mkdirp: async () => {
        calls.push("mkdir");
      },
      writeText: async () => {
        calls.push("write");
      },
    })).rejects.toThrow("Proposal review approval reviewer must be a string");
    expect(calls).toEqual([]);
  });
});
