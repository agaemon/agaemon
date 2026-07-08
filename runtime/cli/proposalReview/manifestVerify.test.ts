import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type ProposalReviewManifestVerifyCliModule = typeof import("./manifestVerify.js") & {
  isProposalReviewManifestVerifyDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseProposalReviewManifestVerifyCliArgs?: (argv: readonly string[]) => {
    manifestPath: string;
    proposalPath: string;
    summaryPath: string;
  };
  runProposalReviewManifestVerifyCli?: (options?: {
    argv?: readonly string[];
    writeOutput?: (output: string) => void;
    setExitCode?: (code: number) => void;
    readText?: (path: string) => Promise<string>;
    verifyManifest?: (params: unknown) => VerificationFixture;
  }) => Promise<void>;
};

interface VerificationFixture {
  passed: boolean;
  failures: readonly string[];
}

describe("isProposalReviewManifestVerifyDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./manifestVerify.js") as ProposalReviewManifestVerifyCliModule;
    const scriptPath = resolve("runtime/cli/proposalReview/manifestVerify.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isProposalReviewManifestVerifyDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isProposalReviewManifestVerifyDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isProposalReviewManifestVerifyDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/proposalReview/manifest.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./manifestVerify.js") as ProposalReviewManifestVerifyCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/proposalReview/manifestVerify.ts")).href;

    expect(() => module.isProposalReviewManifestVerifyDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseProposalReviewManifestVerifyCliArgs", () => {
  it("requires manifest, proposal, and summary paths", async () => {
    const module = await import("./manifestVerify.js") as ProposalReviewManifestVerifyCliModule;

    expect(() => module.parseProposalReviewManifestVerifyCliArgs?.([])).toThrow("--manifest is required");
    expect(() => module.parseProposalReviewManifestVerifyCliArgs?.(["--manifest", "manifest.json"])).toThrow(
      "--proposal is required",
    );
    expect(() => module.parseProposalReviewManifestVerifyCliArgs?.([
      "--manifest",
      "manifest.json",
      "--proposal",
      "proposal.json",
    ])).toThrow("--summary is required");
  });

  it("parses split and equals-form proposal review manifest verification flags", async () => {
    const module = await import("./manifestVerify.js") as ProposalReviewManifestVerifyCliModule;

    expect(module.parseProposalReviewManifestVerifyCliArgs?.([
      "--manifest=artifacts/manifest.json",
      "--proposal",
      "artifacts/proposal.json",
      "--summary= artifacts/summary.md ",
    ])).toEqual({
      manifestPath: "artifacts/manifest.json",
      proposalPath: "artifacts/proposal.json",
      summaryPath: "artifacts/summary.md",
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./manifestVerify.js") as ProposalReviewManifestVerifyCliModule;

    expect(() => module.parseProposalReviewManifestVerifyCliArgs?.([
      "--manifest",
      "a.json",
      "--manifest",
      "b.json",
    ])).toThrow("Duplicate argument: --manifest");
    expect(() => module.parseProposalReviewManifestVerifyCliArgs?.(["--summary"])).toThrow("--summary requires a value");
    expect(() => module.parseProposalReviewManifestVerifyCliArgs?.(["--manifest", "a.json", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runProposalReviewManifestVerifyCli", () => {
  it("prints injected manifest verification reports", async () => {
    const module = await import("./manifestVerify.js") as ProposalReviewManifestVerifyCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runProposalReviewManifestVerifyCli?.({
      argv: [
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
      verifyManifest: (params) => {
        calls.push(`verify:${typeof params}`);
        return { passed: true, failures: [] };
      },
    });

    expect(outputs).toEqual([JSON.stringify({
      manifest: "artifacts/manifest.json",
      proposal: "artifacts/proposal.json",
      summary: "artifacts/summary.md",
      passed: true,
      failures: [],
    }, null, 2)]);
    expect(calls).toEqual([
      "read:artifacts/manifest.json",
      "read:artifacts/proposal.json",
      "read:artifacts/summary.md",
      "verify:object",
    ]);
  });

  it("sets exit code after failed manifest verification output", async () => {
    const module = await import("./manifestVerify.js") as ProposalReviewManifestVerifyCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await module.runProposalReviewManifestVerifyCli?.({
      argv: [
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
      verifyManifest: () => ({ passed: false, failures: ["summary sha256 does not match current summary"] }),
    });

    expect(outputs).toEqual([JSON.stringify({
      manifest: "artifacts/manifest.json",
      proposal: "artifacts/proposal.json",
      summary: "artifacts/summary.md",
      passed: false,
      failures: ["summary sha256 does not match current summary"],
    }, null, 2)]);
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed arguments before reads or verification", async () => {
    const module = await import("./manifestVerify.js") as ProposalReviewManifestVerifyCliModule;
    const calls: string[] = [];

    await expect(module.runProposalReviewManifestVerifyCli?.({
      argv: ["--unknown"],
      writeOutput: () => calls.push("output"),
      readText: async () => {
        calls.push("read");
        return "";
      },
      verifyManifest: () => {
        calls.push("verify");
        return { passed: true, failures: [] };
      },
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });

  it("rejects malformed injected manifest verification reports before output or exit-code mutation", async () => {
    const module = await import("./manifestVerify.js") as ProposalReviewManifestVerifyCliModule;
    const calls: string[] = [];

    await expect(module.runProposalReviewManifestVerifyCli?.({
      argv: [
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
      verifyManifest: () => ({
        passed: false,
        failures: "none",
      } as unknown as VerificationFixture),
    })).rejects.toThrow("Proposal review manifest verification report failures must be an array");
    expect(calls).toEqual([]);
  });
});
