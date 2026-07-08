import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type ProposalSummaryVerifyCliModule = typeof import("./summaryVerify.js") & {
  isProposalSummaryVerifyDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseProposalSummaryVerifyCliArgs?: (argv: readonly string[]) => {
    proposalPath: string;
    summaryPath: string;
  };
  runProposalSummaryVerifyCli?: (options?: {
    argv?: readonly string[];
    writeOutput?: (output: string) => void;
    setExitCode?: (code: number) => void;
    readText?: (path: string) => Promise<string>;
    verifySummary?: (params: unknown) => SummaryVerificationFixture;
  }) => Promise<void>;
};

interface SummaryVerificationFixture {
  passed: boolean;
  failures: readonly string[];
  expected: string;
}

describe("isProposalSummaryVerifyDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./summaryVerify.js") as ProposalSummaryVerifyCliModule;
    const scriptPath = resolve("runtime/cli/proposal/summaryVerify.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isProposalSummaryVerifyDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isProposalSummaryVerifyDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isProposalSummaryVerifyDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/proposal/summary.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./summaryVerify.js") as ProposalSummaryVerifyCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/proposal/summaryVerify.ts")).href;

    expect(() => module.isProposalSummaryVerifyDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseProposalSummaryVerifyCliArgs", () => {
  it("requires proposal and summary paths", async () => {
    const module = await import("./summaryVerify.js") as ProposalSummaryVerifyCliModule;

    expect(() => module.parseProposalSummaryVerifyCliArgs?.([])).toThrow("--proposal is required");
    expect(() => module.parseProposalSummaryVerifyCliArgs?.(["--proposal", "proposal.json"])).toThrow(
      "--summary is required",
    );
  });

  it("parses split and equals-form proposal summary verification flags", async () => {
    const module = await import("./summaryVerify.js") as ProposalSummaryVerifyCliModule;

    expect(module.parseProposalSummaryVerifyCliArgs?.([
      "--proposal=artifacts/proposal.json",
      "--summary",
      " artifacts/summary.md ",
    ])).toEqual({
      proposalPath: "artifacts/proposal.json",
      summaryPath: "artifacts/summary.md",
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./summaryVerify.js") as ProposalSummaryVerifyCliModule;

    expect(() => module.parseProposalSummaryVerifyCliArgs?.([
      "--proposal",
      "a.json",
      "--proposal",
      "b.json",
    ])).toThrow("Duplicate argument: --proposal");
    expect(() => module.parseProposalSummaryVerifyCliArgs?.(["--summary"])).toThrow("--summary requires a value");
    expect(() => module.parseProposalSummaryVerifyCliArgs?.(["--proposal", "a.json", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runProposalSummaryVerifyCli", () => {
  it("prints injected proposal summary verification reports", async () => {
    const module = await import("./summaryVerify.js") as ProposalSummaryVerifyCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];

    await module.runProposalSummaryVerifyCli?.({
      argv: ["--proposal", "artifacts/proposal.json", "--summary", "artifacts/summary.md"],
      writeOutput: (output) => outputs.push(output),
      setExitCode: () => {
        throw new Error("setExitCode should not be called");
      },
      readText: async (path) => {
        calls.push(`read:${path}`);
        return path;
      },
      verifySummary: (params) => {
        calls.push(`verify:${typeof params}`);
        return { passed: true, failures: [], expected: "# Agent Proposal Review\n" };
      },
    });

    expect(outputs).toEqual([JSON.stringify({
      proposal: "artifacts/proposal.json",
      summary: "artifacts/summary.md",
      passed: true,
      failures: [],
    }, null, 2)]);
    expect(calls).toEqual([
      "read:artifacts/proposal.json",
      "read:artifacts/summary.md",
      "verify:object",
    ]);
  });

  it("sets exit code after failed summary verification output", async () => {
    const module = await import("./summaryVerify.js") as ProposalSummaryVerifyCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];

    await module.runProposalSummaryVerifyCli?.({
      argv: ["--proposal", "artifacts/proposal.json", "--summary", "artifacts/summary.md"],
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      verifySummary: () => ({
        passed: false,
        failures: ["proposal summary is stale"],
        expected: "# Agent Proposal Review\n",
      }),
    });

    expect(outputs).toEqual([JSON.stringify({
      proposal: "artifacts/proposal.json",
      summary: "artifacts/summary.md",
      passed: false,
      failures: ["proposal summary is stale"],
    }, null, 2)]);
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed arguments before reads or verification", async () => {
    const module = await import("./summaryVerify.js") as ProposalSummaryVerifyCliModule;
    const calls: string[] = [];

    await expect(module.runProposalSummaryVerifyCli?.({
      argv: ["--unknown"],
      writeOutput: () => calls.push("output"),
      readText: async () => {
        calls.push("read");
        return "";
      },
      verifySummary: () => {
        calls.push("verify");
        return { passed: true, failures: [], expected: "" };
      },
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });

  it("rejects malformed injected summary verification reports before output or exit-code mutation", async () => {
    const module = await import("./summaryVerify.js") as ProposalSummaryVerifyCliModule;
    const calls: string[] = [];

    await expect(module.runProposalSummaryVerifyCli?.({
      argv: ["--proposal", "artifacts/proposal.json", "--summary", "artifacts/summary.md"],
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      readText: async () => "{}",
      verifySummary: () => ({
        passed: false,
        failures: "none",
        expected: "# Agent Proposal Review\n",
      } as unknown as SummaryVerificationFixture),
    })).rejects.toThrow("Proposal summary verification report failures must be an array");
    expect(calls).toEqual([]);
  });
});
