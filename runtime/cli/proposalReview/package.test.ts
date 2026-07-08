import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type ProposalReviewPackageCliModule = typeof import("./package.js") & {
  isProposalReviewPackageDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseProposalReviewPackageCliArgs?: (argv: readonly string[]) => {
    proposalPath: string;
    summaryOutputPath: string;
    manifestOutputPath: string;
    generatedAt?: string | undefined;
  };
  runProposalReviewPackageCli?: (options?: {
    argv?: readonly string[];
    writeOutput?: (output: string) => void;
    setExitCode?: (code: number) => void;
    readText?: (path: string) => Promise<string>;
    createPackage?: (params: unknown) => PackageResultFixture;
    mkdirp?: (dir: string) => Promise<void>;
    writeText?: (path: string, contents: string) => Promise<void>;
  }) => Promise<void>;
};

interface PackageResultFixture {
  proposal: string;
  summary: { path: string; markdown: string };
  manifestPath: string;
  manifest: unknown;
  passed: boolean;
  failures: readonly string[];
}

const PACKAGE_RESULT: PackageResultFixture = {
  proposal: "artifacts/proposal.json",
  summary: { path: "artifacts/summary.md", markdown: "# Summary\n" },
  manifestPath: "artifacts/manifest.json",
  manifest: {
    generatedAt: "2026-07-01T06:30:00.000Z",
    preflight: { passed: true, failures: [] },
  },
  passed: true,
  failures: [],
};

describe("isProposalReviewPackageDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./package.js") as ProposalReviewPackageCliModule;
    const scriptPath = resolve("runtime/cli/proposalReview/package.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isProposalReviewPackageDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isProposalReviewPackageDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isProposalReviewPackageDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/proposalReview/approval.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./package.js") as ProposalReviewPackageCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/proposalReview/package.ts")).href;

    expect(() => module.isProposalReviewPackageDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseProposalReviewPackageCliArgs", () => {
  it("requires proposal, summary output, and manifest output paths", async () => {
    const module = await import("./package.js") as ProposalReviewPackageCliModule;

    expect(() => module.parseProposalReviewPackageCliArgs?.([])).toThrow("--proposal is required");
    expect(() => module.parseProposalReviewPackageCliArgs?.(["--proposal", "proposal.json"])).toThrow(
      "--summary-output is required",
    );
    expect(() => module.parseProposalReviewPackageCliArgs?.([
      "--proposal",
      "proposal.json",
      "--summary-output",
      "summary.md",
    ])).toThrow("--manifest-output is required");
  });

  it("parses split and equals-form proposal review package flags", async () => {
    const module = await import("./package.js") as ProposalReviewPackageCliModule;

    expect(module.parseProposalReviewPackageCliArgs?.([
      "--proposal=artifacts/proposal.json",
      "--summary-output",
      "artifacts/summary.md",
      "--manifest-output=artifacts/manifest.json",
      "--generated-at",
      " 2026-07-01T06:30:00.000Z ",
    ])).toEqual({
      proposalPath: "artifacts/proposal.json",
      summaryOutputPath: "artifacts/summary.md",
      manifestOutputPath: "artifacts/manifest.json",
      generatedAt: "2026-07-01T06:30:00.000Z",
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./package.js") as ProposalReviewPackageCliModule;

    expect(() => module.parseProposalReviewPackageCliArgs?.([
      "--proposal",
      "a.json",
      "--proposal",
      "b.json",
    ])).toThrow("Duplicate argument: --proposal");
    expect(() => module.parseProposalReviewPackageCliArgs?.(["--summary-output"])).toThrow(
      "--summary-output requires a value",
    );
    expect(() => module.parseProposalReviewPackageCliArgs?.(["--proposal", "a.json", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runProposalReviewPackageCli", () => {
  it("writes successful package artifacts through injected dependencies", async () => {
    const module = await import("./package.js") as ProposalReviewPackageCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runProposalReviewPackageCli?.({
      argv: [
        "--proposal",
        "artifacts/proposal.json",
        "--summary-output",
        "artifacts/summary.md",
        "--manifest-output",
        "artifacts/manifest.json",
      ],
      writeOutput: (output) => outputs.push(output),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      readText: async (path) => {
        calls.push(`read:${path}`);
        return "{\"proposal\":true}";
      },
      createPackage: (params) => {
        calls.push(`package:${typeof params}`);
        return PACKAGE_RESULT;
      },
      mkdirp: async (dir) => {
        calls.push(`mkdir:${dir}`);
      },
      writeText: async (path, contents) => {
        calls.push(`write:${path}:${contents}`);
      },
    });

    expect(outputs).toEqual([JSON.stringify({
      proposal: "artifacts/proposal.json",
      summary: "artifacts/summary.md",
      manifest: "artifacts/manifest.json",
      passed: true,
      failures: [],
    }, null, 2)]);
    expect(calls).toEqual([
      "read:artifacts/proposal.json",
      "package:object",
      "mkdir:artifacts",
      "write:artifacts/summary.md:# Summary\n",
      "mkdir:artifacts",
      `write:artifacts/manifest.json:${JSON.stringify(PACKAGE_RESULT.manifest, null, 2)}\n`,
    ]);
  });

  it("does not write failed package artifacts and sets exit code after output", async () => {
    const module = await import("./package.js") as ProposalReviewPackageCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];
    const calls: string[] = [];
    const failedResult: PackageResultFixture = {
      ...PACKAGE_RESULT,
      manifest: null,
      passed: false,
      failures: ["proposal preflight failed"],
    };

    await module.runProposalReviewPackageCli?.({
      argv: [
        "--proposal",
        "artifacts/proposal.json",
        "--summary-output",
        "artifacts/summary.md",
        "--manifest-output",
        "artifacts/manifest.json",
      ],
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      createPackage: () => failedResult,
      mkdirp: async (dir) => {
        calls.push(`mkdir:${dir}`);
      },
      writeText: async (path, contents) => {
        calls.push(`write:${path}:${contents}`);
      },
    });

    expect(outputs).toEqual([JSON.stringify({
      proposal: "artifacts/proposal.json",
      summary: "artifacts/summary.md",
      manifest: "artifacts/manifest.json",
      passed: false,
      failures: ["proposal preflight failed"],
    }, null, 2)]);
    expect(exitCodes).toEqual([1]);
    expect(calls).toEqual([]);
  });

  it("rejects malformed arguments before reads or writes", async () => {
    const module = await import("./package.js") as ProposalReviewPackageCliModule;
    const calls: string[] = [];

    await expect(module.runProposalReviewPackageCli?.({
      argv: ["--unknown"],
      writeOutput: () => calls.push("output"),
      readText: async () => {
        calls.push("read");
        return "";
      },
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });

  it("rejects malformed injected package results before output or artifact writes", async () => {
    const module = await import("./package.js") as ProposalReviewPackageCliModule;
    const calls: string[] = [];

    await expect(module.runProposalReviewPackageCli?.({
      argv: [
        "--proposal",
        "artifacts/proposal.json",
        "--summary-output",
        "artifacts/summary.md",
        "--manifest-output",
        "artifacts/manifest.json",
      ],
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      readText: async () => "{}",
      createPackage: () => ({
        ...PACKAGE_RESULT,
        summary: { path: "artifacts/summary.md", markdown: 42 },
      } as unknown as PackageResultFixture),
      mkdirp: async () => {
        calls.push("mkdir");
      },
      writeText: async () => {
        calls.push("write");
      },
    })).rejects.toThrow("Proposal review package summary markdown must be a string");
    expect(calls).toEqual([]);
  });
});
