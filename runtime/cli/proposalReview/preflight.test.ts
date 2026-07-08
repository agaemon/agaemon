import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type ProposalReviewPreflightCliModule = typeof import("./preflight.js") & {
  isProposalReviewPreflightDirectRun?: (moduleUrl: string, argv: readonly string[]) => boolean;
  parseProposalReviewPreflightCliArgs?: (argv: readonly string[]) => {
    proposalPath: string;
    summaryPath: string;
  };
  runProposalReviewPreflightCli?: (options?: {
    argv?: readonly string[];
    writeOutput?: (output: string) => void;
    setExitCode?: (code: number) => void;
    readText?: (path: string) => Promise<string>;
    verifyPreflight?: (params: unknown) => PreflightReportFixture;
  }) => Promise<void>;
};

interface PreflightReportFixture {
  passed: boolean;
  checks: readonly unknown[];
}

describe("isProposalReviewPreflightDirectRun", () => {
  it("detects direct execution from the current module URL and argv script path", async () => {
    const module = await import("./preflight.js") as ProposalReviewPreflightCliModule;
    const scriptPath = resolve("runtime/cli/proposalReview/preflight.ts");
    const moduleUrl = pathToFileURL(scriptPath).href;

    expect(module.isProposalReviewPreflightDirectRun?.(moduleUrl, ["node", scriptPath])).toBe(true);
    expect(module.isProposalReviewPreflightDirectRun?.(moduleUrl, ["node"])).toBe(false);
    expect(module.isProposalReviewPreflightDirectRun?.(
      moduleUrl,
      ["node", resolve("runtime/cli/proposalReview/package.ts")],
    )).toBe(false);
  });

  it("rejects malformed argv values before script path comparison", async () => {
    const module = await import("./preflight.js") as ProposalReviewPreflightCliModule;
    const moduleUrl = pathToFileURL(resolve("runtime/cli/proposalReview/preflight.ts")).href;

    expect(() => module.isProposalReviewPreflightDirectRun?.(
      moduleUrl,
      "not-argv" as unknown as readonly string[],
    )).toThrow("Direct-run argv must be an array of strings");
  });
});

describe("parseProposalReviewPreflightCliArgs", () => {
  it("requires proposal and summary paths", async () => {
    const module = await import("./preflight.js") as ProposalReviewPreflightCliModule;

    expect(() => module.parseProposalReviewPreflightCliArgs?.([])).toThrow("--proposal is required");
    expect(() => module.parseProposalReviewPreflightCliArgs?.(["--proposal", "proposal.json"])).toThrow(
      "--summary is required",
    );
  });

  it("parses split and equals-form proposal review preflight flags", async () => {
    const module = await import("./preflight.js") as ProposalReviewPreflightCliModule;

    expect(module.parseProposalReviewPreflightCliArgs?.([
      "--proposal=artifacts/proposal.json",
      "--summary",
      " artifacts/summary.md ",
    ])).toEqual({
      proposalPath: "artifacts/proposal.json",
      summaryPath: "artifacts/summary.md",
    });
  });

  it("rejects duplicate, missing, and unsupported arguments", async () => {
    const module = await import("./preflight.js") as ProposalReviewPreflightCliModule;

    expect(() => module.parseProposalReviewPreflightCliArgs?.([
      "--proposal",
      "a.json",
      "--proposal",
      "b.json",
    ])).toThrow("Duplicate argument: --proposal");
    expect(() => module.parseProposalReviewPreflightCliArgs?.(["--summary"])).toThrow("--summary requires a value");
    expect(() => module.parseProposalReviewPreflightCliArgs?.(["--proposal", "a.json", "--unknown"])).toThrow(
      "Unsupported argument: --unknown",
    );
  });
});

describe("runProposalReviewPreflightCli", () => {
  it("prints injected proposal review preflight reports", async () => {
    const module = await import("./preflight.js") as ProposalReviewPreflightCliModule;
    const outputs: string[] = [];
    const calls: string[] = [];
    const report: PreflightReportFixture = {
      passed: true,
      checks: [{ name: "proposal-artifact", passed: true, failures: [] }],
    };

    await module.runProposalReviewPreflightCli?.({
      argv: ["--proposal", "artifacts/proposal.json", "--summary", "artifacts/summary.md"],
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
    expect(calls).toEqual([
      "read:artifacts/proposal.json",
      "read:artifacts/summary.md",
      "verify:object",
    ]);
  });

  it("sets exit code after failed preflight output", async () => {
    const module = await import("./preflight.js") as ProposalReviewPreflightCliModule;
    const outputs: string[] = [];
    const exitCodes: number[] = [];
    const report: PreflightReportFixture = {
      passed: false,
      checks: [{ name: "proposal-summary", passed: false, failures: ["proposal summary is stale"] }],
    };

    await module.runProposalReviewPreflightCli?.({
      argv: ["--proposal", "artifacts/proposal.json", "--summary", "artifacts/summary.md"],
      writeOutput: (output) => outputs.push(output),
      setExitCode: (code) => exitCodes.push(code),
      readText: async () => "{}",
      verifyPreflight: () => report,
    });

    expect(outputs).toEqual([JSON.stringify(report, null, 2)]);
    expect(exitCodes).toEqual([1]);
  });

  it("rejects malformed arguments before reads or verification", async () => {
    const module = await import("./preflight.js") as ProposalReviewPreflightCliModule;
    const calls: string[] = [];

    await expect(module.runProposalReviewPreflightCli?.({
      argv: ["--unknown"],
      writeOutput: () => calls.push("output"),
      readText: async () => {
        calls.push("read");
        return "";
      },
      verifyPreflight: () => {
        calls.push("verify");
        return { passed: true, checks: [] };
      },
    })).rejects.toThrow("Unsupported argument: --unknown");
    expect(calls).toEqual([]);
  });

  it("rejects malformed injected preflight reports before output or exit-code mutation", async () => {
    const module = await import("./preflight.js") as ProposalReviewPreflightCliModule;
    const calls: string[] = [];

    await expect(module.runProposalReviewPreflightCli?.({
      argv: ["--proposal", "artifacts/proposal.json", "--summary", "artifacts/summary.md"],
      writeOutput: () => calls.push("output"),
      setExitCode: () => calls.push("exit"),
      readText: async () => "{}",
      verifyPreflight: () => ({
        passed: false,
        checks: "none",
      } as unknown as PreflightReportFixture),
    })).rejects.toThrow("Proposal review preflight report checks must be an array");
    expect(calls).toEqual([]);
  });
});
