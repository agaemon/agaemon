import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type ProposalReviewApprovalVerifyCliModule = typeof import("./approvalVerify.js") & {
  isProposalReviewApprovalVerifyDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseProposalReviewApprovalVerifyCliArgs?: (argv: readonly string[]) => {
    approvalPath: string;
    manifestPath: string;
    proposalPath: string;
    summaryPath: string;
  };
  runProposalReviewApprovalVerifyCli?: (options?: {
    argv?: readonly string[];
    writeOutput?: (output: string) => void;
    setExitCode?: (code: number) => void;
    readText?: (path: string) => Promise<string>;
    verifyApproval?: (params: unknown) => ApprovalVerificationFixture;
  }) => Promise<void>;
};

interface ApprovalVerificationFixture {
  passed: boolean;
  failures: readonly string[];
  manifestVerification: unknown;
}

describe("isProposalReviewApprovalVerifyDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./approvalVerify.js") as ProposalReviewApprovalVerifyCliModule;
    const scriptPath = resolve("runtime/cli/proposalReview/approvalVerify.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isProposalReviewApprovalVerifyDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isProposalReviewApprovalVerifyDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isProposalReviewApprovalVerifyDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/proposalReview/approval.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./approvalVerify.js") as ProposalReviewApprovalVerifyCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/proposalReview/approvalVerify.ts")).href;

    expect(() => module.isProposalReviewApprovalVerifyDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseProposalReviewApprovalVerifyCliArgs", () => {
  it("requires approval, manifest, proposal, and summary paths", async () => {
    const module = await import("./approvalVerify.js") as ProposalReviewApprovalVerifyCliModule;

    expect(() => module.parseProposalReviewApprovalVerifyCliArgs?.([])).toThrow("--approval is required");
    expect(() => module.parseProposalReviewApprovalVerifyCliArgs?.(["--approval", "approval.json"])).toThrow(
      "--manifest is required",
    );
    expect(() => module.parseProposalReviewApprovalVerifyCliArgs?.([
      "--approval",
      "approval.json",
      "--manifest",
      "manifest.json",
      "--proposal",
      "proposal.json",
    ])).toThrow("--summary is required");
  });

  it("parses split and equals-form proposal review approval verification flags", async () => {
    const module = await import("./approvalVerify.js") as ProposalReviewApprovalVerifyCliModule;

    expect(module.parseProposalReviewApprovalVerifyCliArgs?.([
      "--approval=artifacts/approval.json",
      "--manifest",
      "artifacts/manifest.json",
      "--proposal=artifacts/proposal.json",
      "--summary",
      " artifacts/summary.md ",
    ])).toEqual({
      approvalPath: "artifacts/approval.json",
      manifestPath: "artifacts/manifest.json",
      proposalPath: "artifacts/proposal.json",
      summaryPath: "artifacts/summary.md",
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./approvalVerify.js") as ProposalReviewApprovalVerifyCliModule;

    expect(() => module.parseProposalReviewApprovalVerifyCliArgs?.([
      "--approval",
      "a.json",
      "--approval",
      "b.json",
    ])).toThrow("Duplicate argument: --approval");
    expect(() => module.parseProposalReviewApprovalVerifyCliArgs?.(["--proposal"])).toThrow("--proposal requires a value");
    expect(() => module.parseProposalReviewApprovalVerifyCliArgs?.(["--approval", "a.json", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runProposalReviewApprovalVerifyCli", () => {
  it("prints injected approval verification reports", async () => {
    const module = await import("./approvalVerify.js") as ProposalReviewApprovalVerifyCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];
    const manifestVerification = { passed: true, failures: [] };

    await module.runProposalReviewApprovalVerifyCli?.({
      argv: [
        "--approval",
        "artifacts/approval.json",
        "--manifest",
        "artifacts/manifest.json",
        "--proposal",
        "artifacts/proposal.json",
        "--summary",
        "artifacts/summary.md",
      ],
      writeOutput: (output) => outputs.push(output),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      verifyApproval: (params) => {
        calls.push(`verify:${typeof params}`);
        return { passed: true, failures: [], manifestVerification };
      },
    });

    expect(outputs).toEqual([JSON.stringify({
      approval: "artifacts/approval.json",
      manifest: "artifacts/manifest.json",
      proposal: "artifacts/proposal.json",
      summary: "artifacts/summary.md",
      passed: true,
      failures: [],
      manifestVerification,
      verificationScope: "local-record-consistency",
      reviewerAuthentication: "not-verified",
    }, null, 2)]);
    expect(calls).toEqual([
      "read:artifacts/approval.json",
      "read:artifacts/manifest.json",
      "read:artifacts/proposal.json",
      "read:artifacts/summary.md",
      "verify:object",
    ]);
  });

  it("sets exit code after failed approval verification output", async () => {
    const module = await import("./approvalVerify.js") as ProposalReviewApprovalVerifyCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];
    const manifestVerification = { passed: true, failures: [] };

    await module.runProposalReviewApprovalVerifyCli?.({
      argv: [
        "--approval",
        "artifacts/approval.json",
        "--manifest",
        "artifacts/manifest.json",
        "--proposal",
        "artifacts/proposal.json",
        "--summary",
        "artifacts/summary.md",
      ],
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      verifyApproval: () => ({
        passed: false,
        failures: ["approval manifest sha256 does not match current manifest"],
        manifestVerification,
      }),
    });

    expect(outputs).toEqual([JSON.stringify({
      approval: "artifacts/approval.json",
      manifest: "artifacts/manifest.json",
      proposal: "artifacts/proposal.json",
      summary: "artifacts/summary.md",
      passed: false,
      failures: ["approval manifest sha256 does not match current manifest"],
      manifestVerification,
      verificationScope: "local-record-consistency",
      reviewerAuthentication: "not-verified",
    }, null, 2)]);
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed arguments before reads or verification", async () => {
    const module = await import("./approvalVerify.js") as ProposalReviewApprovalVerifyCliModule;
    const calls: string[] = [];

    await expect(module.runProposalReviewApprovalVerifyCli?.({
      argv: ["--unknown"],
      writeOutput: () => calls.push("output"),
      readText: async () => {
        calls.push("read");
        return "";
      },
      verifyApproval: () => {
        calls.push("verify");
        return { passed: true, failures: [], manifestVerification: { passed: true, failures: [] } };
      },
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });

  it("rejects malformed injected approval verification reports before output or exit-code mutation", async () => {
    const module = await import("./approvalVerify.js") as ProposalReviewApprovalVerifyCliModule;
    const calls: string[] = [];

    await expect(module.runProposalReviewApprovalVerifyCli?.({
      argv: [
        "--approval",
        "artifacts/approval.json",
        "--manifest",
        "artifacts/manifest.json",
        "--proposal",
        "artifacts/proposal.json",
        "--summary",
        "artifacts/summary.md",
      ],
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      readText: async () => "{}",
      verifyApproval: () => ({
        passed: false,
        failures: ["approval manifest sha256 does not match current manifest"],
        manifestVerification: { passed: false, failures: "none" },
      } as unknown as ApprovalVerificationFixture),
    })).rejects.toThrow("Proposal review approval verification report manifestVerification failures must be an array");
    expect(calls).toEqual([]);
  });
});
